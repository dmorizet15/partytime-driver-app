'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWillCallOrders } from '@/lib/willCall/api'
import type { WillCallOrder } from '@/lib/willCall/types'

const REFRESH_MS = 30_000

/**
 * Will Call order list — fetch on mount, refetch on window focus /
 * visibilitychange and on a 30s interval. NO realtime subscription by
 * design: will_call_orders postgres_changes are RLS-filtered per subscriber,
 * so events would be silently dropped for will_call-only role holders
 * (publication membership alone is a false green — see tasks/lessons.md).
 *
 * Deps rule (tasks/lessons.md): the effect keys on nothing it sets — load
 * state never re-triggers the fetch.
 */
export function useWillCallOrders() {
  const [orders, setOrders]   = useState<WillCallOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const inFlight = useRef(false)

  const refetch = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const rows = await fetchWillCallOrders()
      setOrders(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Will Call orders')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch()

    const onFocus = () => { void refetch() }
    const onVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(() => { void refetch() }, REFRESH_MS)

    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [refetch])

  return { orders, loading, error, refetch }
}
