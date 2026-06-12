// Will Call module palette — the app's editorial tokens (StopDetailScreen /
// workOrders theme), not the mockup's raw hexes, so the screens feel native.
// Labels + state→color mapping follow the locked WillCallMockup.jsx
// (docs/design-references/).

import type { WillCallStatus } from './types'

export const WL = {
  blue:      '#0000FF',
  ink:       '#0A0B14',
  cream:     '#FFF9EE',
  paper:     '#FFFFFF',
  off:       '#F4F6FA',
  muted:     '#6B7488',
  gold:      '#FFB800',
  goldInk:   '#3a2a00',
  green:     '#1FBF6B',
  greenTint: '#e9f8ef',
  amber:     '#F5A623',
  amberTint: '#fdf2e3',
  red:       '#E5484D',
  redTint:   '#fdeced',
  line:      'rgba(10,11,20,0.10)',
} as const

export const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
export const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// Exact StatePill labels from the locked mockup.
export const STATE_PILL: Record<WillCallStatus, { label: string; bg: string; color: string }> = {
  pending:         { label: 'Needs Staging',  bg: '#f3f4f6',      color: WL.muted },
  staged:          { label: 'Staged — Ready', bg: '#eff0ff',      color: WL.blue  },
  picked_up:       { label: 'Out w/ Customer', bg: WL.amberTint,  color: WL.amber },
  awaiting_return: { label: 'Return Overdue', bg: WL.redTint,     color: WL.red   },
  returned:        { label: 'Returned ✓',     bg: WL.greenTint,   color: WL.green },
}
