'use client'

import type { CurrentConditions } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_GOLD  = '#FFB800'
const C_TEXT  = 'rgba(255,255,255,0.92)'
const C_SUB   = 'rgba(255,255,255,0.55)'

interface Props {
  current:   CurrentConditions
  locationLabel: string
}

export default function CurrentConditionsCard({ current, locationLabel }: Props) {
  return (
    <section
      aria-label="Current conditions"
      style={{
        background:   C_INK,
        borderRadius: 16,
        padding:      '18px 18px 16px',
        color:        C_TEXT,
        fontFamily:   FONT_BODY,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: C_GOLD, textTransform: 'uppercase' }}>
          Right now
        </div>
        <div style={{ fontSize: 11, color: C_SUB, fontWeight: 600, maxWidth: '60%', textAlign: 'right', lineHeight: 1.2 }}>
          {locationLabel}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14 }}>
        <div>
          <div style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 56, fontWeight: 900, lineHeight: 0.95,
            color: '#fff', letterSpacing: '-0.03em',
          }}>
            {Math.round(current.temperatureF)}°
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C_SUB }}>
            {Math.round(current.humidityPct)}% humidity
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <Stat label="Wind"       value={`${Math.round(current.windSpeedMph)} mph`} />
          <Stat label="Gusts"      value={`${Math.round(current.windGustMph)} mph`} />
          <Stat label="Rain"       value={`${current.precipitationInHr.toFixed(2)} in/hr`} />
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: C_SUB, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: '#fff', fontWeight: 700 }}>
        {value}
      </span>
    </div>
  )
}
