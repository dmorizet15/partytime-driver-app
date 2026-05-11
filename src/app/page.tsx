'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DayRouteSelectorScreen from '@/screens/DayRouteSelectorScreen'
import ToolsOnlyHomeScreen from '@/screens/ToolsOnlyHomeScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

export default function HomePage() {
  const router = useRouter()
  const { user, roles, loading } = useAuth()

  // 2026-05-11 — REVERSAL of the May-10 tools_only-redirects-to-/tools rule.
  // tools_only users now stay on / and see a minimal Home variant; the
  // schedule view is their primary work surface. Drivers / super_admin
  // continue to see the DayRouteSelector.
  const isToolsOnly = !!roles
    && !roles.includes('driver')
    && !roles.includes('super_admin')
    && roles.includes('tools_only')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  if (isToolsOnly) {
    return <ToolsOnlyHomeScreen />
  }

  if (!roles?.includes('driver') && !roles?.includes('super_admin')) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Access denied.</p>
      </div>
    )
  }

  return <DayRouteSelectorScreen />
}
