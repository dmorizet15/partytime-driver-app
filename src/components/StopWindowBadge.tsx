'use client'

// ─── StopWindowBadge ──────────────────────────────────────────────────────────
// Time-window constraint badge surfaced on the driver app (Phase 4 read-only).
// Compact amber pill rendered below the address on stop rows + stop detail.
// Driver app never writes constraint data — no confirm/dismiss controls.
//
// Visual tiers:
//   verified / inferred / manual  → solid amber background, ink text
//   suggested                     → dashed amber outline on cream, gold text

import { buildBadgeContent } from '@/lib/stopConstraints'
import type { Stop } from '@/types'

// Editorial Direction 03 tokens — match the rest of the driver app.
const TOKENS = {
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFEFC2',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

export type StopWindowBadgeSize = 'sm' | 'md'

interface Props {
  stop: Stop
  size?: StopWindowBadgeSize
  // Optional override — useful when callers (StopDetailScreen hero on the
  // blue band) need a light-on-dark variant.
  variant?: 'default' | 'on-dark'
}

export function StopWindowBadge({ stop, size = 'sm', variant = 'default' }: Props) {
  const content = buildBadgeContent(stop)
  if (!content) return null

  const { label, isHard } = content

  const pad = size === 'md' ? '4px 10px' : '3px 8px'
  const fontSize = size === 'md' ? 11.5 : 10.5
  const letter = size === 'md' ? '0.04em' : '0.06em'

  // Solid amber for hard tiers; dashed outline for suggested. The on-dark
  // variant lightens the surface so the badge still pops against blue.
  let bg: string
  let color: string
  let border: string

  if (isHard) {
    if (variant === 'on-dark') {
      bg = TOKENS.gold
      color = TOKENS.ink
      border = `1.5px solid ${TOKENS.ink}`
    } else {
      bg = TOKENS.goldSoft
      color = TOKENS.goldDeep
      border = `1.5px solid ${TOKENS.gold}`
    }
  } else {
    // Suggested — dashed outline, no fill.
    bg = variant === 'on-dark' ? 'rgba(255,184,0,0.12)' : 'transparent'
    color = variant === 'on-dark' ? TOKENS.gold : TOKENS.goldDeep
    border = `1.5px dashed ${TOKENS.gold}`
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        color,
        border,
        borderRadius: 999,
        padding: pad,
        fontSize,
        fontWeight: 800,
        letterSpacing: letter,
        fontFamily: FONT_DISPLAY,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <ClockIcon size={size === 'md' ? 12 : 11} color={color} />
      {label}
    </span>
  )
}

function ClockIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export default StopWindowBadge
