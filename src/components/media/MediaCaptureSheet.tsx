'use client'

import { useEffect, useRef, useState } from 'react'
import type { Stop } from '@/types'
import { compressImage } from '@/lib/imageCompress'
import {
  CAPTION_LIMIT,
  MAX_VIDEO_SECONDS,
  PHOTO_ACCEPT,
  VIDEO_ACCEPT,
  formatBytes,
  type FieldMediaType,
} from '@/lib/fieldMedia/config'
import {
  probeVideoDuration,
  queueCapture,
  validateCapture,
} from '@/lib/fieldMedia/service'

// ─── Field media capture sheet ───────────────────────────────────────────────
// Opened from the Add Media tile in Stop Detail's QuickAction grid.
//
// THIS SHEET NEVER UPLOADS. It validates, enqueues and closes — the transfer
// is driven from lib/fieldMedia/service so it survives the driver navigating
// away, which they will do immediately. See that file's header.
//
// Consent is a hard gate on the Send button rather than a soft prompt: this
// is footage of a customer's home, and the whole design (private bucket,
// server-derived tags, nothing auto-publishing) rests on someone having
// actually confirmed it's OK to use.

const C = {
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface Picked {
  blob:      Blob
  mediaType: FieldMediaType
  mimeType:  string
  byteSize:  number
  duration:  number | null
  previewUrl: string
}

interface MediaCaptureSheetProps {
  stop:    Stop
  routeId: string
  onClose: () => void
  /** Fired after a capture is queued, so the screen can toast. */
  onQueued?: (mediaType: FieldMediaType) => void
}

export default function MediaCaptureSheet({
  stop, routeId, onClose, onQueued,
}: MediaCaptureSheetProps) {
  const [picked,   setPicked]   = useState<Picked | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [caption,  setCaption]  = useState('')
  const [consent,  setConsent]  = useState(false)
  const [sending,  setSending]  = useState(false)

  const photoRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLInputElement | null>(null)

  // Object URLs are revoked on replacement and on unmount. (The generator
  // section leaks these — don't copy that part.)
  useEffect(() => {
    return () => { if (picked) URL.revokeObjectURL(picked.previewUrl) }
  }, [picked])

  async function handlePick(file: File | undefined, mediaType: FieldMediaType) {
    if (!file) return
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
      const rejection = validateCapture(mediaType, blob.size, duration)
      if (rejection) { setError(rejection.reason); return }

      if (picked) URL.revokeObjectURL(picked.previewUrl)
      setPicked({
        blob,
        mediaType,
        mimeType,
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

  async function handleSend() {
    if (!picked || !consent || sending) return
    setSending(true)
    setError(null)
    const ok = await queueCapture({
      stopId:          stop.stop_id,
      routeId,
      mediaType:       picked.mediaType,
      blob:            picked.blob,
      mimeType:        picked.mimeType,
      byteSize:        picked.byteSize,
      durationSeconds: picked.duration,
      caption:         caption.trim() || null,
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

  const stopLabel = (stop.company_name?.trim() || stop.customer_name || 'this stop')

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
          Add media
        </div>
        <div style={{ fontSize: 12.5, color: '#94A3B8', marginBottom: 16, lineHeight: 1.45 }}>
          Goes to marketing tagged with <strong style={{ color: '#CBD5E1' }}>{stopLabel}</strong>.
          Nothing is posted — someone reviews it first.
        </div>

        <input
          ref={photoRef} type="file" accept={PHOTO_ACCEPT} capture="environment"
          onChange={(e) => { void handlePick(e.target.files?.[0], 'photo'); e.target.value = '' }}
          style={{ display: 'none' }}
        />
        <input
          ref={videoRef} type="file" accept={VIDEO_ACCEPT} capture="environment"
          onChange={(e) => { void handlePick(e.target.files?.[0], 'video'); e.target.value = '' }}
          style={{ display: 'none' }}
        />

        {!picked && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <PickButton
              label={busy ? 'Reading…' : 'Photo'}
              sub="Finished setup"
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
                  setPicked(null); setConsent(false); setCaption('')
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
              What is it? <span style={{ opacity: 0.7 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={caption}
              maxLength={CAPTION_LIMIT}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="40x60 pole tent, finished"
              style={{
                width: '100%', padding: '11px 12px', fontSize: 16,
                borderRadius: 10, border: '1px solid #334155',
                background: '#1E293B', color: '#fff', marginBottom: 14,
                fontFamily: FONT_BODY,
              }}
            />

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
          disabled={!picked || !consent || sending}
          style={{
            width: '100%', height: 48, borderRadius: 999, border: 'none',
            background: (!picked || !consent) ? '#334155' : C.gold,
            color: (!picked || !consent) ? '#94A3B8' : '#1A1200',
            fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 800,
            cursor: (!picked || !consent) ? 'default' : 'pointer',
          }}
        >
          {sending ? 'Saving…'
            : !picked ? 'Take a photo or video'
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
