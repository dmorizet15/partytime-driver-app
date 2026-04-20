// ─── GET /api/tapgoods/schema ─────────────────────────────────────────────────
// Temporary debug endpoint — hunting for rental token D9E44CE5 (SIDESWIPE missing stop).
// Delete this file once the issue is resolved.

import { NextResponse }  from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const TARGET = 'D9E44CE5'

// Only confirmed-safe fields (isDraft is NOT a selectable field on Rental)
const RENTAL_FIELDS = `
  token
  name
  status
`

async function tryQuery(label: string, gql: string): Promise<object> {
  try {
    const data = await tapgoodsQuery<{ getRentals: { token: string; name: string; status?: string }[] }>(gql)
    const rentals = data.getRentals ?? []
    const found   = rentals.find((r) => r.token === TARGET)
    return { label, count: rentals.length, found: found ?? null }
  } catch (err) {
    return { label, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const results = await Promise.all([
    tryQuery('beingDelivered', `query { getRentals(beingDelivered: true perPage: 200) { ${RENTAL_FIELDS} } }`),
    tryQuery('noFilter_p1',    `query { getRentals(perPage: 200 page: 1) { ${RENTAL_FIELDS} } }`),
    tryQuery('noFilter_p2',    `query { getRentals(perPage: 200 page: 2) { ${RENTAL_FIELDS} } }`),
    tryQuery('noFilter_p3',    `query { getRentals(perPage: 200 page: 3) { ${RENTAL_FIELDS} } }`),
    tryQuery('noFilter_p4',    `query { getRentals(perPage: 200 page: 4) { ${RENTAL_FIELDS} } }`),
  ])

  return NextResponse.json({ target: TARGET, results })
}
