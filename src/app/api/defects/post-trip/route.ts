// ─── /api/defects/post-trip ──────────────────────────────────────────────────
// Driver-scoped post-trip defect report. Distinct from /api/inspection/submit:
// post-trip is a single optional defect captured AFTER route completion, not a
// full DVIR. No checklist, no certify, no parent vehicle_inspections row.
//
// Two methods on one handler — keeps the surface tight:
//
//   GET  → { submitted_today: boolean }
//          Returns true when the current driver has already inserted a
//          vehicle_defects row today with reported_context = 'post_trip'.
//          PostTripDefectCard uses this to hide itself for the rest of the day.
//
//   POST { truck_id, category, severity, description }
//        → 200 { id }
//          Inserts a single vehicle_defects row with reported_context =
//          'post_trip', inspection_id = NULL, severity ∈ {'oos','non_oos'},
//          driver as reported_by_user_id, reported_at defaults to now().
//
// Auth: session cookie identifies the driver (so reported_by_user_id can't be
// spoofed). Inserts run via service-role client to sidestep RLS verification
// on dashboard-side migrations 026–030 (matches /api/inspection/submit).
//
// Schema dependency: migration 009 must be applied (adds reported_context
// column + makes inspection_id nullable). See tasks/open-questions.md.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Local copy of the 12 federal categories — kept in sync with InspectionScreen.tsx
// and /api/inspection/submit FEDERAL_CATEGORIES by review.
// TODO: extract to src/lib/defect-categories.ts when pre-trip stabilizes.
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
const CATEGORY_SET: ReadonlySet<string> = new Set(FEDERAL_CATEGORIES)

interface SubmitBody {
  truck_id:    unknown
  category:    unknown
  severity:    unknown
  description: unknown
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

// "Today" anchored to the server's local timezone. Supabase column
// `reported_at` is timestamptz; we compare against [today_00:00, tomorrow_00:00)
// in the server's wall clock. Driver app is single-region (US East Coast
// service area) so DST/TZ drift across drivers isn't a concern in v1.
function dayBoundsISO(): { startISO: string; endISO: string } {
  const now   = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

export async function GET() {
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()
  const { startISO, endISO } = dayBoundsISO()

  const res = await admin
    .from('vehicle_defects')
    .select('id')
    .eq('reported_by_user_id', user.id)
    .eq('reported_context', 'post_trip')
    .gte('reported_at', startISO)
    .lt('reported_at', endISO)
    .limit(1)

  if (res.error) {
    console.error('[/api/defects/post-trip GET] query failed:', res.error.message)
    return NextResponse.json({ error: res.error.message }, { status: 500 })
  }

  return NextResponse.json(
    { submitted_today: (res.data?.length ?? 0) > 0 },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function POST(request: NextRequest) {
  let body: SubmitBody
  try {
    body = (await request.json()) as SubmitBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const truckId = body.truck_id
  if (typeof truckId !== 'string' || !UUID_RE.test(truckId)) {
    return NextResponse.json({ error: 'Missing or invalid truck_id' }, { status: 400 })
  }

  const category = body.category
  if (typeof category !== 'string' || !CATEGORY_SET.has(category)) {
    return NextResponse.json({ error: 'Missing or invalid category' }, { status: 400 })
  }

  const severity = body.severity
  if (severity !== 'oos' && severity !== 'non_oos') {
    return NextResponse.json({ error: 'severity must be "oos" or "non_oos"' }, { status: 400 })
  }

  const description = body.description
  if (typeof description !== 'string' || description.trim().length === 0) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getAdminClient()

  const insertRes = await admin
    .from('vehicle_defects')
    .insert({
      truck_id:            truckId,
      category:            category as Category,
      severity:            severity,
      description:         description.trim(),
      reported_by_user_id: user.id,
      reported_context:    'post_trip',
      inspection_id:       null,
    })
    .select('id')
    .single()

  if (insertRes.error) {
    console.error('[/api/defects/post-trip POST] insert failed:', insertRes.error.message)
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 })
  }

  return NextResponse.json(
    { id: insertRes.data.id },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
