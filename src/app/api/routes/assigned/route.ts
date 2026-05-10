// ─── /api/routes/assigned ────────────────────────────────────────────────────
// Driver-scoped lookup: which route_id is THIS driver assigned to today?
//
//   GET → 200 { route_id: string | null }
//
// Powers the Home auto-load: if the driver opens the app and has an
// assignment for today, the client routes them straight to their route's
// stop list instead of showing the day overview. When no assignment exists
// (or the lookup fails), the client falls back to the existing day overview
// — manual selection stays as the safety net.
//
// Auth: session cookie identifies the driver (user.id can't be spoofed by
// the client). The actual table read runs through a service-role client to
// sidestep RLS verification on the dashboard-side route_assignments policies
// (matches /api/inspection/status and /api/defects/post-trip).
//
// Edge case — multiple assignments: the dashboard's data model permits a
// driver to be assigned to several routes on the same day (the rare
// dual-truck scenario or a mid-day reassignment that wasn't cleaned up).
// We log a warning and return the most-recently-assigned one (`assigned_at
// DESC`) so the driver lands on their freshest assignment. Dispatch can
// reconcile on the dashboard side.

import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient }       from '@supabase/supabase-js'

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Route-handler context — cookie writes silently no-op.
          }
        },
      },
    }
  )
}

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Server-local "today" — driver app is single-region (US East), so wall-clock
// date matches what the driver expects when they sign in. Matches the
// `todayStr()` helper on the client.
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function GET() {
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  const today = todayStr()

  // Inner-join shape: pull the driver's assignments and the joined routes'
  // route_date in one round-trip, then filter to today's. Service-role bypass
  // means RLS doesn't gate the join. Order by assigned_at DESC so the most
  // recent assignment wins when the rare multi-match case fires.
  const res = await admin
    .from('route_assignments')
    .select('route_id, assigned_at, routes!inner(route_date)')
    .eq('user_id', user.id)
    .eq('routes.route_date', today)
    .order('assigned_at', { ascending: false })

  if (res.error) {
    console.error('[/api/routes/assigned] query failed:', res.error.message)
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }

  const rows = res.data ?? []
  if (rows.length === 0) {
    return NextResponse.json(
      { route_id: null },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  if (rows.length > 1) {
    console.warn(
      `[/api/routes/assigned] driver ${user.id} has ${rows.length} assignments for ${today}; ` +
      `selecting most recent (${rows[0].route_id}). Dispatch should reconcile.`
    )
  }

  return NextResponse.json(
    { route_id: rows[0].route_id as string },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
