// ─── Field media — capture → queue → upload ──────────────────────────────────
// THE RULE THIS FILE EXISTS TO ENFORCE: capturing media never blocks the
// driver. The sheet validates, enqueues and closes; nothing uploads on the
// screen's watch. Upload is driven from here, kicked by loadDay and by the
// online / visibilitychange listeners AppStateContext already owns.
//
// That placement is deliberate and matches existing doctrine: the App Router
// unmounts screens on navigation — the same reason the co-driver realtime
// subscription lives in AppStateProvider rather than a screen. A driver taps
// Send, immediately walks to the truck and opens the next stop, and a 90 MB
// clip keeps going.
//
// Progress is published through a tiny module-level store rather than through
// AppStateContext, so the chip can render app-wide without widening that
// context's value contract (and without re-rendering every consumer of it on
// every progress tick).
//
// Transport split: photos take the ordinary storage upload (a few hundred KB
// after compression, cheap to retry); video takes tus so a dropped LTE
// connection resumes instead of restarting. See resumableUpload.ts.

import { supabase } from '@/lib/supabase'
import {
  FIELD_MEDIA_BUCKET,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  extForMime,
  fieldMediaPath,
  formatBytes,
  genericMediaPath,
  type FieldMediaType,
} from './config'
import {
  enqueueFieldMedia,
  fieldMediaKey,
  listQueuedFieldMedia,
  removeQueuedFieldMedia,
} from './offlineQueue'
import { resumableUpload } from './resumableUpload'
import type {
  FieldMediaCapture,
  FieldMediaOutcome,
  FieldMediaStatus,
  QueuedFieldMedia,
} from './types'

// ─── Store ───────────────────────────────────────────────────────────────────
// useSyncExternalStore compares snapshots by reference, so `status` is
// replaced wholesale on change and never mutated in place.

const EMPTY_STATUS: FieldMediaStatus = Object.freeze({
  queued: 0, active: null, lastError: null,
})

let status: FieldMediaStatus = EMPTY_STATUS
const listeners = new Set<() => void>()

function setStatus(next: Partial<FieldMediaStatus>): void {
  status = { ...status, ...next }
  listeners.forEach((l) => { try { l() } catch { /* a bad listener can't stall an upload */ } })
}

export function subscribeFieldMedia(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getFieldMediaStatus(): FieldMediaStatus {
  return status
}

/** SSR / hydration snapshot — must be referentially stable across calls. */
export function getFieldMediaServerStatus(): FieldMediaStatus {
  return EMPTY_STATUS
}

// ─── Validation helpers ──────────────────────────────────────────────────────

/**
 * Read a clip's duration by letting the browser decode just its metadata.
 *
 * Resolves to `null` — NOT a rejection — when the duration can't be read.
 * That happens for real: iOS records HEVC in a .mov container that Safari
 * will happily hand to a file input but won't always expose a finite duration
 * for. Treating "unknown" as "too long" would reject perfectly good footage
 * the driver just shot, so the byte cap carries the guard in that case.
 */
export function probeVideoDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    const done = (value: number | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(value)
    }
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const d = video.duration
      done(Number.isFinite(d) && d > 0 ? d : null)
    }
    video.onerror = () => done(null)
    // Some mobile browsers neither fire loadedmetadata nor error on a
    // container they can't parse. Don't hang the sheet on them.
    window.setTimeout(() => done(null), 4000)
    video.src = url
  })
}

export interface CaptureRejection { reason: string }

/**
 * Returns null when acceptable, or a driver-facing rejection message.
 *
 * `fromLibrary` only changes the wording. A library pick is rejected BEFORE any
 * upload starts — telling someone to "record a shorter one" when they just
 * chose a file from their camera roll is the wrong instruction.
 */
