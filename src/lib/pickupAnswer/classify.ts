// Pickup Answer — pure item classification (inflatable / tent).
//
// Doctrine (LOCKED in the spec): single source of truth, name-match aware.
//   • Inflatable: category `INFLATABLES` leaks into GAMES / Misc / blank
//     (verified live 2026-07-06 — e.g. "EMERALD ICE DUAL LANE DRY SLIDE" and
//     "CASTLE COMBO -RED/BLUE" sit under a BLANK category), so detection is
//     category OR name — never category-only. We reuse `isInflatableCategory`
//     from ../inflatable VERBATIM (the exact keyword list the dashboard's
//     INFLATABLE pill uses) and apply it to the NAME as well, so a leaked unit
//     is still caught. Conversely, keyword-less names ("MECHANICAL BULL",
//     "JOUST CHALLENGE") are caught by their INFLATABLES category — which is
//     why BOTH gates are OR'd, not AND'd.
//   • Tent: pure mirror of `isTentItem` in ../ava/dependencyHits (category has
//     'tent' AND name has tent/canopy/marquee). That module imports the
//     supabase browser client, so importing it here would make this module
//     impure and break its offline testability — the predicate is tiny and
//     mirrored with this note binding the two. Keep them in lockstep.

import { isInflatableCategory } from '../inflatable'
import type { PickupItem } from './types'

// Names that contain an inflatable keyword substring but are ANCHOR/WEIGHT
// accessories, not the unit itself (e.g. "SAND BAGS /WEIGHTS SLIDE OVER 18'"
// matches 'slide'). Excluded ONLY from the name-fallback path — an item whose
// CATEGORY is inflatable stays inflatable (mirrors dashboard behavior).
const INFLATABLE_NAME_EXCLUDE = ['sand bag', 'sandbag', 'weight']

function nameMatchesInflatable(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase()
  if (!n) return false
  if (INFLATABLE_NAME_EXCLUDE.some((x) => n.includes(x))) return false
  // Reuse the exact category keyword list against the NAME string.
  return isInflatableCategory(n)
}

export function isInflatableItem(it: PickupItem): boolean {
  return isInflatableCategory(it.category) || nameMatchesInflatable(it.name)
}

// Mirror of ../ava/dependencyHits `isTentItem` — keep byte-identical.
const TENT_NAME_KEYWORDS = ['tent', 'canopy', 'marquee']

export function isTentItem(it: PickupItem): boolean {
  const category = (it.category ?? '').toLowerCase()
  const name     = (it.name ?? '').toLowerCase()
  return category.includes('tent') && TENT_NAME_KEYWORDS.some((kw) => name.includes(kw))
}

export function hasInflatableItems(items: PickupItem[] | null | undefined): boolean {
  return Array.isArray(items) && items.some(isInflatableItem)
}

export function hasTentItems(items: PickupItem[] | null | undefined): boolean {
  return Array.isArray(items) && items.some(isTentItem)
}
