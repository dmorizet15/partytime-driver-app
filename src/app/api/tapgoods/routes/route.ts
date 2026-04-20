// ─── GET /api/tapgoods/routes?date=YYYY-MM-DD ────────────────────────────────
// Server-side Next.js route handler.  API key never reaches the browser.

import { NextRequest, NextResponse } from 'next/server'
import { tapgoodsQuery }             from '@/lib/tapgoodsClient'
import { GET_DELIVERY_RENTALS, GET_PICKUP_RENTALS } from '@/lib/tapgoodsQueries'
import { transformToRoutesAndStops } from '@/lib/tapgoodsTransform'
import type { GetRentalsResponse, TapGoodsRental } from '@/lib/tapgoodsTransform'

// YYYY-MM-DD validator
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

  // ── 2. Fetch from TapGoods — delivery and pickup in parallel ─────────────
  //    Delivery query is required; pickup query is optional (graceful fallback
  //    in case beingPickedUp isn't a supported arg in this TapGoods account).
  let deliveryRentals: TapGoodsRental[]
  let pickupRentals:   TapGoodsRental[] = []

  try {
    const [deliveryResult, pickupResult] = await Promise.allSettled([
      tapgoodsQuery<GetRentalsResponse>(GET_DELIVERY_RENTALS),
      tapgoodsQuery<GetRentalsResponse>(GET_PICKUP_RENTALS),
    ])

    // Delivery must succeed
    if (deliveryResult.status === 'rejected') {
      throw deliveryResult.reason
    }
    deliveryRentals = deliveryResult.value.getRentals

    // Pickup is best-effort — log a warning and continue with an empty list
    if (pickupResult.status === 'fulfilled') {
      pickupRentals = pickupResult.value.getRentals
    } else {
      console.warn(
        '[/api/tapgoods/routes] Pickup query failed (non-fatal):',
        pickupResult.reason instanceof Error
          ? pickupResult.reason.message
          : String(pickupResult.reason)
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/tapgoods/routes] TapGoods fetch error:', message)
    return NextResponse.json(
      { error: `TapGoods error: ${message}` },
      { status: 502 }
    )
  }

  // ── 3. Merge and deduplicate by rental ID ─────────────────────────────────
  //    A rental could theoretically appear in both result sets if it has both
  //    a delivery and a pickup stop.  Keep the first occurrence.
  const seen        = new Set<string>()
  const allRentals: TapGoodsRental[] = []

  for (const rental of [...deliveryRentals, ...pickupRentals]) {
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
      headers: {
        // Allow intermediate caches up to 60 s; always revalidate
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      },
    }
  )
}
