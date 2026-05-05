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
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Phase-2 reservation flags ────────────────────────────────────────────────
// Slots stay in JSX so flipping to `true` is a one-line change once the
// backend is ready. While `false`, the slot renders as a designed stub.
const HAS_AVA = false

// ─── Inline icons — outline style, gold stroke, consistent weight ────────────
type IconProps = { size?: number; color?: string }
const STROKE_WIDTH = 2

function TentIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 20 L12 4 L21 20 Z"/>
      <line x1="12" y1="4"  x2="12" y2="20"/>
      <line x1="8.5" y1="20" x2="15.5" y2="20"/>
    </svg>
  )
}

function DanceFloorIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5"  y="3.5"  width="7" height="7" rx="1"/>
      <rect x="13.5" y="3.5"  width="7" height="7" rx="1"/>
      <rect x="3.5"  y="13.5" width="7" height="7" rx="1"/>
      <rect x="13.5" y="13.5" width="7" height="7" rx="1"/>
    </svg>
  )
}

function StageIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="9" width="18" height="6" rx="1"/>
      <line x1="6"  y1="15" x2="6"  y2="20"/>
      <line x1="18" y1="15" x2="18" y2="20"/>
    </svg>
  )
}

function ThermometerIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z"/>
      <line x1="12" y1="9" x2="12" y2="15"/>
    </svg>
  )
}

function BoltIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"/>
    </svg>
  )
}

function FlameIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2c0 4-5 5-5 11a5 5 0 0 0 10 0c0-4-3-6-5-11z"/>
    </svg>
  )
}

function DocIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8"  y1="13" x2="16" y2="13"/>
      <line x1="8"  y1="17" x2="13" y2="17"/>
    </svg>
  )
}

function CloudIcon({ size = 22, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 16H7a4 4 0 1 1 1-7.9A6 6 0 0 1 19 10a3 3 0 0 1-3 6z"/>
      <line x1="3"  y1="20" x2="9"  y2="20"/>
      <line x1="13" y1="20" x2="20" y2="20"/>
    </svg>
  )
}

// ─── Tool tile catalog ───────────────────────────────────────────────────────
type ToolTile = {
  id:    string
  name:  string
  sub:   string
  Icon:  (props: IconProps) => JSX.Element
}

const TOOLS: ToolTile[] = [
  { id: 'tenting',     name: 'Tenting',          sub: 'Calculators, diagrams, anchoring', Icon: TentIcon },
  { id: 'dance-floor', name: 'Dance Floor',      sub: 'Size calculator',                  Icon: DanceFloorIcon },
  { id: 'stage',       name: 'Stage',            sub: 'Stage size calculator',            Icon: StageIcon },
  { id: 'heat-air',    name: 'Heat & Air',       sub: 'Tent climate calculator',          Icon: ThermometerIcon },
  { id: 'power',       name: 'Power',            sub: 'Generator & power requirements', Icon: BoltIcon },
  { id: 'propane',     name: 'Propane',          sub: 'Heater usage calculator',      Icon: FlameIcon },
  { id: 'guides',      name: 'Equipment Guides', sub: 'Specs, setup, troubleshooting', Icon: DocIcon },
  { id: 'weather',     name: 'Weather & Wind',   sub: 'Live forecast by job site',    Icon: CloudIcon },
]

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ToolsScreen() {
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
            Field Utilities
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
          Tools.
        </div>

        {/* Sub-copy */}
        <div style={{
          marginTop: 12, position: 'relative',
          fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4,
          maxWidth: '32ch',
        }}>
          Field utilities for every job — sized for gloves, built for lots.
        </div>
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Tool tile grid */}
        <div style={{
          padding: '20px 18px 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}>
          {TOOLS.map((tool) => {
            const { Icon } = tool
            return (
              <button
                key={tool.id}
                onClick={() => showToast('Coming soon — this feature is in development.')}
                aria-label={`${tool.name} — coming soon`}
                style={{
                  background: C.ink,
                  border: 0, cursor: 'pointer',
                  borderRadius: 16,
                  padding: '16px 14px',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  position: 'relative',
                  minHeight: 152,
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  color: '#fff',
                }}
              >
                {/* gold accent dot top-right */}
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 12, right: 12,
                    width: 7, height: 7, borderRadius: '50%',
                    background: C.gold,
                  }}
                />

                {/* gold-bordered icon tile */}
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  border: `1.5px solid ${C.gold}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={22} color={C.gold}/>
                </div>

                {/* text block */}
                <div>
                  <div style={{
                    fontSize: 16, fontWeight: 800, color: '#fff',
                    fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                    lineHeight: 1.15,
                  }}>
                    {tool.name}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 11.5, color: 'rgba(255,255,255,0.55)',
                    lineHeight: 1.35,
                  }}>
                    {tool.sub}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Ask Ava chip — designed stub, centered */}
        <div style={{
          padding: '24px 18px 0',
          display: 'flex', justifyContent: 'center',
        }}>
          <button
            onClick={() => HAS_AVA
              ? showToast('Ava is thinking…')
              : showToast('Coming soon — this feature is in development.')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: C.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              padding: '6px 16px 6px 6px',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: C.ink,
              boxShadow: '0 6px 16px -8px rgba(10,11,20,0.18)',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.coral,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              fontSize: 14, fontWeight: 900,
              fontFamily: FONT_DISPLAY,
              lineHeight: 1,
            }}>
              +
            </span>
            <span style={{
              fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em',
            }}>
              Ask Ava to find a tool
            </span>
          </button>
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
