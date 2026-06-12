'use client'

import { useAuth } from '@/hooks/useAuth'

/**
 * Will Call is ROLE-gated (`will_call` in profiles.roles) — unlike Fleet /
 * Work Orders it is not a stacked boolean column. Strict will_call check for
 * the surfaces that swap on the role (Tools Hub TrainingCard; BottomNav does
 * the same check via its declarative rolesAllowed list). WillCallGate is
 * looser on purpose (will_call OR super_admin — admins reach every surface by
 * URL). The server enforces its own gate on GET /api/will-call and the
 * dashboard on every action POST.
 */
export function useWillCallAccess() {
  const { roles, loading } = useAuth()
  return {
    hasAccess: !!roles && roles.includes('will_call'),
    loading,
  }
}
