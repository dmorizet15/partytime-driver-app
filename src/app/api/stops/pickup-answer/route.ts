// ─── /api/stops/pickup-answer ────────────────────────────────────────────────
// Pickup Answer (driver-facing) — reservation-scoped read for the gold card on
// a DELIVERY stop. Answers "when are you picking up?" from the reservation's
// pickup stop(s).
//
// GET ?stop_id=<delivery uuid>
//   → { ok: true,  answer: PickupAnswer }   (answer.kind === 'none' ⇒ confirmed no pickup)
//   → { ok: false, answer: null }           (unauth / no stop / not a delivery / error)
//
// The `ok` discriminator matters: the "no pickup scheduled" copy must show ONLY
// when we CONFIRMED no pickup exists (ok:true, kind:'none') — never on a
// transient failure (ok:false → card renders nothing), or the customer would be
// told "no pickup" when we simply couldn't load.
//
// Service-role + session cookie: the reservation's pickup stops live on OTHER
// routes (a future date), so client RLS can't read them — same rationale as
// /api/stops/equipment-returns and /api/stops/same-job. Derivation is pure
// (src/lib/pickupAnswer/derive.ts) and runs server-side; the card is a thin
// renderer over the returned view model.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { derivePickupAnswer } from '@/lib/pickupAnswer/derive'
import type { PickupStopInput, DeliveryStopInput } from '@/lib/pickupAnswer/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store' }
const NOT_OK = { ok: false as const, answer: null }

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

function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Columns the pure derivation reads. `effectiveWindow()` (the guard's resolver)
// consumes dispatcher_time_override / notes_classification / *_window_*.
const PICKUP_COLS =
  'id, reservation_id, stop_type, scheduled_date, pickup_window_start, pickup_window_end, ' +
  'delivery_window_start, delivery_window_end, calculated_eta, dispatcher_time_override, ' +
  'notes_classification, items'

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get('stop_id')
  if (!stopId) return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })

  const supabase = adminClient()
  if (!supabase) return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })

  // Resolve the delivery stop → its reservation.
  const delRes = await supabase
    .from('dispatch_stops')
    .select('id, reservation_id, stop_type')
    .eq('id', stopId)
    .maybeSingle()
  if (delRes.error) {
    console.warn('[pickup-answer] delivery query failed:', delRes.error.message)
    return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })
  }
  const delivery = (delRes.data as DeliveryStopInput | null) ?? null
  if (!delivery || delivery.stop_type !== 'delivery') {
    return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })
  }
  // Delivery with no reservation (0 live cases) ⇒ we can't look up pickups, but
  // it's a confirmed "nothing to show" state.
  if (!delivery.reservation_id) {
    return NextResponse.json(
      { ok: true, answer: derivePickupAnswer(delivery, []) },
      { status: 200, headers: HEADERS }
    )
  }

  const pkRes = await supabase
    .from('dispatch_stops')
    .select(PICKUP_COLS)
    .eq('reservation_id', delivery.reservation_id)
    .eq('stop_type', 'pickup')
  if (pkRes.error) {
    console.warn('[pickup-answer] pickups query failed:', pkRes.error.message)
    return NextResponse.json(NOT_OK, { status: 200, headers: HEADERS })
  }

  const pickups = (pkRes.data as unknown as PickupStopInput[]) ?? []
  const answer = derivePickupAnswer(delivery, pickups)
  return NextResponse.json({ ok: true, answer }, { status: 200, headers: HEADERS })
}
