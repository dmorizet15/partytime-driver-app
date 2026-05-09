'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import InspectionScreen from '@/screens/InspectionScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

// useSearchParams() needs a Suspense boundary in the app router so that the
// page falls back to a static shell during static generation.
export default function InspectionPage() {
  return (
    <Suspense fallback={<div style={pageStyle}><p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p></div>}>
      <InspectionPageInner/>
    </Suspense>
  )
}

function InspectionPageInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const { user, roles, loading } = useAuth()

  const routeId = searchParams.get('route_id')

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

  if (!roles?.includes('driver') && !roles?.includes('super_admin')) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Access denied.</p>
      </div>
    )
  }

  if (!routeId) {
    return (
      <div style={pageStyle}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Missing route_id.</p>
      </div>
    )
  }

  return <InspectionScreen routeId={routeId}/>
}
