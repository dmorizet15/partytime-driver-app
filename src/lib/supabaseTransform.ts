import type { PaymentState, Route, Stop, StopStatus } from '@/types'

// ─── Row shapes returned by the Supabase queries ─────────────────────────────
export interface SupabaseTruckRow {
  id:   string
  name: string
}

// Mirrors the dashboard's BreakBlock shape (partytime-dashboard/src/types/board.ts).
// Stored as JSONB in routes.break_blocks. Warehouse blocks surface in the driver
// list as synthetic depot-return stops; pure 'break' blocks are ignored — they
// aren't destinations, just time padding for the dispatcher's ETA cascade.
export interface BreakBlock {
  id:               string
  type?:            'break' | 'warehouse'
  afterStopIndex:   number
  duration_minutes: number
}

export interface SupabaseRouteRow {
  id:           string
  route_date:   string
  label:        string
  truck_id:     string | null
  truck_id_2:   string | null
  break_blocks: BreakBlock[] | null
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
  calculated_eta:        string | null
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

// ─── Stop builders ───────────────────────────────────────────────────────────
// Extracted for clarity now that the transform interleaves real stops with
// synthetic warehouse stops (Path A). routeId is passed explicitly so callers
// don't need to retype-narrow s.route_id at the call site.
function toRealStop(s: SupabaseStopRow, routeId: string, seq: number): Stop {
  return {
    stop_id:        s.id,
    route_id:       routeId,
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
    calculated_eta: s.calculated_eta,
    current_status: 'pending' as StopStatus,
    on_the_way_sent:    false,
    on_the_way_sent_at: undefined,
    completed_at:       undefined,
  }
}

// Synthesize a Stop for a warehouse break block (Path A). The driver list
// renders these as depot-return stops; SMS/COD/POD are skipped per spec, and
// completion is local-only with no button (Decision 1A). Address falls back
// to the depot since BreakBlock carries no location data.
const DEPOT_ADDRESS_LINE_1 = '2575 Route 55, Poughquag, NY 12570'
const DEPOT_CITY           = 'Poughquag'
const DEPOT_STATE          = 'NY'
const DEPOT_POSTAL         = '12570'

function buildWarehouseStop(block: BreakBlock, routeId: string, seq: number): Stop {
  return {
    stop_id:        block.id,
    route_id:       routeId,
    stop_sequence:  seq,
    order_id:       '',
    // The Stop union is extended to include 'warehouse' in the next file
    // (src/types/index.ts). Until that lands, double-cast through unknown
    // so this file builds standalone.
    stop_type:      'warehouse' as unknown as Stop['stop_type'],
    customer_name:  'Return to Depot',
    company_name:   undefined,
    client_company: undefined,
    address_line_1: DEPOT_ADDRESS_LINE_1,
    address_line_2: undefined,
    city:           DEPOT_CITY,
    state:          DEPOT_STATE,
    postal_code:    DEPOT_POSTAL,
    latitude:       undefined,
    longitude:      undefined,
    customer_phone: '',
    customer_cell:  undefined,
    notes:          undefined,
    items_text:     undefined,
    items:          undefined,
    payment_state:  undefined,
    balance_due_amount: null,
    calculated_eta: null,
    current_status: 'pending' as StopStatus,
    on_the_way_sent:    false,
    on_the_way_sent_at: undefined,
    completed_at:       undefined,
  }
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

  // Count stops per route once, instead of N filter passes. Warehouse blocks
  // (synthesized as stops below) are folded into the count so the route hero's
  // "N stops" matches what the route list actually shows.
  const stopCountByRoute = new Map<string, number>()
  for (const s of stopRows) {
    if (!s.route_id) continue
    stopCountByRoute.set(s.route_id, (stopCountByRoute.get(s.route_id) ?? 0) + 1)
  }
  for (const r of routeRows) {
    const wbCount = (r.break_blocks ?? []).filter((b) => b.type === 'warehouse').length
    if (wbCount > 0) {
      stopCountByRoute.set(r.id, (stopCountByRoute.get(r.id) ?? 0) + wbCount)
    }
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

  // Group dispatch_stops by route_id, preserving the SQL .order('route_position')
  // arrival order. Then walk routes in their own order, interleaving warehouse
  // blocks (Path A) at their afterStopIndex slot and re-sequencing 1..N over
  // the merged list. Mirrors the dashboard print view's interleave logic
  // (partytime-dashboard/src/app/print/route/[routeId]/page.tsx).
  const stopsByRoute = new Map<string, SupabaseStopRow[]>()
  for (const s of stopRows) {
    if (!s.route_id) continue   // belt-and-braces; the query filters this
    const list = stopsByRoute.get(s.route_id) ?? []
    list.push(s)
    stopsByRoute.set(s.route_id, list)
  }

  const stops: Stop[] = []
  for (const r of routeRows) {
    const realStops = stopsByRoute.get(r.id) ?? []
    const wbs       = (r.break_blocks ?? []).filter((b) => b.type === 'warehouse')

    let seq = 0
    for (let i = 0; i < realStops.length; i++) {
      seq += 1
      stops.push(toRealStop(realStops[i], r.id, seq))
      for (const wb of wbs.filter((b) => b.afterStopIndex === i)) {
        seq += 1
        stops.push(buildWarehouseStop(wb, r.id, seq))
      }
    }
    // Tail blocks — the common case; warehouse default afterStopIndex equals
    // route.stops.length, placing the depot return at end-of-route.
    for (const wb of wbs.filter((b) => b.afterStopIndex >= realStops.length)) {
      seq += 1
      stops.push(buildWarehouseStop(wb, r.id, seq))
    }
  }

  return { routes, stops }
}