export function validateCapture(
  mediaType: FieldMediaType,
  byteSize: number,
  durationSeconds: number | null,
  fromLibrary = false,
): CaptureRejection | null {
  if (mediaType === 'video') {
    if (durationSeconds !== null && durationSeconds > MAX_VIDEO_SECONDS + 1) {
      return {
        reason: fromLibrary
          ? `That clip is ${Math.round(durationSeconds)} seconds. Please choose or trim a clip under ${MAX_VIDEO_SECONDS} seconds.`
          : `That clip is ${Math.round(durationSeconds)} seconds. Keep it to ${MAX_VIDEO_SECONDS} or under.`,
      }
    }
    if (byteSize > MAX_VIDEO_BYTES) {
      return {
        reason: fromLibrary
          ? `That clip is ${formatBytes(byteSize)} — too big to send. Please choose a shorter one.`
          : `That clip is ${formatBytes(byteSize)} — too big to send. Record a shorter one, or set your camera to 1080p.`,
      }
    }
    return null
  }
  if (byteSize > MAX_PHOTO_BYTES) {
    return { reason: `That photo is ${formatBytes(byteSize)} — too big to send.` }
  }
  return null
}

// ─── Enqueue ─────────────────────────────────────────────────────────────────

/**
 * Hand a validated capture to the queue. Returns false only when IndexedDB
 * itself is unavailable — the caller must surface that, because unlike a
 * generator capture there is no optimistic local state to fall back on and
 * the media would otherwise be silently lost.
 */
export async function queueCapture(capture: FieldMediaCapture): Promise<boolean> {
  const ext = extForMime(capture.mimeType, capture.mediaType)

  // A generic capture keys on the driver; a stop capture keys on the stop.
  // Both are stamped once here and never recomputed, so a retry lands on the
  // same object instead of orphaning the first attempt.
  const isGeneric = capture.source === 'generic' || !capture.stopId
  const storagePath = isGeneric
    ? genericMediaPath(capture.mediaType, capture.driverId, capture.capturedAtMs, ext)
    : fieldMediaPath(capture.mediaType, capture.stopId!, capture.capturedAtMs, ext)
  const id = isGeneric
    ? fieldMediaKey(`generic:${capture.driverId}`, capture.capturedAtMs)
    : fieldMediaKey(capture.stopId!, capture.capturedAtMs)

  const record: QueuedFieldMedia = {
    ...capture,
    id,
    storagePath,
    attempts:    0,
    queuedAt:    new Date().toISOString(),
  }
  const ok = await enqueueFieldMedia(record)
  if (ok) {
    setStatus({ queued: status.queued + 1, lastError: null })
    void flushFieldMediaQueue()
  }
  return ok
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

let cancelRequestedFor: string | null = null
let abortActive: (() => Promise<void>) | null = null

/** Cancel the upload currently in flight and drop it from the queue. */
export async function cancelActiveFieldMedia(): Promise<void> {
  const active = status.active
  if (!active) return
  cancelRequestedFor = active.id
  try { await abortActive?.() } catch { /* abort is best-effort */ }
}

// ─── Upload ──────────────────────────────────────────────────────────────────

async function accessToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}

async function deleteObject(path: string): Promise<void> {
  try {
    await supabase.storage.from(FIELD_MEDIA_BUCKET).remove([path])
  } catch (err) {
    console.warn('[field-media] orphan cleanup failed', path, err)
  }
}

async function uploadBytes(record: QueuedFieldMedia): Promise<'ok' | 'retry' | 'cancelled'> {
  if (record.mediaType === 'photo') {
    const { error } = await supabase.storage
      .from(FIELD_MEDIA_BUCKET)
      .upload(record.storagePath, record.blob, {
        contentType: record.mimeType || 'image/jpeg',
        upsert: true,
      })
    if (error) {
      console.warn('[field-media] photo upload failed', error.message)
      return 'retry'
    }
    return cancelRequestedFor === record.id ? 'cancelled' : 'ok'
  }

  const token = await accessToken()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!token || !supabaseUrl) return 'retry'   // mid-refresh session; try again later

  const upload = resumableUpload({
    supabaseUrl,
    accessToken: token,
    bucket:      FIELD_MEDIA_BUCKET,
    path:        record.storagePath,
    blob:        record.blob,
    contentType: record.mimeType || 'video/mp4',
    onProgress: (fraction) => {
      if (status.active?.id === record.id) {
        setStatus({ active: { ...status.active, progress: fraction } })
      }
    },
  })
  abortActive = upload.abort

  try {
    await upload.promise
  } catch (err) {
    if (cancelRequestedFor === record.id) return 'cancelled'
    console.warn('[field-media] video upload failed', err)
    return 'retry'
  } finally {
    abortActive = null
  }
  return cancelRequestedFor === record.id ? 'cancelled' : 'ok'
}

