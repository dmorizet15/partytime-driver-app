export const GET_DELIVERY_RENTALS = `
  query GetDeliveryRentals($startDate: ISO8601DateTime, $endDate: ISO8601DateTime) {
    getRentals(
      beingDelivered: true
      startDate:      $startDate
      endDate:        $endDate
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
