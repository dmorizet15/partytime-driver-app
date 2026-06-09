// ─── POST /api/routes/transfer/initiate ──────────────────────────────────────
// Phase 2B — Route Handoff. The current owner offers the route to another crew
// member. Writes routes.transfer_pending_to = toProfileId (state → Pending).
//
//   body { routeId: string, toProfileId: string }  →  { success: true }
//
// Ownership gate (server-authoritative — never trust a client flag):
//   active_driver_id IS NULL  → caller must be the route's is_primary crew row.
//   active_driver_id IS NOT NULL → caller must BE active_driver_id (only the
//                                  active driver can re-transfer; no reclaim).
// toProfileId is validated against route_crew (driver roles, not self) so a
// route can't be offered to someone who isn't on its crew.
//
// Auth: session cookie identifies the caller (user.id, can't be spoofed). The
// reads/writes run through the service-role admin client to bypass RLS on the
// dashboard-owned routes table (matches /api/routes).

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const routeId     = typeof body?.routeId === 'string' ? body.routeId : null
  const toProfileId = typeof body?.toProfileId === 'string' ? body.toProfileId : null
  if (!routeId || !toProfileId) {
    return NextResponse.json({ error: 'routeId and toProfileId are required' }, { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[transfer/initiate] missing env — URL:', !!supabaseUrl, '| SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Current transfer state of the route.
  const { data: route, error: routeErr } = await admin
    .from('routes')
    .select('id, active_driver_id, transfer_pending_to')
    .eq('id', routeId)
    .maybeSingle()
  if (routeErr)  return NextResponse.json({ error: routeErr.message }, { status: 500 })
  if (!route)    return NextResponse.json({ error: 'Route not found' }, { status: 404 })

  if (toProfileId === user.id) {
    return NextResponse.json({ error: 'Cannot transfer to yourself' }, { status: 400 })
  }

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
    return NextResponse.json({ error: 'Only the active driver can transfer this route' }, { status: 403 })
  }

  // Target must be a driver on this route's crew (not the caller).
  const { data: target } = await admin
    .from('route_crew')
    .select('user_id')
    .eq('route_id', routeId)
    .eq('user_id', toProfileId)
    .in('role', ['primary_driver', 'secondary_driver'])
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: 'Recipient is not on this route crew' }, { status: 400 })
  }

  const { error: updErr } = await admin
    .from('routes')
    .update({ transfer_pending_to: toProfileId })
    .eq('id', routeId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
}
