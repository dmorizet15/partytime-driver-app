// AVA Tier 2 — checklist offer trigger.
//
// PHASE 1 / SESSION 2 STATE: dependency map content is not seeded yet (Darren
// content task — Notion `3550aa6451b881f19285e369387b75b6`, "Dependency map
// content authoring"). Until the map exists, this helper returns 0 so the
// checklist offer on the AVA card stays hidden.
//
// When content lands (a `dependency_map` table or seed file), swap the body
// to count hits across today's items. Signature stays stable; the AVA card
// consumer reads only the returned count.

type ManifestItem = { category?: string | null; name?: string | null; qty?: number | null }

export function countHitsForItems(_items: ManifestItem[]): number {
  return 0
}

// Lightweight category sniff — used by the morning-message generator to pick
// the "heavy tent day" template. Independent of the dependency map; based on
// the same item-name keywords the rest of the app uses (see `lib/inflatable.ts`
// for the pattern). Conservative — counts any item whose name or category
// contains a tent keyword.
const TENT_KEYWORDS = ['tent', 'canopy', 'marquee']

export function countTentItems(items: ManifestItem[]): number {
  let total = 0
  for (const it of items) {
    const blob = `${it.name ?? ''} ${it.category ?? ''}`.toLowerCase()
    if (TENT_KEYWORDS.some((kw) => blob.includes(kw))) {
      total += Math.max(1, it.qty ?? 1)
    }
  }
  return total
}
