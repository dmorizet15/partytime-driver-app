// ─── /api/media/intake ───────────────────────────────────────────────────────
// Writes the companion row for a field-media capture the driver has already
// uploaded to the private `field-media-intake` bucket.
//
// WHY THE ROW IS WRITTEN HERE AND NOT CLIENT-SIDE:
// The row carries the customer, the org, the event date and the address —
// the whole point of the feature is that marketing gets footage that is
// already labelled. If the client supplied those, a compromised or buggy
// client could label a clip with any customer it liked. So the client sends
// only two things it is entitled to know (which stop, which object), and this
// route derives every tag column itself from dispatch_stops under the service
// role, behind the same crew gate the equipment-returns POST uses.
//
// `marketing_media_intake` deliberately has NO INSERT policy (migration 030):
// service role is the only writer, and this is the only route that writes.
//
// TWO SOURCES (Phase 2), one table, so marketing reads one place:
//   source 'stop'    — captured on a stop. Crew-gated, fully auto-tagged.
//   source 'generic' — the profile uploader. No stop, so no crew gate and
//                      nothing to derive; instead the driver's description is
//                      MANDATORY and the object path must key on their own uid.
//                      Every job-tag column stays null.
// `source` is optional on the wire and defaults to 'stop' — a capture queued
// before this deploy predates the field and was stop-tagged by construction.
//
// POST { source?, stop_id?, storage_path, media_type, mime_type, byte_size,
//        duration_seconds, caption, category?, consent }
//   → 200 { saved: true }
//   401 unauthenticated
//   400 bad_request / consent_required / bad_path / caption_required /
//       generic_cannot_have_stop / stop_not_found
//   403 not_crew · 500 server misconfiguration / insert failure
//
// Idempotent: storage_path is UNIQUE and a duplicate is treated as success,
// because the client uploads first and posts second — a retried post after a
// successful insert must not 500 and strand the record in the queue forever.

import { NextRequest, NextResponse }     from 'next/server'
import { cookies }                       from 'next/headers'
import { createServerClient }            from '@supabase/ssr'
import { createClient, SupabaseClient }  from '@supabase/supabase-js'
import {
  FIELD_MEDIA_BUCKET,
  GENERIC_PHOTO_PREFIX,
  GENERIC_VIDEO_PREFIX,
  PHOTO_PREFIX,
  VIDEO_PREFIX,
} from '@/lib/fieldMedia/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEADERS = { 'Cache-Control': 'private, no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

interface StopRow {
  id:             string
  route_id:       string | null
  reservation_id: string | null
  company_name:   string | null
  customer_name:  string | null
  client_company: string | null
  address:        string | null
  scheduled_date: string | null
  event_start:    string | null
  event_end:      string | null
}

// All three names are stored: company_name is the TapGoods ORDER name (what
// every driver screen renders), customer_name is the on-site CONTACT, and
// client_company is the ORG — 407 of 958 live stops carry a client_company
// whose text appears nowhere in customer_name. Never feed one alone downstream.
const STOP_COLUMNS =
  'id, route_id, reservation_id, company_name, customer_name, client_company, ' +
  'address, scheduled_date, event_start, event_end'

interface PostBody {
  source?:           string
  stop_id?:          string | null
  storage_path?:     string
  media_type?:       string
  mime_type?:        string
  byte_size?:        number
  duration_seconds?: number | null
  caption?:          string | null
  category?:         string | null
  consent?:          boolean
}

/**
 * The path must be exactly what config.fieldMediaPath() would have produced
 * for THIS stop and THIS media type. That stops a caller pointing a row at
 * somebody else's object, and keeps the marketing sweep's filename contract
 * from drifting silently.
 */
function pathMatchesStop(path: string, stopId: string, mediaType: 'photo' | 'video'): boolean {
  const prefix = mediaType === 'video' ? VIDEO_PREFIX : PHOTO_PREFIX
  const re = new RegExp(`^${prefix}/stop-${stopId}__\\d+\\.[a-z0-9]{2,5}$`)
  return re.test(path)
}

/**
 * Generic captures have no stop to key on, so the path keys on the DRIVER —
 * and it is matched against the authenticated uid, never anything the client
 * sent. A caller therefore cannot file a row against another driver's object.
 */
function pathMatchesDriver(path: string, driverId: string, mediaType: 'photo' | 'video'): boolean {
  const prefix = mediaType === 'video' ? GENERIC_VIDEO_PREFIX : GENERIC_PHOTO_PREFIX
  const re = new RegExp(`^${prefix}/generic-${driverId}__\\d+\\.[a-z0-9]{2,5}$`)
  return re.test(path)
}

