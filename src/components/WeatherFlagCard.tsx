'use client'

import { useMemo } from 'react'
import type { Stop } from '@/types'
import { useStopWeather } from '@/hooks/useStopWeather'
import {
  evaluateWindWindow,
  evaluateRainWindow,
  evaluateSnowWindow,
  worstStatus,
} from '@/lib/weather/thresholds'

// Static-summary card on Home — surfaces a weather flag for the day when
// the first delivery stop's forecast shows ≥caution wind, rain, or snow.
// Renders nothing on a clean forecast (typical case), so the slot is
// invisible on most days. Same threshold evaluators the rest of the app
// uses; no parallel logic.

const C = {
  cardBg:    '#FFF3D6',  // soft amber to read as "heads up", not "danger"
  cardBgRed: '#FDE0DC',  // alert/stop tier
  border:    '#FFB800',
  borderRed: '#F87171',
  ink:       '#0A0B14',
  deepGold:  '#7A5A00',
  deepRed:   '#7A1A1A',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface WeatherFlagCardProps {
  dayStops: Stop[]
}

export default function WeatherFlagCard({ dayStops }: WeatherFlagCardProps) {
  const firstDelivery = useMemo(
    () => dayStops.find(
      (s) => s.stop_type === 'delivery'
          && typeof s.latitude  === 'number'
          && typeof s.longitude === 'number'
    ),
    [dayStops]
  )

  const { snapshot, loading, error } = useStopWeather(
    firstDelivery?.latitude,
    firstDelivery?.longitude,
  )

  // No first delivery stop (pickup-only day) → no card.
  if (!firstDelivery)         return null
  // Defensive: a loading or errored fetch hides the card rather than flashing
  // a stale or empty state. Weather is a "heads up" surface, not a critical
  // gate — silence is fine when we can't be sure.
  if (loading || error)       return null
  if (!snapshot)              return null

  const wind  = evaluateWindWindow(snapshot.windHourly, snapshot.windDaily, 'install')
  const rain  = evaluateRainWindow(snapshot.rainHourly)
  const snow  = evaluateSnowWindow(snapshot.snowDaily)
  const worst = worstStatus([wind, rain, snow])

  // Only surface caution and above. Clear forecast → no card, no real estate.
  if (!worst || worst.level === 'clear') return null

  const isAlertOrStop = worst.level === 'alert' || worst.level === 'stop'
  const headline = headlineFor({ wind, rain, snow })

  return (
    <div style={{ padding: '12px 18px 0' }}>
      <div
        role="status"
        style={{
          background: isAlertOrStop ? C.cardBgRed : C.cardBg,
          border: `1.5px solid ${isAlertOrStop ? C.borderRed : C.border}`,
          borderRadius: 18,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: isAlertOrStop
            ? '0 14px 28px -16px rgba(248,113,113,0.45)'
            : '0 14px 28px -16px rgba(255,184,0,0.45)',
        }}
      >
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: isAlertOrStop ? C.borderRed : C.border,
          border: `2px solid ${C.ink}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 20,
        }}>
          {/* simple emoji glyph keeps this lightweight; no new svg asset */}
          {snow.level !== 'clear' ? '❄' : rain.level !== 'clear' ? '🌧' : '💨'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
            color: isAlertOrStop ? C.deepRed : C.deepGold,
            textTransform: 'uppercase',
          }}>
            Weather Heads-Up
          </div>
          <div style={{
            marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
            fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
          }}>
            {headline}
          </div>
          <div style={{
            marginTop: 2, fontSize: 12.5, lineHeight: 1.3,
            color: isAlertOrStop ? C.deepRed : C.deepGold,
          }}>
            {worst.reason}
          </div>
        </div>
      </div>
    </div>
  )
}

// Pick the strongest contributor to title the card. Same severity logic as
// `worstStatus`; falls back to wind if everything ties at clear (won't happen
// because the caller has already filtered out the all-clear case).
function headlineFor(parts: {
  wind: { level: string }
  rain: { level: string }
  snow: { level: string }
}): string {
  const severity: Record<string, number> = { clear: 0, caution: 1, alert: 2, stop: 3 }
  const ranked = [
    { key: 'snow', level: severity[parts.snow.level] ?? 0, label: 'Snow in the forecast' },
    { key: 'rain', level: severity[parts.rain.level] ?? 0, label: 'Rain in the forecast' },
    { key: 'wind', level: severity[parts.wind.level] ?? 0, label: 'High wind in the forecast' },
  ].sort((a, b) => b.level - a.level)
  return ranked[0].label
}
