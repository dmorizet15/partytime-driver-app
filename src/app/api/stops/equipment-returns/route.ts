// ─── /api/stops/equipment-returns ────────────────────────────────────────────
// Equipment Return Tracking — RESERVATION-SCOPED LEDGER (supersedes the
// original pairwise linked-delivery resolution). Balance per equipment_key =
// SUM over the reservation's DELIVERY rows − SUM over its COMPLETED PICKUP
// rows. Jobs split across stops (tent delivered separately from inflatable,
// inflatable picked up first) fall out naturally: the last crew sees whatever
// is LEFT after earlier pickups, not any single delivery's original count.
// Math lives in src/lib/equipmentReturns/ledger.ts (pure, smoke-tested).
//
// GET ?stop_id=<pickup uuid>
//   → { returns: [{equipment_key, quantity}],           // balance > 0 — reminder cards
//       balances: [{equipment_key, delivered, retrieved, balance}] }  // capture prefill
//   The current stop's own pickup rows are EXCLUDED (its earlier entry must
//   not reduce its own expected balance). Always 200 {returns:[],balances:[]}
//   on no-data/unauth/error — never breaks an embedding screen.
//
// POST { stop_id, entries: [{equipment_key, quantity}] }   (pickup completion)
//   Crew-gated (route_crew of the stop's route). Upserts the entries, then
//   checks LIVE whether any OTHER pickup on the reservation is incomplete
//   (completed_at IS NULL — required_pickup_count is deliberately NOT the
//   source of truth; live counts diverge from it). If this was the final
//   pickup: recompute the full ledger (all pickup rows — this stop's
//   completed_at may not be stamped yet) and, on any nonzero balance, alert
//   dispatch ONCE per reservation (equipment_return_alerts insert-gate, so an
//   offline-queue replay can never double-email). Intermediate pickups NEVER
//   alert — a partial retrieval mid-job is normal.
//
// Server-side + service-role: sibling stops and their rows live on OTHER
// routes, so client RLS can't read them (the /api/stops/same-job rationale).

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { computeBalances, traceLines, type LedgerRow } from '@/lib/equipmentReturns/ledger'
import { sendEquipmentAlertEmail } from '@/lib/equipmentReturns/alertEmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY = {
  returns: [] as Array<{ equipment_key: string; quantity: number }>,
  balances: [] as Array<{ equipment_key: string; delivered: number; retrieved: number; balance: number }>,
}
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

function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

interface StopLinkRow {
  id: string
  stop_type: string | null
  reservation_id: string | null
  route_id: string | null
  scheduled_date: string | null
  customer_name: string | null
  address: string | null
}

async function loadStop(supabase: SupabaseClient, stopId: string): Promise<StopLinkRow | null> {
  const res = await supabase
    .from('dispatch_stops')
    .select('id, stop_type, reservation_id, route_id, scheduled_date, customer_name, address')
    .eq('id', stopId)
    .maybeSingle()
  if (res.error) {
    console.warn('[equipment-returns] stop query failed:', res.error.message)
    return null
  }
  return (res.data as StopLinkRow | null) ?? null
}

// All ledger rows for a reservation — equipment rows joined to their stop.
async function loadLedgerRows(supabase: SupabaseClient, reservationId: string): Promise<LedgerRow[] | null> {
  const res = await supabase
    .from('stop_equipment_returns')
    .select('equipment_key, quantity, stop:dispatch_stops!inner(id, stop_type, completed_at, scheduled_date)')
    .eq('stop.reservation_id', reservationId)
  if (res.error) {
    console.warn('[equipment-returns] ledger query failed:', res.error.message)
    return null
  }
  const firstRel = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  return ((res.data ?? []) as unknown as Array<{
    equipment_key: string
    quantity: number
    stop: LedgerRow['stop'] | LedgerRow['stop'][] | null
  }>)
    .map((r) => ({ equipment_key: r.equipment_key, quantity: r.quantity, stop: firstRel(r.stop)! }))
    .filter((r) => !!r.stop)
}

// ─── GET — expected balance for a pickup stop ────────────────────────────────

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get('stop_id')
  if (!stopId) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const supabase = adminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const stop = await loadStop(supabase, stopId)
  if (!stop || stop.stop_type !== 'pickup' || !stop.reservation_id) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const rows = await loadLedgerRows(supabase, stop.reservation_id)
  if (!rows) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const balances = computeBalances(rows, { excludeStopId: stop.id, completedPickupsOnly: true })
  return NextResponse.json(
    {
      returns: balances
        .filter((b) => b.balance > 0)
        .map((b) => ({ equipment_key: b.equipment_key, quantity: b.balance })),
      balances,
    },
    { status: 200, headers: HEADERS }
  )
}

// ─── POST — pickup-completion write + final-pickup discrepancy check ─────────

interface PostBody {
  stop_id?: string
  entries?: Array<{ equipment_key?: string; quantity?: number }>
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ saved: false, error: 'unauthenticated' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as PostBody | null
  const stopId = body?.stop_id
  if (!stopId) {
    return NextResponse.json({ saved: false, error: 'bad_request' }, { status: 400 })
  }
  const entries = (body?.entries ?? [])
    .filter((e): e is { equipment_key: string; quantity: number } =>
      typeof e?.equipment_key === 'string' && e.equipment_key.length > 0
      && typeof e?.quantity === 'number' && Number.isFinite(e.quantity) && e.quantity >= 0)
    .map((e) => ({ equipment_key: e.equipment_key, quantity: Math.floor(e.quantity) }))

