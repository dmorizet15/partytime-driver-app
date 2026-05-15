'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DOCUMENT_LABELS,
  type DocumentType,
} from '@/lib/driverComplianceClient'

// Editorial direction-03 palette (matches ProfileScreen).
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFF6DB',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  green:    '#1FBF6B',
  greenDeep:'#0F8C4D',
  greenSoft:'#E5F7ED',
  red:      '#DC2626',
  redSoft:  '#FEECEC',
  redDeep:  '#B91C1C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface Props {
  driverId:     string
  documentType: DocumentType
  onClose:      () => void
  onSaved:      () => void
}

type Stage = 'pick' | 'extracting' | 'confirm' | 'saving' | 'error'

interface ExtractResponse {
  success:     boolean
  expiry_date?: string
  confidence?: string
  reason?:     string
  message?:    string
}

const ACCEPT = 'image/jpeg,image/png,application/pdf'
const MAX_BYTES = 10 * 1024 * 1024

export default function UploadComplianceDocModal({ driverId, documentType, onClose, onSaved }: Props) {
  const [stage, setStage]             = useState<Stage>('pick')
  const [file, setFile]               = useState<File | null>(null)
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [expiryDate, setExpiryDate]   = useState<string>('')   // YYYY-MM-DD
  const [extractionMethod, setExtractionMethod] = useState<'vision' | 'manual'>('manual')
  const [extractionMessage, setExtractionMessage] = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_BYTES) {
      setError(`File is too large. Max 10 MB.`)
      setStage('error')
      return
    }
    setFile(f)
    setError(null)
    await runUploadAndExtract(f)
  }

  async function runUploadAndExtract(f: File) {
    setStage('extracting')
    setExtractionMessage(null)

    // Path: <driver_id>/<document_type>/<uuid>-<sanitized-filename>
    const ext = (f.name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 8)
    const safeName = `${crypto.randomUUID()}.${ext}`
    const path = `${driverId}/${documentType}/${safeName}`

    const { error: uploadErr } = await supabase
      .storage
      .from('driver-compliance-docs')
      .upload(path, f, {
        contentType: f.type,
        upsert: false,
      })
    if (uploadErr) {
      setError(uploadErr.message)
      setStage('error')
      return
    }
    setStoragePath(path)

    // Call vision extraction. Non-success → manual entry.
    let extractData: ExtractResponse = { success: false }
    try {
      const res = await fetch('/api/profile/extract-document-expiry', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          storage_path:  path,
          mime_type:     f.type,
          document_type: documentType,
        }),
      })
      extractData = await res.json()
    } catch (err) {
      // Network glitch — falls through to manual entry path.
      console.error('[extract] network failure', err)
    }

    if (extractData.success && extractData.expiry_date) {
      setExpiryDate(extractData.expiry_date)
      setExtractionMethod('vision')
      setExtractionMessage(
        `AI extracted ${extractData.expiry_date}${extractData.confidence ? ` (${extractData.confidence} confidence)` : ''}. Confirm or correct below.`,
      )
    } else {
      setExtractionMethod('manual')
      setExtractionMessage(extractData.message ?? 'Enter the expiry date manually.')
    }
    setStage('confirm')
  }

  async function handleSave() {
    if (!storagePath) return
    if (!expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      setError('Enter a valid expiry date (YYYY-MM-DD).')
      return
    }
    setStage('saving')

    // Upsert by (driver_id, document_type) — see Migration 055 UNIQUE.
    const { error: insertErr } = await supabase
      .from('driver_documents')
      .upsert(
        {
          driver_id:         driverId,
          document_type:     documentType,
          storage_path:      storagePath,
          expiry_date:       expiryDate,
          extraction_method: extractionMethod,
        },
        { onConflict: 'driver_id,document_type' },
      )
    if (insertErr) {
      setError(insertErr.message)
      setStage('error')
      return
    }
    onSaved()
  }

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(10,11,20,0.55)',
          zIndex: 50,
        }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0,
          zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 18, fontFamily: FONT_BODY,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 18,
            padding: 18,
            width: '100%',
            maxWidth: 420,
            maxHeight: '90vh',
            overflow: 'auto',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <header>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
              color: C.muted, textTransform: 'uppercase',
            }}>
              Upload
            </div>
            <h2 style={{
              margin: 0, marginTop: 4,
              fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 900,
              color: C.ink, lineHeight: 1.1, letterSpacing: '-0.01em',
            }}>
              {DOCUMENT_LABELS[documentType]}
            </h2>
            <p style={{
              margin: 0, marginTop: 6,
              fontSize: 12.5, color: C.muted, lineHeight: 1.4,
            }}>
              JPG or PNG. PDFs are accepted but the AI date extraction works best on photos. Max 10 MB.
            </p>
          </header>

          {stage === 'pick' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={handleFilePick}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%',
                  background: C.blue,
                  border: 0,
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 800, color: '#fff',
                  letterSpacing: '0.02em',
                }}
              >
                Choose file from device
              </button>
            </>
          )}

          {stage === 'extracting' && (
            <div style={{
              padding: 14,
              background: C.off,
              borderRadius: 12,
              fontSize: 13, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80,
              gap: 10,
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 7,
                border: `2px solid ${C.muted}`, borderTopColor: C.blue,
                animation: 'spin 0.8s linear infinite',
              }} aria-hidden />
              Reading expiry date…
            </div>
          )}

          {stage === 'confirm' && (
            <>
              {extractionMessage && (
                <div style={{
                  padding: '10px 12px',
                  background: extractionMethod === 'vision' ? C.greenSoft : C.goldSoft,
                  border: `1.5px solid ${extractionMethod === 'vision' ? C.greenDeep : C.gold}`,
                  borderRadius: 12,
                  fontSize: 12.5, lineHeight: 1.4,
                  color: extractionMethod === 'vision' ? C.greenDeep : C.goldDeep,
                  fontWeight: 600,
                }}>
                  {extractionMessage}
                </div>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{
                  fontFamily: FONT_DISPLAY,
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: C.muted,
                }}>
                  Expiry date
                </span>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => {
                    setExpiryDate(e.target.value)
                    // If the driver overrides a vision date, downgrade the
                    // captured method to manual so audit reflects truth.
                    setExtractionMethod('manual')
                  }}
                  style={{
                    background: '#FAFBFD',
                    border: `1.5px solid ${error ? C.red : '#D9DBE3'}`,
                    borderRadius: 10,
                    padding: '12px 12px',
                    fontFamily: 'inherit',
                    fontSize: 15, fontWeight: 600, color: C.ink,
                    outline: 'none',
                  }}
                />
              </label>
              {error && (
                <div style={{
                  background: C.redSoft,
                  border: `1px solid ${C.redDeep}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 12, color: C.redDeep, fontWeight: 700,
                }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: `1.5px solid ${C.ink}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 700, color: C.ink,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    background: C.blue,
                    border: 0,
                    borderRadius: 12,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 14, fontWeight: 800, color: '#fff',
                  }}
                >
                  Save document
                </button>
              </div>
            </>
          )}

          {stage === 'saving' && (
            <div style={{
              padding: 14,
              background: C.off,
              borderRadius: 12,
              fontSize: 13, color: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80,
            }}>
              Saving…
            </div>
          )}

          {stage === 'error' && (
            <>
              <div style={{
                background: C.redSoft,
                border: `1.5px solid ${C.redDeep}`,
                borderLeft: `5px solid ${C.red}`,
                borderRadius: 12,
                padding: '12px 14px',
                color: C.redDeep,
                fontWeight: 700, fontSize: 13, lineHeight: 1.4,
              }}>
                {error ?? 'Something went wrong. Try again.'}
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStage(file ? 'confirm' : 'pick')
                }}
                style={{
                  background: C.blue,
                  border: 0,
                  borderRadius: 12,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 14, fontWeight: 800, color: '#fff',
                }}
              >
                Try again
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
