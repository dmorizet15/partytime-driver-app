// ─── POST /api/routes/transfer/respond ───────────────────────────────────────
// Phase 2B — Route Handoff. The pending recipient accepts or declines an offer.
//
//   body { routeId: string, accept: boolean }  →  { success: true }
//
//   accept  → active_driver_id = caller, transfer_pending_to = null  (Transferred)
//   decline → transfer_pending_to = null                              (back to Idle)
//
// Gate (server-authoritative): caller must BE routes.transfer_pending_to. Anyone
// else (including the offering owner) gets 403 — the offer is the recipient's to
// answer. Auth + admin-client pattern mirrors /api/routes/transfer/initiate.

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
  const routeId = typeof body?.routeId === 'string' ? body.routeId : null
  const accept  = typeof body?.accept === 'boolean' ? body.accept : null
  if (!routeId || accept === null) {
    return NextResponse.json({ error: 'routeId and accept (boolean) are required' }, { status: 400 })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[transfer/respond] missing env — URL:', !!supabaseUrl, '| SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const admin = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: route, error: routeErr } = await admin
    .from('routes')
    .select('id, transfer_pending_to')
    .eq('id', routeId)
    .maybeSingle()
  if (routeErr) return NextResponse.json({ error: routeErr.message }, { status: 500 })
  if (!route)   return NextResponse.json({ error: 'Route not found' }, { status: 404 })

  if (route.transfer_pending_to !== user.id) {
    return NextResponse.json({ error: 'No pending transfer for you on this route' }, { status: 403 })
  }

  const patch = accept
    ? { active_driver_id: user.id, transfer_pending_to: null }
    : { transfer_pending_to: null }

  const { error: updErr } = await admin
    .from('routes')
    .update(patch)
    .eq('id', routeId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
}