  const stop = await loadStop(supabase, stopId)
  if (!stop || stop.stop_type !== 'pickup') {
    return NextResponse.json({ saved: false, error: 'not_a_pickup' }, { status: 400 })
  }

  // Crew gate — mirrors the RLS insert policy the delivery side goes through
  // (crew of the stop's route). Service-role does the writes; the gate is here.
  const crewRes = await supabase
    .from('route_crew')
    .select('user_id')
    .eq('route_id', stop.route_id!)
    .eq('user_id', user.id)
    .limit(1)
  if (crewRes.error || (crewRes.data ?? []).length === 0) {
    if (crewRes.error) console.warn('[equipment-returns] crew gate query failed:', crewRes.error.message)
    return NextResponse.json({ saved: false, error: 'not_crew' }, { status: 403 })
  }

  if (entries.length > 0) {
    const upsertRes = await supabase
      .from('stop_equipment_returns')
      .upsert(
        entries.map((e) => ({
          stop_id: stop.id,
          equipment_key: e.equipment_key,
          quantity: e.quantity,
          created_by: user.id,
        })),
        { onConflict: 'stop_id,equipment_key' }
      )
    if (upsertRes.error) {
      console.error('[equipment-returns] pickup upsert failed:', upsertRes.error.message)
      return NextResponse.json({ saved: false, error: 'upsert_failed' }, { status: 500 })
    }
  }

  // No reservation → nothing to reconcile against; the write (if any) stands.
  if (!stop.reservation_id) {
    return NextResponse.json({ saved: true, finalPickup: false, alerted: false }, { headers: HEADERS })
  }

  // Was this the LAST pickup? Live query — authoritative over
  // required_pickup_count (live counts diverge: 31 multi-pickup reservations
  // vs 23 pickups carrying the flag, checked 2026-07-02).
  const remainingRes = await supabase
    .from('dispatch_stops')
    .select('id')
    .eq('reservation_id', stop.reservation_id)
    .eq('stop_type', 'pickup')
    .neq('id', stop.id)
    .is('completed_at', null)
    .limit(1)
  if (remainingRes.error) {
    // Can't prove finality — do NOT alert; the next completion retries.
    console.warn('[equipment-returns] remaining-pickups query failed:', remainingRes.error.message)
    return NextResponse.json({ saved: true, finalPickup: false, alerted: false }, { headers: HEADERS })
  }
  if ((remainingRes.data ?? []).length > 0) {
    // Intermediate pickup — never alert, even if its own count looks low.
    return NextResponse.json({ saved: true, finalPickup: false, alerted: false }, { headers: HEADERS })
  }

  // Final pickup — recompute the reservation ledger INCLUDING this stop's
  // rows (its completed_at may not be stamped yet; rows exist ⇒ crew entered).
  const rows = await loadLedgerRows(supabase, stop.reservation_id)
  if (!rows) {
    return NextResponse.json({ saved: true, finalPickup: true, alerted: false }, { headers: HEADERS })
  }
  const balances = computeBalances(rows, { completedPickupsOnly: false })
  const discrepancies = balances.filter((b) => b.balance !== 0)
  if (discrepancies.length === 0) {
    return NextResponse.json({ saved: true, finalPickup: true, alerted: false }, { headers: HEADERS })
  }

  // Alert at most once per reservation: only the caller whose insert lands
  // sends the email (ignoreDuplicates → replays get back an empty row set).
  const trace = traceLines(rows)
  const stampRes = await supabase
    .from('equipment_return_alerts')
    .upsert(
      { reservation_id: stop.reservation_id, payload: { discrepancies, trace } },
      { onConflict: 'reservation_id', ignoreDuplicates: true }
    )
    .select('reservation_id')
  if (stampRes.error || (stampRes.data ?? []).length === 0) {
    if (stampRes.error) console.warn('[equipment-returns] alert stamp failed:', stampRes.error.message)
    return NextResponse.json({ saved: true, finalPickup: true, alerted: false }, { headers: HEADERS })
  }

  const emailed = await sendEquipmentAlertEmail({
    reservationId: stop.reservation_id,
    customerName: stop.customer_name,
    address: stop.address,
    finalPickupDate: stop.scheduled_date,
    discrepancies,
    trace,
  })
  if (!emailed) {
    // Release the stamp so a retry can re-send (transient Resend failure, or
    // RESEND_API_KEY not yet configured), and tell the client to keep this
    // POST in its offline queue — a plain 200 would otherwise drop it and
    // lose the alert.
    await supabase
      .from('equipment_return_alerts')
      .delete()
      .eq('reservation_id', stop.reservation_id)
    return NextResponse.json(
      { saved: true, finalPickup: true, alerted: false, retryAlert: true },
      { headers: HEADERS }
    )
  }

  return NextResponse.json({ saved: true, finalPickup: true, alerted: true }, { headers: HEADERS })
}
