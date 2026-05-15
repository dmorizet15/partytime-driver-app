'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'

// ─── Direction 03 (Editorial) tokens — match ToolsScreen / WeatherScreen ─────
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  cream: '#FFF9EE',
  gold:  '#FFB800',
  paper: '#FFFFFF',
  muted: '#6B7488',
  hair:  'rgba(10,11,20,0.08)',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

type Shape = 'rectangular' | 'square'

// Parse a free-typed dimension input. Empty / non-numeric / non-positive
// values return null so the output card stays hidden.
function parseDim(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function formatFeetInches(diagonalFeet: number): string {
  const totalInches = diagonalFeet * 12
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches % 12)
  // Carry inches=12 back into feet (rounding edge case at 11.5+ inches).
  if (inches === 12) return `${feet + 1}' 0"`
  return `${feet}' ${inches}"`
}

export default function TentSquaringScreen() {
  const router = useRouter()
  const [shape,  setShape]  = useState<Shape>('rectangular')
  const [length, setLength] = useState<string>('')
  const [width,  setWidth]  = useState<string>('')

  // In square mode, width mirrors length and the field is locked.
  const effectiveWidth = shape === 'square' ? length : width

  const lengthNum = useMemo(() => parseDim(length), [length])
  const widthNum  = useMemo(() => parseDim(effectiveWidth), [effectiveWidth])

  const diagonalFeet =
    lengthNum !== null && widthNum !== null
      ? Math.sqrt(lengthNum * lengthNum + widthNum * widthNum)
      : null

  const diagonalLabel = diagonalFeet !== null ? formatFeetInches(diagonalFeet) : null

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          background: C.blue,
          color: '#fff',
          padding: '24px 22px 22px',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => router.push('/tools')}
            aria-label="Back to Tools"
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: '#fff',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: 0,
            }}
          >
            ← Tools
          </button>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.24em',
              color: C.gold,
              textTransform: 'uppercase',
            }}
          >
            Tenting
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            fontFamily: FONT_DISPLAY,
            fontSize: 32,
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            color: '#fff',
          }}
        >
          Tent Squaring Calculator
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            color: 'rgba(255,255,255,0.80)',
            lineHeight: 1.4,
            maxWidth: '36ch',
          }}
        >
          Enter your tent dimensions to get the diagonal — the corner-to-corner
          measurement that confirms a true square setup.
        </div>
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 18px 24px' }}>
        {/* Shape toggle */}
        <div
          role="tablist"
          aria-label="Tent shape"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            background: C.paper,
            padding: 6,
            borderRadius: 12,
            border: `1px solid ${C.hair}`,
            boxShadow: '0 4px 12px -8px rgba(10,11,20,0.10)',
          }}
        >
          {(['rectangular', 'square'] as Shape[]).map((s) => {
            const active = shape === s
            return (
              <button
                key={s}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => {
                  setShape(s)
                  // When switching into square mode, mirror length into width
                  // so the locked field renders the right value immediately.
                  if (s === 'square') setWidth(length)
                }}
                style={{
                  background: active ? C.ink : 'transparent',
                  color: active ? '#fff' : C.ink,
                  border: 0,
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '-0.005em',
                  cursor: 'pointer',
                  transition: 'background 120ms ease, color 120ms ease',
                }}
              >
                {s === 'rectangular' ? 'Rectangular' : 'Square'}
              </button>
            )
          })}
        </div>

        {/* Length / Width inputs */}
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <DimField
            id="tent-length"
            label="Length (ft)"
            value={length}
            onChange={setLength}
            locked={false}
            placeholder="e.g. 40"
          />
          <DimField
            id="tent-width"
            label="Width (ft)"
            value={effectiveWidth}
            onChange={setWidth}
            locked={shape === 'square'}
            placeholder="e.g. 20"
          />
        </div>

        {/* Output card */}
        {diagonalLabel && (
          <div
            style={{
              marginTop: 20,
              background: C.paper,
              border: `1px solid ${C.hair}`,
              borderRadius: 16,
              padding: '20px 18px',
              boxShadow: '0 8px 24px -16px rgba(10,11,20,0.18)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.18em',
                color: C.muted,
                textTransform: 'uppercase',
              }}
            >
              Diagonal
            </div>
            <div
              style={{
                marginTop: 10,
                fontFamily: FONT_DISPLAY,
                fontSize: 52,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: '-0.03em',
                color: C.ink,
              }}
            >
              {diagonalLabel}
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 13,
                lineHeight: 1.45,
                color: C.muted,
                maxWidth: '34ch',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Measure corner to corner — if it matches, your tent is square.
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

// ─── DimField ────────────────────────────────────────────────────────────────
// Numeric dimension input. Locked variant grays out and disables the field
// while still showing the mirrored value.

type DimFieldProps = {
  id:          string
  label:       string
  value:       string
  onChange:    (next: string) => void
  locked:      boolean
  placeholder: string
}

function DimField({ id, label, value, onChange, locked, placeholder }: DimFieldProps) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: locked ? 0.55 : 1,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.14em',
          color: C.ink,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        disabled={locked}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: locked ? 'rgba(10,11,20,0.04)' : C.paper,
          color: C.ink,
          border: `1px solid ${C.hair}`,
          borderRadius: 10,
          padding: '12px 14px',
          fontFamily: 'inherit',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          width: '100%',
          boxSizing: 'border-box',
          cursor: locked ? 'not-allowed' : 'text',
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      />
    </label>
  )
}
