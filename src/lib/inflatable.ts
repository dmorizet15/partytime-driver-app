// Centralized inflatable detection — mirror of the dashboard helper at
// partytime-dashboard/src/lib/inflatable.ts. Both repos consume the same
// keyword list so the INFLATABLE badge and the Tier 1 inflatables group in
// equipmentSummary.ts stay in sync across surfaces.
//
// Substring matching against keywords rather than an exact-name allow-list,
// because TapGoods category names vary across accounts and have shifted over
// time (e.g. "Combos" vs "Combo Units"). The keyword list deliberately covers
// every PartyTime-relevant inflatable category from the master spec:
//   Inflatables, Bounce Houses, Combos / Combo Units, Water Slides,
//   Dry Slides, Venture Play, Extreme Interactive, Tap System,
//   Inflatable Packages, Do It Yourself Inflatables.
// "slide" is broad but no other PartyTime category contains the substring.

const INFLATABLE_KEYWORDS = [
  'inflat',   // inflatables, inflatable packages, do it yourself inflatables
  'bounce',   // bounce houses
  'combo',    // combos, combo units
  'slide',    // water slides, dry slides, slides
  'venture',  // venture play
  'extreme',  // extreme interactive
  'tap',      // tap system
]

export interface ItemRow {
  category?: string | null
  name?:     string | null
  qty?:      number | null
}

export function isInflatableCategory(category: string | null | undefined): boolean {
  const cat = (category ?? '').toLowerCase()
  if (!cat) return false
  return INFLATABLE_KEYWORDS.some((kw) => cat.includes(kw))
}

export function hasInflatableItem(items: unknown): boolean {
  if (!Array.isArray(items)) return false
  return (items as ItemRow[]).some((i) => isInflatableCategory(i.category))
}
