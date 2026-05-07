'use client'

import StatusBadge from './StatusBadge'
import {
  evaluateWindReading,
  HAS_ANCHORING_GUIDANCE,
  STATUS_COLORS,
  worstStatus,
} from '@/lib/weather/thresholds'
import type { ConditionStatus, WindDaily, WindHourly } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_GOLD  = '#FFB800'
const C_TEXT  = 'rgba(255,255,255,0.92)'
const C_SUB   = 'rgba(255,255,255,0.55)'

interface Props {
  hourly: WindHourly[]
  daily:  WindDaily[]
  onComingSoon: (msg: string) => void
}

export default function WindForecastCard({ hourly, daily, onComingSoon }: Props) {
  // Evaluate the two phases separately so the action message can distinguish
  // an install-only caution ("monitor") from an operating-band hold.
  const installCandidates: ConditionStatus[] = hourly.map((h) =>
    evaluateWindReading(h.sustainedMph, h.gustMph, 'install'),
  )
  const operatingCandidates: ConditionStatus[] = daily.map((d) =>
    evaluateWindReading(d.peakSustainedMph, d.peakGustMph, 'operating'),
  )
  const installWorst   = worstStatus(installCandidates)
  const operatingWorst = worstStatus(operatingCandidates)
  const overall =
    worstStatus([installWorst, operatingWorst].filter(Boolean) as ConditionStatus[])
    ?? { level: 'clear' as const, reason: 'No wind data available' }

  // Action message tied to the threshold state (LOCKED — May 6, 2026)
  const actionMessage =
    overall.level === 'stop'                ? 'Do not set up — contact dispatch' :
    operatingWorst?.level === 'caution'     ? 'Hold — do not begin setup until winds drop' :
    installWorst?.level   === 'caution'     ? 'Proceed with caution — monitor wind closely' :
                                              'Clear to set up'

  // Find the peak day across the 5-day window
  const peakDay = daily.reduce<WindDaily | null>(
    (peak, d) => (peak === null || d.peakGustMph > peak.peakGustMph ? d : peak),
    null,
  )

  return (
    <section
      aria-label="Wind forecast"
      style={{
        background: C_INK,
        borderRadius: 16,
        padding: '18px 18px 16px',
        color: C_TEXT,
        fontFamily: FONT_BODY,
      }}
    >
      <Header
        eyebrow="Wind"
        title="5-day forecast"
        right={<StatusBadge level={overall.level} />}
      />

      {/* Action message — keyed off the resolved threshold state */}
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: STATUS_COLORS[overall.level].bg,
          border: `1px solid ${STATUS_COLORS[overall.level].border}`,
          borderRadius: 10,
          color: STATUS_COLORS[overall.level].text,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '-0.005em',
          lineHeight: 1.3,
        }}
      >
        {actionMessage}
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {daily.length === 0 && (
          <div style={{ fontSize: 12, color: C_SUB }}>No daily forecast available.</div>
        )}
        {daily.map((d) => {
          const status = evaluateWindReading(d.peakSustainedMph, d.peakGustMph, 'operating')
          const isPeak = peakDay?.date === d.date && d.peakGustMph > 0
          return (
            <DayRow
              key={d.date}
              date={d.date}
              sustained={d.peakSustainedMph}
              gust={d.peakGustMph}
              level={status.level}
              isPeak={isPeak}
            />
          )
        })}
      </div>

      {/* Designed stub for Phase 2C — anchoring guidance */}
      {!HAS_ANCHORING_GUIDANCE && (
        <button
          type="button"
          onClick={() => onComingSoon('Anchoring guidance — coming in Phase 2C.')}
          style={{
            marginTop: 16,
            width: '100%',
            background: 'transparent',
            border: `1px dashed ${C_GOLD}`,
            borderRadius: 12,
            padding: '10px 12px',
            color: C_GOLD,
            fontFamily: 'inherit',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Anchoring guidance — coming soon
        </button>
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

function DayRow({ date, sustained, gust, level, isPeak }: {
  date: string; sustained: number; gust: number; level: 'clear' | 'caution' | 'alert' | 'stop'; isPeak: boolean
}) {
  const c = STATUS_COLORS[level]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '64px 1fr auto',
        alignItems: 'center',
        gap: 10,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: c.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {formatDayShort(date)}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
        Sust <strong style={{ color: '#fff' }}>{Math.round(sustained)}</strong> mph
        <span style={{ margin: '0 8px', opacity: 0.4 }}>•</span>
        Gust <strong style={{ color: '#fff' }}>{Math.round(gust)}</strong> mph
      </div>
      {isPeak ? (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.10em',
            background: '#FFB800',
            color: '#0A0B14',
            padding: '3px 7px',
            borderRadius: 999,
            textTransform: 'uppercase',
          }}
        >
          Peak
        </span>
      ) : <span />}
    </div>
  )
}

function formatDayShort(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  if (!y || !m || !d) return yyyyMmDd
  // Build a local-noon date so the displayed weekday matches the local day
  const dt = new Date(y, m - 1, d, 12)
  return dt.toLocaleDateString(undefined, { weekday: 'short' })
}
