import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const Q = `
  query {
    getRentals {
      id
      name
      status
      deliveryType
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
    const summary = rentals.slice(0, 10).map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      deliveryType: r.deliveryType,
      truckRoutes: r.rentalTransportTruckRelationships?.map((rel: any) => ({
        active: rel.active,
        deliveryDate: rel.truckRoute?.deliveryDate ?? null,
      }))
    }))
    return NextResponse.json({ totalRentals: rentals.length, sample: summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
