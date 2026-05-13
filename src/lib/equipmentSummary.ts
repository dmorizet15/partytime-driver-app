// equipmentSummary.ts
// ───────────────────
// Two-tier equipment summary used by every space-constrained surface:
// dashboard condensed board, driver-app week view, driver-app condensed
// route list. Full-card surfaces render the manifest in their own way and
// do not consume this helper.
//
// Tier 1 — always spelled out as text, in this fixed order when present:
//   1. Tents       — consolidated by parsed size ("1 40×100 · 2 20×20")
//   2. Chairs      — rolled-up total ("100 chairs"). Chair-name override
//                    is part of resolveCategory(): any item whose name
//                    contains CHAIR routes here even if raw category is
//                    "Misc". TapGoods chair miscategorization happens
//                    often enough to matter operationally.
//   3. Tables      — rolled-up total ("6 tables")
//   4. Linens      — rolled-up total ("12 linens")
//   5. Inflatables — one token per line item, qty-prefixed, original order
//                    ("1 Bounce House · 1 Giant Slide"). No name-dedup —
//                    each line stays separately visible.
//
// Tier 2 — every category not matched above, normalized through
// resolveCategory (legacy "Venues & Outdoors" → "Heating & Cooling",
// "Catering & Utility" → "Catering & Cooking", empty + non-tent → Miscellaneous),
// deduped, alphabetically sorted. Renderers display these as small pills
// (no qty). Casing comes from CATEGORY_MAP so pills read as proper labels.
//
// Inflatable classification reuses the keyword list in inflatable.ts so
// the same definition drives both the INFLATABLE badge and the Tier 1
// inflatables group.

import { isInflatableCategory } from './inflatable'
import { resolveCategory }      from './itemCategories'

interface ItemLine {
  category: string
  name:     string
  qty:      number
}

interface StopLike {
  items: unknown
}

export interface EquipmentSummary {
  tier1: string[]
  tier2: string[]
}

export function buildStopEquipmentSummary(stop: StopLike): EquipmentSummary {
  return buildEquipmentSummary(stop.items)
}

export function buildEquipmentSummary(items: unknown): EquipmentSummary {
  const empty: EquipmentSummary = { tier1: [], tier2: [] }
  if (!Array.isArray(items) || items.length === 0) return empty
  const lines = items as ItemLine[]

  type Bucket = 'tents' | 'chairs' | 'tables' | 'linens' | 'inflatables' | 'other'
  function bucketOf(displayCategory: string): Bucket {
    if (displayCategory === 'Tents')  return 'tents'
    if (displayCategory === 'Chairs') return 'chairs'
    if (displayCategory === 'Tables') return 'tables'
    if (displayCategory === 'Linens') return 'linens'
    if (isInflatableCategory(displayCategory)) return 'inflatables'
    return 'other'
  }

  const tents:       ItemLine[] = []
  const chairs:      ItemLine[] = []
  const tables:      ItemLine[] = []
  const linens:      ItemLine[] = []
  const inflatables: ItemLine[] = []
  // Others carry their resolved display name on `category` for direct use
  // as a Tier 2 pill label.
  const others:      ItemLine[] = []

  for (const i of lines) {
    const display = resolveCategory(i.category, i.name)
    switch (bucketOf(display)) {
      case 'tents':       tents.push(i); break
      case 'chairs':      chairs.push(i); break
      case 'tables':      tables.push(i); break
      case 'linens':      linens.push(i); break
      case 'inflatables': inflatables.push(i); break
      default:            others.push({ ...i, category: display }); break
    }
  }

  const tier1: string[] = []

  if (tents.length > 0) {
    // Tent dimension parser — mirrors parseTentSqft in the dashboard's
    // stopTimeEstimator.ts. Handles optional foot/inch marks on either
    // side (44'X83', 7'X20') which the simpler `\d×\d` regex would miss.
    const TENT_DIM_RE = /(\d+)\s*['"′″]?\s*[xX×]\s*['"′″]?\s*(\d+)/
    const counts = new Map<string, { qty: number; sqft: number }>()
    for (const t of tents) {
      const m = (t.name ?? '').match(TENT_DIM_RE)
      const size = m ? `${m[1]}×${m[2]}` : (t.name ?? '').trim()
      if (!size) continue
      const sqft = m ? Number(m[1]) * Number(m[2]) : 0
      const existing = counts.get(size)
      if (existing) existing.qty += t.qty || 1
      else counts.set(size, { qty: t.qty || 1, sqft })
    }
    // Sort by physical sqft × qty descending — same priority weighting the
    // full StopCard / WarehouseStopCard use so the largest pieces always
    // lead the line (40×100 before 7×20, etc.). Non-parseable entries
    // (assembly fees, walls without dims) get sqft=0 and trail.
    for (const [size, { qty }] of Array.from(counts.entries()).sort(
      ([, a], [, b]) => b.sqft * b.qty - a.sqft * a.qty,
    )) {
      tier1.push(`${qty} ${size}`)
    }
  }

  const chairTotal = chairs.reduce((s, i) => s + (i.qty || 1), 0)
  if (chairTotal > 0) tier1.push(`${chairTotal} chairs`)
  const tableTotal = tables.reduce((s, i) => s + (i.qty || 1), 0)
  if (tableTotal > 0) tier1.push(`${tableTotal} tables`)
  const linenTotal = linens.reduce((s, i) => s + (i.qty || 1), 0)
  if (linenTotal > 0) tier1.push(`${linenTotal} linens`)

  for (const inf of inflatables) {
    const name = (inf.name ?? '').trim() || 'Inflatable'
    const qty  = inf.qty || 1
    tier1.push(`${qty} ${name}`)
  }

  const seen = new Set<string>()
  for (const o of others) {
    const display = (o.category ?? '').trim()
    if (!display) continue
    seen.add(display)
  }
  const tier2 = Array.from(seen).sort()

  return { tier1, tier2 }
}
