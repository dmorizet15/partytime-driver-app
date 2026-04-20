import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

// Try fetching D9E44CE5 with different filter combinations
const Q1 = `query { getRentals(beingDelivered: true perPage: 200 isDraft: false) { id token name deliveryType jobType status } }`
const Q2 = `query { getRentals(status: ["reserved"] perPage: 200 isDraft: false) { id token name deliveryType jobType status rentalTransportTruckRelationships { active truckRouteId truckRoute { id deliveryDate truck { name } } } } }`
const Q3 = `query { getRentals(deliveryType: "service" perPage: 200 isDraft: false) { id token name deliveryType jobType status } }`

export async function GET() {
  try {
    const [r1, r2, r3] = await Promise.allSettled([
      tapgoodsQuery<any>(Q1),
      tapgoodsQuery<any>(Q2),
      tapgoodsQuery<any>(Q3),
    ])

    const target = 'D9E44CE5'

    const inDelivery = r1.status === 'fulfilled'
      ? r1.value.getRentals?.find((r: any) => r.token === target) ?? null
      : { error: String(r1.reason) }

    const inReserved = r2.status === 'fulfilled'
      ? r2.value.getRentals?.find((r: any) => r.token === target) ?? null
      : { error: String(r2.reason) }

    const inService = r3.status === 'fulfilled'
      ? r3.value.getRentals?.find((r: any) => r.token === target) ?? null
      : { error: String(r3.reason) }

    return NextResponse.json({ target, inDelivery, inReserved, inService })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
