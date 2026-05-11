// equipmentSummary.ts
// ───────────────────
// Builds a 1–2 line equipment summary string for a stop, prioritized per
// Schedule View v1 spec:
//
//   1. TENTS first — consolidated by parsed size, count-prefixed
//      ("1 40×100 · 3 20×20 · 2 20×40")
//   2. CHAIRS and TABLES — single rolled-up totals ("100 chairs · 6 tables")
//   3. FLOORING & STAGING — category-level mention ("dance floor · stage")
//   4. Everything else — category names only, joined with " · "
//
// Existing line-item formatters in the codebase informed the shape but each
// targets a different surface and none implements the spec's exact ordering:
//   • dashboard print/route: formatItemsFull() — splits tents vs others,
//     qty-suffixes per item rather than per consolidated size
//   • driver-app supabaseTransform: formatItemsText() — same shape as print,
//     joins with " · "
//   • stopTimeEstimator: estimateMinutes() — counts tent sqft for the time
//     formula, owns the (\d+)\s*[xX×]\s*(\d+) regex
//
// All three live independently and serve different surfaces — no shared
// helper to extend. Stop.items is stored as untyped JSON in dispatch_stops
// (column type `unknown | null` in /src/types/board.ts) with the shape
// { category, name, qty } established at sync time in tapgoodsSync.ts
// buildItems().

const LINE_LIMIT = 2
const LINE_CHAR_CAP = 90 // soft per-line cap; truncate with "…" on overflow

interface ItemLine {
  category: string
  name:     string
  qty:      number
}

interface StopLike {
  items: unknown
}

// Public API — pass any object with an `items` field (DispatchStop, Stop, etc).
export function buildStopEquipmentSummary(stop: StopLike): string {
  return buildEquipmentSummary(stop.items)
}

// Lower-level entry — useful for tests and direct callers that already have
// a parsed items array.
export function buildEquipmentSummary(items: unknown): string {
  if (!Array.isArray(items) || items.length === 0) return ''
  const lines = items as ItemLine[]

  const groups: { tents: string[]; chairs: number; tables: number; flooringStaging: string[]; others: string[] } = {
    tents:            buildTentTokens(lines),
    chairs:           sumByExactCategory(lines, 'chairs'),
    tables:           sumByExactCategory(lines, 'tables'),
    flooringStaging:  flooringStagingTokens(lines),
    others:           otherCategoryTokens(lines),
  }

  const tokens: string[] = []
  tokens.push(...groups.tents)
  if (groups.chairs > 0) tokens.push(`${groups.chairs} chairs`)
  if (groups.tables > 0) tokens.push(`${groups.tables} tables`)
  tokens.push(...groups.flooringStaging)
  tokens.push(...groups.others)

  if (tokens.length === 0) return ''

  return wrapAndCap(tokens)
}

// Tents consolidated by parsed size. "40×100" extracted from item.name; falls
// back to the raw name when the dimension regex doesn't match (rare — e.g.
// "Pole tent assembly fee" line items). Token format: "1 40×100", "3 20×20".
function buildTentTokens(lines: ItemLine[]): string[] {
  const tents = lines.filter((i) => (i.category ?? '').toLowerCase() === 'tents')
  if (tents.length === 0) return []
  const counts = new Map<string, number>()
  for (const t of tents) {
    const m = (t.name ?? '').match(/(\d+)\s*[xX×]\s*(\d+)/)
    const size = m ? `${m[1]}×${m[2]}` : (t.name ?? '').trim()
    if (!size) continue
    counts.set(size, (counts.get(size) ?? 0) + (t.qty || 1))
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([size, qty]) => `${qty} ${size}`)
}

function sumByExactCategory(lines: ItemLine[], target: string): number {
  return lines
    .filter((i) => (i.category ?? '').toLowerCase() === target)
    .reduce((sum, i) => sum + (i.qty || 1), 0)
}

// "Flooring & Staging" is typically one TapGoods category; some accounts
// split into separate "Dance Floor" / "Staging" categories. Both flow into
// the same group here as bare category names (no qty), per spec.
function flooringStagingTokens(lines: ItemLine[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const i of lines) {
    const c = (i.category ?? '').toLowerCase()
    const isMatch =
      c.includes('flooring') ||
      c.includes('staging') ||
      c === 'stage' ||
      c === 'dance floor' ||
      c === 'dance floors'
    if (!isMatch) continue
    const key = (i.category ?? '').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push((i.category ?? '').trim().toLowerCase())
  }
  return out
}

function otherCategoryTokens(lines: ItemLine[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const i of lines) {
    const raw = (i.category ?? '').trim()
    if (!raw) continue
    const lower = raw.toLowerCase()
    if (
      lower === 'tents' ||
      lower === 'chairs' ||
      lower === 'tables' ||
      lower.includes('flooring') ||
      lower.includes('staging') ||
      lower === 'stage' ||
      lower === 'dance floor' ||
      lower === 'dance floors'
    ) continue
    if (seen.has(lower)) continue
    seen.add(lower)
    out.push(lower)
  }
  return out
}

// Joins tokens with " · " and wraps to at most LINE_LIMIT lines. If the
// content would overflow, truncate the last visible token with "…".
function wrapAndCap(tokens: string[]): string {
  const lines: string[] = []
  let current = ''
  for (const tok of tokens) {
    const candidate = current ? `${current} · ${tok}` : tok
    if (candidate.length <= LINE_CHAR_CAP) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = tok
    if (lines.length >= LINE_LIMIT - 1 && (current.length > LINE_CHAR_CAP || tokens.indexOf(tok) < tokens.length - 1)) {
      const truncated = current.length > LINE_CHAR_CAP
        ? current.slice(0, LINE_CHAR_CAP - 1) + '…'
        : current + ' …'
      lines.push(truncated)
      return lines.slice(0, LINE_LIMIT).join('\n')
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, LINE_LIMIT).join('\n')
}
