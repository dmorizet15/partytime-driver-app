'use client'

import { useEffect, useRef } from 'react'
import { speak, stopSpeaking } from '@/lib/ava/elevenLabs'

// Route-start "FROM WAREHOUSE" sheet. Fires when the driver taps
// "Inspect & Start Route" AND routes.warehouse_notes is present — BEFORE the
// pre-trip inspection screen loads, so the driver sees + hears the note while
// still at the yard and can act on it (grab items, rearrange the load).
//
// The warehouse note is READ ALOUD on mount (no tap required, per spec) — we
// speak the note text verbatim; copy rules apply to system-generated speech,
// not this user-authored content. AVA's `speak()` falls through to the Web
// Speech synth on any ElevenLabs error, so the note is always audible even
// before the AudioContext has been unlocked by an earlier gesture this session.
//
// Mirrors StopNotesPreSheet's dark "Before you go" sheet: no backdrop-dismiss,
// no auto-dismiss — the driver controls close via the CTA. Warehouse note
// renders FIRST; the route dispatcher note (if any) renders SECOND.

const BLUE = '#0000FF'

interface RouteStartWarehouseSheetProps {
  warehouseNote:  string
  dispatcherNote?: string | null  // routes.dispatcher_notes — shown second if present
  onProceed:      () => void       // dismiss + continue into the inspection flow
}

export default function RouteStartWarehouseSheet({
  warehouseNote,
  dispatcherNote,
  onProceed,
}: RouteStartWarehouseSheetProps) {
  // Read the warehouse note aloud once on mount. Guard against StrictMode
  // double-invoke so the note isn't spoken twice.
  const spokenRef = useRef(false)
  useEffect(() => {
    if (spokenRef.current) return
    spokenRef.current = true
    // Verbatim — do not summarize or reformat user-authored note text.
    void speak(warehouseNote)
    return () => { stopSpeaking() }
  }, [warehouseNote])

  const dispatch = dispatcherNote?.trim() ? dispatcherNote.trim() : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Note from the warehouse before you start your route"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      {/* NO backdrop-dismiss and NO auto-dismiss — driver controls close via the CTA. */}
      <div
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 14px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} aria-hidden="true" className="ava-wave-bar"
                style={{ width: 2, height: 12, background: '#fff', borderRadius: 1, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Before you head out
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>
          Grab anything you need while you&rsquo;re still at the yard.
        </div>

        {/* FROM WAREHOUSE — first, full untruncated note text. */}
        <div style={{ marginBottom: dispatch ? 16 : 6 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: '#FFB800', marginBottom: 5,
          }}>
            From warehouse
          </div>
          <div style={{
            fontSize: 14.5, lineHeight: 1.5, color: '#E2E8F0',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {warehouseNote}
          </div>
        </div>

        {/* FROM DISPATCH — second, only when a route-level dispatcher note exists. */}
        {dispatch && (
          <div style={{ marginBottom: 6 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: '#FFB800', marginBottom: 5,
            }}>
              From dispatch
            </div>
            <div style={{
              fontSize: 14.5, lineHeight: 1.5, color: '#E2E8F0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {dispatch}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onProceed}
          style={{
            marginTop: 16, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999, padding: '13px 16px', cursor: 'pointer',
            fontSize: 14.5, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          Got it — Start Inspection
        </button>
      </div>
    </div>
  )
}
