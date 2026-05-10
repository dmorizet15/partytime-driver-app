'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import DayRouteSelectorScreen from '@/screens/DayRouteSelectorScreen'

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

  // tools_only users have no route to drive and no Home tab in their nav —
  // redirect them to /tools (their default landing per the May-10 user-
  // management lock). Driver / super_admin land here normally.
  const isToolsOnly = !!roles
    && !roles.includes('driver')
    && !roles.includes('super_admin')
    && roles.includes('tools_only')

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
      return
    }
    if (!loading && user && isToolsOnly) {
      router.replace('/tools')
    }
  }, [loading, user, isToolsOnly, router])

  if (loading || !user || isToolsOnly) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p>
      </div>
    )
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
