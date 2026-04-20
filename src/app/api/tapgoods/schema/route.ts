import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const Q1 = `query { getRentals(beingDelivered: true perPage: 200) { id name rentalTransportTruckRelationships { active truckRouteId truckRoute { id deliveryDate } } } }`
const Q2 = `query { getRentals(perPage: 200 isDraft: false) { id name rentalTransportTruckRelationships { active truckRouteId truckRoute { id deliveryDate } } } }`

export async function GET() {
  try {
    const [d1, d2] = await Promise.all([
      tapgoodsQuery<any>(Q1),
      tapgoodsQuery<any>(Q2),
    ])
    const r1 = d1.getRentals ?? []
    const r2 = d2.getRentals ?? []
    const withRoutes = (list: any[]) => list.filter((r: any) =>
      r.rentalTransportTruckRelationships?.some((rel: any) => rel.truckRouteId)
    )
    const routeDates = (list: any[]) => withRoutes(list).flatMap((r: any) =>
      r.rentalTransportTruckRelationships.map((rel: any) => ({
        rental: r.name,
        deliveryDate: rel.truckRoute?.deliveryDate
      }))
    )
    return NextResponse.json({
      beingDelivered: { total: r1.length, withTruckRoutes: withRoutes(r1).length, dates: routeDates(r1) },
      noFilter:       { total: r2.length, withTruckRoutes: withRoutes(r2).length, dates: routeDates(r2).slice(0,10) },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
