'use client'

import { useAuth } from '@/hooks/useAuth'

/**
 * Will Call is ROLE-gated (`will_call` in profiles.roles) — unlike Fleet /
 * Work Orders it is not a stacked boolean column. This hook is the single UI
 * gate for the nav tab, the Tools Hub Training swap, and the screen gate.
 * The server enforces the same set on GET /api/will-call and the dashboard
 * enforces it on every action POST.
 */
export function useWillCallAccess() {
  const { roles, loading } = useAuth()
  return {
    hasAccess: !!roles && roles.includes('will_call'),
    loading,
  }
}
