// ─── /api/inspection/status?route_id=...&truck_id=... ────────────────────────
// Driver-scoped pre-trip inspection state read. Two payloads in one trip:
//
//   current  — vehicle_inspections row WHERE route_id = ? AND driver_id = ?
//              Drives Home's gate state: stops are non-tappable until this
//              exists, and the pre-trip card flips to receipt when it does.
//
//   previous — most recent vehicle_inspections row for the same truck_id BEFORE
//              today, with its open vehicle_defects fanned out. Drives the
//              inspection flow's Screens 2 (clean review) / 3 (defect review).
//
// Auth: session cookie identifies the driver (so driver_id can't be spoofed by
// the client). The actual reads run through a service-role client per the
// session decision (sidesteps RLS verification on dashboard-side migrations).
//
//   GET ?route_id=<uuid>&truck_id=<uuid>
//   → 200 { current: { id, signed_at, has_oos } | null,
//           previous: { id, inspection_date, has_open_defects,
//                       open_defects: Array<{ id, category, severity, description }> } | null }

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export async function GET(request: NextRequest) {
  const routeId = request.nextUrl.searchParams.get('route_id')
  const truckId = request.nextUrl.searchParams.get('truck_id')

  if (!routeId || !UUID_RE.test(routeId)) {
    return NextResponse.json({ error: 'Missing or invalid route_id' }, { status: 400 })
  }
  if (!truckId || !UUID_RE.test(truckId)) {
    return NextResponse.json({ error: 'Missing or invalid truck_id' }, { status: 400 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()

  // ── Current inspection — gate driver for THIS route ────────────────────────
  const currentRes = await admin
    .from('vehicle_inspections')
    .select('id, signed_at')
    .eq('route_id', routeId)
    .eq('driver_id', user.id)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (currentRes.error) {
    console.error('[/api/inspection/status] current query failed:', currentRes.error.message)
    return NextResponse.json({ error: currentRes.error.message }, { status: 500 })
  }

  let currentPayload: { id: string; signed_at: string; has_oos: boolean } | null = null
  if (currentRes.data) {
    // Look up OOS defects on this inspection so the receipt can carry the
    // truck's road-status forward. (Phase 1 receipt is a green check; Phase 2+
    // could swap to a red banner when has_oos = true.)
    const oosRes = await admin
      .from('vehicle_defects')
      .select('id')
      .eq('inspection_id', currentRes.data.id)
      .eq('severity', 'oos')
      .limit(1)
    currentPayload = {
      id:        currentRes.data.id,
      signed_at: currentRes.data.signed_at,
      has_oos:   (oosRes.data?.length ?? 0) > 0,
    }
  }

  // ── Previous inspection — for Screens 2/3 of the flow ──────────────────────
  // Most recent inspection for this truck BEFORE today. Excludes any inspection
  // already tied to today's route (handles the case where driver re-enters the
  // flow mid-day after partial completion).
  const todayLocal = new Date()
  const yyyy = todayLocal.getFullYear()
  const mm   = String(todayLocal.getMonth() + 1).padStart(2, '0')
  const dd   = String(todayLocal.getDate()).padStart(2, '0')
  const todayStr = `${yyyy}-${mm}-${dd}`

  const prevRes = await admin
    .from('vehicle_inspections')
    .select('id, inspection_date')
    .eq('truck_id', truckId)
    .lt('inspection_date', todayStr)
    .order('inspection_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (prevRes.error) {
    console.error('[/api/inspection/status] previous query failed:', prevRes.error.message)
    return NextResponse.json({ error: prevRes.error.message }, { status: 500 })
  }

  let previousPayload:
    | { id: string; inspection_date: string; has_open_defects: boolean
        open_defects: Array<{ id: string; category: string; severity: 'oos' | 'non_oos'; description: string }> }
    | null = null

  if (prevRes.data) {
    const defectsRes = await admin
      .from('vehicle_defects')
      .select('id, category, severity, description')
      .eq('inspection_id', prevRes.data.id)
      .eq('status', 'open')
      .order('severity', { ascending: true }) // 'non_oos' < 'oos' alphabetically; OOS items render last (most attention-grabbing at the bottom of the review list)

    if (defectsRes.error) {
      console.error('[/api/inspection/status] defects query failed:', defectsRes.error.message)
      return NextResponse.json({ error: defectsRes.error.message }, { status: 500 })
    }

    const open = (defectsRes.data ?? []) as Array<{ id: string; category: string; severity: 'oos' | 'non_oos'; description: string }>
    previousPayload = {
      id:               prevRes.data.id,
      inspection_date:  prevRes.data.inspection_date,
      has_open_defects: open.length > 0,
      open_defects:     open,
    }
  }

  return NextResponse.json(
    { current: currentPayload, previous: previousPayload },
    {
      status:  200,
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
