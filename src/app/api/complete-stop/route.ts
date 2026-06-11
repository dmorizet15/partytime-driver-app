// ─── /api/complete-stop ──────────────────────────────────────────────────────
// Driver-app stop completion. Writes three columns to dispatch_stops in a
// single update — stop_status, completed_at, actual_departure_at — so the
// dashboard's realtime subscription can cascade-recompute downstream ETAs
// using actual_departure_at as the anchor instead of the planned eta.
//
// Auth-gated via Supabase session cookie (same pattern as /api/cash-collections
// and /api/assigned-route — never the service-role key). RLS on dispatch_stops
// (Migration 007) allows any authenticated user to UPDATE.
//
//   POST  body { stop_id }   →   { success: true }
//   400 if stop_id missing/invalid, 401 if no session, 500 on DB error.
//
// completed_at and actual_departure_at are both set to the same server-side
// timestamp here. They remain distinct columns (Migration 033) so future
// workflows can model "driver marked done" vs "driver actually departed"
// independently — for now they're written together because the driver tap
// IS the departure moment.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

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
            // Route-handler context where cookie writes aren't allowed —
            // safe to ignore for this single-write call.
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

    // Single server timestamp for both columns — see Migration 033 design note.
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('dispatch_stops')
      .update({
        stop_status:         'completed',
        completed_at:        now,
        actual_departure_at: now,
      })
      .eq('id', stopId)
      .select('id, route_id, stop_type')

    if (error) {
      console.error('[/api/complete-stop] update failed:', error.message)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      // No row matched — either bogus stop_id or RLS denied the update.
      // Return 404 so the client can surface a real error instead of a
      // silent no-op completion.
      return NextResponse.json(
        { success: false, error: 'Stop not found' },
        { status: 404 }
      )
    }

    // ── Phase 2B lifecycle hygiene (Rev 2, 2026-06-10) ─────────────────────
    // Route handoff state was never cleared — active_driver_id set on a route
    // stayed set forever, so every FUTURE read treated the handoff as still
    // active (the stale-data root cause behind the co-driver lockout). The
    // warehouse_return completion IS the end of the route (both the geofence
    // auto-fire and the manual Mark Complete funnel through this endpoint), so
    // clear active_driver_id + transfer_pending_to here. Best-effort + non-
    // fatal: the stop completion above already committed; a missed clear only
    // means the stale state survives until the next route end. Service-role
    // client — routes has no authenticated UPDATE policy (by design).
    const completedRow = data[0] as { id: string; route_id: string | null; stop_type: string | null }
    if (completedRow.stop_type === 'warehouse_return' && completedRow.route_id) {
      const adminUrl = process.env.SUPABASE_URL
      const adminKey = process.env.SUPABASE_SERVICE_KEY
      if (adminUrl && adminKey) {
        try {
          const admin = createClient(adminUrl, adminKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          })
          const { error: clearErr } = await admin
            .from('routes')
            .update({ active_driver_id: null, transfer_pending_to: null })
            .eq('id', completedRow.route_id)
          if (clearErr) {
            console.warn('[/api/complete-stop] transfer-state clear failed (non-fatal):', clearErr.message)
          }
        } catch (clearErr) {
          console.warn('[/api/complete-stop] transfer-state clear threw (non-fatal):', clearErr)
        }
      } else {
        console.warn('[/api/complete-stop] admin env missing — transfer-state clear skipped')
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/complete-stop POST] unhandled:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
