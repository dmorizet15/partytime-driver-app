'use client'

import { useAuth } from '@/hooks/useAuth'

/**
 * Fleet Maintenance is a stacked, additive permission (profiles.fleet_maintenance_access)
 * — independent of `roles`. This hook is the single UI gate; the DB enforces the
 * same via the has_fleet_maintenance_access() RLS predicate.
 */
export function useFleetAccess() {
  const { profile, loading } = useAuth()
  return {
    hasAccess: profile?.fleet_maintenance_access === true,
    loading,
  }
}
