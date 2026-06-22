// ─── GET /api/stops/same-job ─────────────────────────────────────────────────
// Next Day Route Preview — Session 3. Given a reservation (job) + date, returns
// the OTHER routes (trucks) working that same job on that day, with the primary
// driver / co-driver names + truck. Powers <SameJobIndicator />.
//
// Query: ?reservation_id=<uuid>&date=<YYYY-MM-DD>&exclude_route_id=<uuid>
//
// Server-side + service-role because route_crew / profiles reads are RLS-gated
// to the caller's own routes (the whole reason /api/routes uses service-role) —
// a client query would return EMPTY crew for sibling routes the driver isn't on.
// Auth: session cookie gates access (any authenticated app user); the reads run
// through the service-role client.
//
// dispatch_stops uses `scheduled_date` (held = routes.route_date by the
// dashboard Migration 035 trigger) — that's the date column we filter on.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
          } catch { /* route-handler context — cookie writes no-op */ }
        },
      },
    }
  )
}

export async function GET(req: NextRequest) {
  const reservationId = req.nextUrl.searchParams.get('reservation_id')
  const date          = req.nextUrl.searchParams.get('date')
  const excludeRoute  = req.nextUrl.searchParams.get('exclude_route_id')

  if (!reservationId || !date || !DATE_RE.test(date)) {
    return NextResponse.json({ siblings: [] }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ siblings: [] }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Sibling stops = same job + same day, NOT on the current route, not the depot
  // return leg. We only need the distinct route_ids.
  let stopsQuery = supabase
    .from('dispatch_stops')
    .select('route_id')
    .eq('reservation_id', reservationId)
    .eq('scheduled_date', date)
    .neq('stop_type', 'warehouse_return')
  if (excludeRoute) stopsQuery = stopsQuery.neq('route_id', excludeRoute)

  const stopsRes = await stopsQuery
  if (stopsRes.error) {
    console.warn('[/api/stops/same-job] stops query failed:', stopsRes.error.message)
    return NextResponse.json({ siblings: [] }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const routeIds = Array.from(new Set(
    (stopsRes.data ?? []).map((r) => r.route_id).filter((id): id is string => !!id)
  ))
  if (routeIds.length === 0) {
    return NextResponse.json({ siblings: [] }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const [routesRes, crewRes] = await Promise.all([
    supabase
      .from('routes')
      .select('id, route_number, truck:trucks!routes_truck_id_fkey(name)')
      .in('id', routeIds),
    supabase
      .from('route_crew')
      .select('route_id, is_primary, role, wiw_user_name, profile:profiles(display_name), truck:trucks(name)')
      .in('route_id', routeIds),
  ])

  const firstRel = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  type RouteRow = { id: string; route_number: number | null; truck: { name: string | null } | { name: string | null }[] | null }
  type CrewRow = {
    route_id: string; is_primary: boolean | null; role: string
    wiw_user_name: string | null
    profile: { display_name: string | null } | { display_name: string | null }[] | null
    truck: { name: string | null } | { name: string | null }[] | null
  }
  const routeRows = (routesRes.error ? [] : (routesRes.data ?? [])) as unknown as RouteRow[]
  const crewRows  = (crewRes.error  ? [] : (crewRes.data  ?? [])) as unknown as CrewRow[]

  const crewByRoute = new Map<string, CrewRow[]>()
  for (const c of crewRows) {
    const arr = crewByRoute.get(c.route_id) ?? []
    arr.push(c)
    crewByRoute.set(c.route_id, arr)
  }
  const nameOf = (c: CrewRow | undefined): string | null =>
    c ? (firstRel(c.profile)?.display_name?.trim() || c.wiw_user_name?.trim() || null) : null

  const siblings = routeIds.map((rid) => {
    const route = routeRows.find((r) => r.id === rid)
    const crew = crewByRoute.get(rid) ?? []
    const primary = crew.find((c) => c.is_primary === true || c.role === 'primary_driver')
    const coDriver = crew.find((c) => c.is_primary !== true && c.role === 'secondary_driver')
    const truckName =
      firstRel(primary?.truck)?.name?.trim() ||
      firstRel(route?.truck)?.name?.trim() ||
      null
    return {
      route_id:       rid,
      route_number:   route?.route_number ?? null,
      driver_name:    nameOf(primary),
      co_driver_name: nameOf(coDriver),
      truck_name:     truckName,
    }
  }).sort((a, b) => (a.route_number ?? 0) - (b.route_number ?? 0))

  return NextResponse.json(
    { siblings },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
  )
}
