'use client'

import { useState } from 'react'
import { useStopWeather } from '@/hooks/useStopWeather'
import {
  evaluateLightning,
  evaluateRainWindow,
  evaluateSnowWindow,
  evaluateWindReading,
  evaluateWindWindow,
  STATUS_COLORS,
  worstStatus,
} from '@/lib/weather/thresholds'
import type { ConditionStatus, StatusLevel, WeatherSnapshot } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_TEXT  = 'rgba(255,255,255,0.92)'
const C_SUB   = 'rgba(255,255,255,0.55)'
const C_GOLD  = '#FFB800'

interface Props {
  lat: number
  lng: number
}

// Stop-level weather module — Phase 2B. Compact dark card sits above the
// Manifest section on Stop Detail. Visual language matches the standalone
// Tools weather screen so drivers recognize the same signals across surfaces.
//
// Behavior locked by Notion spec (Master Build Checklist Phase 2B):
//   - Wind always visible (even when collapsed).
//   - Snow client-discussion callout always visible if snow forecasted in
//     window, regardless of collapse state.
//   - Lightning STOP forces expanded view + replaces the wind summary with a
//     prominent stop banner (highest-priority signal).
//   - Auto-expand on any caution+ condition, snow forecasted, or lightning.
//   - Manual toggle only when collapsed-eligible (all-clear, no snow, no
//     lightning).
export default function StopWeatherModule({ lat, lng }: Props) {
  const { snapshot, loading, error } = useStopWeather(lat, lng)
  const [userExpanded, setUserExpanded] = useState(false)

  if (loading && !snapshot) return <SkeletonCard />
  if (error || !snapshot)   return null  // fail soft — never block Stop Detail

  const evals = evaluateAll(snapshot)
  const overallLevel = worstStatus([
    evals.wind,
    evals.rain,
    { level: evals.snow.level, reason: evals.snow.reason },
    evals.lightning,
  ])?.level ?? 'clear'

  const lightningStop = evals.lightning.level === 'stop'
  const hasSnowFlag   = evals.snow.clientDiscussionRequired
  const autoExpand    = lightningStop || hasSnowFlag || overallLevel !== 'clear'
  const expanded      = autoExpand || userExpanded

  return (
    <section
      aria-label="Stop weather"
      style={{
        margin: '20px 18px 0',
        background: C_INK,
        borderRadius: 16,
        padding: '14px 16px',
        color: C_TEXT,
        fontFamily: FONT_BODY,
      }}
    >
      {lightningStop ? (
        <LightningStopBanner reason={evals.lightning.reason} />
      ) : (
        <WindSummaryRow
          status={evals.wind}
          gustMph={Math.round(snapshot.current.windGustMph)}
          sustainedMph={Math.round(snapshot.current.windSpeedMph)}
          expanded={expanded}
          collapsibleEligible={!autoExpand}
          onToggle={() => setUserExpanded((v) => !v)}
        />
      )}

      {hasSnowFlag && (
        <SnowDiscussionCallout
          peakIn={evals.snow.peakAccumulationIn}
          signOff={evals.snow.signOffRequired}
        />
      )}

      {expanded && (
        <ExpandedDetail
          snapshot={snapshot}
          evals={evals}
          showWindRow={lightningStop /* we replaced the top row with the stop banner */}
        />
      )}
    </section>
  )
}

// ─── Top row: wind summary or lightning STOP ─────────────────────────────────

function WindSummaryRow({
  status,
  sustainedMph,
  gustMph,
  expanded,
  collapsibleEligible,
  onToggle,
}: {
  status:               ConditionStatus
  sustainedMph:         number
  gustMph:              number
  expanded:             boolean
  collapsibleEligible:  boolean
  onToggle:             () => void
}) {
  const c = STATUS_COLORS[status.level]
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!collapsibleEligible}
      aria-expanded={expanded}
      style={{
        all: 'unset',
        width:    '100%',
        display:  'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 12,
        cursor:   collapsibleEligible ? 'pointer' : 'default',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Eyebrow text="Wind" />
        <div style={{ marginTop: 2, fontSize: 14.5, fontWeight: 800, color: '#fff', letterSpacing: '-0.005em' }}>
          Sust <span style={{ fontFamily: FONT_DISPLAY }}>{sustainedMph}</span>
          <span style={{ opacity: 0.45, margin: '0 8px' }}>·</span>
          Gust <span style={{ fontFamily: FONT_DISPLAY }}>{gustMph}</span>
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: C_SUB }}>mph</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: c.text, fontWeight: 700, letterSpacing: '-0.005em' }}>
          {status.reason}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusPill level={status.level} />
        {collapsibleEligible && (
          <Chevron expanded={expanded} />
        )}
      </div>
    </button>
  )
}

function LightningStopBanner({ reason }: { reason: string }) {
  const c = STATUS_COLORS.stop
  return (
    <div
      role="alert"
      style={{
        background: c.bg,
        border:     `1.5px solid ${c.border}`,
        borderRadius: 12,
        padding:    '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: c.text, textTransform: 'uppercase' }}>
        ⚡ Lightning Hold
      </div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
        {reason}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: c.text, fontWeight: 700 }}>
        Do not set up — contact dispatch
      </div>
    </div>
  )
}

