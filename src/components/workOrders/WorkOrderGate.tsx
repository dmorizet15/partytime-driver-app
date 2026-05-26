'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { WC, FONT_BODY } from '@/lib/workOrders/theme'

/**
 * Route-level gate for the technician-only Work Orders screens. Mirrors
 * FleetGate, but keys on profiles.work_order_technician. Users without the
 * flag never see /tools/work-orders or any detail page.
 *
 * NOTE: this gate is for the *technician queue* (list + detail). The
 * Report Issue form is gated only by sign-in — any authed user can file.
 */
export default function WorkOrderGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return <Centered>Loading…</Centered>
  }
  if (profile?.work_order_technician !== true) {
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
        background: WC.bgDark, fontFamily: FONT_BODY,
      }}
    >
      <p style={{ color: tone === 'error' ? WC.red : WC.muted, fontSize: 14 }}>{children}</p>
    </div>
  )
}
