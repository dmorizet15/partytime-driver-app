// ─── Geocoding — Nominatim (OSM), cache-first ────────────────────────────────
// AVA Phase 2 weather alerts need coordinates per stop. We geocode each
// address ONCE and cache the result on dispatch_stops.delivery_lat/lng so the
// morning brief never re-geocodes the same address.
//
// Nominatim usage policy: max 1 request/second, and a descriptive User-Agent
// is required. This module makes a SINGLE request per call — batch callers
// must space their calls by GEOCODE_RATE_LIMIT_MS (see Step 4 populate logic).
//
// Everything degrades gracefully: a null return means "couldn't geocode", and
// the weather feature simply skips the alert rather than crashing.

import { supabase } from '@/lib/supabase'

export interface LatLng {
  lat: number
  lng: number
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'PartyTimeRentals-DriverApp/1.0'

/** Nominatim allows 1 req/sec; batch callers must delay this long between calls. */
export const GEOCODE_RATE_LIMIT_MS = 1000

/**
 * Geocode a street address to coordinates, cache-first.
 *
 * When `stopId` is supplied:
 *   1. Returns the cached dispatch_stops.delivery_lat/lng if the row is
 *      already geocoded — no network call.
 *   2. After a successful geocode, writes the coordinates back to that row.
 *
 * Both DB steps are best-effort: a read or write failure (e.g. RLS) never
 * fails the geocode — caching is an optimization, not a requirement.
 *
 * @returns coordinates, or null on any failure (empty address, network error,
 *   no Nominatim match) so the weather feature degrades gracefully.
 */
export async function geocodeAddress(
  address: string,
  stopId?: string,
): Promise<LatLng | null> {
  if (!address || !address.trim()) return null

  // 1. Cache-first — skip Nominatim entirely if we've geocoded this stop before.
  if (stopId) {
    const cached = await readCachedCoords(stopId)
    if (cached) return cached
  }

  // 2. Geocode via Nominatim.
  let coords: LatLng | null = null
  try {
    const url =
      `${NOMINATIM_URL}?q=${encodeURIComponent(address)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const lat = parseFloat(data[0].lat)
    const lng = parseFloat(data[0].lon)
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null
    coords = { lat, lng }
  } catch {
    return null
  }

  // 3. Write the result back to the cache (best-effort).
  if (stopId && coords) {
    await writeCachedCoords(stopId, coords)
  }

  return coords
}

async function readCachedCoords(stopId: string): Promise<LatLng | null> {
  try {
    const { data, error } = await supabase
      .from('dispatch_stops')
      .select('delivery_lat, delivery_lng')
      .eq('id', stopId)
      .maybeSingle()
    if (error || !data) return null
    if (data.delivery_lat == null || data.delivery_lng == null) return null
    return { lat: data.delivery_lat, lng: data.delivery_lng }
  } catch {
    return null
  }
}

async function writeCachedCoords(stopId: string, coords: LatLng): Promise<void> {
  try {
    await supabase
      .from('dispatch_stops')
      .update({ delivery_lat: coords.lat, delivery_lng: coords.lng })
      .eq('id', stopId)
  } catch {
    /* non-fatal — the geocode succeeded; only the cache write failed. */
  }
}
