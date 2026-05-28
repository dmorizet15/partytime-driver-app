'use client'

import { useEffect, useRef, useState } from 'react'
import {
  listNotesForAddress,
  saveStopNote,
  uploadStopNotePhoto,
  type StopNoteRow,
} from '@/lib/ava/stopNotesClient'

// AVA Remembers note sheet — opens from the Stop Detail Tier 3 pill, the
// faint footer link below action buttons, or the morning-card review list.
// Two modes in one shell:
//   - read existing notes for this address (newest first)
//   - draft a new one (text + optional photos)
//
// The Gold CTA on Home / Mark Complete on Stop Detail are NOT gated on this
// sheet — it's a reminder layer, not a checklist gate.

const BLUE       = '#0000FF'
const NOTE_LIMIT = 280

interface AvaNoteSheetProps {
  stopId:      string
  addressKey:  string
  rawAddress:  string
  authorId:    string
  onClose:     () => void
  onSaved?:    (row: StopNoteRow) => void
}

export default function AvaNoteSheet({
  stopId, addressKey, rawAddress, authorId, onClose, onSaved,
}: AvaNoteSheetProps) {
  const [priorNotes,   setPriorNotes]   = useState<StopNoteRow[]>([])
  const [loadingPrior, setLoadingPrior] = useState(true)
  const [draft,        setDraft]        = useState('')
  const [photoUrls,    setPhotoUrls]    = useState<string[]>([])
  const [uploading,    setUploading]    = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [toast,        setToast]        = useState<string | null>(null)
  const [photoError,   setPhotoError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    listNotesForAddress(addressKey).then((rows) => {
      if (cancelled) return
      setPriorNotes(rows)
      setLoadingPrior(false)
    })
    return () => { cancelled = true }
  }, [addressKey])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(t)
  }, [toast])

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError(null)
    setUploading(true)
    const result = await uploadStopNotePhoto(stopId, file)
    setUploading(false)
    if (result.ok) {
      setPhotoUrls((prev) => [...prev, result.url])
    } else {
      setPhotoError(result.error || 'Photo upload failed — note text still saves.')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSave() {
    if (saving) return
    const text = draft.trim()
    if (!text) return
    setSaving(true)
    const result = await saveStopNote({
      stop_id:     stopId,
      address_key: addressKey,
      raw_address: rawAddress,
      note:        text,
      author_id:   authorId,
      photo_urls:  photoUrls,
    })
    setSaving(false)

    if (result.ok && result.row) {
      onSaved?.(result.row)
      setToast('Note saved — AVA will remember this stop ✓')
      window.setTimeout(onClose, 700)
      return
    }
    if (result.queued) {
      setToast('Saved offline — AVA will sync when you reconnect.')
      window.setTimeout(onClose, 900)
      return
    }
    setToast(result.error || 'Save failed — try again.')
  }

  const remaining = NOTE_LIMIT - draft.length
  const canSave   = draft.trim().length > 0 && !saving && !uploading

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AVA Remembers"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
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
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px',
        }}/>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="ava-wave-bar"
                style={{
                  width: 2, height: 12,
                  background: '#fff', borderRadius: 1,
                  animationDelay: `${i * 120}ms`,
                }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            AVA Remembers
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 0,
              color: '#94A3B8', fontSize: 26, lineHeight: 1,
              cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        {/* Address echo */}
        <div style={{
          fontSize: 12, color: '#94A3B8', marginBottom: 14,
          lineHeight: 1.4,
        }}>
          {rawAddress}
        </div>

        {/* Prior notes */}
        <div style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
            color: '#94A3B8', marginBottom: 10,
          }}>
            PRIOR NOTES
          </div>
          {loadingPrior ? (
            <div style={{ fontSize: 13, color: '#64748B' }}>Loading…</div>
          ) : priorNotes.length === 0 ? (
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4 }}>
              No notes yet. Be the first to leave one.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {priorNotes.map((n) => (
                <li
                  key={n.id}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 14, lineHeight: 1.45, color: '#F4F6FA' }}>
                    {n.note}
                  </div>
                  {n.photo_urls.length > 0 && (
                    <div style={{
                      display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap',
                    }}>
                      {n.photo_urls.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url}
                          alt=""
                          style={{
                            width: 72, height: 72, objectFit: 'cover',
                            borderRadius: 8, background: '#1E293B',
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <div style={{
                    marginTop: 6, fontSize: 12, color: '#64748B',
                  }}>
                    — {firstNameOf(n.author_name)} · {formatShortDate(n.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{
          height: 1, background: 'rgba(255,255,255,0.08)',
          marginBottom: 16,
        }}/>

        {/* New note */}
        <div style={{
          fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
          color: '#94A3B8', marginBottom: 10,
        }}>
          LEAVE A NOTE
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTE_LIMIT))}
          placeholder="What should the next driver know?"
          rows={3}
          style={{
            width: '100%',
            background: '#1E293B', color: '#F4F6FA',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 14, lineHeight: 1.5,
            fontFamily: 'inherit',
            resize: 'vertical',
            minHeight: 78,
            boxSizing: 'border-box',
          }}
        />

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 8,
        }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'transparent',
              color: uploading ? '#475569' : '#94A3B8',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 999,
              padding: '6px 12px',
              fontSize: 12, fontWeight: 600,
              cursor: uploading ? 'default' : 'pointer',
            }}
          >
            {uploading ? 'Uploading…' : '+ Photo'}
          </button>
          <span style={{
            fontSize: 11,
            color: remaining < 20 ? '#FFB800' : '#64748B',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {remaining}/{NOTE_LIMIT}
          </span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoPick}
          style={{ display: 'none' }}
        />

        {photoUrls.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap',
          }}>
            {photoUrls.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                style={{
                  width: 64, height: 64, objectFit: 'cover',
                  borderRadius: 8, background: '#1E293B',
                }}
              />
            ))}
          </div>
        )}

        {photoError && (
          <div style={{
            marginTop: 8, fontSize: 12, color: '#FF8A65',
          }}>
            {photoError}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            marginTop: 18, width: '100%',
            background: canSave ? '#FFB800' : '#334155',
            color:      canSave ? '#0A0B14' : '#64748B',
            border: 0, borderRadius: 999,
            padding: '12px 16px',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>

        {toast && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'rgba(31,191,107,0.12)',
              border: '1px solid rgba(31,191,107,0.25)',
              borderRadius: 12,
              fontSize: 13, color: '#A7F3D0',
              textAlign: 'center',
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

function firstNameOf(displayName: string | null | undefined): string {
  if (!displayName) return 'Anonymous'
  const trimmed = displayName.trim()
  if (!trimmed) return 'Anonymous'
  return trimmed.split(/\s+/)[0]
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}
