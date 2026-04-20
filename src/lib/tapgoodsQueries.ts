// ─── TapGoods GraphQL queries ─────────────────────────────────────────────────
// Field names confirmed via schema introspection:
//   - phoneNumbers.cell  (not .number)
//   - isDraft is NOT a selectable field
//   - beingPickedUp arg does not exist
//   - truckNeeded: true catches service stops that beingDelivered misses

const RENTAL_BODY = `
      id
      name
      token

      customers {
        id
        firstName
        lastName
        phoneNumbers {
          cell
          phoneType
        }
      }

      deliveryAddressStreetAddress1
      deliveryAddressStreetAddress2
      deliveryAddressCity
      deliveryAddressLocale
      deliveryAddressPostalCode

      additionalDeliveryInfo

      rentalTransportTruckRelationships {
        position
        stopType
        active
        truckRouteId
        truckRoute {
          id
          deliveryDate
          truck { name }
          drivers { name }
        }
      }
`

// ── Delivery stops ────────────────────────────────────────────────────────────
export const GET_DELIVERY_RENTALS = `
  query GetDeliveryRentals {
    getRentals(beingDelivered: true perPage: 200) {
      ${RENTAL_BODY}
    }
  }
`

// ── Truck-needed stops (service, setup, teardown, etc.) ───────────────────────
// truckNeeded: true is a superset of beingDelivered — it also catches service
// stops (e.g. tent setup/teardown) that have no inventory delivery.
// Must be paginated: there can be 200+ truck-needed rentals across all dates.
// The transform filters by truckRoute.deliveryDate so only today's stops survive.
export function GET_TRUCK_NEEDED_PAGE(page: number): string {
  return `
    query GetTruckNeededRentals {
      getRentals(truckNeeded: true perPage: 200 page: ${page}) {
        ${RENTAL_BODY}
      }
    }
  `
}
