// ─── GET /api/routes?date=YYYY-MM-DD ─────────────────────────────────────────
// Server-side route handler. Reads routes + dispatch_stops from Supabase
// (partytime-east) — the same source of truth Melissa writes to from the
// dashboard. Service-role key never reaches the browser.
//
// Driver-scope: the response is narrowed to the caller's `route_assignments`
// for the requested date. If the caller is authenticated but has no
// assignment, the endpoint returns an empty result — the driver app is the
// driver's tool, this day-view endpoint is always assignment-scoped for
// everyone including super_admin. An unassigned super_admin should see
// nothing here (same empty state as an unassigned driver), and should use
// GET /api/schedule/week (WeekScheduleView, /schedule route) for the full
// board. Unauthenticated callers also receive an empty result.
//
// Soft-fail exception: if the `route_assignments` lookup itself errors
// (transient Postgres / RLS hiccup), fall through to the unscoped query so
// a real driver isn't locked out of their route by a flaky read.
//
// Auth: session cookie identifies the caller (`user.id` can't be spoofed).
// The actual reads run through a service-role client to sidestep RLS
// verification on the dashboard-side route_assignments policies (matches
// /api/inspection/status and /api/defects/post-trip).

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import {
  transformSupabase,
  type SupabaseAssignmentRow,
  type SupabaseRouteRow,
  type SupabaseStopRow,
} from '@/lib/supabaseTransform'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: 'Missing or invalid "date" param — expected YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[/api/routes] Missing env — SUPABASE_URL:', !!supabaseUrl, '| SUPABASE_SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Driver scope lookup ─────────────────────────────────────────────────
  // Identify caller via session cookie. Narrow routeIds to the caller's
  // route_assignments rows for this date. Service-role reads do the actual
  // join (RLS-bypass).
  //
  // `assignedRouteIds`:
  //   - string[] (possibly empty)  → use as the .in() filter
  //   - null                       → assignment lookup errored; soft-fail
  //                                  through to the unscoped query so a
  //                                  driver isn't locked out by a transient
  //                                  read failure.
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()

  if (!user) {
    const cookieNames = cookies().getAll().map((c) => c.name)
    console.warn('[/api/routes] unauthenticated request', { date, cookies: cookieNames })
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  let assignedRouteIds: string[] | null = []
  if (user) {
    const assignRes = await supabase
      .from('route_assignments')
      .select('route_id, routes!inner(route_date)')
      .eq('user_id', user.id)
      .eq('routes.route_date', date)

    if (assignRes.error) {
      console.warn('[/api/routes] assignment lookup failed (non-fatal):', assignRes.error.message)
      assignedRouteIds = null
    } else {
      assignedRouteIds = (assignRes.data ?? []).map((r) => r.route_id as string)
    }
  }
  // else: unauthenticated → assignedRouteIds stays []. Production callers
  // always carry a session via middleware-gated screens; an unauth hit on
  // this endpoint is either dev-tools poking or a logged-out tab, neither
  // of which has any business receiving the full day's routes.

  // Empty assignment set → return immediately. No need to query routes /
  // stops for a user with no assignment today.
  if (Array.isArray(assignedRouteIds) && assignedRouteIds.length === 0) {
    return NextResponse.json(
      { routes: [], stops: [], date },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  // Routes for the day, joined twice to trucks (primary + secondary). Aliases
  // mirror the dashboard's boardClient.ts so future dashboard ↔ driver schema
  // changes only need one search.
  let routesQuery = supabase
    .from('routes')
    .select(`
      id,
      route_date,
      label,
      truck_id,
      truck_id_2,
      break_blocks,
      dispatcher_notes,
      truck:trucks!routes_truck_id_fkey(id, name, plate, dvir_requirement, current_defect_status),
      truck_2:trucks!routes_truck_id_2_fkey(id, name, plate)
    `)
    .eq('route_date', date)

  if (assignedRouteIds) {
    routesQuery = routesQuery.in('id', assignedRouteIds)
  }

  const routesRes = await routesQuery

  if (routesRes.error) {
    console.error('[/api/routes] routes query failed:', routesRes.error.message)
    return NextResponse.json({ error: routesRes.error.message }, { status: 500 })
  }

  const routeRows = (routesRes.data ?? []) as unknown as SupabaseRouteRow[]
  if (routeRows.length === 0) {
    // Per-user response now varies; private cache only.
    return NextResponse.json(
      { routes: [], stops: [], date },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const routeIds = routeRows.map((r) => r.id)

  // Stops + assignments in parallel — both keyed off routeIds.
  const [stopsRes, assignmentsRes] = await Promise.all([
    supabase
      .from('dispatch_stops')
      .select(`
        id, route_id, route_position,
        customer_name, customer_phone, customer_cell,
        company_name, client_company,
        address, address_lat, address_lng,
        items, notes, dispatcher_notes, warehouse_notes, stop_type, payment_state, balance_due_amount,
        calculated_eta,
        stop_status, completed_at,
        arrived_at,
        tapgoods_order_token,
        constraint_confidence, has_any_constraint,
        delivery_window_start, delivery_window_end,
        pickup_window_start, pickup_window_end,
        event_start, event_end,
        notes_classification,
        notes_additional_delivery, notes_employee_authored, notes_flip,
        notes_set_by_time, notes_strike_time,
        dispatcher_time_override, dispatcher_constraint_dismissed
      `)
      .in('route_id', routeIds)
      // Dashboard Migration 035 (2026-05-08) installed a trigger that holds
      // dispatch_stops.scheduled_date = routes.route_date whenever route_id
      // IS NOT NULL. Auto-stub Monday anchors are reset on assignment, so the
      // historical pickup-stub drift problem is gone. scheduled_date IS now
      // the authoritative per-day filter for assigned stops. (The earlier
      // `calculated_eta IS NOT NULL` workaround coupled visibility to the
      // dispatcher running Optimize — no longer needed.)
      .eq('scheduled_date', date)
      .order('route_position', { ascending: true, nullsFirst: false }),
    supabase
      .from('route_assignments')
      .select('route_id, staff_name')
      .in('route_id', routeIds),
  ])

  if (stopsRes.error) {
    console.error('[/api/routes] stops query failed:', stopsRes.error.message)
    return NextResponse.json({ error: stopsRes.error.message }, { status: 500 })
  }
  if (assignmentsRes.error) {
    // Assignments are non-fatal — drivers can still see the route, just without
    // a name attribution.
    console.warn('[/api/routes] assignments query failed (non-fatal):', assignmentsRes.error.message)
  }

  const { routes, stops } = transformSupabase({
    routes:      routeRows,
    assignments: (assignmentsRes.data ?? []) as SupabaseAssignmentRow[],
    stops:       (stopsRes.data ?? []) as SupabaseStopRow[],
    targetDate:  date,
  })

  return NextResponse.json(
    { routes, stops, date },
    {
      status:  200,
      // Response is per-user — never shared-cache. Browsers can still hold
      // it across in-session navigations; CDNs / proxies must not store.
      headers: { 'Cache-Control': 'private, no-store' },
    }
  )
}