async function postIntakeRow(record: QueuedFieldMedia): Promise<FieldMediaOutcome> {
  try {
    const res = await fetch('/api/media/intake', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source:           record.source,
        stop_id:          record.stopId,
        storage_path:     record.storagePath,
        media_type:       record.mediaType,
        mime_type:        record.mimeType,
        byte_size:        record.byteSize,
        duration_seconds: record.durationSeconds,
        caption:          record.caption,
        category:         record.category,
        consent:          record.consent,
      }),
    })
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const j = await res.json().catch(() => null)
      console.error('[field-media] intake POST rejected permanently:', res.status, j)
      return 'permanent'
    }
    if (!res.ok) return 'retry'
    const j = await res.json().catch(() => null) as { saved?: boolean } | null
    return j?.saved ? 'ok' : 'retry'
  } catch (err) {
    console.warn('[field-media] intake POST network failure — staying queued', err)
    return 'retry'
  }
}

async function processRecord(record: QueuedFieldMedia): Promise<FieldMediaOutcome> {
  setStatus({
    active: {
      id: record.id, mediaType: record.mediaType, byteSize: record.byteSize, progress: null,
    },
  })

  const uploaded = await uploadBytes(record)
  if (uploaded === 'cancelled') {
    await deleteObject(record.storagePath)
    return 'cancelled'
  }
  if (uploaded === 'retry') return 'retry'

  const posted = await postIntakeRow(record)
  if (posted === 'permanent') {
    // The row can never be written, so the bytes are unusable to marketing —
    // don't leave them sitting in a private bucket forever.
    await deleteObject(record.storagePath)
  }
  return posted
}

// ─── Flush ───────────────────────────────────────────────────────────────────

let flushing = false

/**
 * Drain the queue. Call on app-load / reconnect (loadDay — the same trigger as
 * every other queue in this app). Never throws.
 */
export async function flushFieldMediaQueue(): Promise<void> {
  if (flushing) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return

  flushing = true
  try {
    const queue = await listQueuedFieldMedia()
    setStatus({ queued: queue.length })
    if (!queue.length) { setStatus({ active: null, lastError: null }); return }

    let stuck = 0
    for (const record of queue) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) { stuck++; break }

      const outcome = await processRecord(record)

      if (outcome === 'ok' || outcome === 'permanent' || outcome === 'cancelled') {
        await removeQueuedFieldMedia(record.id)
      } else {
        // Left in the queue for the next loadDay / reconnect. `attempts` is
        // recorded for diagnosis only — nothing is ever discarded for being
        // retried too often, because discarding a driver's footage silently
        // is the one outcome this feature cannot have.
        stuck++
        await enqueueFieldMedia({ ...record, attempts: record.attempts + 1 })
      }

      if (cancelRequestedFor === record.id) cancelRequestedFor = null
      setStatus({ queued: Math.max(0, status.queued - 1) })
    }

    const remaining = (await listQueuedFieldMedia()).length
    setStatus({
      queued: remaining,
      active: null,
      lastError: stuck > 0
        ? `${stuck} ${stuck === 1 ? 'item' : 'items'} still waiting to send`
        : null,
    })
  } catch (err) {
    console.error('[field-media] flush failed', err)
    setStatus({ active: null })
  } finally {
    flushing = false
  }
}

/** Seed the chip's count on app load without starting a transfer. */
export async function refreshFieldMediaCount(): Promise<void> {
  const n = (await listQueuedFieldMedia()).length
  if (n !== status.queued) setStatus({ queued: n })
}