export async function POST(req: NextRequest) {
  const supabase = adminClient()
  if (!supabase) {
    return NextResponse.json({ saved: false, error: 'server_misconfiguration' }, { status: 500 })
  }

  const session = getSessionClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    return NextResponse.json({ saved: false, error: 'unauthenticated' }, { status: 401, headers: HEADERS })
  }

  const body = (await req.json().catch(() => null)) as PostBody | null
  const storagePath = body?.storage_path
  const mediaType   = body?.media_type
  // Absent `source` means a Phase 1 client (or a queued capture enqueued before
  // this deploy) — those were all stop-tagged, so default rather than reject.
  const source      = body?.source ?? 'stop'

  if (!storagePath
      || (mediaType !== 'photo' && mediaType !== 'video')
      || (source !== 'stop' && source !== 'generic')) {
    return NextResponse.json({ saved: false, error: 'bad_request' }, { status: 400, headers: HEADERS })
  }

  // Consent is not advisory, on either path. A capture without it must never
  // reach marketing, and a client that forgets to send it is a bug we want to
  // see loudly.
  if (body?.consent !== true) {
    return NextResponse.json({ saved: false, error: 'consent_required' }, { status: 400, headers: HEADERS })
  }

  const caption = typeof body?.caption === 'string' && body.caption.trim().length > 0
    ? body.caption.trim().slice(0, 140)
    : null
  const duration = typeof body?.duration_seconds === 'number' && Number.isFinite(body.duration_seconds)
    ? body.duration_seconds
    : null
  const byteSize = typeof body?.byte_size === 'number' && Number.isFinite(body.byte_size)
    ? Math.max(0, Math.floor(body.byte_size))
    : null

  const profRes = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()
  const driverName = (profRes.data as { display_name?: string | null } | null)?.display_name ?? null

  // Columns every row carries regardless of where it came from.
  const common = {
    storage_bucket:    FIELD_MEDIA_BUCKET,
    storage_path:      storagePath,
    media_type:        mediaType,
    mime_type:         body?.mime_type ?? null,
    byte_size:         byteSize,
    duration_seconds:  duration,
    driver_id:         user.id,
    driver_name:       driverName,
    caption,
    consent_confirmed: true,
    consent_at:        new Date().toISOString(),
  }

  let row: Record<string, unknown>

  if (source === 'generic') {
    // ── Generic (profile uploader) ────────────────────────────────────────
    // No stop, so there is no crew gate to apply and nothing to derive. What
    // replaces it: the description is mandatory (without it marketing gets an
    // unlabelled file, the exact problem this feature exists to solve), and
    // the path must key on THIS driver's uid.
    if (!caption) {
      return NextResponse.json({ saved: false, error: 'caption_required' }, { status: 400, headers: HEADERS })
    }
    if (body?.stop_id) {
      // A generic capture claiming a stop is incoherent — the DB check would
      // reject it anyway; fail here with something readable.
      return NextResponse.json({ saved: false, error: 'generic_cannot_have_stop' }, { status: 400, headers: HEADERS })
    }
    if (!pathMatchesDriver(storagePath, user.id, mediaType)) {
      return NextResponse.json({ saved: false, error: 'bad_path' }, { status: 400, headers: HEADERS })
    }

    // Every job-tag column stays null. There is no job.
    row = {
      ...common,
      source:   'generic',
      category: typeof body?.category === 'string' && body.category.trim()
        ? body.category.trim().slice(0, 40)
        : null,
    }
  } else {
    // ── Stop-tagged (unchanged from Phase 1) ──────────────────────────────
    const stopId = body?.stop_id
    if (!stopId || !UUID_RE.test(stopId)) {
      return NextResponse.json({ saved: false, error: 'bad_request' }, { status: 400, headers: HEADERS })
    }
    if (!pathMatchesStop(storagePath, stopId, mediaType)) {
      return NextResponse.json({ saved: false, error: 'bad_path' }, { status: 400, headers: HEADERS })
    }

    const stopRes = await supabase
      .from('dispatch_stops')
      .select(STOP_COLUMNS)
      .eq('id', stopId)
      .maybeSingle()
    if (stopRes.error) {
      console.warn('[media-intake] stop query failed:', stopRes.error.message)
      return NextResponse.json({ saved: false, error: 'stop_lookup_failed' }, { status: 500, headers: HEADERS })
    }
    const stop = stopRes.data as StopRow | null
    if (!stop) {
      return NextResponse.json({ saved: false, error: 'stop_not_found' }, { status: 400, headers: HEADERS })
    }

    // Crew gate — the caller must be on this stop's route. Mirrors the
    // equipment-returns POST; service role does the write, the gate lives here.
    // Note it gates on crew membership only, never on completion: attaching
    // media to an already-completed stop is expected (see v2.11.1).
    const crewRes = await supabase
      .from('route_crew')
      .select('user_id')
      .eq('route_id', stop.route_id!)
      .eq('user_id', user.id)
      .limit(1)
    if (crewRes.error || (crewRes.data ?? []).length === 0) {
      if (crewRes.error) console.warn('[media-intake] crew gate query failed:', crewRes.error.message)
      return NextResponse.json({ saved: false, error: 'not_crew' }, { status: 403, headers: HEADERS })
    }

    row = {
      ...common,
      source:         'stop',
      category:       null,
      stop_id:        stop.id,
      route_id:       stop.route_id,
      reservation_id: stop.reservation_id,
      company_name:   stop.company_name,
      customer_name:  stop.customer_name,
      client_company: stop.client_company,
      address:        stop.address,
      scheduled_date: stop.scheduled_date,
      event_start:    stop.event_start,
      event_end:      stop.event_end,
    }
  }

  const insertRes = await supabase
    .from('marketing_media_intake')
    .upsert(row, { onConflict: 'storage_path', ignoreDuplicates: true })
  if (insertRes.error) {
    console.error('[media-intake] insert failed:', insertRes.error.message)
    return NextResponse.json({ saved: false, error: 'insert_failed' }, { status: 500, headers: HEADERS })
  }

  return NextResponse.json({ saved: true }, { status: 200, headers: HEADERS })
}
