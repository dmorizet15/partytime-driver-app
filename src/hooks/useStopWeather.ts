'use client'

import { useEffect, useState } from 'react'
import type { WeatherSnapshot } from '@/lib/weather/types'

// Lightweight client hook for fetching a stop's weather snapshot. Wraps the
// same `/api/weather?lat=&lng=` endpoint that Phase 2A's WeatherScreen uses
// (server keeps the Tomorrow.io key); the server caches by 4-decimal coords
// for 15 minutes, so revisiting the same stop within that window is free.
//
// Component-side state caches the last successful key so a re-render of
// StopDetailScreen doesn't trigger a redundant network call. Cancellation is
// handled via a `cancelled` flag so a stale response from a prior stop never
// overwrites a newer one if the driver swipes between stops fast.
export function useStopWeather(lat: number | undefined, lng: number | undefined) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [loading,  setLoading]  = useState<boolean>(false)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      setSnapshot(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        if (!cancelled) setSnapshot(json as WeatherSnapshot)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [lat, lng])

  return { snapshot, loading, error }
}
