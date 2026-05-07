// ─── /api/weather — server-side weather snapshot endpoint ───────────────────
// GET /api/weather?lat=42.3478&lng=-71.0466
//
// Returns the merged WeatherSnapshot from Tomorrow.io + NWS. The Tomorrow.io
// API key never leaves the server. Caching, rate-limit warnings, and
// degradation-to-stale are handled inside getWeatherSnapshot().

import { NextResponse } from 'next/server'
import { getWeatherSnapshot } from '@/lib/weather/weather-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const latRaw = searchParams.get('lat')
  const lngRaw = searchParams.get('lng')

  const lat = latRaw !== null ? Number(latRaw) : NaN
  const lng = lngRaw !== null ? Number(lngRaw) : NaN

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: 'Invalid or missing lat/lng query params' },
      { status: 400 }
    )
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: 'lat/lng out of range' },
      { status: 400 }
    )
  }

  try {
    const snapshot = await getWeatherSnapshot(lat, lng)
    return NextResponse.json(snapshot, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Weather fetch failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
