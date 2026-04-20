import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const Q = `
  query {
    getRentals(status: ["reserved", "in_use"] deliveryType: "delivery" isDraft: false) {
      id
      name
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
    const summary = rentals.map((r: any) => ({
      id: r.id,
      name: r.name,
      relationships: r.rentalTransportTruckRelationships?.map((rel: any) => ({
        active: rel.active,
        truckRouteId: rel.truckRouteId,
        deliveryDate: rel.truckRoute?.deliveryDate ?? null,
      }))
    }))
    return NextResponse.json({ totalRentals: rentals.length, rentals: summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
