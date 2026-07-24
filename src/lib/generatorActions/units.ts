// ─── Generator Stop Actions — the single shared unit-detection config ───────
// Metered generator units are detected by EXACT item-name match (case-
// insensitive, trimmed) — never a substring/category match. Category is
// unreliable here the same way it's unreliable for chairs (see
// equipmentReturns/rules.ts): stop items carry only {qty, name, category,
// tapgoods_pick_list_item_id}, no product id. Exact-name match is safe
// specifically because Darren verified (2026-07-23) the two 50KVA units are
// separate TapGoods products with visibly distinct names — the no-suffix
// name is NOT a substring/prefix relationship that could collide with the
// "(WN)" name under a looser match, so exact equality is both simplest and
// correct. Portable generators (DuroMax 10K, Homelite 6.25K, Honda 2K, Lifan
// 8.75K, Subaru 7.5K) are deliberately absent from this list — no card, no
// gate, ever, for those stops.
//
// New units are a code change here, never a migration — same doctrine as
// EQUIPMENT_RETURN_RULES.

export interface GeneratorUnitConfig {
  itemName: string   // exact stop item name, matched case-insensitively
  assetId: string     // non_truck_assets.id
  unitLabel: string   // matches non_truck_assets.unit_label, for display
}

export const GENERATOR_UNITS: readonly GeneratorUnitConfig[] = [
  {
    itemName: 'GENERATOR - 130KVA SUPER QUIET (WN)',
    assetId: '26b9ca30-a1ef-4d70-a779-6393a85c3b4a',
    unitLabel: 'WN',
  },
  {
    itemName: 'GENERATOR - 35KVA SUPER QUIET (WN)',
    assetId: 'e0ccec1e-ba82-452f-aaaf-9f33c120e70c',
    unitLabel: 'WN',
  },
  {
    // No suffix — this is the Terex unit (TapGoods product 242198). Do not
    // confuse with the "(WN)" 50KVA row below; they are separate products.
    itemName: 'GENERATOR - 50KVA SUPER QUIET',
    assetId: 'c3e6cd13-1613-473e-b810-ada026146427',
    unitLabel: 'Terex',
  },
  {
    itemName: 'GENERATOR - 50KVA SUPER QUIET (WN)',
    assetId: 'b765c407-9acf-4de5-8b9a-3db9820398e5',
    unitLabel: 'WN',
  },
] as const

export interface GeneratorUnitItem {
  name?: string | null
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

// Units detected on a stop's manifest, in config order. A stop can carry more
// than one metered unit (rare, but a job could rent two different sizes) —
// each gets its own card, keyed by assetId (matches the table's
// UNIQUE(stop_id, asset_id, action_type)).
export function matchingGeneratorUnits(items: GeneratorUnitItem[]): GeneratorUnitConfig[] {
  const names = new Set(items.map((i) => normalize(i.name ?? '')).filter(Boolean))
  return GENERATOR_UNITS.filter((u) => names.has(normalize(u.itemName)))
}

export function unitForAssetId(assetId: string): GeneratorUnitConfig | null {
  return GENERATOR_UNITS.find((u) => u.assetId === assetId) ?? null
}
