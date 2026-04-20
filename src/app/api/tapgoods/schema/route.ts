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
    tryArg('truckNeeded_p1', `query { getRentals(truckNeeded: true page: 1 perPage: 200) { ${FIELDS} } }`),
    tryArg('truckNeeded_p2', `query { getRentals(truckNeeded: true page: 2 perPage: 200) { ${FIELDS} } }`),
    tryArg('truckNeeded_p3', `query { getRentals(truckNeeded: true page: 3 perPage: 200) { ${FIELDS} } }`),
    tryArg('truckNeeded_p4', `query { getRentals(truckNeeded: true page: 4 perPage: 200) { ${FIELDS} } }`),
    // Also try status filter with reservation
    tryArg('status_reservation', `query { getRentals(status: ["reservation"] perPage: 200) { ${FIELDS} } }`),
  ])
  return NextResponse.json({ target: TARGET, results })
}
