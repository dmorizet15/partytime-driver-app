'use client'

import StatusBadge from './StatusBadge'
import { evaluateSnowWindow, STATUS_COLORS } from '@/lib/weather/thresholds'
import type { SnowDaily } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_GOLD  = '#FFB800'
const C_TEXT  = 'rgba(255,255,255,0.92)'
const C_SUB   = 'rgba(255,255,255,0.55)'
const C_CORAL = '#FF5A3C'   // matches the codebase's --pt-coral for the orange callout

interface Props {
  daily: SnowDaily[]
}

export default function SnowForecastCard({ daily }: Props) {
  const evalResult = evaluateSnowWindow(daily)

  return (
    <section
      aria-label="Snow forecast"
      style={{
        background: C_INK,
        borderRadius: 16,
        padding: '18px 18px 16px',
        color: C_TEXT,
        fontFamily: FONT_BODY,
      }}
    >
      <Header
        eyebrow="Snow"
        title="Rental window + 2 days"
        right={<StatusBadge level={evalResult.level} />}
      />

      <p style={{ margin: '8px 0 0', fontSize: 12, color: C_SUB, lineHeight: 1.4 }}>
        {evalResult.reason}
      </p>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {daily.length === 0 && (
          <div style={{ fontSize: 12, color: C_SUB }}>No daily forecast available.</div>
        )}
        {daily.map((d) => {
          const hasSnow = d.accumulationIn > 0
          const isHeavy = d.accumulationIn > 1.0
          const level   = isHeavy ? 'alert' : hasSnow ? 'caution' : 'clear'
          const c       = STATUS_COLORS[level]
          return (
            <div
              key={d.date}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px 1fr auto',
                alignItems: 'center',
                gap: 10,
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                padding: '8px 12px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: c.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {formatDayShort(d.date)}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                {hasSnow
                  ? <>Accum <strong style={{ color: '#fff' }}>{d.accumulationIn.toFixed(1)}&quot;</strong></>
                  : <span style={{ opacity: 0.55 }}>—</span>}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.text }}>
                {isHeavy ? 'SIGN-OFF' : hasSnow ? 'DISCUSS' : 'CLEAR'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Always-visible client discussion callout — does NOT collapse with the rest */}
      {evalResult.clientDiscussionRequired && (
        <div
          role="alert"
          style={{
            marginTop: 16,
            background: 'rgba(255,90,60,0.10)',
            border: `1.5px solid ${C_CORAL}`,
            borderRadius: 12,
            padding: '12px 14px',
            color: '#fff',
          }}
        >
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            color: C_CORAL, textTransform: 'uppercase',
          }}>
            Client discussion required
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.4 }}>
            {evalResult.signOffRequired
              ? <>Snow over 1&quot; forecast. <strong>No setup proceeds without explicit client sign-off and office approval.</strong></>
              : <>Snow forecast in the rental window. Contact the client and document the decision before crew dispatch.</>}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: C_SUB }}>
            Peak forecast: {evalResult.peakAccumulationIn.toFixed(1)}&quot;
          </div>
        </div>
      )}
    </section>
  )
}

function Header({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: C_GOLD, textTransform: 'uppercase' }}>
          {eyebrow}
        </div>
        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          {title}
        </div>
      </div>
      {right}
    </div>
  )
}

function formatDayShort(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  if (!y || !m || !d) return yyyyMmDd
  const dt = new Date(y, m - 1, d, 12)
  return dt.toLocaleDateString(undefined, { weekday: 'short' })
}
