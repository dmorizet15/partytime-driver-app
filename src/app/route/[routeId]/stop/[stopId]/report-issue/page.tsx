'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import ReportIssueScreen from '@/screens/workOrders/ReportIssueScreen'

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0F1117',
} as const

const loadingFallback = (
  <div style={pageStyle}>
    <p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p>
  </div>
)

interface Props {
  params: { routeId: string; stopId: string }
}

// useSearchParams requires a Suspense boundary in the app router — the inner
// component reads the check-off damage-flow params (?item=N&checkoff=1).
function ReportIssueStopPageInner({ params }: Props) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()

  const itemParam = searchParams.get('item')
  const parsedItem = itemParam !== null ? Number.parseInt(itemParam, 10) : NaN
  const preSelectedItemIndex = Number.isInteger(parsedItem) && parsedItem >= 0
    ? parsedItem
    : undefined
  const checkoffReturn = searchParams.get('checkoff') === '1'

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) return loadingFallback

  return (
    <ReportIssueScreen
      routeId={params.routeId}
      stopId={params.stopId}
      preSelectedItemIndex={preSelectedItemIndex}
      checkoffReturn={checkoffReturn}
    />
  )
}

export default function ReportIssueStopPage({ params }: Props) {
  return (
    <Suspense fallback={loadingFallback}>
      <ReportIssueStopPageInner params={params} />
    </Suspense>
  )
}
