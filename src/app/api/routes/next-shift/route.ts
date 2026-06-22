// ─── GET /api/routes/next-shift ──────────────────────────────────────────────
// Next Day Route Preview — Session 1. Returns the caller's SOONEST upcoming
// shift (route_date strictly AFTER today), or { shift: null } when there isn't
// one. Powers <NextShiftCard /> on Home.
//
// Auth: session cookie identifies the caller (`user.id` can't be spoofed). The
// actual reads run through a service-role client to sidestep RLS verification
// on the dashboard-owned route_crew / dispatch_stops policies (matches
// /api/routes, /api/inspection/status).
//
// INVESTIGATION NOTES (2026-06-22, live DB):
//  1. route_crew RLS for future-date reads under driver auth: MOOT here — the
//     reads use the service-role client (RLS-bypass), exactly like /api/routes.
//     No date restriction exists on route_crew that would block a driver-auth
//     read anyway; the existing /api/routes (date=) already reads arbitrary
//     dates the same way. No policy change needed.
//  2. route_crew.truck_id → trucks.name join CONFIRMED on future rows (e.g.
//     2026-06-23 rows resolved SIDESWIPE / ULTRA). truck_id IS NULL on some
//     future rows (e.g. 2026-06-24) → truck_name returned as null; the card
//     omits the truck chip gracefully.
//  3. dispatch_stops reachable from a future route via route_id + scheduled_date
//     = route_date (the dashboard Migration 035 trigger keeps them in sync);
//     items[] JSONB is present and carries { qty, name, category, ... }.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { resolveCategory }           from '@/lib/itemCategories'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// Mirrors DayRouteSelectorScreen's COD_PAYMENT_STATES — only literal 'cod' is a
// collect-cash-at-the-door scenario.
const COD_PAYMENT_STATES = new Set<string>(['cod'])

interface RawItem { qty?: number | null; name?: string | null; category?: string | null }

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

// Sum the quantity of every line item whose raw category contains 'tent'
// (case-insensitive) — per the locked spec. Items with null qty count as 1.
function sumTents(items: RawItem[]): number {
  return items.reduce((n, it) => {
    const cat = (it.category ?? '').toLowerCase()
    return cat.includes('tent') ? n + (it.qty ?? 1) : n
  }, 0)
}

// Sum quantity for a resolved display bucket ('Chairs' / 'Tables'). Uses the
// shared resolveCategory() so CHAIR-named items mis-filed under "Misc" still
// land in the chair total (a common TapGoods quirk).
function sumBucket(items: RawItem[], bucket: 'Chairs' | 'Tables'): number {
  return items.reduce((n, it) => {
    return resolveCategory(it.category, it.name ?? '') === bucket ? n + (it.qty ?? 1) : n
  }, 0)
}

export async function GET(req: NextRequest) {
  // `today` defaults to the server's UTC date but the client passes its own
  // local todayStr() so "future" is computed in the driver's timezone, not
  // Vercel's. Strictly-after comparison, so passing today is safe either way.
  const todayParam = req.nextUrl.searchParams.get('today')
  const today = todayParam && DATE_RE.test(todayParam)
    ? todayParam
    : new Date().toISOString().slice(0, 10)

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('[/api/routes/next-shift] Missing env — SUPABASE_URL:', !!supabaseUrl, '| SUPABASE_SERVICE_KEY:', !!supabaseKey)
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ shift: null }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Caller's future driver-crew rows. Sorted in JS (avoids ordering-on-embedded
  // pitfalls) — pick the soonest route_date. Helper / WIW-only rows (the caller
  // would never be one for their own lookup) excluded by the role filter.
  const crewRes = await supabase
    .from('route_crew')
    .select('route_id, role, is_primary, truck:trucks(name), routes!inner(id, route_date, route_number, dispatcher_notes)')
    .eq('user_id', user.id)
    .in('role', ['primary_driver', 'secondary_driver'])
    .gt('routes.route_date', today)

  if (crewRes.error) {
    console.warn('[/api/routes/next-shift] crew lookup failed:', crewRes.error.message)
    return NextResponse.json({ shift: null }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  type CrewRow = {
    route_id: string
    role: string
    is_primary: boolean | null
    truck: { name: string | null } | { name: string | null }[] | null
    routes: { id: string; route_date: string; route_number: number | null; dispatcher_notes: string | null }
           | { id: string; route_date: string; route_number: number | null; dispatcher_notes: string | null }[]
  }
  const rows = (crewRes.data ?? []) as unknown as CrewRow[]
  const firstRel = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  const mine = rows
    .map((r) => ({ ...r, route: firstRel(r.routes) }))
    .filter((r) => r.route)
    .sort((a, b) => (a.route!.route_date < b.route!.route_date ? -1 : a.route!.route_date > b.route!.route_date ? 1 : 0))

  if (mine.length === 0) {
    return NextResponse.json({ shift: null }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const next = mine[0]
  const routeId   = next.route_id
  const routeDate = next.route!.route_date

  // Stops + full crew for that single route, in parallel.
  const [stopsRes, crewNamesRes] = await Promise.all([
    supabase
      .from('dispatch_stops')
      .select('stop_type, items, payment_state')
      .eq('route_id', routeId)
      .eq('scheduled_date', routeDate),
    supabase
      .from('route_crew')
      .select('role, is_primary, wiw_user_name, truck:trucks(name), profile:profiles(display_name)')
      .eq('route_id', routeId),
  ])

  if (stopsRes.error) {
    console.warn('[/api/routes/next-shift] stops query failed:', stopsRes.error.message)
  }

  type StopRow = { stop_type: string | null; items: unknown; payment_state: string | null }
  const stopRows = (stopsRes.data ?? []) as StopRow[]

  // Customer stops only (exclude depot legs) — matches Home's customerStopCount.
  const customerStops = stopRows.filter(
    (s) => s.stop_type !== 'warehouse' && s.stop_type !== 'warehouse_return'
  )

  const allItems: RawItem[] = customerStops.flatMap((s) =>
    Array.isArray(s.items) ? (s.items as RawItem[]) : []
  )

  const tent_count  = sumTents(allItems)
  const chair_count = sumBucket(allItems, 'Chairs')
  const table_count = sumBucket(allItems, 'Tables')
  const cod_flag = customerStops.some(
    (s) => s.stop_type === 'delivery' && COD_PAYMENT_STATES.has(s.payment_state ?? '')
  )

  type CrewNameRow = {
    role: string
    is_primary: boolean | null
    wiw_user_name: string | null
    truck: { name: string | null } | { name: string | null }[] | null
    profile: { display_name: string | null } | { display_name: string | null }[] | null
  }
  const crewRows = (crewNamesRes.error ? [] : (crewNamesRes.data ?? [])) as unknown as CrewNameRow[]

  const crew = crewRows
    .map((c) => {
      const display_name =
        firstRel(c.profile)?.display_name?.trim() || c.wiw_user_name?.trim() || null
      return {
        display_name,
        role: c.role,
        is_primary: c.is_primary === true,
        truck_name: firstRel(c.truck)?.name?.trim() || null,
      }
    })
    .filter((c) => c.display_name) // drop rows with no resolvable name
    // Primary first, then drivers, then helpers.
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))

  return NextResponse.json(
    {
      shift: {
        route_date:      routeDate,
        route_id:        routeId,
        route_number:    next.route!.route_number ?? null,
        stop_count:      customerStops.length,
        tent_count,
        chair_count,
        table_count,
        cod_flag,
        crew,
        dispatcher_notes: next.route!.dispatcher_notes?.trim() || null,
      },
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
  )
}
