// ─── Field media — shared configuration ──────────────────────────────────────
// One file owns the bucket name, the caps and the path convention so the
// sheet, the queue, the uploader and the API route can never disagree.

export const FIELD_MEDIA_BUCKET = 'field-media-intake'

// Prefixes deliberately mirror the PUBLIC marketing pipeline's
// (`social/intake/` photos, `social/video-intake/` video) so the weekly sweep
// only has to change which bucket it reads and mint a signed URL.
export const PHOTO_PREFIX = 'social/intake'
export const VIDEO_PREFIX = 'social/video-intake'

// Phase 2 — captures with no stop behind them (the profile uploader). Separate
// prefixes so marketing can tell the two apart from the object path alone,
// without joining to the table first.
export const GENERIC_PHOTO_PREFIX = 'social/generic-intake'
export const GENERIC_VIDEO_PREFIX = 'social/generic-video-intake'

export const MAX_VIDEO_SECONDS = 60

// How far back a COMPLETED stop still offers Add Media.
//
// 1 = today and yesterday. Reaching further back re-exposes stops the route
// list intentionally hides and reads as confusing rather than useful — a
// driver scrolling last week's work does not want a live upload control on it.
// Anything older belongs on the profile uploader, which is what it is for.
// The route-list hide logic itself is untouched; this only bounds where the
// completed-stop tile appears.
export const COMPLETED_STOP_MEDIA_DAYS = 1

// ⚠ THE REAL CEILING IS THE PROJECT-WIDE STORAGE UPLOAD LIMIT, NOT THIS.
// A bucket's file_size_limit cannot exceed the project global (Dashboard →
// Project Settings → Storage → "Upload file size limit"). Probed live with
// the service role on 2026-08-06: 49 MB → 200, 60 MB → 413 EntityTooLarge,
// i.e. the global was 50 MB at that moment. Migration 030 sets the bucket to
// 500 MB and these constants match it, but if video uploads start failing at
// ~50 MB with EntityTooLarge, the project global is the thing to raise —
// resumable (tus) uploads do NOT bypass it.
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024   // 500 MB

// Photos are compressed to ~1200px/JPEG-0.8 before upload (see
// lib/imageCompress). This cap is the guard for the cases where compression
// declines to run — HEIC the browser can't decode, ProRAW — and returns the
// original untouched.
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024    // 50 MB

export const PHOTO_ACCEPT = 'image/*'
export const VIDEO_ACCEPT = 'video/*'

export const CAPTION_LIMIT = 140

export type FieldMediaType = 'photo' | 'video'

/** 'stop' = captured on a stop, auto-tagged. 'generic' = profile uploader, no
 *  stop behind it, so the driver's own description carries the meaning. */
export type FieldMediaSource = 'stop' | 'generic'

// Offered on the generic uploader only. A stop-tagged capture already has the
// real job context, which beats a self-reported bucket. Values are stored as
// free text (`category`), so retuning this list is not a migration.
export const GENERIC_CATEGORIES = [
  { key: 'tent',      label: 'Tent' },
  { key: 'event',     label: 'Event setup' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'other',     label: 'Other' },
] as const

// Extension from the mime the camera actually handed us. iOS video capture
// returns video/quicktime (.mov); Android returns video/mp4 or video/3gpp.
// Kept in sync with migration 030's allowed_mime_types.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg':      'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
  'image/heic':      'heic',
  'image/heif':      'heif',
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/webm':      'webm',
  'video/3gpp':      '3gp',
}

export function extForMime(mime: string, mediaType: FieldMediaType): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? (mediaType === 'video' ? 'mp4' : 'jpg')
}

// Deterministic and stable for the life of one capture — the timestamp is
// stamped once at enqueue time, never at upload time. That matters: a retry
// after a failed row-write re-uploads to the SAME path with upsert, rather
// than orphaning the first attempt (the generator-photo doctrine).
//
// The `stop-` prefix is what keeps driver uploads from colliding with a real
// post code in the marketing ledger, which is matched on a space-anchored
// code pattern.
export function fieldMediaPath(
  mediaType: FieldMediaType,
  stopId: string,
  capturedAtMs: number,
  ext: string,
): string {
  const prefix = mediaType === 'video' ? VIDEO_PREFIX : PHOTO_PREFIX
  return `${prefix}/stop-${stopId}__${capturedAtMs}.${ext}`
}

// Generic captures key on the DRIVER instead of a stop. No `stop-` prefix, so
// the two kinds can never be confused by a path match on either side.
export function genericMediaPath(
  mediaType: FieldMediaType,
  driverId: string,
  capturedAtMs: number,
  ext: string,
): string {
  const prefix = mediaType === 'video' ? GENERIC_VIDEO_PREFIX : GENERIC_PHOTO_PREFIX
  return `${prefix}/generic-${driverId}__${capturedAtMs}.${ext}`
}

/** Which media type a picked file is, from its own mime. Needed for the
 *  library picker, where one input accepts both and the user's choice — not a
 *  button — decides what we got. */
export function mediaTypeForFile(mime: string): FieldMediaType | null {
  const m = (mime || '').toLowerCase()
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('image/')) return 'photo'
  return null
}

/**
 * Is this stop still inside the completed-stop upload window?
 *
 * Takes the route's operating date (YYYY-MM-DD, local) rather than a
 * timestamp: that is the day the driver is actually looking at, and it is what
 * makes "today's route and yesterday's" predictable across a stop completed at
 * 00:15. Falls back to `completedAt` when the route date is missing.
 */
export function withinCompletedMediaWindow(
  operatingDate: string | null | undefined,
  completedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  if (operatingDate && /^\d{4}-\d{2}-\d{2}$/.test(operatingDate)) {
    const [y, m, d] = operatingDate.split('-').map(Number)
    const diffDays = Math.round((todayMs - Date.UTC(y, m - 1, d)) / 86_400_000)
    // Future-dated routes (a next-day preview) are in-window too; only the
    // PAST is bounded.
    return diffDays <= COMPLETED_STOP_MEDIA_DAYS
  }

  if (completedAt) {
    const c = new Date(completedAt)
    if (!Number.isNaN(c.getTime())) {
      const cMs = Date.UTC(c.getFullYear(), c.getMonth(), c.getDate())
      return Math.round((todayMs - cMs) / 86_400_000) <= COMPLETED_STOP_MEDIA_DAYS
    }
  }

  // Neither signal available — fail CLOSED. A missing date must not silently
  // re-open every historical stop, which is the exact thing this bounds.
  return false
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
