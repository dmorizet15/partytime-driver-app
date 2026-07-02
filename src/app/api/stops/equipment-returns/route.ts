// ─── GET /api/stops/equipment-returns ────────────────────────────────────────
// Equipment Return Tracking — pickup-side read. Given a PICKUP stop id,
// resolves its linked DELIVERY stop and returns the equipment counts the
// delivery crew captured there (stop_equipment_returns, quantity > 0).
// Powers <EquipmentRetrieveCard />.
//
// Query: ?stop_id=<uuid>   (the pickup stop)
//
// Server-side + service-role for the same reason as /api/stops/same-job: the
// linked delivery stop lives on a DIFFERENT route, so the pickup crew's RLS
// (crew-of-the-stop's-route) can't read its rows client-side. Auth: session
// cookie gates access; the reads run through the service-role client.
//
// Linkage resolution (verified live 2026-07-02: 425/426 pickups carry
// linked_stop_id; reservation_id is populated on 100%):
//   1. dispatch_stops.linked_stop_id — direct FK, date-independent (a Will
//      Call pickup months after delivery still resolves).
//   2. Fallback (~0.2%): most recent DELIVERY stop on the same reservation_id
//      scheduled on/before the pickup's date.
// Always responds 200 {returns: []} on no-data/unauth/error — never breaks a
// screen that embeds the card.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY = { returns: [] as Array<{ equipment_key: string; quantity: number }> }
const HEADERS = { 'Cache-Control': 'private, no-store' }

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

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get('stop_id')
  if (!stopId) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // The pickup stop — linkage fields only.
  const stopRes = await supabase
    .from('dispatch_stops')
    .select('id, stop_type, linked_stop_id, reservation_id, scheduled_date')
    .eq('id', stopId)
    .maybeSingle()
  if (stopRes.error || !stopRes.data) {
    if (stopRes.error) console.warn('[/api/stops/equipment-returns] stop query failed:', stopRes.error.message)
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }
  const stop = stopRes.data as {
    id: string
    stop_type: string | null
    linked_stop_id: string | null
    reservation_id: string | null
    scheduled_date: string | null
  }
  if (stop.stop_type !== 'pickup') {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  // Resolve the delivery stop: linked_stop_id first, reservation fallback.
  let deliveryStopId = stop.linked_stop_id
  if (!deliveryStopId && stop.reservation_id) {
    let fallback = supabase
      .from('dispatch_stops')
      .select('id, scheduled_date')
      .eq('reservation_id', stop.reservation_id)
      .eq('stop_type', 'delivery')
      .order('scheduled_date', { ascending: false })
      .limit(1)
    if (stop.scheduled_date) fallback = fallback.lte('scheduled_date', stop.scheduled_date)
    const fbRes = await fallback.maybeSingle()
    if (fbRes.error) {
      console.warn('[/api/stops/equipment-returns] fallback query failed:', fbRes.error.message)
    }
    deliveryStopId = (fbRes.data as { id: string } | null)?.id ?? null
  }
  if (!deliveryStopId) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const returnsRes = await supabase
    .from('stop_equipment_returns')
    .select('equipment_key, quantity')
    .eq('stop_id', deliveryStopId)
    .gt('quantity', 0)
  if (returnsRes.error) {
    console.warn('[/api/stops/equipment-returns] returns query failed:', returnsRes.error.message)
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  return NextResponse.json(
    { returns: returnsRes.data ?? [] },
    { status: 200, headers: HEADERS }
  )
}
