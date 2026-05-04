'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import ProfileScreen from '@/screens/ProfileScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

export default function ProfilePage() {
  const router = useRouter()
  const { user, role, loading } = useAuth()

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

  if (role !== 'driver' && role !== 'super_admin') {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Access denied.</p>
      </div>
    )
  }

  return <ProfileScreen />
}
