// equipmentSummary.ts
// ───────────────────
// Two-tier equipment summary used by every space-constrained surface:
// dashboard condensed board, driver-app week view, driver-app condensed
// route list. Full-card surfaces render the manifest in their own way and
// do not consume this helper.
//
// Tier 1 — always spelled out as text, in this fixed order when present:
//   1. Tents       — consolidated by parsed size ("1 40×100 · 2 20×20")
//   2. Chairs      — rolled-up total ("100 chairs"). Chair-name override:
//                    any item whose name contains CHAIR routes here even if
//                    raw category is "Misc" (mirrors itemCategories
//                    resolveCategory; chair counts matter operationally).
//   3. Tables      — rolled-up total ("6 tables")
//   4. Linens      — rolled-up total ("12 linens")
//   5. Inflatables — one token per line item, qty-prefixed, original order
//                    ("1 Bounce House · 1 Giant Slide"). No name-dedup —
//                    each line stays separately visible.
//
// Tier 2 — every category not matched above, deduped + lowercased,
// alphabetically sorted. Renderers display these as small pills (no qty).
//
// Inflatable classification reuses the keyword list in inflatable.ts so
// the same definition drives both the INFLATABLE badge and the Tier 1
// inflatables group.

import { isInflatableCategory } from './inflatable'

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
  function bucketOf(i: ItemLine): Bucket {
    const cat  = (i.category ?? '').toLowerCase().trim()
    const name = (i.name ?? '').toUpperCase()
    if (name.includes('CHAIR'))      return 'chairs'
    if (isInflatableCategory(cat))   return 'inflatables'
    if (cat === 'tents')             return 'tents'
    if (cat === 'chairs')            return 'chairs'
    if (cat === 'tables')            return 'tables'
    if (cat === 'linens')            return 'linens'
    return 'other'
  }

  const tents:       ItemLine[] = []
  const chairs:      ItemLine[] = []
  const tables:      ItemLine[] = []
  const linens:      ItemLine[] = []
  const inflatables: ItemLine[] = []
  const others:      ItemLine[] = []

  for (const i of lines) {
    switch (bucketOf(i)) {
      case 'tents':       tents.push(i); break
      case 'chairs':      chairs.push(i); break
      case 'tables':      tables.push(i); break
      case 'linens':      linens.push(i); break
      case 'inflatables': inflatables.push(i); break
      default:            others.push(i); break
    }
  }

  const tier1: string[] = []

  if (tents.length > 0) {
    const counts = new Map<string, number>()
    for (const t of tents) {
      const m = (t.name ?? '').match(/(\d+)\s*[xX×]\s*(\d+)/)
      const size = m ? `${m[1]}×${m[2]}` : (t.name ?? '').trim()
      if (!size) continue
      counts.set(size, (counts.get(size) ?? 0) + (t.qty || 1))
    }
    for (const [size, qty] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
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
    const raw = (o.category ?? '').trim().toLowerCase()
    if (!raw) continue
    seen.add(raw)
  }
  const tier2 = Array.from(seen).sort()

  return { tier1, tier2 }
}
