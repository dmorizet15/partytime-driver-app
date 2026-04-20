import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const TARGET = 'D9E44CE5'

async function tryQuery(label: string, query: string) {
  try {
    const result = await tapgoodsQuery<{ getRentals: Array<{ token: string; name: string; deliveryType: string; jobType: string; status: string; isDraft: boolean }> }>(query)
    const found = result.getRentals?.find((r) => r.token === TARGET)
    return { label, count: result.getRentals?.length ?? 0, found: found ?? null }
  } catch (err) {
    return { label, error: String(err) }
  }
}

export async function GET() {
  try {
    const [a, b, c, d] = await Promise.all([
      tryQuery('beingDelivered', `query { getRentals(beingDelivered: true perPage: 200) { token name deliveryType jobType status isDraft } }`),
      tryQuery('no-filter-p1',   `query { getRentals(perPage: 200 page: 1) { token name deliveryType jobType status isDraft } }`),
      tryQuery('no-filter-p2',   `query { getRentals(perPage: 200 page: 2) { token name deliveryType jobType status isDraft } }`),
      tryQuery('isDraft-true',   `query { getRentals(isDraft: true perPage: 200) { token name deliveryType jobType status isDraft } }`),
    ])
    return NextResponse.json({ target: TARGET, results: [a, b, c, d] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
