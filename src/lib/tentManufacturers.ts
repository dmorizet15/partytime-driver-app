// Canonical tent manufacturer list. Locked — keep this in sync with the
// dashboard's copy at partytime-dashboard/src/lib/tentManufacturers.ts.
// Spelling (Fred's apostrophe, E-Z Up hyphen, Top-Tec hyphen) must match
// exactly so dashboard upload + driver filtering line up.
export const TENT_MANUFACTURERS = [
  'Anchor',
  'Aztec Tents',
  'Celina',
  'Central Tent',
  'Eureka',
  'E-Z Up',
  'Fiesta Tent',
  "Fred's",
  'Ideal Canopy',
  'Losberger',
  'Tentology',
  'Top-Tec Tents',
] as const

export type TentManufacturer = (typeof TENT_MANUFACTURERS)[number]
