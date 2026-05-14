// GET /api/schedule/week?start=YYYY-MM-DD&days=8
// ───────────────────────────────────────────────
// Driver-app copy of the dashboard endpoint. Returns a per-day schedule
// view across the requested window. Equipment summary is precomputed per
// stop. Auth: session cookie identifies the user; service-role client
// bypasses RLS for the join (same pattern as /api/inspection/status).

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { buildEquipmentSummary, type EquipmentSummary } from '@/lib/equipmentSummary'

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            /* route-handler context */
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

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function extractTown(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map((p) => p.trim())
  return parts.length >= 3 ? parts[1] : (parts.length >= 2 ? parts[0] : '')
}

interface ScheduleStop {
  id:                   string
  stop_type:            string
  customer_name:        string
  town:                 string
  equipment:            EquipmentSummary
  tapgoods_order_token: string | null
}

interface ScheduleRoute {
  id:          string
  name:        string
  driver_id:   string | null
  driver_name: string | null
  stop_count:  number
  status:      string
  stops:       ScheduleStop[]
}

interface ScheduleDay {
  date:   string
  routes: ScheduleRoute[]
}

export async function GET(req: NextRequest) {
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const start = url.searchParams.get('start') || todayISO()
  const daysParam = parseInt(url.searchParams.get('days') ?? '8', 10)
  const days = Math.max(1, Math.min(31, isNaN(daysParam) ? 8 : daysParam))

  const dates: string[] = []
  for (let i = 0; i < days; i++) dates.push(addDays(start, i))
  const endExclusive = addDays(start, days)

  const db = getAdminClient()

  const [routesRes, stopsRes] = await Promise.all([
    db
      .from('routes')
      .select('id, route_date, route_number, label, status')
      .gte('route_date', start)
      .lt('route_date', endExclusive)
      .order('route_date')
      .order('route_number', { ascending: true, nullsFirst: false }),
    db
      .from('dispatch_stops')
      .select('id, route_id, route_position, stop_type, customer_name, address, items, tapgoods_order_token')
      .gte('scheduled_date', start)
      .lt('scheduled_date', endExclusive)
      .not('route_id', 'is', null)
      .order('route_position', { ascending: true, nullsFirst: false }),
  ])

  if (routesRes.error) return NextResponse.json({ error: routesRes.error.message }, { status: 500 })
  if (stopsRes.error) return NextResponse.json({ error: stopsRes.error.message }, { status: 500 })

  const routes = routesRes.data ?? []
  const stops = stopsRes.data ?? []

  const routeIds = routes.map((r) => r.id as string)
  const driverByRoute = new Map<string, { id: string; name: string | null }>()
  if (routeIds.length > 0) {
    const { data: assignments } = await db
      .from('route_assignments')
      .select('route_id, user_id')
      .in('route_id', routeIds)
      .eq('role', 'driver')
    const userIds = Array.from(
      new Set((assignments ?? []).map((a) => a.user_id).filter((x): x is string => !!x)),
    )
    const namesById = new Map<string, string | null>()
    if (userIds.length > 0) {
      const { data: profs } = await db
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      for (const p of profs ?? []) namesById.set(p.id, p.display_name)
    }
    for (const a of assignments ?? []) {
      if (a.user_id) {
        driverByRoute.set(a.route_id, { id: a.user_id, name: namesById.get(a.user_id) ?? null })
      }
    }
  }

  const stopsByRoute = new Map<string, ScheduleStop[]>()
  for (const s of stops) {
    if (!s.route_id) continue
    const stop: ScheduleStop = {
      id:                   s.id as string,
      stop_type:             (s.stop_type as string) ?? 'delivery',
      customer_name:         (s.customer_name as string) ?? '',
      town:                  extractTown(s.address as string | null),
      equipment:             buildEquipmentSummary(s.items),
      tapgoods_order_token:  (s.tapgoods_order_token as string | null) ?? null,
    }
    const arr = stopsByRoute.get(s.route_id as string)
    if (arr) arr.push(stop)
    else stopsByRoute.set(s.route_id as string, [stop])
  }

  const routesByDate = new Map<string, ScheduleRoute[]>()
  for (const r of routes) {
    const driver = driverByRoute.get(r.id as string) ?? null
    const stopsForRoute = stopsByRoute.get(r.id as string) ?? []
    const route: ScheduleRoute = {
      id:          r.id as string,
      name:        ((r.label as string) ?? '').trim() || `Route ${(r.route_number as number | null) ?? '?'}`,
      driver_id:   driver?.id ?? null,
      driver_name: driver?.name ?? null,
      stop_count:  stopsForRoute.length,
      status:      (r.status as string) ?? 'draft',
      stops:       stopsForRoute,
    }
    const arr = routesByDate.get(r.route_date as string)
    if (arr) arr.push(route)
    else routesByDate.set(r.route_date as string, [route])
  }

  const result: ScheduleDay[] = dates.map((date) => ({
    date,
    routes: routesByDate.get(date) ?? [],
  }))

  return NextResponse.json({ days: result })
}
