'use client'

import StatusBadge from './StatusBadge'
import {
  evaluateRainIntensity,
  evaluateRainWindow,
  HAS_TENT_SIZE_DATA,
  STATUS_COLORS,
} from '@/lib/weather/thresholds'
import type { RainHourly } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_GOLD  = '#FFB800'
const C_TEXT  = 'rgba(255,255,255,0.92)'
const C_SUB   = 'rgba(255,255,255,0.55)'

interface Props {
  hourly: RainHourly[]
}

// Y-axis cap for the bar chart, in/hr. Anything above the heavy threshold
// (0.30) saturates to the cap so the chart stays legible.
const CHART_CAP_IN_HR = 0.40

export default function RainForecastCard({ hourly }: Props) {
  const overall  = evaluateRainWindow(hourly)
  const sameDayHourly = todayOnly(hourly)
  const display = sameDayHourly.length > 0 ? sameDayHourly : hourly.slice(0, 12)
  const peak    = display.reduce((m, h) => Math.max(m, h.intensityInHr), 0)

  return (
    <section
      aria-label="Rain forecast"
      style={{
        background: C_INK,
        borderRadius: 16,
        padding: '18px 18px 16px',
        color: C_TEXT,
        fontFamily: FONT_BODY,
      }}
    >
      <Header
        eyebrow="Rain"
        title={sameDayHourly.length > 0 ? 'Today, hourly' : 'Next 12 hours'}
        right={<StatusBadge level={overall.level} />}
      />

      <p style={{ margin: '8px 0 0', fontSize: 12, color: C_SUB, lineHeight: 1.4 }}>
        {overall.reason}
        {peak === 0 && ' — none in window'}
      </p>

      {/* Intensity bars */}
      <div style={{ marginTop: 14 }}>
        <Chart hourly={display} />
      </div>

      {/* Conservative-default callout (HAS_TENT_SIZE_DATA flag) */}
      {!HAS_TENT_SIZE_DATA && (
        <div
          style={{
            marginTop: 14,
            background: 'rgba(255,184,0,0.08)',
            border: `1px solid rgba(255,184,0,0.30)`,
            borderRadius: 10,
            padding: '8px 12px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: C_GOLD, letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10.5 }}>
            Conservative defaults
          </strong>
          {' '}— thresholds assume 30×40 or larger. Tent-size differentiation ships when TapGoods size data flows through (Phase 2B).
        </div>
      )}

      {/* Tier reference key */}
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <KeyRow label="Light"  range="< 0.10 in/hr"     level="clear"   note="Proceed" />
        <KeyRow label="Medium" range="0.10–0.30 in/hr" level="caution" note="Hold" />
        <KeyRow label="Heavy"  range="> 0.30 in/hr"     level="alert"   note="Stop tent work" />
      </div>
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

function Chart({ hourly }: { hourly: RainHourly[] }) {
  if (hourly.length === 0) {
    return <div style={{ fontSize: 12, color: C_SUB }}>No hourly forecast available.</div>
  }
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${hourly.length}, 1fr)`,
        alignItems: 'end',
        gap: 3,
        height: 64,
        padding: '0 2px',
      }}
      role="img"
      aria-label="Rain intensity bar chart"
    >
      {hourly.map((h) => {
        const status = evaluateRainIntensity(h.intensityInHr)
        const c      = STATUS_COLORS[status.level]
        const ratio  = Math.min(h.intensityInHr / CHART_CAP_IN_HR, 1)
        const heightPct = h.intensityInHr === 0 ? 4 : Math.max(8, ratio * 100)
        return (
          <div
            key={h.time}
            title={`${formatHour(h.time)} — ${h.intensityInHr.toFixed(2)} in/hr`}
            style={{
              height: `${heightPct}%`,
              background: h.intensityInHr === 0 ? 'rgba(255,255,255,0.10)' : c.dot,
              borderRadius: 3,
              minHeight: 2,
            }}
          />
        )
      })}
    </div>
  )
}

function KeyRow({ label, range, level, note }: { label: string; range: string; level: 'clear' | 'caution' | 'alert' | 'stop'; note: string }) {
  const c = STATUS_COLORS[level]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      <span style={{ fontWeight: 800, color: '#fff', minWidth: 56 }}>{label}</span>
      <span style={{ color: C_SUB }}>{range}</span>
      <span style={{ marginLeft: 'auto', color: c.text, fontWeight: 700 }}>{note}</span>
    </div>
  )
}

function todayOnly(hourly: RainHourly[]): RainHourly[] {
  if (hourly.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  return hourly.filter((h) => h.time.slice(0, 10) === today)
}

function formatHour(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleTimeString(undefined, { hour: 'numeric' })
}
