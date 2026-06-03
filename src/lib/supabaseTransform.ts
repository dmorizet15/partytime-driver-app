import type { PaymentState, Route, Stop, StopStatus } from '@/types'
import type {
  ConstraintTier,
  DispatcherTimeOverride,
  NotesClassification,
} from './stopConstraints'
import { buildEquipmentSummary } from './equipmentSummary'

// ─── Row shapes returned by the Supabase queries ─────────────────────────────
export interface SupabaseTruckRow {
  id:    string
  name:  string
  plate: string | null
  // Primary truck only — the inspection flow needs to branch on the truck's
  // DVIR requirement and surface OOS hard-blocks. truck_2 doesn't need these
  // fields (driver app is single-truck per login per the May 8 home rewrite).
  dvir_requirement?:      'always' | 'when_towing' | 'never' | null
  current_defect_status?: 'ok' | 'non_oos_defect' | 'oos_defect' | null
}

// Mirrors the dashboard's BreakBlock shape (partytime-dashboard/src/types/board.ts).
// Stored as JSONB in routes.break_blocks. Warehouse blocks surface in the driver
// list as synthetic depot-return stops; pure 'break' blocks are ignored — they
// aren't destinations, just time padding for the dispatcher's ETA cascade.
// `calculated_eta` is written back into the JSONB by the dashboard cascade
// (writeWarehouseETAs); we read it here to populate the warehouse stop's ETA.
export interface BreakBlock {
  id:               string
  type?:            'break' | 'warehouse'
  afterStopIndex:   number
  duration_minutes: number
  calculated_eta?:  string | null
}

export interface SupabaseRouteRow {
  id:               string
  route_date:       string
  label:            string
  truck_id:         string | null
  truck_id_2:       string | null
  break_blocks:     BreakBlock[] | null
  dispatcher_notes: string | null
  warehouse_notes:  string | null
  truck:            SupabaseTruckRow | SupabaseTruckRow[] | null
  truck_2:          SupabaseTruckRow | SupabaseTruckRow[] | null
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
  dispatcher_notes:      string | null
  warehouse_notes:       string | null
  stop_type:             string
  payment_state:         string | null
  balance_due_amount:    number | null
  calculated_eta:        string | null
  stop_status:           string | null
  completed_at:          string | null
  arrived_at:            string | null
  tapgoods_order_token:  string | null
  // Time-window constraint columns (Phase 1/2 of the dashboard rollout —
  // driver app reads only, never writes). `constraint_confidence` is set
  // by the dashboard's Migration 058 trigger; the window bounds come from
  // TapGoods structured schedule, the dispatcher's manual override, or
  // the LLM notes classifier per the source-priority tree.
  constraint_confidence:           string | null
  has_any_constraint:              boolean | null
  delivery_window_start:           string | null
  delivery_window_end:             string | null
  pickup_window_start:             string | null
  pickup_window_end:               string | null
  event_start:                     string | null
  event_end:                       string | null
  notes_classification:            unknown | null
  notes_additional_delivery:       string | null
  notes_employee_authored:         string | null
  notes_flip:                      string | null
  notes_set_by_time:               string | null
  notes_strike_time:               string | null
  dispatcher_time_override:        unknown | null
  dispatcher_constraint_dismissed: boolean | null
}

// Local alias — the items[] row shape coming back from dispatch_stops.
type RawItem = { category?: string | null; name?: string | null; qty?: number | null }

// ─── Helpers ─────────────────────────────────────────────────────────────────
// PostgREST embedded relationships can come back as either an object or a
// single-element array depending on FK shape — normalize to one accessor.
function firstRel(rel: SupabaseTruckRow | SupabaseTruckRow[] | null): SupabaseTruckRow | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

