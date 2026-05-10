// ─── /api/inspection/submit ──────────────────────────────────────────────────
// Driver-scoped pre-trip inspection write. Inserts:
//   1. vehicle_inspections row (one per route + driver, gated by Home)
//   2. vehicle_defects rows for every checklist row in 'fail' state
//   3. defect_acknowledgments rows for every previous-DVIR defect the driver
//      acknowledged on Screen 3 (role = 'driver', linked to today's route)
//
// Auth: session cookie identifies the driver (driver_id can't be spoofed).
// Inserts run via service-role client to sidestep RLS verification on
// dashboard-side migrations 026–030.
//
//   POST { route_id, truck_id, towing_trailer, previous_dvir_reviewed_id?,
//          previous_dvir_acknowledged, checklist, defect_acknowledgments }
//   → 200 { id, outcome: 'clear' | 'non_oos' | 'oos' }
//
// outcome derivation:
//   any failed row with severity = 'oos' → 'oos'
//   any failed row at all                  → 'non_oos'
//   all rows pass                          → 'clear'

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mirrors src/screens/InspectionScreen.tsx — kept in sync by review. If a
// new federal category lands in the spec it must be added in both places.
const FEDERAL_CATEGORIES = [
  'service_brakes',
  'trailer_brake_connections',
  'parking_brake',
  'steering_mechanism',
  'lighting_devices',
  'tires',
  'horn',
  'windshield_wipers',
  'rear_vision_mirrors',
  'coupling_devices',
  'wheels_and_rims',
  'emergency_equipment',
] as const

type Category = typeof FEDERAL_CATEGORIES[number]

// Trailer-conditional categories: pass column is nullable in the schema and
// the row is omitted from defect inserts when towing_trailer = false.
const TRAILER_ONLY = new Set<Category>(['trailer_brake_connections', 'coupling_devices'])

type IncomingItem =
  | { state: 'pass' }
  | { state: 'fail'; severity: 'oos' | 'non_oos'; description: string }

interface SubmitBody {
  route_id:                   unknown
  truck_id:                   unknown
  towing_trailer:             unknown
  previous_dvir_reviewed_id?: unknown
  previous_dvir_acknowledged: unknown
  checklist:                  unknown
  defect_acknowledgments:     unknown
}

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

export async function POST(request: NextRequest) {
  let body: SubmitBody
  try {
    body = (await request.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const routeId = body.route_id
  const truckId = body.truck_id
  if (typeof routeId !== 'string' || !UUID_RE.test(routeId)) {
    return NextResponse.json({ error: 'Missing or invalid route_id' }, { status: 400 })
  }
  if (typeof truckId !== 'string' || !UUID_RE.test(truckId)) {
    return NextResponse.json({ error: 'Missing or invalid truck_id' }, { status: 400 })
  }

  const towing = body.towing_trailer === true
  const checklist = body.checklist
  if (!checklist || typeof checklist !== 'object') {
    return NextResponse.json({ error: 'Missing checklist' }, { status: 400 })
  }
  const checklistMap = checklist as Record<string, IncomingItem | undefined>

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()

  // ── Validate + map checklist to *_pass columns ────────────────────────────
  const passColumns: Record<string, boolean | null> = {}
  for (const k of FEDERAL_CATEGORIES) {
    if (TRAILER_ONLY.has(k) && !towing) {
      passColumns[`${k}_pass`] = null
      continue
    }
    const item = checklistMap[k]
    if (!item || (item.state !== 'pass' && item.state !== 'fail')) {
      return NextResponse.json({ error: `Missing or invalid checklist entry: ${k}` }, { status: 400 })
    }
    if (item.state === 'fail') {
      if (item.severity !== 'oos' && item.severity !== 'non_oos') {
        return NextResponse.json({ error: `Invalid severity for ${k}` }, { status: 400 })
      }
      if (typeof item.description !== 'string' || item.description.trim().length === 0) {
        return NextResponse.json({ error: `Missing description for ${k}` }, { status: 400 })
      }
    }
    passColumns[`${k}_pass`] = item.state === 'pass'
  }

  // ── Insert vehicle_inspections ────────────────────────────────────────────
  const inspectionRow = {
    truck_id:                   truckId,
    driver_id:                  user.id,
    route_id:                   routeId,
    inspection_type:            'pre_trip',
    towing_trailer:             towing,
    ...passColumns,
    previous_dvir_reviewed_id:  typeof body.previous_dvir_reviewed_id === 'string' ? body.previous_dvir_reviewed_id : null,
    previous_dvir_acknowledged: body.previous_dvir_acknowledged === true,
    signed_by_user_id:          user.id,
  }

  const inspectionRes = await admin
    .from('vehicle_inspections')
    .insert(inspectionRow)
    .select('id')
    .single()

  if (inspectionRes.error) {
    console.error('[/api/inspection/submit] inspection insert failed:', inspectionRes.error.message)
    return NextResponse.json({ error: inspectionRes.error.message }, { status: 500 })
  }
  const inspectionId = inspectionRes.data.id as string

  // ── Insert vehicle_defects (per failed row) ───────────────────────────────
  // TODO: wrap inspection + defects + acks in a transactional RPC. Today the
  // inserts are sequential — if defects fail after inspection succeeded, the
  // driver has an inspection row with no defect rows (fail-open: home gate
  // shows inspected, but maintenance loses visibility). Acceptable for v1.
  const defectRows: Array<{ inspection_id: string; truck_id: string; category: string; severity: 'oos' | 'non_oos'; description: string; reported_by_user_id: string }> = []
  for (const k of FEDERAL_CATEGORIES) {
    if (TRAILER_ONLY.has(k) && !towing) continue
    const item = checklistMap[k]
    if (item?.state === 'fail') {
      defectRows.push({
        inspection_id:        inspectionId,
        truck_id:             truckId,
        category:             k,
        severity:             item.severity,
        description:          item.description.trim(),
        reported_by_user_id:  user.id,
      })
    }
  }

  if (defectRows.length > 0) {
    const defectRes = await admin.from('vehicle_defects').insert(defectRows)
    if (defectRes.error) {
      console.error('[/api/inspection/submit] defects insert failed:', defectRes.error.message)
      return NextResponse.json({ error: defectRes.error.message }, { status: 500 })
    }
  }

  // ── Insert defect_acknowledgments (per acked previous defect) ─────────────
  // Non-fatal: if this insert fails the inspection still stands. The
  // dispatcher-side ack on the persistent defect already exists; the driver
  // ack is an audit trail enrichment.
  const acks = Array.isArray(body.defect_acknowledgments) ? body.defect_acknowledgments as unknown[] : []
  const ackRows = acks
    .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    .map((defectId) => ({
      defect_id:               defectId,
      acknowledged_by_user_id: user.id,
      acknowledgment_role:     'driver',
      route_id:                routeId,
    }))
  if (ackRows.length > 0) {
    const ackRes = await admin.from('defect_acknowledgments').insert(ackRows)
    if (ackRes.error) {
      console.warn('[/api/inspection/submit] defect ack insert failed (non-fatal):', ackRes.error.message)
    }
  }

  // ── Compute outcome ────────────────────────────────────────────────────────
  const hasOos  = defectRows.some((d) => d.severity === 'oos')
  const outcome: 'clear' | 'non_oos' | 'oos' =
    hasOos ? 'oos' : defectRows.length > 0 ? 'non_oos' : 'clear'

  return NextResponse.json(
    { id: inspectionId, outcome },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
