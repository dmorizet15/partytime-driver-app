// ─── GET /api/tapgoods/routes?date=YYYY-MM-DD ────────────────────────────────
// Server-side Next.js route handler.  API key never reaches the browser.

import { NextRequest, NextResponse } from 'next/server'
import { tapgoodsQuery }             from '@/lib/tapgoodsClient'
import { GET_DELIVERY_RENTALS, GET_TRUCK_NEEDED_PAGE } from '@/lib/tapgoodsQueries'
import { transformToRoutesAndStops } from '@/lib/tapgoodsTransform'
import type { GetRentalsResponse, TapGoodsRental } from '@/lib/tapgoodsTransform'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  // ── 1. Validate query param ───────────────────────────────────────────────
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json(
      { error: 'Missing or invalid "date" param — expected YYYY-MM-DD' },
      { status: 400 }
    )
  }

  // ── 2. Fetch from TapGoods — all queries in parallel ─────────────────────
  //    beingDelivered: catches standard delivery stops
  //    truckNeeded pages 1-4: catches service stops (tent setup/teardown, etc.)
  //      that beingDelivered misses.  Pages 1-4 = up to 800 records.
  //    The transform filters by truckRoute.deliveryDate so off-date records
  //    are discarded automatically.
  const settled = await Promise.allSettled([
    tapgoodsQuery<GetRentalsResponse>(GET_DELIVERY_RENTALS),
    tapgoodsQuery<GetRentalsResponse>(GET_TRUCK_NEEDED_PAGE(1)),
    tapgoodsQuery<GetRentalsResponse>(GET_TRUCK_NEEDED_PAGE(2)),
    tapgoodsQuery<GetRentalsResponse>(GET_TRUCK_NEEDED_PAGE(3)),
    tapgoodsQuery<GetRentalsResponse>(GET_TRUCK_NEEDED_PAGE(4)),
  ])

  const raw: TapGoodsRental[] = []
  let anySuccess = false

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      anySuccess = true
      raw.push(...result.value.getRentals)
    } else {
      console.warn(
        '[/api/tapgoods/routes] A query failed (non-fatal):',
        result.reason instanceof Error ? result.reason.message : String(result.reason)
      )
    }
  }

  if (!anySuccess) {
    return NextResponse.json({ error: 'All TapGoods queries failed' }, { status: 502 })
  }

  // ── 3. Deduplicate by rental ID ───────────────────────────────────────────
  const seen        = new Set<string>()
  const allRentals: TapGoodsRental[] = []
  for (const rental of raw) {
    if (!seen.has(rental.id)) {
      seen.add(rental.id)
      allRentals.push(rental)
    }
  }

  // ── 4. Transform ──────────────────────────────────────────────────────────
  const { routes, stops } = transformToRoutesAndStops(allRentals, date)

  // ── 5. Return ─────────────────────────────────────────────────────────────
  return NextResponse.json(
    { routes, stops, date },
    {
      status:  200,
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=30' },
    }
  )
}
