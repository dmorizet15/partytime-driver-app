// ─── PTR Weather Thresholds — LOCKED (May 5, 2026) ───────────────────────────
// Source of truth: Notion "Feature Architecture — Weather Intelligence".
// Do NOT modify thresholds here without updating Notion first.
//
// All evaluators are pure functions of their inputs so they can be unit-tested
// once a test framework is wired in.

import type {
  ConditionStatus,
  LightningAlert,
  RainHourly,
  SnowDaily,
  StatusLevel,
  WindDaily,
  WindHourly,
} from './types'

// ─── Locked status color spec ────────────────────────────────────────────────
// Designed for dark card surfaces. Used by every weather badge.

export const STATUS_COLORS: Record<
  StatusLevel,
  { text: string; dot: string; bg: string; border: string }
> = {
  clear:   { text: '#4ADE80', dot: '#22C55E', bg: '#0A2A0A', border: '#1A5C1A' },
  caution: { text: '#FBBF24', dot: '#F59E0B', bg: '#2A200A', border: '#5C400A' },
  alert:   { text: '#F87171', dot: '#EF4444', bg: '#2A0A0A', border: '#5C1A1A' },
  stop:    { text: '#FF4444', dot: '#FF0000', bg: '#2A0000', border: '#7F0000' },
}

// ─── Phase-2A feature flags (Designed Stubs Pattern) ─────────────────────────
// Flip when the supporting feature lands.
export const HAS_TENT_SIZE_DATA     = false  // TapGoods size → stop record
export const HAS_ANCHORING_GUIDANCE = false  // Phase 2C content layer
export const HAS_STOP_LEVEL_BADGES  = false  // Phase 2B integration

// ─── Wind ────────────────────────────────────────────────────────────────────
// Watch window: install + use + pickup + 2 days. Highest severity across the
// window wins. Phase context drives caution thresholds:
//   Install:  sustained > 13  OR  gusts > 18  → caution
//   Operating: sustained 20–34 → caution, sustained 35+ → stop
//   Universal: gusts 35+ → stop, period
//
// On the standalone Tools screen (no specific install/event time), we use
// "operating" thresholds for forecast days and "install" for the current
// reading — conservative assumption matching the in-the-field default.

export type WindPhase = 'install' | 'operating'

export function evaluateWindReading(
  sustainedMph: number,
  gustMph: number,
  phase: WindPhase,
): ConditionStatus {
  // Universal gust stop — overrides phase
  if (gustMph >= 35) {
    return { level: 'stop', reason: `Gusts ${Math.round(gustMph)} mph — STOP` }
  }

  if (phase === 'operating') {
    if (sustainedMph >= 35) {
      return { level: 'stop', reason: `Sustained ${Math.round(sustainedMph)} mph — STOP` }
    }
    if (sustainedMph >= 20) {
      return { level: 'caution', reason: `Sustained ${Math.round(sustainedMph)} mph — hold zone` }
    }
    return { level: 'clear', reason: `Sustained ${Math.round(sustainedMph)} mph` }
  }

  // install phase — stricter
  if (sustainedMph > 13 || gustMph > 18) {
    return {
      level: 'caution',
      reason: `Install: sustained ${Math.round(sustainedMph)} / gusts ${Math.round(gustMph)} mph`,
    }
  }
  return { level: 'clear', reason: `Sustained ${Math.round(sustainedMph)} / gusts ${Math.round(gustMph)} mph` }
}

export function evaluateWindWindow(
  hourly: WindHourly[],
  daily: WindDaily[],
  currentPhase: WindPhase = 'install',
): ConditionStatus {
  // Look at next ~24h via hourly with the chosen phase, plus the daily peaks
  // across the watch window with operating-phase thresholds.
  const candidates: ConditionStatus[] = []

  for (const h of hourly) {
    candidates.push(evaluateWindReading(h.sustainedMph, h.gustMph, currentPhase))
  }
  for (const d of daily) {
    candidates.push(evaluateWindReading(d.peakSustainedMph, d.peakGustMph, 'operating'))
  }

  return worstStatus(candidates) ?? {
    level: 'clear',
    reason: 'No wind data available',
  }
}

