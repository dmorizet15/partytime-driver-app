'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import ReferenceLibraryScreen from '@/screens/ReferenceLibraryScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

// /reference/library — general-purpose reference items (PDFs + external URLs).
// Read-only browse for every authenticated driver-app user. Writes happen on
// the dashboard side and are gated to super_admin by RLS.
export default function ReferenceLibraryPage() {
  const router = useRouter()
  const { user, loading } = useAuth()

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

  return <ReferenceLibraryScreen />
}
