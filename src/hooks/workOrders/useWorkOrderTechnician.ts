'use client'

import { useAuth } from '@/hooks/useAuth'

/**
 * Work-order technician access is a stacked, additive permission
 * (profiles.work_order_technician) — independent of `roles`. Mirrors the
 * fleet pattern; the dashboard enforces the same on its API routes.
 */
export function useWorkOrderTechnician() {
  const { profile, loading } = useAuth()
  return {
    hasAccess: profile?.work_order_technician === true,
    loading,
  }
}
