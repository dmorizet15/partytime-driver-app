// AVA Tier 2 — checklist source-of-truth.
//
// Rules live in the `dependency_map` table (Migration 016). Three trigger
// shapes:
//   - 'always'  : fire every route, independent of manifest
//   - 'category': fire when item.category equals trigger_value (case-insensitive)
//   - 'keyword' : fire when item.name contains trigger_value (case-insensitive)
//
// For category/keyword rules, the rule fires when the SUMMED qty of matching
// items meets quantity_threshold (e.g. "5+ walls → ladders" needs ≥5 sidewall
// items). Items with null qty count as 1 (mirrors countTentItems).
//
// countHitsForItems returns the DISTINCT count of required_item values across
// fired manifest-triggered rules — so two rules requiring "Hand truck" only
// raise the hit count by 1.

import { supabase } from '../supabase'

export type DependencyMapRow = {
  id:                 string
  trigger_type:       'category' | 'keyword' | 'always'
  trigger_value:      string | null
  quantity_threshold: number
  required_item:      string
  required_quantity:  number
  notes:              string | null
  active:             boolean
}

type ManifestItem = { category?: string | null; name?: string | null; qty?: number | null }

function itemQty(it: ManifestItem): number {
  return Math.max(1, it.qty ?? 1)
}

function ruleFires(row: DependencyMapRow, items: ManifestItem[]): boolean {
  const tv = (row.trigger_value ?? '').toLowerCase()
  if (!tv) return false

  let matched = 0
  for (const it of items) {
    if (row.trigger_type === 'category') {
      if ((it.category ?? '').toLowerCase() === tv) matched += itemQty(it)
    } else if (row.trigger_type === 'keyword') {
      if ((it.name ?? '').toLowerCase().includes(tv)) matched += itemQty(it)
    }
  }
  return matched >= row.quantity_threshold
}

async function fetchManifestTriggers(): Promise<DependencyMapRow[]> {
  const { data, error } = await supabase
    .from('dependency_map')
    .select('*')
    .eq('active', true)
    .in('trigger_type', ['category', 'keyword'])
  if (error || !data) return []
  return data as unknown as DependencyMapRow[]
}

export async function countHitsForItems(items: ManifestItem[]): Promise<number> {
  const rows = await fetchManifestTriggers()
  const fired = new Set<string>()
  for (const row of rows) {
    if (ruleFires(row, items)) fired.add(row.required_item)
  }
  return fired.size
}

export async function getAlwaysCarryItems(): Promise<DependencyMapRow[]> {
  const { data, error } = await supabase
    .from('dependency_map')
    .select('*')
    .eq('active', true)
    .eq('trigger_type', 'always')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data as unknown as DependencyMapRow[]
}

export async function getTriggeredItems(items: ManifestItem[]): Promise<DependencyMapRow[]> {
  const rows = await fetchManifestTriggers()
  return rows.filter((row) => ruleFires(row, items))
}

// ---------------------------------------------------------------------------
// Lightweight tent sniff — used by the morning-message generator to pick the
// "heavy tent day" template and to display the tent count.
//
// An item counts as a tent only when BOTH hold:
//   - category contains 'tent'   (it's filed under the TENTS family), AND
//   - name contains 'tent' | 'canopy' | 'marquee'  (it's an actual tent, not
//     an accessory)
//
// Why both: items filed under category "TENTS" include walls, wind walls, and
// doors — accessories whose NAME has no tent keyword, so the name gate drops
// them. Conversely a "tent heater" filed under a non-TENTS category has the
// name keyword but fails the category gate, so it's dropped too. Qty is summed
// on matched items (3 units of one tent model = 3, which is correct copy).
const TENT_NAME_KEYWORDS = ['tent', 'canopy', 'marquee']

function isTentItem(it: ManifestItem): boolean {
  const name     = (it.name ?? '').toLowerCase()
  const category = (it.category ?? '').toLowerCase()
  return category.includes('tent')
    && TENT_NAME_KEYWORDS.some((kw) => name.includes(kw))
}

export function countTentItems(items: ManifestItem[]): number {
  let total = 0
  for (const it of items) {
    if (isTentItem(it)) total += Math.max(1, it.qty ?? 1)
  }
  return total
}
