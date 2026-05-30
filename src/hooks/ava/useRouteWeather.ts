'use client'

// ─── useRouteWeather — AVA Phase 2 weather enrichment ────────────────────────
// Fetches forecast wind at each stop's scheduled arrival from
// POST /api/ava/route-weather, keyed by stop_id. Drives two surfaces:
//   - AvaMorningCard's hasWeatherFlag (wind-aware brief copy)   [Step 4]
//   - per-stop wind pills on the home day list                  [Step 5]
//
// Fails open: any error → empty map, hasWeatherFlag false, loading false. The
// weather feature simply doesn't surface; nothing on Home breaks.

import { useEffect, useState } from 'react'
import type { Stop } from '@/types'

export interface StopWeather {
  weatherAlert: boolean
  windMph:      number | null
}

export interface RouteWeatherState {
  weatherByStopId: Map<string, StopWeather>
  hasWeatherFlag:  boolean
  loading:         boolean
}

const DEPOT_TYPES = new Set<Stop['stop_type']>(['warehouse', 'warehouse_return'])

const EMPTY: RouteWeatherState = {
  weatherByStopId: new Map(),
  hasWeatherFlag:  false,
  loading:         false,
}

interface RouteWeatherResponse {
  stops:          Array<{ stopId: string; weatherAlert: boolean; windMph: number | null }>
  hasWeatherFlag: boolean
}

export function useRouteWeather(dayStops: Stop[]): RouteWeatherState {
  const [state, setState] = useState<RouteWeatherState>({ ...EMPTY, loading: true })

  // Stable key over today's customer stop ids (depot stops excluded) — the
  // effect refetches only when the actual set of stops changes, not on every
  // render of a new dayStops array reference.
  const idsKey = dayStops
    .filter((s) => !DEPOT_TYPES.has(s.stop_type))
    .map((s) => s.stop_id)
    .join(',')

  useEffect(() => {
    let cancelled = false
    const stopIds = idsKey ? idsKey.split(',') : []

    if (stopIds.length === 0) {
      setState({ ...EMPTY, weatherByStopId: new Map() })
      return
    }

    setState((prev) => ({ ...prev, loading: true }))

    fetch('/api/ava/route-weather', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ stopIds }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: RouteWeatherResponse) => {
        if (cancelled) return
        const map = new Map<string, StopWeather>()
        for (const s of data.stops ?? []) {
          map.set(s.stopId, { weatherAlert: s.weatherAlert, windMph: s.windMph })
        }
        setState({ weatherByStopId: map, hasWeatherFlag: !!data.hasWeatherFlag, loading: false })
      })
      .catch(() => {
        if (cancelled) return
        setState({ ...EMPTY, weatherByStopId: new Map() })
      })

    return () => { cancelled = true }
  }, [idsKey])

  return state
}
