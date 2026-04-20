import { NextResponse }  from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const TARGET = 'D9E44CE5'

const RENTAL_FIELDS = `
  token name status
  rentalTransportTruckRelationships {
    stopType active truckRouteId
    truckRoute { id deliveryDate truck { name } }
  }
`

export async function GET() {
  try {
    const data = await tapgoodsQuery<{ getRentals: any[] }>(
      `query { getRentals(perPage: 200 page: 3) { ${RENTAL_FIELDS} } }`
    )
    const found = (data.getRentals ?? []).find((r: any) => r.token === TARGET)
    return NextResponse.json({ target: TARGET, rental: found ?? null })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) })
  }
}
