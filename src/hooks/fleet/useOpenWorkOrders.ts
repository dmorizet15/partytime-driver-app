'use client'

import { useEffect, useState } from 'react'
import { fetchOpenWorkOrdersSummary } from '@/lib/fleet/queries'
import type { OpenWorkOrdersSummary } from '@/lib/fleet/types'
import { useFleetAccess } from './useFleetAccess'

const EMPTY: OpenWorkOrdersSummary = { count: 0, assets: [] }

/**
 * Open work-order count + affected asset names — drives the Tools Hub card
 * badge and the home-screen fleet alert card. No-ops for non-fleet users.
 */
export function useOpenWorkOrders() {
  const { hasAccess, loading: accessLoading } = useFleetAccess()
  const [summary, setSummary] = useState<OpenWorkOrdersSummary>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (accessLoading) return
    if (!hasAccess) {
      setSummary(EMPTY)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchOpenWorkOrdersSummary().then((s) => {
      if (!cancelled) {
        setSummary(s)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [hasAccess, accessLoading])

  return {
    count:   summary.count,
    assets:  summary.assets,
    hasAccess,
    loading: loading || accessLoading,
  }
}