// ─── Rain (30x40+ conservative defaults until tent size flows) ───────────────
//   Light  < 0.10 in/hr → proceed
//   Medium 0.10–0.30 in/hr → HOLD
//   Heavy  > 0.30 in/hr → HOLD (treated as alert vs caution at the upper band)

export function evaluateRainIntensity(intensityInHr: number): ConditionStatus {
  if (intensityInHr > 0.30) {
    return { level: 'alert', reason: `Heavy rain ${intensityInHr.toFixed(2)} in/hr — hold all tent work` }
  }
  if (intensityInHr >= 0.10) {
    return { level: 'caution', reason: `Medium rain ${intensityInHr.toFixed(2)} in/hr — hold` }
  }
  if (intensityInHr > 0) {
    return { level: 'clear', reason: `Light rain ${intensityInHr.toFixed(2)} in/hr — proceed` }
  }
  return { level: 'clear', reason: 'No rain' }
}

export function evaluateRainWindow(hourly: RainHourly[]): ConditionStatus {
  if (hourly.length === 0) {
    return { level: 'clear', reason: 'No rain forecast data' }
  }
  const peak = hourly.reduce((max, h) => Math.max(max, h.intensityInHr), 0)
  return evaluateRainIntensity(peak)
}

// ─── Snow ────────────────────────────────────────────────────────────────────
// ANY forecasted snow in window → client discussion flag (caution).
// > 1 inch accumulation any day → alert (client sign-off required).

export interface SnowEvaluation extends ConditionStatus {
  clientDiscussionRequired: boolean
  signOffRequired:          boolean
  peakAccumulationIn:       number
}

export function evaluateSnowWindow(daily: SnowDaily[]): SnowEvaluation {
  const peak = daily.reduce((max, d) => Math.max(max, d.accumulationIn), 0)
  if (peak > 1.0) {
    return {
      level: 'alert',
      reason: `Snow ${peak.toFixed(1)}" forecast — client sign-off required`,
      clientDiscussionRequired: true,
      signOffRequired:          true,
      peakAccumulationIn:       peak,
    }
  }
  if (peak > 0) {
    return {
      level: 'caution',
      reason: `Snow ${peak.toFixed(1)}" forecast — discuss with client`,
      clientDiscussionRequired: true,
      signOffRequired:          false,
      peakAccumulationIn:       peak,
    }
  }
  return {
    level: 'clear',
    reason: 'No snow forecast',
    clientDiscussionRequired: false,
    signOffRequired:          false,
    peakAccumulationIn:       0,
  }
}

// ─── Lightning ───────────────────────────────────────────────────────────────
// Any active NWS Severe Thunderstorm or Tornado Warning overlapping our point
// = STOP. Highest priority signal.

const LIGHTNING_EVENTS = new Set([
  'Severe Thunderstorm Warning',
  'Tornado Warning',
])

export function evaluateLightning(alerts: LightningAlert[]): ConditionStatus {
  const matches = alerts.filter((a) => LIGHTNING_EVENTS.has(a.event))
  if (matches.length === 0) {
    return { level: 'clear', reason: 'No active lightning alerts' }
  }
  // Single, prioritized message — list the event types involved
  const types = Array.from(new Set(matches.map((m) => m.event))).join(' + ')
  return { level: 'stop', reason: `${types} — STOP` }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY: Record<StatusLevel, number> = {
  clear: 0, caution: 1, alert: 2, stop: 3,
}

export function worstStatus(items: ConditionStatus[]): ConditionStatus | null {
  if (items.length === 0) return null
  return items.reduce((worst, current) =>
    SEVERITY[current.level] > SEVERITY[worst.level] ? current : worst
  )
}
