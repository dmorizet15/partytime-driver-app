import { Route, Stop, StopStatus } from '@/types'

export interface TapGoodsTruckRoute {
  id:           string
  deliveryDate: string
  truck?:       { name: string }
  drivers?:     Array<{ name: string }>
}

export interface TapGoodsTruckRelationship {
  position:     number | null
  stopType:     string
  active:       boolean
  truckRouteId: string
  truckRoute:   TapGoodsTruckRoute | null
}

export interface TapGoodsCustomer {
  id:        string
  firstName: string
  lastName:  string
}

export interface TapGoodsRental {
  id:                                  string
  name:                                string
  customerContactPhone?:               string | null
  deliveryAddressStreetAddress1?:      string | null
  deliveryAddressStreetAddress2?:      string | null
  deliveryAddressCity?:                string | null
  deliveryAddressLocale?:              string | null
  deliveryAddressPostalCode?:          string | null
  notes?:                              string | null
  customers?:                          TapGoodsCustomer[]
  rentalTransportTruckRelationships:   TapGoodsTruckRelationship[]
}

export interface GetRentalsResponse {
  getRentals: TapGoodsRental[]
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
    rental:       TapGoodsRental
    relationship: TapGoodsTruckRelationship
    truckRoute:   TapGoodsTruckRoute
  }

  const items: RentalOnRoute[] = []
  for (const rental of rentals) {
    for (const rel of rental.rentalTransportTruckRelationships) {
      if (!rel.active)     continue
      if (!rel.truckRoute) continue
      if (isoToDateStr(rel.truckRoute.deliveryDate) !== targetDate) continue
      items.push({ rental, relationship: rel, truckRoute: rel.truckRoute })
    }
  }

  if (items.length === 0) return { routes: [], stops: [] }

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

  const stops: Stop[] = []
  const routeInsertOrder = new Map<string, number>()

  for (const { rental, relationship, truckRoute } of items) {
    const routeId = truckRoute.id
    let seq: number
    if (relationship.position != null && relationship.position > 0) {
      seq = relationship.position
    } else {
      const next = (routeInsertOrder.get(routeId) ?? 0) + 1
      routeInsertOrder.set(routeId, next)
      seq = next
    }

    const primaryCustomer = rental.customers?.[0]
    const customerName = primaryCustomer
      ? `${primaryCustomer.firstName ?? ''} ${primaryCustomer.lastName ?? ''}`.trim()
      : rental.name

    stops.push({
      stop_id:        `${truckRoute.id}-${rental.id}`,
      route_id:       routeId,
      stop_sequence:  seq,
      order_id:       rental.name,
      customer_name:  customerName || rental.name,
      address_line_1: rental.deliveryAddressStreetAddress1 ?? '',
      address_line_2: rental.deliveryAddressStreetAddress2 ?? undefined,
      city:           rental.deliveryAddressCity           ?? '',
      state:          rental.deliveryAddressLocale         ?? '',
      postal_code:    rental.deliveryAddressPostalCode     ?? '',
      latitude:       undefined,
      longitude:      undefined,
      customer_phone: rental.customerContactPhone          ?? '',
      notes:          rental.notes                        ?? undefined,
      current_status:     'pending' as StopStatus,
      on_the_way_sent:    false,
      on_the_way_sent_at: undefined,
      completed_at:       undefined,
    })
  }

  const routes = Array.from(routeMap.values())
  for (const route of routes) {
    route.stop_count = stops.filter((s) => s.route_id === route.route_id).length
  }
  routes.sort((a, b) => a.route_name.localeCompare(b.route_name))

  return { routes, stops }
}
