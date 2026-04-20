export const GET_DELIVERY_RENTALS = `
  query GetDeliveryRentals {
    getRentals(
      beingDelivered: true
      perPage:        200
      isDraft:        false
    ) {
      id
      name
      customerContactPhone
      deliveryAddressStreetAddress1
      deliveryAddressStreetAddress2
      deliveryAddressCity
      deliveryAddressLocale
      deliveryAddressPostalCode
      additionalDeliveryInfo
      customers { id firstName lastName }
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
