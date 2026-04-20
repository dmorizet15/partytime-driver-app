export const GET_DELIVERY_RENTALS = `
  query GetDeliveryRentals {
    getRentals(
      status:       ["reserved", "in_use"]
      deliveryType: "delivery"
      isDraft:      false
    ) {
      id
      rentalNumber
      contact { id firstName lastName phone email }
      deliveryAddress { address address2 city state zip lat lng }
      deliveryNotes
      rentalTransportTruckRelationships {
        position stopType active truckRouteId
        truckRoute {
          id deliveryDate
          truck { name }
          drivers { name }
        }
      }
    }
  }
`
