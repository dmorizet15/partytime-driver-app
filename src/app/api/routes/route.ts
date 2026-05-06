// ─── GET /api/routes?date=YYYY-MM-DD ─────────────────────────────────────────
// Server-side route handler. Reads routes + dispatch_stops from Supabase
// (partytime-east) — the same source of truth Melissa writes to from the
// dashboard. Service-role key never reaches the browser.

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'
import {
  transformSupabase,
  type SupabaseAssignmentRow,
  type SupabaseRouteRow,
  type SupabaseStopRow,
} from '@/lib/supabaseTransform'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  // Routes for the day, joined twice to trucks (primary + secondary). Aliases
  // mirror the dashboard's boardClient.ts so future dashboard ↔ driver schema
  // changes only need one search.
  const routesRes = await supabase
    .from('routes')
    .select(`
      id,
      route_date,
      label,
      truck_id,
      truck_id_2,
      truck:trucks!routes_truck_id_fkey(id, name),
      truck_2:trucks!routes_truck_id_2_fkey(id, name)
    `)
    .eq('route_date', date)

  if (routesRes.error) {
    console.error('[/api/routes] routes query failed:', routesRes.error.message)
    return NextResponse.json({ error: routesRes.error.message }, { status: 500 })
  }

  const routeRows = (routesRes.data ?? []) as unknown as SupabaseRouteRow[]
  if (routeRows.length === 0) {
    return NextResponse.json(
      { routes: [], stops: [], date },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=15' } }
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
        items, notes, stop_type, payment_state, balance_due_amount,
        calculated_eta,
        tapgoods_order_token
      `)
      .in('route_id', routeIds)
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
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=15' },
    }
  )
}
