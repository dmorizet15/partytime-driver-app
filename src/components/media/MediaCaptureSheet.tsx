'use client'

import { useEffect, useRef, useState } from 'react'
import type { Stop } from '@/types'
import { compressImage } from '@/lib/imageCompress'
import {
  CAPTION_LIMIT,
  GENERIC_CATEGORIES,
  MAX_VIDEO_SECONDS,
  PHOTO_ACCEPT,
  VIDEO_ACCEPT,
  formatBytes,
  mediaTypeForFile,
  type FieldMediaSource,
  type FieldMediaType,
} from '@/lib/fieldMedia/config'
import {
  probeVideoDuration,
  queueCapture,
  validateCapture,
} from '@/lib/fieldMedia/service'

// ─── Field media capture sheet (shared) ──────────────────────────────────────
// ONE sheet serves both entry points, so the validation, caps, consent gate and
// upload path can never drift between them:
//   • mode 'stop'    — the Add Media tile on Stop Detail. Auto-tagged.
//   • mode 'generic' — the profile uploader. No stop, so the driver's own
//                      description is REQUIRED; it is the only thing telling
//                      marketing what the file is.
//
// THIS SHEET NEVER UPLOADS. It validates, enqueues and closes — the transfer is
// driven from lib/fieldMedia/service so it survives the driver navigating away.
//
// TWO SOURCES (Phase 2): shoot live, or choose an existing file. Both run the
// identical path from `handlePick` down; only where the Blob came from differs.
// Live capture is `capture="environment"` (the OS camera); the library picker
// is the same <input type="file"> WITHOUT that attribute, which is what opens
// the iOS Photos picker / Android gallery.
//
// ⚠ Permissions: this is a web PWA, not a native shell — there is no
// PHPicker/expo-image-picker call to make and no permission API to query. The
// OS prompts for camera or photo-library access on its own, per action, and a
// denial simply means the input's change event never fires. That is handled by
// `handlePick` returning early on no file: the sheet stays open with its
// buttons intact so the driver can try the other source. There is deliberately
// no "permission denied" error state, because the browser gives us no way to
// distinguish a denial from an ordinary cancel — inventing one would mean
// showing a scary message to everyone who simply changed their mind.

const C = {
  gold:     '#FFB800',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const LIBRARY_ACCEPT = `${PHOTO_ACCEPT},${VIDEO_ACCEPT}`

interface Picked {
  blob:       Blob
  mediaType:  FieldMediaType
  mimeType:   string
  byteSize:   number
  duration:   number | null
  previewUrl: string
}

interface MediaCaptureSheetProps {
  mode:      FieldMediaSource
  /** Required when mode === 'stop'. */
  stop?:     Stop
  routeId?:  string | null
  driverId:  string
  onClose:   () => void
  onQueued?: (mediaType: FieldMediaType) => void
}

/** Last-resort type sniff: some Android pickers hand back an empty file.type. */
function inferMediaType(file: File): FieldMediaType | null {
  const byMime = mediaTypeForFile(file.type)
  if (byMime) return byMime
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'mov', 'm4v', '3gp', 'webm', 'avi', 'mkv'].includes(ext)) return 'video'
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) return 'photo'
  return null
}

