'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import TentingHubScreen from '@/screens/TentingHubScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

export default function TentingPage() {
  const router = useRouter()
  const { user, roles, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  if (
    !roles?.includes('driver') &&
    !roles?.includes('super_admin') &&
    !roles?.includes('tools_only')
  ) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Access denied.</p>
      </div>
    )
  }

  return <TentingHubScreen />
}
