import type { PaymentState, Route, Stop, StopStatus } from '@/types'

// ─── Row shapes returned by the Supabase queries ─────────────────────────────
export interface SupabaseTruckRow {
  id:   string
  name: string
}

export interface SupabaseRouteRow {
  id:           string
  route_date:   string
  label:        string
  truck_id:     string | null
  truck_id_2:   string | null
  truck:        SupabaseTruckRow | SupabaseTruckRow[] | null
  truck_2:      SupabaseTruckRow | SupabaseTruckRow[] | null
}

export interface SupabaseAssignmentRow {
  route_id:   string
  staff_name: string | null
}

export interface SupabaseStopRow {
  id:                    string
  route_id:              string | null
  route_position:        number | null
  customer_name:         string
  customer_phone:        string | null
  customer_cell:         string | null
  company_name:          string | null
  client_company:        string | null
  address:               string | null
  address_lat:           number | null
  address_lng:           number | null
  items:                 unknown | null
  notes:                 string | null
  stop_type:             string
  payment_state:         string | null
  balance_due_amount:    number | null
  tapgoods_order_token:  string | null
}

// ─── Items formatter ─────────────────────────────────────────────────────────
// Mirrors the dashboard's print/route formatter so drivers see the same item
// summary the warehouse sees on the load list.
type RawItem = { category?: string | null; name?: string | null; qty?: number | null }

function formatItemsText(items: unknown): string | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined
  const lines = items as RawItem[]

  const tents = lines
    .filter((i) => (i.category ?? '').toLowerCase() === 'tents')
    .map((t) => {
      const m = (t.name ?? '').match(/(\d+\s*[xX×]\s*\d+)/)
      const size = m ? m[1] : (t.name ?? '').trim()
      const qty  = t.qty ?? 1
      return qty > 1 ? `${size} ×${qty}` : size
    })
    .filter(Boolean)

  const catTotals = new Map<string, number>()
  for (const o of lines.filter((i) => (i.category ?? '').toLowerCase() !== 'tents')) {
    const cat = o.category ?? ''
    if (!cat) continue
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + (o.qty ?? 1))
  }
  const others: string[] = []
  catTotals.forEach((qty, cat) => others.push(qty > 1 ? `${cat} ×${qty}` : cat))

  const parts: string[] = []
  if (tents.length)  parts.push(`Tents: ${tents.join(', ')}`)
  if (others.length) parts.push(others.join(', '))
  return parts.length ? parts.join(' · ') : undefined
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// PostgREST embedded relationships can come back as either an object or a
// single-element array depending on FK shape — normalize to one accessor.
function firstRel(rel: SupabaseTruckRow | SupabaseTruckRow[] | null): SupabaseTruckRow | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function mapStopType(raw: string): 'delivery' | 'pickup' | 'service' {
  const v = raw?.toLowerCase()
  if (v === 'pickup')  return 'pickup'
  if (v === 'service') return 'service'
  return 'delivery'
}

function mapPaymentState(raw: string | null): PaymentState | undefined {
  if (raw === 'paid_in_full' || raw === 'cod' || raw === 'ar_customer' || raw === 'balance_due') return raw
  return undefined
}

// ─── Public API ──────────────────────────────────────────────────────────────
export interface TransformInput {
  routes:       SupabaseRouteRow[]
  assignments:  SupabaseAssignmentRow[]
  stops:        SupabaseStopRow[]
  targetDate:   string
}

export interface TransformResult {
  routes: Route[]
  stops:  Stop[]
}

export function transformSupabase({ routes: routeRows, assignments, stops: stopRows, targetDate }: TransformInput): TransformResult {
  // Build driver-name list per route from route_assignments. Multiple crew
  // members can be assigned; concatenate non-empty names.
  const driversByRoute = new Map<string, string[]>()
  for (const a of assignments) {
    if (!a.staff_name) continue
    const list = driversByRoute.get(a.route_id) ?? []
    list.push(a.staff_name)
    driversByRoute.set(a.route_id, list)
  }

  // Count stops per route once, instead of N filter passes.
  const stopCountByRoute = new Map<string, number>()
  for (const s of stopRows) {
    if (!s.route_id) continue
    stopCountByRoute.set(s.route_id, (stopCountByRoute.get(s.route_id) ?? 0) + 1)
  }

  const routes: Route[] = routeRows.map((r) => {
    const truck   = firstRel(r.truck)
    const truck_2 = firstRel(r.truck_2)
    const drivers = driversByRoute.get(r.id) ?? []
    return {
      route_id:        r.id,
      route_name:      r.label,
      operating_date:  targetDate,
      assigned_driver: drivers.length ? drivers.join(', ') : undefined,
      stop_count:      stopCountByRoute.get(r.id) ?? 0,
      route_status:    'active',
      truck_name:      truck?.name,
      truck_2_name:    truck_2?.name,
    }
  })

  // Sort routes by label for stable display.
  routes.sort((a, b) => a.route_name.localeCompare(b.route_name, undefined, { numeric: true }))

  // Stops are already ordered by route_position from the SQL query; we just
  // need to assign a 1-based stop_sequence per route in arrival order.
  const sequenceByRoute = new Map<string, number>()
  const stops: Stop[] = []
  for (const s of stopRows) {
    if (!s.route_id) continue   // belt-and-braces; the query filters this
    const seq = (sequenceByRoute.get(s.route_id) ?? 0) + 1
    sequenceByRoute.set(s.route_id, seq)
    stops.push({
      stop_id:        s.id,
      route_id:       s.route_id,
      stop_sequence:  seq,
      order_id:       s.tapgoods_order_token ?? '',
      stop_type:      mapStopType(s.stop_type),
      customer_name:  s.customer_name,
      company_name:   s.company_name   ?? undefined,
      client_company: s.client_company ?? undefined,
      address_line_1: s.address ?? '',
      address_line_2: undefined,
      city:           '',
      state:          '',
      postal_code:    '',
      latitude:       s.address_lat  ?? undefined,
      longitude:      s.address_lng  ?? undefined,
      customer_phone: s.customer_phone ?? '',
      customer_cell:  s.customer_cell  ?? undefined,
      notes:          s.notes ?? undefined,
      items_text:     formatItemsText(s.items),
      items:          Array.isArray(s.items) ? (s.items as RawItem[]) : undefined,
      payment_state:  mapPaymentState(s.payment_state),
      balance_due_amount: s.balance_due_amount,
      current_status: 'pending' as StopStatus,
      on_the_way_sent:    false,
      on_the_way_sent_at: undefined,
      completed_at:       undefined,
    })
  }

  return { routes, stops }
}
