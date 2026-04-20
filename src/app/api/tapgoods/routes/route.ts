import { NextRequest, NextResponse }  from 'next/server'
import { tapgoodsQuery }              from '@/lib/tapgoodsClient'
import { GET_DELIVERY_RENTALS }       from '@/lib/tapgoodsQueries'
import { transformToRoutesAndStops }  from '@/lib/tapgoodsTransform'
import type { GetRentalsResponse }    from '@/lib/tapgoodsTransform'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: 'Missing or invalid "date" param — expected YYYY-MM-DD' },
      { status: 400 }
    )
  }
  try {
    const data = await tapgoodsQuery<GetRentalsResponse>(GET_DELIVERY_RENTALS)
    const { routes, stops } = transformToRoutesAndStops(data.getRentals, date)
    return NextResponse.json({ routes, stops, date })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `TapGoods error: ${message}` }, { status: 502 })
  }
}
