import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const Q = `
  query {
    getRentals(
      deliveryType: ["custom_delivery", "default_delivery"]
      isDraft: false
      perPage: 100
    ) {
      id name status deliveryType
      rentalTransportTruckRelationships {
        active truckRouteId
        truckRoute { id deliveryDate }
      }
    }
  }
`
export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(Q)
    const rentals = data.getRentals ?? []
    const statuses = [...new Set(rentals.map((r: any) => r.status))]
    const withRoutes = rentals.filter((r: any) =>
      r.rentalTransportTruckRelationships?.some((rel: any) => rel.truckRouteId)
    )
    return NextResponse.json({
      totalRentals: rentals.length,
      uniqueStatuses: statuses,
      rentalsWithTruckRoutes: withRoutes.length,
      truckRouteSamples: withRoutes.slice(0, 10).map((r: any) => ({
        name: r.name,
        status: r.status,
        deliveryDate: r.rentalTransportTruckRelationships?.[0]?.truckRoute?.deliveryDate
      }))
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
