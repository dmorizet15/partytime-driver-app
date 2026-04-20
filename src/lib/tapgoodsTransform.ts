// ─── TapGoods → App type transformers ────────────────────────────────────────
import { Route, Stop, StopStatus } from '@/types'

export interface TapGoodsTruckRoute {
  id:           string
  deliveryDate: string
  truck?: { name: string }
  drivers?: Array<{ name: string }>
}

export interface TapGoodsTruckRelationship {
  position:     number | null
  stopType:     string
  active:       boolean
  truckRouteId: string
  truckRoute:   TapGoodsTruckRoute | null
}

export interface TapGoodsPhoneNumber {
  number:    string
  phoneType: string
}

export interface TapGoodsCustomer {
  id:           string
  firstName:    string
  lastName:     string
  phoneNumbers?: TapGoodsPhoneNumber[]
}

export interface TapGoodsRental {
  id:    string
  name:  string
  token: string

  customers?: TapGoodsCustomer[]

  deliveryAddressStreetAddress1?: string | null
  deliveryAddressStreetAddress2?: string | null
  deliveryAddressCity?:           string | null
  deliveryAddressLocale?:         string | null
  deliveryAddressPostalCode?:     string | null

  additionalDeliveryInfo?: string | null

  rentalTransportTruckRelationships: TapGoodsTruckRelationship[]
}

export interface GetRentalsResponse {
  getRentals: TapGoodsRental[]
}

function getMobilePhone(customers?: TapGoodsCustomer[]): string {
  const c = customers?.[0]
  if (!c?.phoneNumbers?.length) return ''
  const mobile = c.phoneNumbers.find((p) => /cell|mobile/i.test(p.phoneType ?? ''))
  return mobile?.number ?? ''
}

function isoToDateStr(iso: string): string {
  return iso.slice(0, 10)
}

export interface TransformResult {
  routes: Route[]
  stops:  Stop[]
}

export function transformToRoutesAndStops(
  rentals:    TapGoodsRental[],
  targetDate: string
): TransformResult {
  interface RentalOnRoute {
    rental:         TapGoodsRental
    relationship:   TapGoodsTruckRelationship
    truckRoute:     TapGoodsTruckRoute
    insertionIndex: number
  }

  const items: RentalOnRoute[] = []
  let globalIdx = 0

  for (const rental of rentals) {
    for (const rel of rental.rentalTransportTruckRelationships) {
      if (!rel.active)     continue
      if (!rel.truckRoute) continue
      if (isoToDateStr(rel.truckRoute.deliveryDate) !== targetDate) continue

      items.push({ rental, relationship: rel, truckRoute: rel.truckRoute, insertionIndex: globalIdx++ })
    }
  }

  if (items.length === 0) return { routes: [], stops: [] }

  // ── Build Route objects ───────────────────────────────────────────────────
  const routeMap = new Map<string, Route>()

  for (const { truckRoute } of items) {
    if (routeMap.has(truckRoute.id)) continue
    const driverNames = (truckRoute.drivers ?? []).map((d) => d.name).join(', ')
    routeMap.set(truckRoute.id, {
      route_id:        truckRoute.id,
      route_name:      truckRoute.truck?.name ?? `Route ${truckRoute.id}`,
      operating_date:  targetDate,
      assigned_driver: driverNames || undefined,
      stop_count:      0,
      route_status:    'active',
    })
  }

  // ── Group by route ────────────────────────────────────────────────────────
  const itemsByRoute = new Map<string, RentalOnRoute[]>()

  for (const item of items) {
    const routeId = item.truckRoute.id
    const arr = itemsByRoute.get(routeId) ?? []
    arr.push(item)
    itemsByRoute.set(routeId, arr)
  }

  // ── Sort each route by (position, insertionIndex) ─────────────────────────
  for (const arr of Array.from(itemsByRoute.values())) {
    arr.sort((a, b) => {
      const posA = (a.relationship.position != null && a.relationship.position > 0)
        ? a.relationship.position : Infinity
      const posB = (b.relationship.position != null && b.relationship.position > 0)
        ? b.relationship.position : Infinity
      if (posA !== posB) return posA - posB
      return a.insertionIndex - b.insertionIndex
    })
  }

  // ── Build Stop objects ────────────────────────────────────────────────────
  const stops: Stop[] = []

  for (const [, routeItems] of Array.from(itemsByRoute)) {
    routeItems.forEach((item, idx) => {
      const { rental, truckRoute } = item
      const customer = rental.customers?.[0]
      const customerName = customer
        ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
        : rental.name

      const stop: Stop = {
        stop_id:          `${truckRoute.id}-${rental.id}`,
        route_id:         truckRoute.id,
        stop_sequence:    idx + 1,
        order_id:         rental.token ?? rental.name,
        customer_name:    customerName || rental.name,
        destination_name: undefined,
        address_line_1:   rental.deliveryAddressStreetAddress1 ?? '',
        address_line_2:   rental.deliveryAddressStreetAddress2 ?? undefined,
        city:             rental.deliveryAddressCity           ?? '',
        state:            rental.deliveryAddressLocale         ?? '',
        postal_code:      rental.deliveryAddressPostalCode     ?? '',
        latitude:         undefined,
        longitude:        undefined,
        customer_phone:   getMobilePhone(rental.customers),
        notes:            rental.additionalDeliveryInfo ?? undefined,
        current_status:      'pending' as StopStatus,
        on_the_way_sent:     false,
        on_the_way_sent_at:  undefined,
        completed_at:        undefined,
      }

      stops.push(stop)
    })
  }

  // ── Patch stop_count ──────────────────────────────────────────────────────
  const routes = Array.from(routeMap.values())
  for (const route of routes) {
    route.stop_count = stops.filter((s) => s.route_id === route.route_id).length
  }

  routes.sort((a, b) => a.route_name.localeCompare(b.route_name))

  return { routes, stops }
}
