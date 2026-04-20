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

  let data: GetRentalsResponse
  try {
    data = await tapgoodsQuery<GetRentalsResponse>(
      GET_DELIVERY_RENTALS,
      {
        startDate: `${date}T00:00:00Z`,
        endDate:   `${date}T23:59:59Z`,
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/tapgoods/routes] error:', message)
    return NextResponse.json({ error: `TapGoods error: ${message}` }, { status: 502 })
  }

  const { routes, stops } = transformToRoutesAndStops(data.getRentals, date)
  return NextResponse.json(
    { routes, stops, date },
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' } }
  )
}
