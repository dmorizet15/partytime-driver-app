import { NextRequest, NextResponse } from 'next/server'
import { cookies }                   from 'next/headers'
import { createServerClient }        from '@supabase/ssr'
import { createClient }              from '@supabase/supabase-js'
import { isElevatedRole }            from '@/lib/ava/access'

// POST /api/upload-photo
// Accepts: multipart/form-data with fields: file, stop_id, route_id
// Returns: { success: true, url: "https://..." } | { success: false, error: "..." }
//
// Uploads compressed JPEG to Supabase Storage bucket `pod-photos`,
// upserts pod_photo_url onto the stops table, and returns the public URL.
// Single-photo per stop — upsert overwrites any previous photo for the same stop_id.
//
// Auth (2026-07-23): session cookie identifies the caller (user.id, can't be
// spoofed); unauthenticated → 401. The write itself runs through the service-role
// key (Storage + the RLS-less `stops` table), so ownership is enforced HERE, not
// by RLS: the stop's true route is resolved from dispatch_stops (the client's
// route_id is NOT trusted) and the caller must be a non-helper crew member on
// that route (super_admin passes defensively). This mirrors /api/complete-stop's
// helper backstop, tightened to require crew membership because there is no RLS
// backstop on a service-role write — otherwise any authenticated driver could
// overwrite any stop's POD photo. `stops.stop_id === dispatch_stops.id`
// (supabaseTransform: stop_id ← s.id).
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const file    = formData.get('file')
    const stopId  = formData.get('stop_id')
    const routeId = formData.get('route_id')

    if (!file || typeof file === 'string') {
      return NextResponse.json({ success: false, error: 'Missing file field' }, { status: 400 })
    }
    if (!stopId || typeof stopId !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing stop_id field' }, { status: 400 })
    }

    // ── Auth: identify the caller from the session cookie ────────────────────
    const session = getSessionClient()
    const { data: { user } } = await session.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('[upload-photo] Missing env vars — SUPABASE_URL present:', !!supabaseUrl, '| SUPABASE_SERVICE_KEY present:', !!supabaseKey)
      return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Ownership: resolve the stop's REAL route (never trust client route_id) ─
    const { data: stopRow, error: stopErr } = await admin
      .from('dispatch_stops')
      .select('route_id')
      .eq('id', stopId)
      .maybeSingle()
    if (stopErr) {
      console.error('[upload-photo] stop lookup failed:', stopErr.message)
      return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
    }
    if (!stopRow) {
      return NextResponse.json({ success: false, error: 'Stop not found' }, { status: 404 })
    }

    const trueRouteId = stopRow.route_id
    if (trueRouteId && typeof routeId === 'string' && routeId && routeId !== trueRouteId) {
      console.warn('[upload-photo] client route_id', routeId, 'differs from stop route', trueRouteId, '— using stop route')
    }

    // Caller must be a non-helper crew member on the stop's route. No crew row →
    // only super_admin passes (field POD photos are a driver action).
    let authorized = false
    if (trueRouteId) {
      const { data: crewRow } = await admin
        .from('route_crew')
        .select('role')
        .eq('route_id', trueRouteId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (crewRow) {
        authorized = crewRow.role !== 'helper'
      }
    }
    if (!authorized) {
      const { data: profile } = await admin
        .from('profiles')
        .select('roles')
        .eq('id', user.id)
        .maybeSingle()
      authorized = isElevatedRole(profile?.roles)
    }
    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Not authorized for this stop' }, { status: 403 })
    }

    console.log('[upload-photo] Authorized. stop_id:', stopId, '| route_id:', trueRouteId ?? 'unknown', '| user:', user.id)

    const bytes  = await (file as File).arrayBuffer()
    const buffer = Buffer.from(bytes)

    const storagePath = `${stopId}/${Date.now()}.jpg`

    console.log('[upload-photo] Uploading to storage path:', storagePath)

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/pod-photos/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buffer,
      }
    )

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[upload-photo] Storage upload error:', uploadRes.status, errText)
      return NextResponse.json({ success: false, error: errText }, { status: 500 })
    }

    console.log('[upload-photo] Storage upload success:', storagePath)

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pod-photos/${storagePath}`

    console.log('[upload-photo] Public URL generated:', publicUrl)

    const { error: dbError } = await admin
      .from('stops')
      .update({ pod_photo_url: publicUrl })
      .eq('stop_id', stopId)

    if (dbError) {
      console.error('[upload-photo] DB upsert error:', dbError.message)
      return NextResponse.json({ success: false, error: dbError.message }, { status: 500 })
    }

    console.log('[upload-photo] DB upsert success for stop:', stopId)

    console.log(`[upload-photo] Uploaded for stop ${stopId} (route: ${trueRouteId ?? 'unknown'}): ${publicUrl}`)
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (err) {
    console.error('[upload-photo] Unhandled exception:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ success: false, error: 'Upload failed — server error' }, { status: 500 })
  }
}
