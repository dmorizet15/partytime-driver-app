'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import ArcadeHub from '@/components/arcade/ArcadeHub'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#080814',
} as const

export default function ArcadePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // The arcade is open to every signed-in employee — no role gate.
  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div style={pageStyle}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  return <ArcadeHub />
}
