// ─── /api/stops/early-override ───────────────────────────────────────────────
// Records that a driver dismissed the early-pickup gate on a stop — either the
// On Standby countdown card's "Navigate anyway" button or the pre-navigate
// "Too early for pickup" modal.
//
// Why this exists (2026-08-04, Route 1 ETA investigation): StopDetailScreen has
// ALWAYS built this event —
//   logEvent('NAVIGATION_STARTED', …, { early_pickup_override: true, … })
// — but EventLogger is still the Phase-1 ConsoleEventLogger stub, so it
// console.log()s into the driver's phone and persists nothing. Completing a
// pickup hours before a verified window is only reachable THROUGH this
// override, which made it the single most useful signal we were throwing away:
// on 2026-07-31 a crew closed out a NYACK pickup at 8:21 AM against a verified
// 12:30 PM window and there was no record of the dismissal anywhere.
//
// The gate stays SOFT on purpose — a customer waving the crew in early is a
// real thing that happens, and drivers need the escape hatch. This endpoint
// changes nothing about the workflow; it just stops the escape hatch being
// invisible. Decision: leave it, but start recording it.
//
// Auth model matches /api/stops/arrived and /api/complete-stop: Supabase
// session cookie + anon key. dispatch_stops RLS (Migration 007) allows any
// authenticated user to UPDATE, so no service-role write is needed.
//
//   POST  body { stop_id, source: 'standby' | 'navigate_gate', minutes_early? }
//     → 200 { success: true }
//     → 400 missing/invalid stop_id or source
//     → 401 no session
//     → 404 stop not found (also covers RLS denials)
//     → 500 unexpected DB error
//
// FIRST DISMISSAL WINS — idempotent via `early_pickup_override_at IS NULL`,
// same shape as /api/stops/arrived. A driver who dismisses on the standby card
// and then again at the navigate gate is one decision, not two, and the first
// one is the one with the honest minutes_early on it.
//
// Columns are mig 117. `early_pickup_override_at` is SERVER-stamped — driver
// phone clocks drift, and this is an audit value.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'

const SOURCES = ['standby', 'navigate_gate'] as const
type Source = (typeof SOURCES)[number]

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
    const source = body?.source

    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid stop_id' },
        { status: 400 }
      )
    }
    if (!SOURCES.includes(source as Source)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid source' },
        { status: 400 }
      )
    }

    // Optional, and only trusted as a rounded integer — it comes off the
    // client's clock, unlike the timestamp. A bad value must never fail the
    // write: the WHO and WHEN are what matter.
    const rawMinutes = body?.minutes_early
    const minutesEarly =
      typeof rawMinutes === 'number' && Number.isFinite(rawMinutes)
        ? Math.max(0, Math.round(rawMinutes))
        : null

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: updated, error: updateErr } = await supabase
      .from('dispatch_stops')
      .update({
        early_pickup_override_by:            user.id,
        early_pickup_override_at:            new Date().toISOString(),
        early_pickup_override_source:        source,
        early_pickup_override_minutes_early: minutesEarly,
      })
      .eq('id', stopId)
      .is('early_pickup_override_at', null)
      .select('id')

    if (updateErr) {
      console.error('[/api/stops/early-override] update failed:', updateErr.message)
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      )
    }

    // Zero rows = already stamped (first dismissal wins — success), or the
    // stop doesn't exist / RLS denied. Distinguish so a genuinely bad stop_id
    // surfaces instead of reading as a silent success.
    if (!updated || updated.length === 0) {
      const { data: existing } = await supabase
        .from('dispatch_stops')
        .select('id')
        .eq('id', stopId)
        .maybeSingle()
      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Stop not found' },
          { status: 404 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(
      '[/api/stops/early-override POST] unhandled:',
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    )
  }
}
