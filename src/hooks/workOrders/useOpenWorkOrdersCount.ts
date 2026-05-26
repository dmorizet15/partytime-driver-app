'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useWorkOrderTechnician } from './useWorkOrderTechnician'

/**
 * Open field_work_orders count — drives the "Work Orders" Tools Hub card
 * badge. Technicians-only; no-ops for everyone else.
 *
 * Uses an exact COUNT head request — we don't need rows here, just the
 * number for the pill. Status set: 'open' + 'in_progress' (anything that
 * isn't 'done' is unfinished).
 */
export function useOpenWorkOrdersCount() {
  const { hasAccess, loading: accessLoading } = useWorkOrderTechnician()
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (accessLoading) return
    if (!hasAccess) {
      setCount(0)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { count: n, error } = await supabase
        .from('field_work_orders')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress'])
      if (cancelled) return
      if (error) {
        console.error('[useOpenWorkOrdersCount]', error.message)
        setCount(0)
      } else {
        setCount(n ?? 0)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [hasAccess, accessLoading])

  return { count, hasAccess, loading: loading || accessLoading }
}
