import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const Q1 = `query { getRentals(beingDelivered: true perPage: 200) { id token name deliveryType jobType status isDraft } }`
const Q2 = `query { getRentals(perPage: 200 page: 1) { id token name deliveryType jobType status isDraft } }`
const Q3 = `query { getRentals(perPage: 200 page: 2) { id token name deliveryType jobType status isDraft } }`

export async function GET() {
  try {
    const [r1, r2, r3] = await Promise.allSettled([
      tapgoodsQuery<any>(Q1),
      tapgoodsQuery<any>(Q2),
      tapgoodsQuery<any>(Q3),
    ])

    const target = 'D9E44CE5'

    const inDelivery = r1.status === 'fulfilled'
      ? r1.value.getRentals?.find((r: any) => r.token === target) ?? 'not found'
      : { error: String(r1.reason) }

    const page1 = r2.status === 'fulfilled'
      ? r2.value.getRentals?.find((r: any) => r.token === target) ?? 'not found'
      : { error: String(r2.reason) }

    const page2 = r3.status === 'fulfilled'
      ? r3.value.getRentals?.find((r: any) => r.token === target) ?? 'not found'
      : { error: String(r3.reason) }

    // Also show all statuses/deliveryTypes found in beingDelivered results
    const deliveryTypes = r1.status === 'fulfilled'
      ? [...new Set(r1.value.getRentals?.map((r: any) => `${r.deliveryType}|${r.jobType}|${r.status}`))]
      : []

    return NextResponse.json({ target, inDelivery, page1, page2, deliveryTypesFound: deliveryTypes })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
