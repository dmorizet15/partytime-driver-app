import { NextResponse }  from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const FIELDS = `token name status`

async function tryArg(label: string, gql: string) {
  try {
    const data = await tapgoodsQuery<{ getRentals: any[] }>(gql)
    return { label, count: data.getRentals?.length ?? 0, tokens: data.getRentals?.map((r:any) => r.token) }
  } catch (err) {
    return { label, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const [schema, truckRoute, onTruck, scheduled] = await Promise.all([
    // Find the real root query type name
    tapgoodsQuery<any>(`query { __schema { queryType { name } } }`).catch(e => ({ schemaError: String(e) })),
    // Try filtering by truckRouteId
    tryArg('truckRouteId=91188', `query { getRentals(truckRouteId: 91188 perPage: 50) { ${FIELDS} } }`),
    // Try onTruck or hasRoute style args
    tryArg('onTruck',     `query { getRentals(onTruck: true perPage: 200) { ${FIELDS} } }`),
    tryArg('scheduledForDelivery', `query { getRentals(scheduledForDelivery: true perPage: 200) { ${FIELDS} } }`),
  ])

  return NextResponse.json({ schema, truckRoute, onTruck, scheduled })
}
