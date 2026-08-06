// ─── Field media — shared configuration ──────────────────────────────────────
// One file owns the bucket name, the caps and the path convention so the
// sheet, the queue, the uploader and the API route can never disagree.

export const FIELD_MEDIA_BUCKET = 'field-media-intake'

// Prefixes deliberately mirror the PUBLIC marketing pipeline's
// (`social/intake/` photos, `social/video-intake/` video) so the weekly sweep
// only has to change which bucket it reads and mint a signed URL.
export const PHOTO_PREFIX = 'social/intake'
export const VIDEO_PREFIX = 'social/video-intake'

export const MAX_VIDEO_SECONDS = 60

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
