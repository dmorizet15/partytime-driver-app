// ─── Status vocabulary — EXACT strings from the live app ────────────────────
// Do not invent values; do not localize; do not rename. The backend stores
// status as free text, so a typo here silently forks the dataset.

export const ITEM_STATUSES = [
  'Needs to be Inspected',
  'Ready to Rent',
  'Repair',
  'Staged',
  'Wash',
  'Wet',
] as const
export type ItemStatus = (typeof ITEM_STATUSES)[number]

/** Statuses that block a delivery checkout (non-rentable). */
export const NON_RENTABLE_STATUSES: ReadonlySet<string> = new Set([
  'Wash',
  'Repair',
  'Wet',
  'Needs to be Inspected',
])

/** Wash reason vocabulary (live app) + free-text Other. */
export const WASH_REASONS = [
  'Dirty / Mud',
  'Leaves',
  'Oil',
  'Mold',
  'Stain',
  'Oxidation',
  'Wet',
] as const

/** Repair reason vocabulary (live app) + free-text Location of Repair. */
export const REPAIR_REASONS = [
  'Rip or Tear',
  'Sewing repair needed',
  'Grommet',
  'Rope',
  'Buckle',
] as const

/** Statuses whose selection REQUIRES at least one reason. */
export const REASON_REQUIRED_STATUSES: ReadonlySet<string> = new Set(['Wash', 'Repair'])
