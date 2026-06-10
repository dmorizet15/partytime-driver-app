// ─── POST /api/routes/[routeId]/depart ───────────────────────────────────────
// Stamps routes.actual_departure_at when the driver starts the route (pre-trip
// complete → "Inspect & Start Route" / "Start Route"). This is the WRITER for
// the warehouse Overview IN TRANSIT stage (warehouseOverviewServer.deriveStage)
// and the warehouse board 'out' column (deriveColState) — both read this column.
//
//   no body  →  { success: true, actual_departure_at, alreadyDeparted }
//
// Ownership gate (server-authoritative — never trust a client flag), mirrors
// /api/routes/transfer/initiate:
//   active_driver_id IS NOT NULL → caller must BE active_driver_id.
//   active_driver_id IS NULL     → caller must be the route's is_primary crew row.
// Only the primary / active driver starts the route (co-drivers don't depart it).
//
// Idempotent: if actual_departure_at is already set, returns 200 with the
// existing timestamp and no write — a re-tap or a second start path is a no-op.
//
// Auth: session cookie identifies the caller (user.id, can't be spoofed). The
// reads/writes run through the service-role admin client to bypass RLS on the
// dashboard-owned routes table (matches /api/routes + the transfer endpoints).

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

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
          } catch { /* route-handler context — cookie writes no-op */ }
        },
      },
    }
  )
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { routeId: string } },
) {
  const routeId = params.routeId
  if (!routeId) {
    return NextResponse.json({ error: 'routeId is required' }, { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[routes/depart] missing env — URL:', !!supabaseUrl, '| SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Current departure + ownership state of the route.
  const { data: route, error: routeErr } = await admin
    .from('routes')
    .select('id, active_driver_id, actual_departure_at')
    .eq('id', routeId)
    .maybeSingle()
  if (routeErr) return NextResponse.json({ error: routeErr.message }, { status: 500 })
  if (!route)   return NextResponse.json({ error: 'Route not found' }, { status: 404 })

  // Ownership gate.
  let callerIsOwner: boolean
  if (route.active_driver_id) {
    callerIsOwner = route.active_driver_id === user.id
  } else {
    const { data: mine } = await admin
      .from('route_crew')
      .select('is_primary')
      .eq('route_id', routeId)
      .eq('user_id', user.id)
      .in('role', ['primary_driver', 'secondary_driver'])
      .maybeSingle()
    callerIsOwner = mine?.is_primary === true
  }
  if (!callerIsOwner) {
    return NextResponse.json({ error: 'Only the active driver can start this route' }, { status: 403 })
  }

  // Idempotent — already departed: return the existing stamp, no write.
  if (route.actual_departure_at) {
    return NextResponse.json(
      { success: true, actual_departure_at: route.actual_departure_at, alreadyDeparted: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // Stamp. The `.is('actual_departure_at', null)` guard makes a concurrent
  // double-start a no-op on the loser instead of overwriting the first stamp.
  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await admin
    .from('routes')
    .update({ actual_departure_at: now })
    .eq('id', routeId)
    .is('actual_departure_at', null)
    .select('actual_departure_at')
    .maybeSingle()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Lost the race (another start stamped first) → return whatever is live now.
  const stamped = updated?.actual_departure_at ?? now
  return NextResponse.json(
    { success: true, actual_departure_at: stamped, alreadyDeparted: !updated },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
