// ─── /api/stops/arrived ──────────────────────────────────────────────────────
// Phase 2.5C — GPS Auto-Arrival. Driver app POSTs here when their device
// crosses the 150m geofence around a stop's address_lat/address_lng. The
// server stamps dispatch_stops.arrived_at exactly once per stop; subsequent
// POSTs are no-ops (idempotent via the `arrived_at IS NULL` predicate). The
// dashboard's existing dispatch_stops realtime channel fans the value out
// to StopCard automatically — no separate notification path needed.
//
// Auth model matches /api/complete-stop: Supabase session cookie + anon
// key. dispatch_stops RLS (Migration 007) allows any authenticated user to
// UPDATE, so no service-role write is required for what's effectively a
// scoped column-stamp on a row the driver is already cleared to mutate.
//
//   POST  body { stop_id }
//     → 200 { success: true, arrived_at: <ISO timestamp> }
//     → 400 missing/invalid stop_id
//     → 401 no session
//     → 404 stop not found (also covers RLS denials)
//     → 500 unexpected DB error
//
// arrived_at is server-stamped (`new Date().toISOString()`) for clock
// agnosticism — driver phone clocks drift; the dashboard / audit trail
// reads one canonical timestamp.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'

function getSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Route-handler context; cookie writes are no-ops here.
          }
        },
      },
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const body   = await request.json().catch(() => null)
    const stopId = body?.stop_id

    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid stop_id' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const now = new Date().toISOString()

    // Idempotent stamp: only writes when arrived_at IS NULL. A subsequent
    // POST against an already-arrived stop returns 0 updated rows — we then
    // fall through to read the existing value and return it, so the client
    // gets a canonical timestamp either way.
    const { data: updated, error: updateErr } = await supabase
      .from('dispatch_stops')
      .update({ arrived_at: now })
      .eq('id', stopId)
      .is('arrived_at', null)
      .select('arrived_at')

    if (updateErr) {
      console.error('[/api/stops/arrived] update failed:', updateErr.message)
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      )
    }

    if (updated && updated.length > 0) {
      return NextResponse.json({ success: true, arrived_at: updated[0].arrived_at })
    }

    // Update affected zero rows — either already-arrived (the common case)
    // or the stop doesn't exist / RLS denied us. Resolve by selecting:
    const { data: existing, error: selectErr } = await supabase
      .from('dispatch_stops')
      .select('arrived_at')
      .eq('id', stopId)
      .maybeSingle()

    if (selectErr) {
      console.error('[/api/stops/arrived] select failed:', selectErr.message)
      return NextResponse.json(
        { success: false, error: selectErr.message },
        { status: 500 }
      )
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Stop not found' },
        { status: 404 }
      )
    }

    // Stop exists, already arrived — treat as success with the canonical
    // timestamp. Client suppresses any duplicate-arrival UI off this.
    return NextResponse.json({ success: true, arrived_at: existing.arrived_at })
  } catch (err) {
    console.error('[/api/stops/arrived POST] unhandled:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
