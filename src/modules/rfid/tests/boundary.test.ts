// ─── Module boundary enforcement ─────────────────────────────────────────────
// Fails the suite when any file inside src/modules/rfid imports driver-app
// internals, or when vendor implementations leak outside their sanctioned
// homes. This is acceptance criterion 2 made executable: the extraction test
// ("fresh app = adapters + route stubs + env, zero module changes") stays true
// only while these rules hold.

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const MODULE_ROOT = path.resolve(__dirname, '..')

// Bare-specifier allowlist. Extend deliberately — every addition is a new
// framework/platform dependency a fresh host must provide.
const ALLOWED_BARE = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  'next/server', // exported API route handlers only
  'vitest',
  'fake-indexeddb',
  'fake-indexeddb/auto',
  '@testing-library/react', // tests only
])
const ALLOWED_BARE_PREFIXES = ['node:']

// Vendor implementations may be imported only from these module-relative
// locations: implementations, composition root, fakes, tests, and the public
// entry barrel (the host composes vendor impls from there). Business logic
// (flows/, screens/, components/, offline/, hal/) must stay port-only.
const VENDOR_IMPORT_PATTERN = /tapgoods|easyrfid|ezrfid/i
const VENDOR_ALLOWED_DIRS = ['server', 'provider', 'testing', 'tests']
const VENDOR_ALLOWED_FILES = ['index.ts']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = []
  const patterns = [
    /(?:^|\n)\s*import\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // static import ... from
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,               // side-effect import
    /(?:^|\n)\s*export\s+[^'"]*?from\s*['"]([^'"]+)['"]/g, // re-export
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,                   // dynamic import
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,                  // CJS require
  ]
  for (const re of patterns) {
    for (const m of Array.from(source.matchAll(re))) specs.push(m[1])
  }
  return specs
}

const files = walk(MODULE_ROOT)

describe('module boundary', () => {
  it('finds module files (sanity)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('imports nothing from driver-app internals', () => {
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(MODULE_ROOT, file)
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (spec.startsWith('@/')) {
          // Alias imports may only point back inside the module itself.
          if (!spec.startsWith('@/modules/rfid')) violations.push(`${rel} → ${spec}`)
        } else if (spec.startsWith('.')) {
          const resolved = path.resolve(path.dirname(file), spec)
          if (!resolved.startsWith(MODULE_ROOT)) violations.push(`${rel} → ${spec}`)
        } else if (
          !ALLOWED_BARE.has(spec) &&
          !ALLOWED_BARE_PREFIXES.some((p) => spec.startsWith(p))
        ) {
          violations.push(`${rel} → ${spec} (bare import not on allowlist)`)
        }
      }
    }
    expect(violations, `boundary violations:\n${violations.join('\n')}`).toEqual([])
  })

  it('keeps vendor implementations behind their ports', () => {
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(MODULE_ROOT, file)
      const topDir = rel.split(path.sep)[0]
      if (VENDOR_ALLOWED_DIRS.includes(topDir) || VENDOR_ALLOWED_FILES.includes(rel)) continue
      for (const spec of importSpecifiers(readFileSync(file, 'utf8'))) {
        if (VENDOR_IMPORT_PATTERN.test(spec)) violations.push(`${rel} → ${spec}`)
      }
    }
    expect(
      violations,
      `vendor imports outside server/provider/testing:\n${violations.join('\n')}`,
    ).toEqual([])
  })
})