function mapStopType(raw: string): Stop['stop_type'] {
  const v = raw?.toLowerCase()
  if (v === 'pickup')           return 'pickup'
  if (v === 'service')          return 'service'
  if (v === 'warehouse_return') return 'warehouse_return'
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
  const mappedType = mapStopType(s.stop_type)
  const isDepotReturn = mappedType === 'warehouse_return'
  // For warehouse_return rows (Migration 071), the dashboard writes the
  // depot address text but leaves lat/lng NULL pending geocode-pipeline
  // backfill. Inject the depot constants here so the driver-app geofence
  // can fire on day 1 regardless of backfill state.
  const lat = isDepotReturn ? DEPOT_LAT : (s.address_lat ?? undefined)
  const lng = isDepotReturn ? DEPOT_LNG : (s.address_lng ?? undefined)
  return {
    stop_id:        s.id,
    route_id:       routeId,
    stop_sequence:  seq,
    order_id:       s.tapgoods_order_token ?? '',
    stop_type:      mappedType,
    customer_name:  s.customer_name,
    company_name:   s.company_name   ?? undefined,
    client_company: s.client_company ?? undefined,
    address_line_1: s.address ?? '',
    address_line_2: undefined,
    city:           '',
    state:          '',
    postal_code:    '',
    latitude:       lat,
    longitude:      lng,
    customer_phone: s.customer_phone ?? '',
    customer_cell:  s.customer_cell  ?? undefined,
    notes:          s.notes ?? undefined,
    dispatcher_notes: s.dispatcher_notes?.trim() ? s.dispatcher_notes : undefined,
    warehouse_notes:  s.warehouse_notes?.trim() ? s.warehouse_notes : undefined,
    equipment:      buildEquipmentSummary(s.items),
    items:          Array.isArray(s.items) ? (s.items as RawItem[]) : undefined,
    payment_state:  mapPaymentState(s.payment_state),
    balance_due_amount: s.balance_due_amount,
    calculated_eta: s.calculated_eta,
    current_status: s.stop_status === 'completed'
      ? ('completed' as StopStatus)
      : ('pending'   as StopStatus),
    on_the_way_sent:    false,
    on_the_way_sent_at: undefined,
    completed_at:       s.completed_at ?? undefined,
    arrived_at:         s.arrived_at ?? undefined,
    constraint_confidence:           narrowTier(s.constraint_confidence),
    has_any_constraint:              s.has_any_constraint ?? false,
    delivery_window_start:           s.delivery_window_start,
    delivery_window_end:             s.delivery_window_end,
    pickup_window_start:             s.pickup_window_start,
    pickup_window_end:               s.pickup_window_end,
    event_start:                     s.event_start,
    event_end:                       s.event_end,
    notes_classification:            s.notes_classification as NotesClassification | null,
    notes_additional_delivery:       s.notes_additional_delivery?.trim() ? s.notes_additional_delivery : undefined,
    notes_employee_authored:         s.notes_employee_authored?.trim()   ? s.notes_employee_authored   : undefined,
    notes_flip:                      s.notes_flip?.trim()                ? s.notes_flip                : undefined,
    notes_set_by_time:               s.notes_set_by_time?.trim()         ? s.notes_set_by_time         : undefined,
    notes_strike_time:               s.notes_strike_time?.trim()         ? s.notes_strike_time         : undefined,
    dispatcher_time_override:        s.dispatcher_time_override as DispatcherTimeOverride | null,
    dispatcher_constraint_dismissed: s.dispatcher_constraint_dismissed ?? false,
  }
}

function narrowTier(raw: string | null): ConstraintTier | null {
  if (raw === 'verified' || raw === 'inferred' || raw === 'suggested' || raw === 'manual') return raw
  return null
}

// Synthesize a Stop for a warehouse break block (Path A). The driver list
// renders these as depot-return stops; SMS/COD/POD are skipped per spec, and
// completion is local-only with no button (Decision 1A). Address falls back
// to the depot since BreakBlock carries no location data.
const DEPOT_ADDRESS_LINE_1 = '2575 Route 55, Poughquag, NY 12570'
const DEPOT_CITY           = 'Poughquag'
const DEPOT_STATE          = 'NY'
const DEPOT_POSTAL         = '12570'
// Depot geofence target — mirrors the dashboard's WAREHOUSE_LAT/WAREHOUSE_LNG
// env-or-geocode lookup (src/lib/warehouseLocation.ts). Hardcoded here as an
// operational constant so the driver-app geofence works on day 1 even before
// the dashboard's geocode pipeline backfills lat/lng onto the warehouse_return
// dispatch_stops row (Migration 071 inserts with NULL coords by design). The
// 150m radius gives the geofence plenty of margin against rough coords.
const DEPOT_LAT = 41.6225
const DEPOT_LNG = -73.6816

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
    customer_name:  'Return to Warehouse',
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
    equipment:      { tier1: [], tier2: [] },
    items:          undefined,
    payment_state:  undefined,
    balance_due_amount: null,
    // Cascade-computed arrival ETA written by the dashboard into break_blocks
    // JSONB (writeWarehouseETAs). Null when the dispatcher hasn't set a
    // route_start_time yet — driver app shows dashes, which is correct.
    calculated_eta: block.calculated_eta ?? null,
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
      truck_id:                    truck?.id,
      truck_name:                  truck?.name,
      truck_plate:                 truck?.plate ?? undefined,
      truck_dvir_requirement:      truck?.dvir_requirement      ?? undefined,
      truck_current_defect_status: truck?.current_defect_status ?? undefined,
      truck_2_name:                truck_2?.name,
      dispatcher_notes:            r.dispatcher_notes?.trim() ? r.dispatcher_notes : undefined,
      warehouse_notes:             r.warehouse_notes?.trim() ? r.warehouse_notes : undefined,
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
