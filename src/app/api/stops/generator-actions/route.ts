// ─── /api/stops/generator-actions ────────────────────────────────────────────
// GET ?stop_id=<pickup uuid>
//   → { references: Record<asset_id, { hourMeter, fuelLevel, skipReason, photoUrl }> }
//   The paired delivery_out capture(s) for this pickup's reservation — shown
//   for reference on the pickup-side Generator Actions card (same
//   prefill-for-context pattern as EquipmentPickupSection's prior counts).
//   Server-side + service-role: the delivery stop lives on a DIFFERENT route
//   than this pickup, so client RLS can't see it directly (the
//   /api/stops/equipment-returns, /api/stops/same-job rationale). Mints a
//   signed URL for any delivery photo here too, since storage RLS is
//   bucket-wide-authenticated (not crew-route-scoped) and a cross-route
//   client read would otherwise be unreliable to reason about.
//   Always 200 {references:{}} on no-data/unauth/error — never breaks the
//   embedding screen.

import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'generator-action-photos'
const SIGNED_URL_TTL_SECONDS = 60 * 60   // 1 hour — plenty for a single stop view

interface DeliveryReference {
  hourMeter: number | null
  fuelLevel: string | null
  skipReason: string | null
  photoUrl: string | null
}

const EMPTY = { references: {} as Record<string, DeliveryReference> }
const HEADERS = { 'Cache-Control': 'private, no-store' }

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
          } catch { /* route-handler context — cookie writes no-op */ }
        },
      },
    }
  )
}

function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(req: NextRequest) {
  const stopId = req.nextUrl.searchParams.get('stop_id')
  if (!stopId) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const supabase = adminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const stopRes = await supabase
    .from('dispatch_stops')
    .select('id, stop_type, reservation_id')
    .eq('id', stopId)
    .maybeSingle()
  if (stopRes.error) {
    console.warn('[generator-actions] stop query failed:', stopRes.error.message)
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }
  const stop = stopRes.data
  if (!stop || stop.stop_type !== 'pickup' || !stop.reservation_id) {
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const rowsRes = await supabase
    .from('stop_generator_actions')
    .select('asset_id, hour_meter, fuel_level, skip_reason, photo_path, stop:dispatch_stops!inner(reservation_id)')
    .eq('action_type', 'delivery_out')
    .eq('stop.reservation_id', stop.reservation_id)
  if (rowsRes.error) {
    console.warn('[generator-actions] delivery-reference query failed:', rowsRes.error.message)
    return NextResponse.json(EMPTY, { status: 200, headers: HEADERS })
  }

  const references: Record<string, DeliveryReference> = {}
  for (const row of rowsRes.data ?? []) {
    let photoUrl: string | null = null
    if (row.photo_path) {
      const signed = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS)
      photoUrl = signed.data?.signedUrl ?? null
    }
    references[row.asset_id] = {
      hourMeter: row.hour_meter,
      fuelLevel: row.fuel_level,
      skipReason: row.skip_reason,
      photoUrl,
    }
  }

  return NextResponse.json({ references }, { status: 200, headers: HEADERS })
}
