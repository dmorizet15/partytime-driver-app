'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { FC, FONT_BODY } from '@/lib/fleet/theme'

/**
 * Route-level gate for every /tools/fleet screen. Mirrors the auth gate in
 * src/app/tools/page.tsx, but keys on profiles.fleet_maintenance_access — a
 * standard driver lands on "Access denied" and never sees fleet UI. The DB
 * enforces the same via the has_fleet_maintenance_access() RLS predicate.
 */
export default function FleetGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return <Centered>Loading…</Centered>
  }
  if (profile?.fleet_maintenance_access !== true) {
    return <Centered tone="error">Access denied.</Centered>
  }
  return <>{children}</>
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: FC.bg, fontFamily: FONT_BODY,
      }}
    >
      <p style={{ color: tone === 'error' ? FC.red : FC.muted, fontSize: 14 }}>{children}</p>
    </div>
  )
}
