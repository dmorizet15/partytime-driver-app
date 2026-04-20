import { NextResponse } from 'next/server'
import { tapgoodsQuery } from '@/lib/tapgoodsClient'

const INTROSPECT = `
  query {
    relType: __type(name: "RentalTransportTruckRelationship") {
      fields { name type { name kind ofType { name kind } } }
    }
    truckRouteType: __type(name: "TruckRoute") {
      fields { name type { name kind ofType { name kind } } }
    }
  }
`

const RAW_DATA = `
  query {
    getRentals(beingDelivered: true perPage: 200 isDraft: false) {
      id token name
      rentalTransportTruckRelationships {
        position stopType active truckRouteId
        truckRoute { id deliveryDate truck { name } }
      }
    }
  }
`

const PICKUP_DATA = `
  query {
    getRentals(beingPickedUp: true perPage: 200 isDraft: false) {
      id token name
      rentalTransportTruckRelationships {
        position stopType active truckRouteId
        truckRoute { id deliveryDate truck { name } }
      }
    }
  }
`

export async function GET() {
  try {
    const [schema, delivery, pickup] = await Promise.all([
      tapgoodsQuery<any>(INTROSPECT),
      tapgoodsQuery<any>(RAW_DATA),
      tapgoodsQuery<any>(PICKUP_DATA).catch((e: unknown) => ({ error: String(e) })),
    ])

    const deliveryStops = (delivery.getRentals ?? []).flatMap((r: any) =>
      r.rentalTransportTruckRelationships
        .filter((rel: any) => rel.active && rel.truckRoute)
        .map((rel: any) => ({
          source: 'delivery',
          rentalToken: r.token,
          rentalName: r.name,
          position: rel.position,
          stopType: rel.stopType,
          truckName: rel.truckRoute?.truck?.name,
          deliveryDate: rel.truckRoute?.deliveryDate?.slice(0, 10),
        }))
    )

    const pickupStops = Array.isArray((pickup as any).getRentals)
      ? (pickup as any).getRentals.flatMap((r: any) =>
          r.rentalTransportTruckRelationships
            .filter((rel: any) => rel.active && rel.truckRoute)
            .map((rel: any) => ({
              source: 'pickup',
              rentalToken: r.token,
              rentalName: r.name,
              position: rel.position,
              stopType: rel.stopType,
              truckName: rel.truckRoute?.truck?.name,
              deliveryDate: rel.truckRoute?.deliveryDate?.slice(0, 10),
            }))
        )
      : { pickupQueryError: (pickup as any).error }

    return NextResponse.json({
      RentalTransportTruckRelationship: schema.relType?.fields?.map((f: any) => f.name).sort() ?? [],
      TruckRoute: schema.truckRouteType?.fields?.map((f: any) => f.name).sort() ?? [],
      stops: { delivery: deliveryStops, pickup: pickupStops },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
