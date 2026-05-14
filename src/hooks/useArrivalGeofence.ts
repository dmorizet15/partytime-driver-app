'use client'

// ─── useArrivalGeofence ──────────────────────────────────────────────────────
// Phase 2.5C — GPS Auto-Arrival.
//
// Arms a foreground geolocation watch on the stop's coordinates. When the
// device crosses inside `radiusMeters` (default 150m) of the stop center,
// the hook fires POST /api/stops/arrived exactly once, regardless of how
// many subsequent position updates the browser emits before the screen is
// unmounted. The server is also idempotent — re-posts against an
// already-arrived stop return success without overwriting — but the
// client-side guard avoids the redundant round-trip.
//
// Permission model: browser native, just-in-time. The first watchPosition
// call triggers the OS prompt; the grant persists at the site level
// (work.partytime-rentals.com), so subsequent stops mount without UI.
//
// Foreground-only: navigator.geolocation.watchPosition only fires while
// the document is visible on most mobile browsers. Acceptable for v1 — the
// PTR-owned Android devices stay on the active stop with screen on during
// arrival. Background geofencing requires native (Capacitor / Geofence
// API) — out of scope.

import { useEffect, useRef, useState } from 'react'

export type GeofenceStatus =
  | 'idle'         // disabled or coords missing — no watch active
  | 'watching'     // watchPosition running, haven't crossed yet
  | 'arrived'      // POST succeeded; watch cleared
  | 'denied'       // browser permission denied
  | 'unavailable'  // navigator.geolocation absent (very old browsers)
  | 'error'        // unrecoverable position error (POSITION_UNAVAILABLE / TIMEOUT)

export interface UseArrivalGeofenceArgs {
  stopId: string
  latitude?:  number
  longitude?: number
  enabled:    boolean
  radiusMeters?: number
  onArrive?:  (arrivedAt: string) => void
}

export interface UseArrivalGeofenceResult {
  status: GeofenceStatus
  lastDistanceMeters: number | null
}

// Haversine distance, meters. Standard formulation; the 150m geofence
// radius is well within flat-earth approximation tolerance, but haversine
// is one extra trig call per tick and removes any latitude-band drift.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function useArrivalGeofence({
  stopId,
  latitude,
  longitude,
  enabled,
  radiusMeters = 150,
  onArrive,
}: UseArrivalGeofenceArgs): UseArrivalGeofenceResult {
  const [status, setStatus] = useState<GeofenceStatus>('idle')
  const [lastDistanceMeters, setLastDistanceMeters] = useState<number | null>(null)

  // Refs survive across re-renders without re-triggering the effect. Used
  // so the POST fires once per mount even if multiple watchPosition ticks
  // land inside the geofence before the effect cleanup runs.
  const postedRef = useRef(false)
  const watchIdRef = useRef<number | null>(null)

  // Keep latest onArrive in a ref so changing closures don't re-arm the watch.
  const onArriveRef = useRef(onArrive)
  useEffect(() => { onArriveRef.current = onArrive }, [onArrive])

  useEffect(() => {
    if (!enabled || latitude == null || longitude == null) {
      setStatus('idle')
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }

    postedRef.current = false
    setStatus('watching')

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (postedRef.current) return
        const d = distanceMeters(
          pos.coords.latitude, pos.coords.longitude,
          latitude, longitude,
        )
        setLastDistanceMeters(d)

        if (d > radiusMeters) return

        // Inside geofence — guard against double-fire from a fast second tick.
        postedRef.current = true

        try {
          const r = await fetch('/api/stops/arrived', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ stop_id: stopId }),
          })
          const j = await r.json().catch(() => null)
          if (r.ok && j?.success && typeof j.arrived_at === 'string') {
            setStatus('arrived')
            onArriveRef.current?.(j.arrived_at)
            // Stop watching — the column is terminal for this stop.
            if (watchIdRef.current != null) {
              navigator.geolocation.clearWatch(watchIdRef.current)
              watchIdRef.current = null
            }
          } else {
            // Server rejected — allow a retry on the next tick.
            postedRef.current = false
            console.warn('[useArrivalGeofence] arrival POST rejected:', j?.error ?? r.status)
          }
        } catch (err) {
          postedRef.current = false
          console.warn('[useArrivalGeofence] arrival POST network error:', err)
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied')
        } else {
          // POSITION_UNAVAILABLE / TIMEOUT — keep the watch alive so the
          // OS can recover, but surface the state for diagnostic UI.
          setStatus('error')
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge:         5_000,
        timeout:            30_000,
      }
    )

    watchIdRef.current = watchId

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled, stopId, latitude, longitude, radiusMeters])

  return { status, lastDistanceMeters }
}
