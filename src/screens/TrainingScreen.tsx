'use client'

import { useState, useEffect } from 'react'
import BottomNav from '@/components/BottomNav'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFEFC2',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Module catalog ──────────────────────────────────────────────────────────
type Module = { id: string; name: string; desc: string }

const MODULES: Module[] = [
  { id: 'safety',      name: 'Safety & DOT Compliance',     desc: 'Required reading for all drivers' },
  { id: 'tents',       name: 'Tent Setup & Anchoring',      desc: 'MQ series, frame tents, stakes' },
  { id: 'equipment',   name: 'Equipment Operation',         desc: 'Generators, heaters, dance floors' },
  { id: 'service',     name: 'Customer Service Standards',  desc: 'Delivery protocols and communication' },
  { id: 'orientation', name: 'New Driver Orientation',      desc: 'Your first week at PartyTime' },
]

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function TrainingScreen() {
  const [toast, setToast] = useState<string | null>(null)

  // Toast auto-dismiss after 3s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string) { setToast(msg) }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '32px 22px 24px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* asymmetric gold star */}
        <svg
          aria-hidden="true"
          width={200} height={200} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16,
            opacity: 0.22,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        {/* Eyebrow row: section name + PTR mark */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Crew Development
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: C.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ptr-mark.png"
              alt="PartyTime Rentals"
              style={{ width: '74%', height: '74%', objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Headline */}
        <div style={{
          marginTop: 22, position: 'relative',
          fontFamily: FONT_DISPLAY,
          fontSize: 38, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff',
        }}>
          Training.
        </div>

        {/* Sub-copy */}
        <div style={{
          marginTop: 12, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
        }}>
          Everything you need to work safe, work smart, and represent PartyTime in the field.
        </div>
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div style={{
          padding: '20px 18px 0',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {MODULES.map((m) => (
            <button
              key={m.id}
              onClick={() => showToast('Coming soon — this feature is in development.')}
              aria-label={`${m.name} — coming soon`}
              style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 16,
                padding: '16px 16px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                width: '100%',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: C.ink,
                  fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}>
                  {m.name}
                </div>
                <div style={{
                  marginTop: 4, fontSize: 13, color: C.muted, lineHeight: 1.35,
                }}>
                  {m.desc}
                </div>
              </div>
              <span style={{
                background: C.goldSoft, color: C.goldDeep,
                padding: '5px 10px', borderRadius: 999,
                fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                Coming Soon
              </span>
            </button>
          ))}
        </div>
      </div>

      <BottomNav/>

      {/* Toast — fixed bottom, ephemeral. Single state slot, auto-dismiss 3s.
          Bottom offset clears the 80px BottomNav + iOS safe-area inset. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(108px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            background: C.ink, color: '#fff',
            padding: '12px 18px', borderRadius: 999,
            fontSize: 13, fontWeight: 700,
            borderLeft: `4px solid ${C.gold}`,
            boxShadow: '0 12px 30px -10px rgba(0,0,0,0.45)',
            zIndex: 100,
            maxWidth: '80vw',
            fontFamily: 'inherit',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
