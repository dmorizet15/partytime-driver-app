import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'
const INTROSPECT = `query {
  rental: __type(name: "Rental") { fields { name type { name kind ofType { name } } } }
  customer: __type(name: "Customer") { fields { name } }
  truckRel: __type(name: "RentalTransportTruckRelationship") { fields { name } }
  truckRoute: __type(name: "TruckRoute") { fields { name } }
}`
export async function GET() {
  try {
    const data = await tapgoodsQuery<any>(INTROSPECT)
    return NextResponse.json({
      customerFields: data.customer?.fields?.map((f: any) => f.name).sort(),
      truckRelFields: data.truckRel?.fields?.map((f: any) => f.name).sort(),
      truckRouteFields: data.truckRoute?.fields?.map((f: any) => f.name).sort(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
