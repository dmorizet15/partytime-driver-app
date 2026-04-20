// ─── TapGoods GraphQL queries ─────────────────────────────────────────────────

// Arguments passed directly (no `input:` wrapper).
// getRentals returns Rental[] directly — no nested { rentals, pagination }.

// ── Delivery stops ────────────────────────────────────────────────────────────
// Fetches rentals that have an active delivery truck-route relationship.
export const GET_DELIVERY_RENTALS = `
  query GetDeliveryRentals {
    getRentals(
      beingDelivered: true
      perPage:        200
      isDraft:        false
    ) {
      id
      name
      token

      customers {
        id
        firstName
        lastName
        phoneNumbers {
          number
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
          truck {
            name
          }
          drivers {
            name
          }
        }
      }
    }
  }
`

// ── Pickup stops ──────────────────────────────────────────────────────────────
// Fetches rentals that have an active pickup truck-route relationship
// (e.g. retrieving equipment from a customer after an event).
// Uses the same field selection as GET_DELIVERY_RENTALS so the two result sets
// can be safely merged and deduped before passing to the transform.
export const GET_PICKUP_RENTALS = `
  query GetPickupRentals {
    getRentals(
      beingPickedUp: true
      perPage:       200
      isDraft:       false
    ) {
      id
      name
      token

      customers {
        id
        firstName
        lastName
        phoneNumbers {
          number
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
          truck {
            name
          }
          drivers {
            name
          }
        }
      }
    }
  }
`
