import { NextResponse }  from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const TARGET = 'D9E44CE5'
const FIELDS = `token name status`

async function tryArg(label: string, gql: string) {
  try {
    const data = await tapgoodsQuery<{ getRentals: any[] }>(gql)
    const rentals = data.getRentals ?? []
    const found   = rentals.find((r: any) => r.token === TARGET)
    return { label, count: rentals.length, found: found ?? null }
  } catch (err) {
    return { label, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const results = await Promise.all([
    tryArg('beingDelivered', `query { getRentals(beingDelivered: true perPage: 200) { ${FIELDS} } }`),
    tryArg('truckNeeded',    `query { getRentals(truckNeeded: true perPage: 200) { ${FIELDS} } }`),
    tryArg('deliveryType=delivery', `query { getRentals(deliveryType: "delivery" perPage: 200) { ${FIELDS} } }`),
    tryArg('deliveryType=service',  `query { getRentals(deliveryType: "service"  perPage: 200) { ${FIELDS} } }`),
  ])
  return NextResponse.json({ target: TARGET, results })
}
