// AVA Remembers — read-side client for the morning brief.
// Writer UI (note entry on stop detail + arrival surface) ships in Session 4.
// This module is read-only this session: given today's stops, count how many
// have at least one prior note authored at the same normalized address.

import { supabase } from '../supabase'

type StopAddressInput = {
  address_line_1: string
  city?:          string
  state?:         string
  postal_code?:   string
}

// Mirror of the address normalizer the migration expects: lowercase,
// punctuation stripped, whitespace collapsed. Same routine will be used by the
// future writer UI so reads and writes hit the same key.
export function addressKey(stop: StopAddressInput): string {
  const raw = [stop.address_line_1, stop.city, stop.state, stop.postal_code]
    .filter(Boolean)
    .join(' ')
  return raw
    .toLowerCase()
    .replace(/[.,#'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns the number of distinct address_keys among today's stops that have
 * at least one ava_stop_notes row. Single supabase query gated by RLS;
 * authenticated users can read all rows.
 */
export async function fetchTodayNotesHitCount(addressKeys: string[]): Promise<number> {
  if (addressKeys.length === 0) return 0
  const { data, error } = await supabase
    .from('ava_stop_notes')
    .select('address_key')
    .in('address_key', addressKeys)
  if (error) {
    console.warn('[stopNotesClient] fetch failed:', error.message)
    return 0
  }
  const distinct = new Set((data ?? []).map((r) => r.address_key))
  return distinct.size
}
