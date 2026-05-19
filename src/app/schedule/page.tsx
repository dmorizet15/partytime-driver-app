'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import WeekScheduleView from '@/components/WeekScheduleView'
import BottomNav from '@/components/BottomNav'

// /schedule — Week Schedule view for driver / tools_only / super_admin.
// Drivers also reach the same component via the Routes-tab Today/Week
// toggle; this route is the primary entry point for tools_only users
// (their "This Week" Home card links here).

export default function SchedulePage() {
  const router = useRouter()
  const { user, roles, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0F1117' }}>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  const allowed = roles?.some((r) => r === 'driver' || r === 'tools_only' || r === 'super_admin')
  if (!allowed) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFF9EE' }}>
        <p style={{ color: '#EF4444', fontSize: 14 }}>Access denied.</p>
      </div>
    )
  }

  // YOU treatment fires only for drivers viewing their own assignments.
  // tools_only users see all routes uniformly.
  const role = (roles?.find((r) => r === 'driver' || r === 'super_admin' || r === 'tools_only')) ?? null

  return (
    <div className="screen" style={{ background: '#FFF9EE' }}>
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <WeekScheduleView
          currentUserId={user.id}
          currentUserRole={role}
        />
      </main>
      <BottomNav />
    </div>
  )
}