export default function MediaCaptureSheet({
  mode, stop, routeId = null, driverId, onClose, onQueued,
}: MediaCaptureSheetProps) {
  const [picked,  setPicked]  = useState<Picked | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [sending, setSending] = useState(false)

  const photoRef   = useRef<HTMLInputElement | null>(null)
  const videoRef   = useRef<HTMLInputElement | null>(null)
  const libraryRef = useRef<HTMLInputElement | null>(null)

  const isGeneric = mode === 'generic'

  // Object URLs are revoked on replacement and on unmount.
  useEffect(() => {
    return () => { if (picked) URL.revokeObjectURL(picked.previewUrl) }
  }, [picked])

  /**
   * The single funnel. Live capture and library picks both land here, so caps,
   * compression, duration probing and the consent gate cannot diverge between
   * the two sources.
   */
  async function handlePick(
    file: File | undefined,
    forcedType: FieldMediaType | null,
    fromLibrary: boolean,
  ) {
    // No file = the user cancelled, or the OS denied the permission. Both look
    // identical to us; leave the sheet exactly as it was.
    if (!file) return

    const mediaType = forcedType ?? inferMediaType(file)
    if (!mediaType) {
      setError("That file isn't a photo or a video.")
      return
    }

    setError(null)
    setBusy(true)
    try {
      let blob: Blob = file
      let mimeType = file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')

      if (mediaType === 'photo') {
        const compressed = await compressImage(file)
        blob = compressed
        mimeType = compressed.type || mimeType
      }

      const duration = mediaType === 'video' ? await probeVideoDuration(blob) : null

      // Caps are checked BEFORE anything is queued, so an over-length library
      // pick is refused up front instead of failing partway through an upload.
      const rejection = validateCapture(mediaType, blob.size, duration, fromLibrary)
      if (rejection) { setError(rejection.reason); return }

      if (picked) URL.revokeObjectURL(picked.previewUrl)
      setPicked({
        blob, mediaType, mimeType,
        byteSize: blob.size,
        duration,
        previewUrl: URL.createObjectURL(blob),
      })
    } catch (err) {
      console.error('[field-media] pick failed', err)
      setError("Couldn't read that file. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const trimmedCaption = caption.trim()
  const captionMissing = isGeneric && trimmedCaption.length === 0
  const canSend = !!picked && consent && !captionMissing && !sending

  async function handleSend() {
    if (!canSend || !picked) return
    setSending(true)
    setError(null)
    const ok = await queueCapture({
      source:          mode,
      stopId:          isGeneric ? null : (stop?.stop_id ?? null),
      routeId:         isGeneric ? null : routeId,
      driverId,
      mediaType:       picked.mediaType,
      blob:            picked.blob,
      mimeType:        picked.mimeType,
      byteSize:        picked.byteSize,
      durationSeconds: picked.duration,
      caption:         trimmedCaption || null,
      category:        isGeneric ? category : null,
      consent:         true,
      capturedAtMs:    Date.now(),
    })
    if (!ok) {
      // IndexedDB refused the write — there is no fallback that could hold a
      // blob this size, so say so rather than closing and losing it silently.
      setError("Your phone wouldn't save this to send. Try again, or free up some storage.")
      setSending(false)
      return
    }
    onQueued?.(picked.mediaType)
    onClose()
  }

  const stopLabel = stop
    ? (stop.company_name?.trim() || stop.customer_name || 'this stop')
    : null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 210,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '92vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          fontFamily: FONT_BODY,
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px',
        }}/>

        <div style={{ marginBottom: 4, fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800 }}>
          {isGeneric ? 'Upload media' : 'Add media'}
        </div>
        <div style={{ fontSize: 12.5, color: '#94A3B8', marginBottom: 16, lineHeight: 1.45 }}>
          {isGeneric
            ? <>Goes to marketing for review. Not tied to a stop, so tell us what it is below.</>
            : <>Goes to marketing tagged with <strong style={{ color: '#CBD5E1' }}>{stopLabel}</strong>. Nothing is posted — someone reviews it first.</>}
        </div>

        {/* Live camera */}
        <input
          ref={photoRef} type="file" accept={PHOTO_ACCEPT} capture="environment"
          onChange={(e) => { void handlePick(e.target.files?.[0], 'photo', false); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        <input
          ref={videoRef} type="file" accept={VIDEO_ACCEPT} capture="environment"
          onChange={(e) => { void handlePick(e.target.files?.[0], 'video', false); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        {/* Library — same element, no `capture`, which is what opens the
            Photos picker / gallery instead of the camera. Accepts both kinds;
            the file's own mime decides which path it takes. */}
        <input
          ref={libraryRef} type="file" accept={LIBRARY_ACCEPT}
          onChange={(e) => { void handlePick(e.target.files?.[0], null, true); e.target.value = '' }}
          style={{ display: 'none' }}
        />

        {!picked && (
          <>
            <div style={{
              fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#64748B', marginBottom: 8,
            }}>
              Take now
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <PickButton
                label={busy ? 'Reading…' : 'Photo'}
                sub="Use the camera"
                disabled={busy}
                onClick={() => photoRef.current?.click()}
              />
              <PickButton
                label={busy ? 'Reading…' : 'Video'}
                sub={`Up to ${MAX_VIDEO_SECONDS}s`}
                disabled={busy}
                onClick={() => videoRef.current?.click()}
              />
            </div>

            <button
              onClick={() => libraryRef.current?.click()}
              disabled={busy}
              style={{
                width: '100%', background: 'transparent',
                border: '1px dashed #475569', borderRadius: 12,
                padding: '14px 12px', marginBottom: 14,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                color: '#CBD5E1', fontSize: 13.5, fontWeight: 700,
                fontFamily: FONT_BODY,
              }}
            >
              Choose from library
              <span style={{
                display: 'block', fontSize: 11, fontWeight: 500,
                color: '#64748B', marginTop: 2,
              }}>
                Something you already shot
              </span>
            </button>
          </>
        )}

        {picked && (
          <>
            <div style={{
              borderRadius: 12, overflow: 'hidden', background: '#020617',
              marginBottom: 10, maxHeight: 260, display: 'flex', justifyContent: 'center',
            }}>
              {picked.mediaType === 'photo'
                ? <img src={picked.previewUrl} alt="" style={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain' }}/>
                : <video src={picked.previewUrl} controls playsInline style={{ maxWidth: '100%', maxHeight: 260 }}/>}
            </div>

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11.5, color: '#94A3B8', marginBottom: 14,
            }}>
              <span>
                {picked.mediaType === 'video' ? 'Video' : 'Photo'} · {formatBytes(picked.byteSize)}
                {picked.duration !== null && ` · ${Math.round(picked.duration)}s`}
              </span>
              <button
                onClick={() => {
                  URL.revokeObjectURL(picked.previewUrl)
                  setPicked(null); setConsent(false)
                }}
                style={{
                  background: 'none', border: 'none', color: '#94A3B8',
                  fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', padding: 0,
                }}
              >
                Choose another
              </button>
            </div>

            <label style={{ display: 'block', fontSize: 11.5, color: '#94A3B8', marginBottom: 6 }}>
              {isGeneric
                ? <>What is it? <span style={{ color: C.gold }}>Required</span></>
                : <>What is it? <span style={{ opacity: 0.7 }}>(optional)</span></>}
            </label>
            <input
              type="text"
              value={caption}
              maxLength={CAPTION_LIMIT}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Finished sailcloth tent, Rhinebeck wedding"
              style={{
                width: '100%', padding: '11px 12px', fontSize: 16,
                borderRadius: 10,
                border: `1px solid ${captionMissing ? '#475569' : '#334155'}`,
                background: '#1E293B', color: '#fff',
                marginBottom: isGeneric ? 12 : 14,
                fontFamily: FONT_BODY,
              }}
            />

            {isGeneric && (
              <>
                <label style={{ display: 'block', fontSize: 11.5, color: '#94A3B8', marginBottom: 6 }}>
                  Category <span style={{ opacity: 0.7 }}>(optional)</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {GENERIC_CATEGORIES.map((c) => {
                    const on = category === c.key
                    return (
                      <button
                        key={c.key}
                        onClick={() => setCategory(on ? null : c.key)}
                        style={{
                          background: on ? C.gold : '#1E293B',
                          border: `1px solid ${on ? C.gold : '#334155'}`,
                          color: on ? '#1A1200' : '#CBD5E1',
                          borderRadius: 999, padding: '8px 14px',
                          fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                          fontFamily: FONT_BODY,
                        }}
                      >
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <button
              onClick={() => setConsent((v) => !v)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                textAlign: 'left', background: consent ? 'rgba(31,191,107,0.12)' : '#1E293B',
                border: `1px solid ${consent ? C.green : '#334155'}`,
                borderRadius: 10, padding: '12px 12px', marginBottom: 14, cursor: 'pointer',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 1,
                border: `2px solid ${consent ? C.green : '#64748B'}`,
                background: consent ? C.green : 'transparent',
                color: '#04210F', fontSize: 13, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {consent ? '✓' : ''}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.45, color: '#E2E8F0' }}>
                The customer is OK with PartyTime using this for marketing.
              </span>
            </button>
          </>
        )}

        {error && (
          <div style={{
            background: 'rgba(255,90,60,0.12)', border: `1px solid ${C.coral}`,
            borderRadius: 10, padding: '10px 12px', marginBottom: 14,
            fontSize: 12.5, lineHeight: 1.45, color: '#FFC9BE',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: '100%', height: 48, borderRadius: 999, border: 'none',
            background: canSend ? C.gold : '#334155',
            color: canSend ? '#1A1200' : '#94A3B8',
            fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 800,
            cursor: canSend ? 'pointer' : 'default',
          }}
        >
          {sending ? 'Saving…'
            : !picked ? 'Take or choose something first'
            : captionMissing ? 'Add a short description'
            : !consent ? 'Confirm it’s OK to use'
            : 'Send to marketing'}
        </button>

        <div style={{
          marginTop: 10, fontSize: 10.5, color: '#64748B', textAlign: 'center', lineHeight: 1.5,
        }}>
          Sends in the background · you can carry on with your route
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 12, background: 'none', border: 'none',
            color: '#94A3B8', fontSize: 13, cursor: 'pointer', padding: 8,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function PickButton({ label, sub, onClick, disabled }: {
  label: string; sub: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, background: '#1E293B', border: '1px solid #334155',
        borderRadius: 12, padding: '18px 10px', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{
        fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: '#94A3B8' }}>{sub}</div>
    </button>
  )
}
