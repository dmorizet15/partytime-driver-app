// ─── POST /api/ava/route-weather ─────────────────────────────────────────────
// AVA Phase 2 weather alerts. Given today's stop ids, enrich each stop with the
// forecast wind at its scheduled arrival so the home screen can flag windy
// setups and populate MorningSummary.hasWeatherFlag.
//
// Why server-side (per the Phase 2 decision): Nominatim requires a real
// User-Agent (browsers can't set one) and the geocode write-back to
// dispatch_stops is RLS-gated. Running here, the admin client owns the cache
// read + write-back, and the existing Tomorrow.io+NWS weather subsystem
// (server-side only) supplies the hourly wind.
//
// Authoritative-by-id: the route reads address / cached coords / calculated_eta
// straight from dispatch_stops, so it never trusts a client-supplied address.
//
// Per-stop failures are swallowed (geocode miss, bad ETA, weather error) → that
// stop returns { weatherAlert: false, windMph: null }. The feature degrades
// gracefully; it never fails the whole request for one bad stop.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { geocodeAddress, GEOCODE_RATE_LIMIT_MS } from '@/lib/geo/geocodeAddress'
import { getWindAtTime }             from '@/lib/weather/weather-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIND_ALERT_THRESHOLD_MPH = 20

interface EnrichedStop {
  stopId:       string
  weatherAlert: boolean
  windMph:      number | null
}

function getSessionClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Route-handler context — cookie writes silently no-op.
          }
        },
      },
    }
  )
}

function getAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function POST(request: NextRequest) {
  // ── Parse + validate body ──────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const stopIds = (body as { stopIds?: unknown })?.stopIds
  if (!Array.isArray(stopIds) || stopIds.some((id) => typeof id !== 'string')) {
    return NextResponse.json({ error: 'stopIds must be an array of strings' }, { status: 400 })
  }

  // ── Require an authenticated session (no open Nominatim/Tomorrow.io proxy) ──
  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (stopIds.length === 0) {
    return NextResponse.json(
      { stops: [], hasWeatherFlag: false },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const admin = getAdminClient()

  // ── Read the stops authoritatively (address + cached coords + ETA) ──────────
  const { data: rows, error } = await admin
    .from('dispatch_stops')
    .select('id, address, delivery_lat, delivery_lng, calculated_eta')
    .in('id', stopIds as string[])

  if (error) {
    console.error('[/api/ava/route-weather] stop read failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Enrich each stop. Sequential so we honor Nominatim's 1 req/sec limit;
  //    the delay only applies when we actually hit Nominatim (cache hits skip). ─
  const enriched: EnrichedStop[] = []
  let geocodedThisRun = 0

  for (const row of rows ?? []) {
    const result: EnrichedStop = { stopId: row.id, weatherAlert: false, windMph: null }

    try {
      // 1. Coordinates — cache-first off the row, else geocode + write back.
      let lat = row.delivery_lat as number | null
      let lng = row.delivery_lng as number | null

      if ((lat == null || lng == null) && row.address) {
        if (geocodedThisRun > 0) await sleep(GEOCODE_RATE_LIMIT_MS)
        geocodedThisRun += 1
        const coords = await geocodeAddress(row.address) // no stopId → pure geocode, no client-side DB
        if (coords) {
          lat = coords.lat
          lng = coords.lng
          // Write-back under the admin client (RLS bypass) so we never re-geocode.
          const { error: wbErr } = await admin
            .from('dispatch_stops')
            .update({ delivery_lat: lat, delivery_lng: lng })
            .eq('id', row.id)
          if (wbErr) {
            console.warn('[/api/ava/route-weather] coord write-back failed:', wbErr.message)
          }
        }
      }

      // 2. Wind at scheduled arrival. Normalize calculated_eta → UTC ISO so the
      //    hour-bucket match lines up with Tomorrow.io's UTC windHourly times.
      if (lat != null && lng != null && row.calculated_eta) {
        const utcIso = new Date(row.calculated_eta as string).toISOString()
        const windMph = await getWindAtTime(lat, lng, utcIso)
        if (windMph != null) {
          result.windMph = windMph
          result.weatherAlert = windMph >= WIND_ALERT_THRESHOLD_MPH
        }
      }
    } catch (e) {
      // Never let one stop fail the batch — leave it as no-alert / null.
      console.warn(`[/api/ava/route-weather] stop ${row.id} enrich failed:`,
        e instanceof Error ? e.message : String(e))
    }

    enriched.push(result)
  }

  const hasWeatherFlag = enriched.some((s) => s.weatherAlert)

  return NextResponse.json(
    { stops: enriched, hasWeatherFlag },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