// ─── Always-visible snow callout ─────────────────────────────────────────────

function SnowDiscussionCallout({ peakIn, signOff }: { peakIn: number; signOff: boolean }) {
  const c = STATUS_COLORS[signOff ? 'alert' : 'caution']
  return (
    <div
      style={{
        marginTop: 12,
        background: c.bg,
        border:     `1px solid ${c.border}`,
        borderRadius: 10,
        padding:    '8px 12px',
        color:      c.text,
        fontSize:   12.5,
        fontWeight: 700,
        letterSpacing: '-0.005em',
        lineHeight: 1.3,
      }}
    >
      ❄ Snow {peakIn.toFixed(1)}&quot; forecast — {signOff ? 'client sign-off required' : 'discuss with client'}
    </div>
  )
}

// ─── Expanded detail (rain, snow, lightning summary, plus wind if hidden) ────

function ExpandedDetail({
  snapshot,
  evals,
  showWindRow,
}: {
  snapshot:    WeatherSnapshot
  evals:       AllEvals
  showWindRow: boolean
}) {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {showWindRow && (
        <DetailRow
          eyebrow="Wind"
          headline={`Sust ${Math.round(snapshot.current.windSpeedMph)} · Gust ${Math.round(snapshot.current.windGustMph)} mph`}
          status={evals.wind}
        />
      )}
      <DetailRow
        eyebrow="Rain"
        headline={describeRain(evals.rain, snapshot)}
        status={evals.rain}
      />
      <DetailRow
        eyebrow="Snow"
        headline={describeSnow(evals.snow.peakAccumulationIn)}
        status={{ level: evals.snow.level, reason: evals.snow.reason }}
      />
      <DetailRow
        eyebrow="Lightning"
        headline={evals.lightning.level === 'stop' ? 'Active warning' : 'No active alerts'}
        status={evals.lightning}
      />
    </div>
  )
}

function DetailRow({ eyebrow, headline, status }: { eyebrow: string; headline: string; status: ConditionStatus }) {
  const c = STATUS_COLORS[status.level]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 10,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '8px 12px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', color: c.text, textTransform: 'uppercase' }}>
          {eyebrow}
        </div>
        <div style={{ marginTop: 2, fontSize: 13, fontWeight: 800, color: '#fff', letterSpacing: '-0.005em' }}>
          {headline}
        </div>
        <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 600, color: c.text, lineHeight: 1.3 }}>
          {status.reason}
        </div>
      </div>
      <StatusPill level={status.level} />
    </div>
  )
}

// ─── Small primitives ────────────────────────────────────────────────────────

function StatusPill({ level }: { level: StatusLevel }) {
  const c = STATUS_COLORS[level]
  const label = level === 'clear' ? 'Clear' : level === 'caution' ? 'Caution' : level === 'alert' ? 'Alert' : 'Stop'
  return (
    <span
      style={{
        background: c.dot,
        color:      level === 'caution' ? '#0A0B14' : '#fff',
        padding:    '4px 9px',
        borderRadius: 999,
        fontSize:   10.5,
        fontWeight: 800,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  )
}

function Eyebrow({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.18em', color: C_GOLD, textTransform: 'uppercase' }}>
      {text}
    </div>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        transition: 'transform 120ms ease',
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        color: C_SUB,
        fontSize: 12,
      }}
    >
      ▾
    </span>
  )
}

function SkeletonCard() {
  return (
    <section
      aria-label="Stop weather (loading)"
      style={{
        margin: '20px 18px 0',
        background: C_INK,
        borderRadius: 16,
        padding: '14px 16px',
        color: C_SUB,
        fontFamily: FONT_BODY,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      Loading weather…
    </section>
  )
}

// ─── Eval orchestration ──────────────────────────────────────────────────────

interface AllEvals {
  wind:      ConditionStatus
  rain:      ConditionStatus
  snow:      ReturnType<typeof evaluateSnowWindow>
  lightning: ConditionStatus
}

function evaluateAll(snapshot: WeatherSnapshot): AllEvals {
  // Wind: prefer the window-level evaluator (looks at hourly + daily). For
  // the summary row we rely on its overall level + reason; the current-reading
  // numbers shown in the row come straight from snapshot.current so the driver
  // sees "right now" at a glance without arithmetic.
  const wind      = evaluateWindWindow(snapshot.windHourly, snapshot.windDaily, 'install')
  const rain      = evaluateRainWindow(snapshot.rainHourly)
  const snow      = evaluateSnowWindow(snapshot.snowDaily)
  const lightning = evaluateLightning(snapshot.lightningAlerts)
  void evaluateWindReading // silence unused-import lint if tree-shake misses
  return { wind, rain, snow, lightning }
}

function describeRain(_status: ConditionStatus, snapshot: WeatherSnapshot): string {
  const peak = snapshot.rainHourly.reduce((max, h) => Math.max(max, h.intensityInHr), 0)
  if (peak <= 0) return 'No rain forecast'
  return `Peak ${peak.toFixed(2)} in/hr`
}

function describeSnow(peakIn: number): string {
  if (peakIn <= 0) return 'No snow forecast'
  return `${peakIn.toFixed(1)}" forecast`
}
