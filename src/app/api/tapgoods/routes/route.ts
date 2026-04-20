// ─── GET /api/tapgoods/routes?date=YYYY-MM-DD ────────────────────────────────
// Server-side Next.js route handler.  API key never reaches the browser.

import { NextRequest, NextResponse } from 'next/server'
import { tapgoodsQuery }             from '@/lib/tapgoodsClient'
import { GET_DELIVERY_RENTALS }       from '@/lib/tapgoodsQueries'
import { transformToRoutesAndStops } from '@/lib/tapgoodsTransform'
import type { GetRentalsResponse }   from '@/lib/tapgoodsTransform'

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

  // ── 2. Fetch from TapGoods ────────────────────────────────────────────────
  let data: GetRentalsResponse

  try {
    data = await tapgoodsQuery<GetRentalsResponse>(
      GET_DELIVERY_RENTALS
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/tapgoods/routes] TapGoods fetch error:', message)
    return NextResponse.json(
      { error: `TapGoods error: ${message}` },
      { status: 502 }
    )
  }

  // ── 3. Transform ──────────────────────────────────────────────────────────
  const { routes, stops } = transformToRoutesAndStops(
    data.getRentals,
    date
  )

  // ── 4. Return ─────────────────────────────────────────────────────────────
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
