// Display-name normalization for TapGoods item categories — mirror of
// partytime-dashboard/src/lib/itemCategories.ts. Both repos consume the
// same map so equipmentSummary.ts emits identical Tier 2 pill labels and
// bucket classification across surfaces.
//
// TapGoods renamed some product categories at some point but the API still
// emits the legacy strings on existing items, so the data layer sees a mix
// of old and new names. ~159 production items also carry an empty-string
// category (frame tents, ballasting, restroom trailers — the long tail).
//
// resolveCategory() takes a raw items[] entry and returns the display name
// the manifest should show. Pass-through for unknown values keeps future
// TapGoods additions visible instead of silently dropping them.

// Keys are intentionally lowercased so the lookup tolerates whatever casing
// TapGoods returns (productCategoryName has come through as both "Tents" and
// "tents" across accounts). Values keep canonical display casing — exact-match
// downstream consumers (StopCard `i.display === 'Tents'`, equipmentSummary
// bucketOf) continue to work.
const CATEGORY_MAP: Record<string, string> = {
  'misc':                'Miscellaneous',
  'tents':               'Tents',
  'tables':              'Tables',
  'chairs':              'Chairs',
  'tabletop':            'Tabletop',
  'linens':              'Linens',
  'inflatables':         'Inflatables',
  'lighting':            'Lighting',
  'audio & video':       'Audio & Video',
  // Legacy TapGoods category names — mapped to the current display name.
  // Confirmed against production samples:
  //   Catering & Utility → BAKER'S RACK / SPEEDRACK     → Catering & Cooking
  //   Venues & Outdoors  → PATIO HEATER                 → Heating & Cooling
  'catering & utility':  'Catering & Cooking',
  'venues & outdoors':   'Heating & Cooling',
  // Flooring & Staging — TapGoods uses both spellings (and frequently
  // emits no category at all for stage line items, which the empty-category
  // STAGE/DANCE FLOOR fallback below catches by name).
  'flooring and staging': 'Flooring and Staging',
  'flooring & staging':   'Flooring and Staging',
}

// Returns the display-name bucket for a single items[] entry. Order of
// operations matches the manifest spec:
//   1. name-based chair detection (overrides raw category) — TapGoods often
//      files chairs under "Misc" instead of "Chairs", which would otherwise
//      hide chair qty inside the Misc count. Any item whose name contains
//      CHAIR is routed to the Chairs bucket regardless of raw category.
//   2. trim whitespace (raw values like "PATIO HEATER " have a trailing space)
//   3. if raw is empty, keyword-detect the item name — names containing
//      TENT or WALL bucket into Tents; everything else falls back to
//      Miscellaneous
//   4. look up the trimmed raw in CATEGORY_MAP
//   5. unknown values fall through as the trimmed raw string itself
export function resolveCategory(rawCategory: string | undefined | null, name: string): string {
  const upper = (name ?? '').toUpperCase()
  if (upper.includes('CHAIR')) return 'Chairs'

  const raw = (rawCategory ?? '').trim()
  if (raw === '') {
    if (upper.includes('TENT') || upper.includes('WALL')) return 'Tents'
    // Empty-category stage / dance floor — TapGoods often emits no
    // category for these (long-tail items). Catch by name so the pill
    // survives instead of collapsing into Miscellaneous. Bound to empty
    // category so legitimate cross-categorized items (e.g. "Stage Light"
    // with category="Lighting") are not affected.
    if (upper.includes('STAGE') || upper.includes('DANCE FLOOR')) return 'Flooring and Staging'
    return 'Miscellaneous'
  }
  // Misc-category rescue: TapGoods sometimes files staging hardware
  // (skirts, ramps, deck panels, stage segments) under "Misc" because the
  // UI category doesn't match the API category value. Catch by name before
  // CATEGORY_MAP collapses everything to Miscellaneous. CHAIR is already
  // caught at the top of the function so it applies to Misc rows too.
  if (raw.toLowerCase() === 'misc') {
    if (upper.includes('STAGE') || upper.includes('SKIRT')) return 'Flooring and Staging'
    if (upper.includes('RAMP')  || upper.includes('DECK'))  return 'Flooring and Staging'
  }
  return CATEGORY_MAP[raw.toLowerCase()] ?? raw
}
