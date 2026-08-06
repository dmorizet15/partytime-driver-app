// ─── Resumable (tus) upload for field video ──────────────────────────────────
// Photos go through the ordinary supabase.storage.upload() call — they are a
// few hundred KB after compression and a retry costs nothing. Video does not:
// a clip is tens to hundreds of MB, drivers are on LTE in places with poor
// coverage, and a single-shot POST that dies at 80% has to start again from
// zero. tus checkpoints the transfer so a dropped connection resumes.
//
// tus-js-client persists the upload URL in localStorage (its own fingerprint
// storage), so a resume survives the app being backgrounded or reloaded — not
// just a transient socket drop.
//
// Supabase specifics that are NOT negotiable:
//   • endpoint is /storage/v1/upload/resumable
//   • chunkSize must be exactly 6 MB
//   • bucket / object / content type travel as tus metadata, not in the URL
//
// ⚠ tus does NOT bypass the project-wide storage upload limit. If the global
// limit is below the clip size the create request fails outright — see
// config.ts's note.

import * as tus from 'tus-js-client'

const CHUNK_SIZE = 6 * 1024 * 1024   // Supabase requires exactly 6 MB

export interface ResumableUpload {
  promise: Promise<void>
  /** Stops the transfer and keeps the checkpoint so a later flush resumes. */
  abort: () => Promise<void>
}

export function resumableUpload(opts: {
  supabaseUrl:  string
  accessToken:  string
  bucket:       string
  path:         string
  blob:         Blob
  contentType:  string
  onProgress?:  (fraction: number) => void
}): ResumableUpload {
  let upload: tus.Upload | null = null

  const promise = new Promise<void>((resolve, reject) => {
    upload = new tus.Upload(opts.blob, {
      endpoint: `${opts.supabaseUrl.replace(/\/$/, '')}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${opts.accessToken}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      metadata: {
        bucketName:  opts.bucket,
        objectName:  opts.path,
        contentType: opts.contentType,
        cacheControl: '3600',
      },
      onProgress: (sent, total) => {
        if (total > 0) opts.onProgress?.(sent / total)
      },
      onError: (err) => reject(err),
      onSuccess: () => resolve(),
    })

    // Resume an earlier attempt at this same object if one is checkpointed.
    upload.findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload!.resumeFromPreviousUpload(previous[0])
        upload!.start()
      })
      .catch(() => {
        // Fingerprint storage unreadable — start fresh rather than fail.
        upload!.start()
      })
  })

  return {
    promise,
    abort: async () => { await upload?.abort() },
  }
}
