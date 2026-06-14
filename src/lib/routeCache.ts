// ─── Offline route cache (PWA Session B) ────────────────────────────────────
// Last-saved-route fallback for the day view. The single /api/routes payload
// carries the FULL day — route list AND every stop's detail/manifest (items,
// notes, coords, COD, windows) — so caching that one merged payload covers
// both the route list and the stop-detail/Navigate paths offline. There is no
// per-stop detail endpoint to cache: StopDetailScreen renders from
// AppStateContext, and its only mount-time fetches are workflow-status
// overlays (SMS status, cash-collected, check-off committed) that each already
// fail closed offline. See CLAUDE.md → "Offline data layer".
//
// Every read and write is wrapped in try/catch: a cache miss, a corrupt blob,
// or a quota error must NEVER break a real load — it falls through cleanly.

import type { Route, Stop } from '@/types'

const CACHE_DATE_KEY = 'ptd_route_cache_date'
const routeKey = (date: string) => `ptd_route_${date}`

export interface RouteCachePayload {
  routes: Route[]
  stops:  Stop[]
  date:   string
}

// Write the merged route+stop payload for `date`. Caches the MERGED stops
// (OTW / completion overlays already applied) so the offline view matches
// what the driver last saw online.
export function writeRouteCache(date: string, routes: Route[], stops: Stop[]): void {
  try {
    localStorage.setItem(routeKey(date), JSON.stringify({ routes, stops, date }))
    localStorage.setItem(CACHE_DATE_KEY, date)
  } catch {
    // Quota / serialization failure — non-fatal, the load already succeeded.
  }
}

// Read the cached payload for `date`. Returns null on miss, corrupt JSON, or
// a shape that isn't a valid payload — caller falls through to LOAD_ERROR.
export function readRouteCache(date: string): RouteCachePayload | null {
  try {
    const raw = localStorage.getItem(routeKey(date))
    if (!raw) return null
    const parsed = JSON.parse(raw) as RouteCachePayload
    if (!parsed || !Array.isArray(parsed.routes) || !Array.isArray(parsed.stops)) return null
    return parsed
  } catch {
    return null
  }
}

// After any successful load, drop every ptd_route_<date> blob that isn't the
// day we just loaded (prunes yesterday's cache). Leaves CACHE_DATE_KEY intact —
// note it ALSO shares the `ptd_route_` prefix, so it must be excluded by name.
export function pruneOldRouteCache(keepDate: string): void {
  try {
    const keep = routeKey(keepDate)
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k === CACHE_DATE_KEY) continue
      if (k.startsWith('ptd_route_') && k !== keep) toRemove.push(k)
    }
    toRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    // Non-fatal — stale keys just linger until the next successful prune.
  }
}
