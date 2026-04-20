// ─── TapGoods → App type transformers ────────────────────────────────────────
import { Route, Stop, StopStatus } from '@/types'

// ─── Raw TapGoods shapes ──────────────────────────────────────────────────────

export interface TapGoodsTruckRoute {
  id:           string
  deliveryDate: string   // ISO datetime, e.g. "2026-04-20T00:00:00+00:00"
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

export interface TapGoodsPhoneNumber {
  number:    string
  phoneType: string   // e.g. "cell", "mobile", "home", "work", "fax"
}

export interface TapGoodsCustomer {
  id:           string
  firstName:    string
  lastName:     string
  phoneNumbers?: TapGoodsPhoneNumber[]
}

export interface TapGoodsRental {
  id:    string
  name:  string   // human-readable rental name
  token: string   // short alphanumeric token — used in TapGoods URLs (e.g. "C9A028AE")

  customers?: TapGoodsCustomer[]

  // Flat address fields (TapGoods uses these instead of a nested address object)
  deliveryAddressStreetAddress1?: string | null
  deliveryAddressStreetAddress2?: string | null
  deliveryAddressCity?:           string | null
  deliveryAddressLocale?:         string | null  // state / province
  deliveryAddressPostalCode?:     string | null

  additionalDeliveryInfo?: string | null

  rentalTransportTruckRelationships: TapGoodsTruckRelationship[]
}

export interface GetRentalsResponse {
  getRentals: TapGoodsRental[]
}

// ─── Phone helper ─────────────────────────────────────────────────────────────

/**
 * Return the customer's cell/mobile phone number, or '' if none exists.
 * Only shows a phone number if its type contains "cell" or "mobile" (case-insensitive).
 */
function getMobilePhone(customers?: TapGoodsCustomer[]): string {
  const c = customers?.[0]
  if (!c?.phoneNumbers?.length) return ''

  const mobile = c.phoneNumbers.find((p) =>
    /cell|mobile/i.test(p.phoneType ?? '')
  )
  return mobile?.number ?? ''
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert an ISO datetime string (any timezone) to a YYYY-MM-DD string
 * using the date portion only — timezone-agnostic slice.
 */
function isoToDateStr(iso: string): string {
  // "2026-04-20T00:00:00+00:00" → "2026-04-20"
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
  //    A rental can appear on more than one truck route (e.g. delivery + pickup
  //    on different days), so we process each relationship independently.
  //    We also track insertion order here so it can serve as a stable tiebreaker
  //    when two stops share the same TapGoods position value.

  interface RentalOnRoute {
    rental:         TapGoodsRental
    relationship:   TapGoodsTruckRelationship
    truckRoute:     TapGoodsTruckRoute
    insertionIndex: number   // index within the API response — used for sort stability
  }

  const items: RentalOnRoute[] = []
  let globalIdx = 0

  for (const rental of rentals) {
    for (const rel of rental.rentalTransportTruckRelationships) {
      if (!rel.active)       continue
      if (!rel.truckRoute)   continue
      if (isoToDateStr(rel.truckRoute.deliveryDate) !== targetDate) continue

      items.push({
        rental,
        relationship:   rel,
        truckRoute:     rel.truckRoute,
        insertionIndex: globalIdx++,
      })
    }
  }

  if (items.length === 0) {
    return { routes: [], stops: [] }
  }

  // ── 2. Build Route objects — one per unique truckRouteId ─────────────────
  const routeMap = new Map<string, Route>()

  for (const { truckRoute } of items) {
    if (routeMap.has(truckRoute.id)) continue

    const driverNames = (truckRoute.drivers ?? []).map((d) => d.name).join(', ')

    routeMap.set(truckRoute.id, {
      route_id:        truckRoute.id,
      route_name:      truckRoute.truck?.name ?? `Route ${truckRoute.id}`,
      operating_date:  targetDate,
      assigned_driver: driverNames || undefined,
      stop_count:      0,   // patched below
      route_status:    'active',
    })
  }

  // ── 3. Group items by route and sort by (position, insertionIndex) ────────
  //    Sorting before building Stop objects ensures each stop gets a unique,
  //    correct 1-based stop_sequence that matches the TapGoods drag-drop order.
  //
  //    Sort rules:
  //      Primary:   position ascending (null / 0 treated as Infinity → goes last)
  //      Secondary: insertionIndex ascending (preserves API response order for ties)

  const itemsByRoute = new Map<string, RentalOnRoute[]>()

  for (const item of items) {
    const routeId = item.truckRoute.id
    const arr = itemsByRoute.get(routeId) ?? []
    arr.push(item)
    itemsByRoute.set(routeId, arr)
  }

  for (const arr of itemsByRoute.values()) {
    arr.sort((a, b) => {
      const posA = (a.relationship.position != null && a.relationship.position > 0)
        ? a.relationship.position
        : Infinity
      const posB = (b.relationship.position != null && b.relationship.position > 0)
        ? b.relationship.position
        : Infinity

      if (posA !== posB) return posA - posB
      return a.insertionIndex - b.insertionIndex
    })
  }

  // ── 4. Build Stop objects with sequential 1-based stop_sequence ──────────
  const stops: Stop[] = []

  for (const [, routeItems] of itemsByRoute) {
    routeItems.forEach((item, idx) => {
      const { rental, truckRoute } = item

      const customer = rental.customers?.[0]

      const customerName = customer
        ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
        : rental.name

      const stop: Stop = {
        stop_id:        `${truckRoute.id}-${rental.id}`,
        route_id:       truckRoute.id,
        stop_sequence:  idx + 1,   // 1-based, unique per route, API-order tiebreaker

        // token is the short alphanumeric ID used in TapGoods URLs (e.g. "C9A028AE")
        order_id:       rental.token ?? rental.name,

        customer_name:  customerName || rental.name,
        destination_name: undefined,

        address_line_1: rental.deliveryAddressStreetAddress1 ?? '',
        address_line_2: rental.deliveryAddressStreetAddress2 ?? undefined,
        city:           rental.deliveryAddressCity           ?? '',
        state:          rental.deliveryAddressLocale         ?? '',
        postal_code:    rental.deliveryAddressPostalCode     ?? '',

        latitude:  undefined,
        longitude: undefined,

        customer_phone: getMobilePhone(rental.customers),
        notes:          rental.additionalDeliveryInfo ?? undefined,

        current_status:      'pending' as StopStatus,
        on_the_way_sent:     false,
        on_the_way_sent_at:  undefined,
        completed_at:        undefined,
      }

      stops.push(stop)
    })
  }

  // ── 5. Patch stop_count on each Route ────────────────────────────────────
  const routes = Array.from(routeMap.values())
  for (const route of routes) {
    route.stop_count = stops.filter((s) => s.route_id === route.route_id).length
  }

  // ── 6. Sort routes by name for consistent display ─────────────────────────
  routes.sort((a, b) => a.route_name.localeCompare(b.route_name))

  return { routes, stops }
}
