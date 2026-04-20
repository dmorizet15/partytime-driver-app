// ─── TapGoods → App type transformers ────────────────────────────────────────
import { Route, Stop, StopStatus } from '@/types'

// ─── Raw TapGoods shapes ──────────────────────────────────────────────────────

export interface TapGoodsTruckRoute {
  id:           string
  deliveryDate: string   // ISO datetime, e.g. "2026-04-20T00:00:00.000Z"
  truck?: {
    name: string
  }
  drivers?: Array<{
    name: string
  }>
}

export interface TapGoodsTruckRelationship {
  position:     number | null
  stopType:     string        // "delivery" | "pickup" | "service"
  active:       boolean
  truckRouteId: string
  truckRoute:   TapGoodsTruckRoute | null
}

export interface TapGoodsContact {
  id:         string
  firstName:  string
  lastName:   string
  phone?:     string
  email?:     string
}

export interface TapGoodsAddress {
  address?:  string
  address2?: string
  city?:     string
  state?:    string
  zip?:      string
  lat?:      number | null
  lng?:      number | null
}

export interface TapGoodsRental {
  id:           string
  rentalNumber: string
  contact?:     TapGoodsContact | null
  deliveryAddress?: TapGoodsAddress | null
  deliveryNotes?: string | null
  rentalTransportTruckRelationships: TapGoodsTruckRelationship[]
}

export interface GetRentalsResponse {
  getRentals: TapGoodsRental[]
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert an ISO datetime string (any timezone) to a YYYY-MM-DD string
 * using the date portion only — timezone-agnostic slice.
 */
function isoToDateStr(iso: string): string {
  // "2026-04-20T00:00:00.000Z" → "2026-04-20"
  return iso.slice(0, 10)
}

// ─── Main transform ───────────────────────────────────────────────────────────

export interface TransformResult {
  routes: Route[]
  stops:  Stop[]
}

export function transformToRoutesAndStops(
  rentals:    TapGoodsRental[],
  targetDate: string   // YYYY-MM-DD
): TransformResult {
  // ── 1. Collect every active truck-route relationship for the target date ──
  //    A rental can theoretically be on more than one truck route, so we
  //    process each relationship independently.

  interface RentalOnRoute {
    rental:       TapGoodsRental
    relationship: TapGoodsTruckRelationship
    truckRoute:   TapGoodsTruckRoute
  }

  const items: RentalOnRoute[] = []

  for (const rental of rentals) {
    for (const rel of rental.rentalTransportTruckRelationships) {
      if (!rel.active)       continue
      if (!rel.truckRoute)   continue
      if (isoToDateStr(rel.truckRoute.deliveryDate) !== targetDate) continue

      items.push({ rental, relationship: rel, truckRoute: rel.truckRoute })
    }
  }

  if (items.length === 0) {
    return { routes: [], stops: [] }
  }

  // ── 2. Build Route objects — one per unique truckRouteId ─────────────────
  const routeMap = new Map<string, Route>()

  for (const { truckRoute, relationship } of items) {
    if (routeMap.has(truckRoute.id)) continue

    const driverNames = (truckRoute.drivers ?? []).map((d) => d.name).join(', ')

    routeMap.set(truckRoute.id, {
      route_id:        truckRoute.id,
      route_name:      truckRoute.truck?.name ?? `Route ${truckRoute.id}`,
      operating_date:  targetDate,
      assigned_driver: driverNames || undefined,
      stop_count:      0,   // will be updated below
      route_status:    'active',
    })
  }

  // ── 3. Build Stop objects ─────────────────────────────────────────────────
  const stops: Stop[] = []

  // Stable position fallback: track insertion order per route
  const routeInsertOrder = new Map<string, number>()

  for (const { rental, relationship, truckRoute } of items) {
    const routeId = truckRoute.id

    // Resolve position: use API value if present, otherwise auto-increment
    let seq: number
    if (relationship.position != null && relationship.position > 0) {
      seq = relationship.position
    } else {
      const next = (routeInsertOrder.get(routeId) ?? 0) + 1
      routeInsertOrder.set(routeId, next)
      seq = next
    }

    const addr    = rental.deliveryAddress ?? {}
    const contact = rental.contact

    const customerName = contact
      ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
      : rental.rentalNumber

    const stop: Stop = {
      stop_id:        `${truckRoute.id}-${rental.id}`,
      route_id:       routeId,
      stop_sequence:  seq,
      order_id:       rental.rentalNumber,

      customer_name:  customerName || rental.rentalNumber,
      destination_name: undefined,

      address_line_1: addr.address  ?? '',
      address_line_2: addr.address2 ?? undefined,
      city:           addr.city     ?? '',
      state:          addr.state    ?? '',
      postal_code:    addr.zip      ?? '',

      latitude:       addr.lat  ?? undefined,
      longitude:      addr.lng  ?? undefined,

      customer_phone: contact?.phone ?? '',
      notes:          rental.deliveryNotes ?? undefined,

      current_status:      'pending' as StopStatus,
      on_the_way_sent:     false,
      on_the_way_sent_at:  undefined,
      completed_at:        undefined,
    }

    stops.push(stop)
  }

  // ── 4. Patch stop_count on each Route ────────────────────────────────────
  const routes = Array.from(routeMap.values())
  for (const route of routes) {
    route.stop_count = stops.filter((s) => s.route_id === route.route_id).length
  }

  // ── 5. Sort routes by name for consistent display ─────────────────────────
  routes.sort((a, b) => a.route_name.localeCompare(b.route_name))

  return { routes, stops }
}
