'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { WL, FONT_BODY } from '@/lib/willCall/theme'

/**
 * Route-level gate for the Will Call screens. Mirrors WorkOrderGate but keys
 * on the `will_call` role. super_admin is also allowed through (app-wide
 * convention — admins can reach every surface by URL) even though the nav tab
 * itself shows only for will_call holders.
 */
export default function WillCallGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, roles, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return <Centered>Loading…</Centered>
  }
  const allowed = !!roles && (roles.includes('will_call') || roles.includes('super_admin'))
  if (!allowed) {
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
        background: WL.cream, fontFamily: FONT_BODY,
      }}
    >
      <p style={{ color: tone === 'error' ? WL.red : WL.muted, fontSize: 14 }}>{children}</p>
    </div>
  )
}
