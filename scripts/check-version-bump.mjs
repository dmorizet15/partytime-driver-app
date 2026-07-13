#!/usr/bin/env node
// Version guard — fail when a change touches the driver-facing app but does NOT
// bump the app VERSION in src/lib/appVersion.ts.
//
// Why: the "What's New" release-notes sheet only re-appears when VERSION differs
// from each driver's stored ptr_last_seen_version. If we ship driver-facing
// changes without bumping VERSION (+ CHANGELOG), drivers never see what changed
// — exactly the regression that left VERSION frozen at 2.0.0 from 2026-06-14
// through 2026-06-28 across many deploys.
//
// Usage:  node scripts/check-version-bump.mjs [baseRef] [headRef]
//   baseRef  — commit/ref the change is measured FROM. Defaults to origin/main
//              (then HEAD~1), so `npm run check:version` works with no args and
//              answers "would this push need a bump?"
//   headRef  — commit/ref the change is measured TO  (default: HEAD)
//
// Escape hatch: put [skip version] in any commit message in the range when a
// change genuinely has nothing a driver would notice (API-only, CI, docs, etc.).
//
// Enforcement: the CI workflow (.github/workflows/version-guard.yml) runs this on
// pushes to main, but a push has ALREADY deployed by then — there it is only a red
// ✗ reminder. The blocking check is the pre-push hook (.githooks/pre-push,
// installed via `npm run hooks:install`). See tasks/lessons.md.
//
// Exit codes: 0 = ok / not required / skipped · 1 = needs a version bump
//             2 = bad invocation (never blocks on internal errors)

import { execSync } from 'node:child_process'

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function revExists(ref) {
  try { sh(`git rev-parse --verify --quiet ${ref}^{commit}`); return true }
  catch { return false }
}

// Resolve the comparison base when none was supplied: what we're about to push
// against (origin/main), falling back to the previous commit.
function defaultBase() {
  for (const ref of ['origin/main', 'HEAD~1']) if (revExists(ref)) return ref
  return null
}

const base = process.argv[2] || process.env.BASE_REF || defaultBase()
const head = process.argv[3] || process.env.HEAD_REF || 'HEAD'

if (!base) {
  console.error('version-guard: no base ref (no origin/main, no HEAD~1); skipping.')
  process.exit(0)
}

// Paths whose changes drivers actually run (the app surface).
const DRIVER_FACING = [
  /^src\/app\//,
  /^src\/screens\//,
  /^src\/components\//,
  /^src\/hooks\//,
  /^src\/context\//,
  /^src\/lib\//,
  /^public\/(?!sw\.js)/, // manifest/icons/etc., but not the generated SW
]

// Carve-outs that are not, on their own, a driver-visible change.
const IGNORE = [
  /^src\/lib\/appVersion\.ts$/, // the version file itself
  /^src\/types\//,              // type-only plumbing
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /\.stories\.[tj]sx?$/,
  /^src\/app\/api\//,           // server API routes — no UI the driver sees directly
]

let changed = []
try {
  changed = sh(`git diff --name-only ${base} ${head}`).split('\n').filter(Boolean)
} catch (e) {
  // A diff we can't compute should never block a deploy.
  console.error(`version-guard: could not compute diff (${e.message}); skipping.`)
  process.exit(0)
}

const driverChanges = changed.filter(
  (f) => DRIVER_FACING.some((r) => r.test(f)) && !IGNORE.some((r) => r.test(f)),
)

if (driverChanges.length === 0) {
  console.log('✓ version-guard: no driver-facing app changes — version bump not required.')
  process.exit(0)
}

// Allow an explicit opt-out via commit message.
let messages = ''
try {
  messages = sh(`git log --format=%B ${base}..${head}`)
} catch {
  /* range log unavailable — fall through to the version check */
}
if (/\[skip[ -]version\]/i.test(messages)) {
  console.log('✓ version-guard: [skip version] found in commit message(s) — bypassed.')
  process.exit(0)
}

// Read the live version at both ends of the range. Two shapes to support:
// current — RELEASES[0].version is the live version (VERSION is derived from
// it, so there is no VERSION literal to grep); pre-2.7.1 — a literal
// `export const VERSION = 'x.y.z'`. The base ref of a range often predates the
// restructure, so BOTH must keep working or the guard fails every push.
function versionAt(ref) {
  try {
    const src = sh(`git show ${ref}:src/lib/appVersion.ts`)
    const release = src.match(/version:\s*['"]([^'"]+)['"]/)   // first = newest
    if (release) return release[1]
    const literal = src.match(/VERSION\s*=\s*['"]([^'"]+)['"]/)
    return literal ? literal[1] : null
  } catch {
    return null
  }
}

const before = versionAt(base)
const after = versionAt(head)

if (before && after && before !== after) {
  const changelogTouched = changed.includes('src/lib/appVersion.ts')
  console.log(`✓ version-guard: VERSION bumped ${before} → ${after}.`)
  if (!changelogTouched) {
    // VERSION changed but the file wasn't in the changed set? Shouldn't happen,
    // but warn rather than fail.
    console.warn('  (warning: VERSION changed but appVersion.ts not in the diff?)')
  }
  process.exit(0)
}

console.error('')
console.error('✗ version-guard: driver-facing changes detected, but app VERSION was NOT bumped.')
console.error('')
console.error('  Driver-facing files in this change:')
for (const f of driverChanges.slice(0, 20)) console.error(`    - ${f}`)
if (driverChanges.length > 20) console.error(`    …and ${driverChanges.length - 20} more`)
console.error('')
console.error('  Before drivers receive this, update src/lib/appVersion.ts so the')
console.error('  "What\'s New" sheet shows them what changed:')
console.error('')
console.error('    add ONE new entry at the TOP of RELEASES (current: ' + (after ?? 'unknown') + ')')
console.error('    with the new version + only THIS release\'s driver-facing bullets.')
console.error('    VERSION derives from it. Do NOT add bullets to an existing release.')
console.error('')
console.error('  If this change has nothing a driver would notice, add [skip version]')
console.error('  to a commit message in this push.')
console.error('')
process.exit(1)
