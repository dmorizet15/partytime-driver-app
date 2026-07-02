// ─── Equipment Return Tracking — the single shared rules config ──────────────
// Equipment PTR leaves behind at a DELIVERY that the pickup crew must
// retrieve. This file is the source of truth for equipment_key values in
// stop_equipment_returns — BOTH the delivery-side capture UI
// (EquipmentReturnSection) and the pickup-side display (EquipmentRetrieveCard)
// import from here, which is what keeps the keys consistent. New equipment
// types are a code change HERE, never a migration (the table deliberately has
// no CHECK enumerating keys).
//
// Trigger semantics (verified against live dispatch_stops.items, 2026-07-02):
//   'always'        — renders on every delivery (extension cords).
//   'category'      — case-insensitive exact match on items[].category.
//                     Reliable ONLY for china / flatware / glassware.
//   'name_contains' — case-insensitive substring on items[].name, minus items
//                     whose name also matches exclude_pattern; category is
//                     deliberately IGNORED. Chairs REQUIRE this: the same
//                     chair name appears live under SEATING, Chairs, AND Misc
//                     depending on the order — never gate chairs on category.
//                     exclude 'cushion' — "CHAIR CUSHIONS -BLACK (VELCRO)" etc.
//                     are a LINENS accessory, not a chair. Chiavari/chrome bar
//                     stools + farm benches intentionally do NOT match
//                     (confirmed with Darren, out of scope).

export type EquipmentReturnGroup = 'power' | 'dinnerware' | 'seating'

export interface EquipmentReturnRule {
  key: string
  label: string           // delivery-side stepper label
  group: EquipmentReturnGroup
  // "Retrieve 3 extension cords" / "Retrieve 1 chair cart" on the pickup side.
  noun: { one: string; many: string }
  trigger: 'always' | 'category' | 'name_contains'
  categories?: string[]      // trigger 'category' — lowercase exact matches
  pattern?: string           // trigger 'name_contains' — lowercase substring
  exclude_pattern?: string   // name_contains only — lowercase substring veto
}

export const EQUIPMENT_RETURN_RULES: readonly EquipmentReturnRule[] = [
  {
    key: 'extension_cords',
    label: 'Extension cords left on-site',
    group: 'power',
    noun: { one: 'extension cord', many: 'extension cords' },
    trigger: 'always',
  },
  {
    key: 'china_racks',
    label: 'China racks delivered',
    group: 'dinnerware',
    noun: { one: 'china rack', many: 'china racks' },
    trigger: 'category',
    categories: ['china'],
  },
  {
    key: 'glassware_racks',
    label: 'Glassware racks delivered',
    group: 'dinnerware',
    noun: { one: 'glassware rack', many: 'glassware racks' },
    trigger: 'category',
    categories: ['glassware'],
  },
  {
    key: 'flatware_crates',
    label: 'Flatware crates delivered',
    group: 'dinnerware',
    noun: { one: 'flatware crate', many: 'flatware crates' },
    trigger: 'category',
    categories: ['flatware'],
  },
  {
    key: 'chair_carts',
    label: 'Chair carts left on-site',
    group: 'seating',
    noun: { one: 'chair cart', many: 'chair carts' },
    trigger: 'name_contains',
    pattern: 'chair',
    exclude_pattern: 'cushion',
  },
] as const

// Display order + headers for the capture UI's grouped sections.
export const EQUIPMENT_RETURN_GROUPS: readonly { group: EquipmentReturnGroup; header: string }[] = [
  { group: 'power',      header: 'Power' },
  { group: 'dinnerware', header: 'Dinnerware' },
  { group: 'seating',    header: 'Seating' },
] as const

// Minimal item shape — matches Stop['items'][number] without importing types.
export interface EquipmentRuleItem {
  category?: string | null
  name?: string | null
}

export function ruleMatchesItems(rule: EquipmentReturnRule, items: EquipmentRuleItem[]): boolean {
  switch (rule.trigger) {
    case 'always':
      return true
    case 'category': {
      const cats = rule.categories ?? []
      return items.some((i) => cats.includes((i.category ?? '').trim().toLowerCase()))
    }
    case 'name_contains': {
      const pat = (rule.pattern ?? '').toLowerCase()
      if (!pat) return false
      const excl = (rule.exclude_pattern ?? '').toLowerCase()
      return items.some((i) => {
        const name = (i.name ?? '').toLowerCase()
        if (!name.includes(pat)) return false
        return excl ? !name.includes(excl) : true
      })
    }
  }
}

// The rules applicable to a stop's manifest, in config order. chair_carts is
// ONE rule, so a job with padded garden AND folding chairs still yields
// exactly one stepper — carts are reused across chair styles.
export function matchingEquipmentRules(items: EquipmentRuleItem[]): EquipmentReturnRule[] {
  return EQUIPMENT_RETURN_RULES.filter((r) => ruleMatchesItems(r, items))
}

export function ruleForKey(key: string): EquipmentReturnRule | null {
  return EQUIPMENT_RETURN_RULES.find((r) => r.key === key) ?? null
}

// Pickup-side card copy: "Retrieve 3 extension cords" / "Retrieve 1 chair cart".
// Unknown keys (a future rule removed from config but still in old rows)
// degrade to the raw key so the count is never silently dropped.
export function retrieveLabel(key: string, quantity: number): string {
  const rule = ruleForKey(key)
  const noun = rule
    ? (quantity === 1 ? rule.noun.one : rule.noun.many)
    : key.replace(/_/g, ' ')
  return `Retrieve ${quantity} ${noun}`
}
