import type { FieldMediaType } from './config'

// What the capture sheet hands to the queue. The sheet never uploads — it
// validates, stamps, enqueues and closes.
export interface FieldMediaCapture {
  stopId:          string
  routeId:         string | null
  mediaType:       FieldMediaType
  blob:            Blob
  mimeType:        string
  byteSize:        number
  /** null when the browser could not decode the container to read a duration
   *  (real on iOS HEVC .mov) — the byte cap is the only guard in that case. */
  durationSeconds: number | null
  caption:         string | null
  consent:         boolean
  capturedAtMs:    number
}

export interface QueuedFieldMedia extends Omit<FieldMediaCapture, 'blob'> {
  /** `${stopId}:${capturedAtMs}` — unique per capture, so a stop can carry
   *  several photos and clips without them overwriting each other. */
  id:          string
  blob:        Blob
  /** Stamped at enqueue time and never recomputed, so a retry re-uploads to
   *  the same object rather than orphaning the first attempt. */
  storagePath: string
  attempts:    number
  queuedAt:    string
}

/** What `<FieldMediaChip/>` renders. Replaced wholesale on every change —
 *  never mutated in place — because useSyncExternalStore compares by
 *  reference. */
export interface FieldMediaStatus {
  /** Captures waiting to upload, including the one in flight. */
  queued: number
  active: {
    id:        string
    mediaType: FieldMediaType
    byteSize:  number
    /** 0–1, or null while the transport hasn't reported yet. */
    progress:  number | null
  } | null
  /** Set when the last pass ended with something still stuck, so the driver
   *  isn't left believing a clip has gone when it hasn't. */
  lastError: string | null
}

export type FieldMediaOutcome = 'ok' | 'retry' | 'permanent' | 'cancelled'
