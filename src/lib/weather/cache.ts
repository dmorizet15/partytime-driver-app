// ─── In-memory weather snapshot cache ────────────────────────────────────────
// 15-minute TTL keyed by coordinate rounded to 4 decimals (~11m precision).
// In-process only — survives across requests within a server instance, not
// across cold starts. This is intentional for v1: the Tomorrow.io free tier
// allows 500 calls/day, and a cold start losing the cache costs at most a
// handful of redundant requests during traffic ramp-up.

import type { WeatherSnapshot } from './types'

const TTL_MS = 15 * 60 * 1000  // 15 minutes

interface CacheEntry {
  snapshot: WeatherSnapshot
  storedAt: number
}

const store = new Map<string, CacheEntry>()

export function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`
}

export function getCached(lat: number, lng: number): WeatherSnapshot | null {
  const entry = store.get(cacheKey(lat, lng))
  if (!entry) return null
  if (Date.now() - entry.storedAt > TTL_MS) return null
  return entry.snapshot
}

// Returns the snapshot regardless of TTL — used by the service to surface
// last-known data when a live fetch fails. The caller is responsible for
// flagging it as stale.
export function getAnyCached(lat: number, lng: number): WeatherSnapshot | null {
  const entry = store.get(cacheKey(lat, lng))
  return entry?.snapshot ?? null
}

export function setCached(lat: number, lng: number, snapshot: WeatherSnapshot): void {
  store.set(cacheKey(lat, lng), { snapshot, storedAt: Date.now() })
}
