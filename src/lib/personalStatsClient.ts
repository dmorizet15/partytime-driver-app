// Personal stats for the driver app's /profile page.
// Lightweight subset of what the admin Driver Profile shows on the
// dashboard side. RLS lets a driver see their own route_assignments +
// dispatch_stops on their own routes; we read those directly here.

import { supabase } from './supabase'

export interface PersonalStats {
  totalStopsCompleted: number
  weekStopsCompleted:  number             // stops completed since start of current week (Mon)
  startDate:           string | null      // YYYY-MM-DD of the earliest route
  truckHistory:        Array<{
    truck_id:       string
    truck_name:     string
    last_driven_at: string
    routes_driven:  number
  }>
}

// Monday-anchored start of week, returned as an ISO timestamp. Used to filter
// the already-fetched stops list — no extra query.
function startOfWeekISO(): string {
  const d = new Date()
  const day = d.getDay()                  // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? 6 : day - 1    // back to Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
  return monday.toISOString()
}

export async function fetchPersonalStats(driverId: string): Promise<PersonalStats> {
  // 1. Routes assigned to the driver.
  const { data: assignments, error: aErr } = await supabase
    .from('route_crew')
    .select('route_id')
    .eq('user_id', driverId)
    .eq('is_primary', true)
  if (aErr) {
    console.error('[personalStats] route_crew lookup failed:', aErr.message)
    throw aErr
  }

  const routeIds = Array.from(new Set((assignments ?? []).map((a) => a.route_id)))
  if (routeIds.length === 0) {
    return { totalStopsCompleted: 0, weekStopsCompleted: 0, startDate: null, truckHistory: [] }
  }

  // 2. Pull routes + stops + trucks in parallel.
  const [routesRes, stopsRes, trucksRes] = await Promise.all([
    supabase
      .from('routes')
      .select('id, route_date, truck_id, truck_id_2')
      .in('id', routeIds)
      .order('route_date', { ascending: false }),
    supabase
      .from('dispatch_stops')
      .select('id, route_id, completed_at')
      .in('route_id', routeIds),
    supabase.from('trucks').select('id, name'),
  ])
  if (routesRes.error)  throw routesRes.error
  if (stopsRes.error)   throw stopsRes.error
  if (trucksRes.error)  throw trucksRes.error

  const truckById = new Map((trucksRes.data ?? []).map((t) => [t.id, t.name]))

  const completedStops = (stopsRes.data ?? []).filter((s) => !!s.completed_at)
  const totalStopsCompleted = completedStops.length
  const weekStart = startOfWeekISO()
  const weekStopsCompleted = completedStops.filter(
    (s) => s.completed_at !== null && s.completed_at >= weekStart
  ).length

  let startDate: string | null = null
  const truckAgg = new Map<string, { routesDriven: number; lastDrivenAt: string }>()
  for (const r of routesRes.data ?? []) {
    if (r.route_date && (!startDate || r.route_date < startDate)) {
      startDate = r.route_date
    }
    for (const tId of [r.truck_id, r.truck_id_2]) {
      if (!tId) continue
      const existing = truckAgg.get(tId)
      if (existing) {
        existing.routesDriven++
        if (r.route_date > existing.lastDrivenAt) existing.lastDrivenAt = r.route_date
      } else {
        truckAgg.set(tId, { routesDriven: 1, lastDrivenAt: r.route_date })
      }
    }
  }
  const truckHistory: PersonalStats['truckHistory'] = []
  truckAgg.forEach((agg, truckId) => {
    const name = truckById.get(truckId)
    if (!name) return
    truckHistory.push({
      truck_id:       truckId,
      truck_name:     name,
      last_driven_at: agg.lastDrivenAt,
      routes_driven:  agg.routesDriven,
    })
  })
  truckHistory.sort((a, b) => b.last_driven_at.localeCompare(a.last_driven_at))

  return { totalStopsCompleted, weekStopsCompleted, startDate, truckHistory }
}
