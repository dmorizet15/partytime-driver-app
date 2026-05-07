'use client'

import { STATUS_COLORS } from '@/lib/weather/thresholds'
import type { StatusLevel } from '@/lib/weather/types'

const FONT_BODY = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const LABEL: Record<StatusLevel, string> = {
  clear:   'CLEAR',
  caution: 'CAUTION',
  alert:   'ALERT',
  stop:    'STOP',
}

interface Props {
  level:    StatusLevel
  label?:   string         // override (default = LABEL[level])
  value?:   string         // optional value text after the label, e.g. "12 mph"
  size?:    'sm' | 'md'
}

export default function StatusBadge({ level, label, value, size = 'md' }: Props) {
  const c = STATUS_COLORS[level]
  const animated = level !== 'clear'

  const padY = size === 'sm' ? 4 : 6
  const padX = size === 'sm' ? 8 : 12
  const fontSize = size === 'sm' ? 10 : 11.5
  const dotSize  = size === 'sm' ? 7 : 9

  return (
    <span
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            8,
        padding:        `${padY}px ${padX}px`,
        background:     c.bg,
        border:         `1px solid ${c.border}`,
        borderRadius:   999,
        color:          c.text,
        fontSize,
        fontWeight:     800,
        letterSpacing:  '0.08em',
        fontFamily:     FONT_BODY,
        textTransform:  'uppercase',
        lineHeight:     1,
      }}
    >
      <span
        aria-hidden="true"
        className={animated ? 'ptr-pulse-dot' : undefined}
        style={{
          width:        dotSize,
          height:       dotSize,
          borderRadius: '50%',
          background:   c.dot,
          flexShrink:   0,
          display:      'inline-block',
        }}
      />
      <span>{label ?? LABEL[level]}</span>
      {value && (
        <span style={{ fontWeight: 700, opacity: 0.95, letterSpacing: '0.04em' }}>
          {value}
        </span>
      )}
    </span>
  )
}
