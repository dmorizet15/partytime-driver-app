// ─── useInspectionStatus ─────────────────────────────────────────────────────
// Fetches the current driver's pre-trip inspection state for a route + truck
// from /api/inspection/status. Drives Home's gate (stops non-tappable until
// inspected) and RouteListScreen's gate (same behavior on the deep-linked
// stop-list view). Returns null while loading, when there's no route/truck,
// or when no inspection has been recorded yet — Home + RouteList both treat
// null as "gate closed."
//
// Failure mode: any fetch error logs and resolves to null. Leaving the gate
// closed is the safe default; over-permissive on the gate would defeat the
// regulatory purpose.

import { useEffect, useState } from 'react'

export type InspectionStatus = {
  id:        string
  signed_at: string  // ISO timestamptz from vehicle_inspections.signed_at
  has_oos:   boolean
} | null

export function useInspectionStatus(
  routeId: string | undefined | null,
  truckId: string | undefined | null,
): InspectionStatus {
  const [inspection, setInspection] = useState<InspectionStatus>(null)

  useEffect(() => {
    // Reset to null on every routeId/truckId change so the previous
    // route's inspection state doesn't linger while the new fetch is
    // in flight. Without this, the gate flickers as: brief → blank
    // (stale "inspected") → brief (after new fetch resolves to null).
    // With this, the gate goes brief → brief consistently.
    setInspection(null)

    if (!routeId || !truckId) return

    let cancelled = false
    fetch(`/api/inspection/status?route_id=${routeId}&truck_id=${truckId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => {
        if (cancelled) return
        setInspection(json.current ?? null)
      })
      .catch((err) => {
        console.warn('[useInspectionStatus] fetch failed:', err instanceof Error ? err.message : err)
        if (!cancelled) setInspection(null)
      })
    return () => { cancelled = true }
  }, [routeId, truckId])

  return inspection
}
