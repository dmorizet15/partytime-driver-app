// ─── Weather Intelligence shared types ───────────────────────────────────────
// Vendor-agnostic surface. Callers consume `WeatherSnapshot` and never need
// to know which vendor backed which condition.

export type StatusLevel = 'clear' | 'caution' | 'alert' | 'stop'

export type Coordinates = {
  lat: number
  lng: number
}

export type LocationSource =
  | { kind: 'current' }
  | { kind: 'stop'; stopId: string; label: string }

// ─── Per-condition reading shapes ────────────────────────────────────────────

export interface CurrentConditions {
  temperatureF:        number
  humidityPct:         number
  windSpeedMph:        number
  windGustMph:         number
  precipitationInHr:   number
  observedAt:          string  // ISO
}

export interface WindHourly {
  time:         string  // ISO
  sustainedMph: number
  gustMph:      number
}

export interface WindDaily {
  date:            string  // YYYY-MM-DD
  peakSustainedMph: number
  peakGustMph:      number
}

export interface RainHourly {
  time:        string  // ISO
  intensityInHr: number
}

export interface SnowDaily {
  date:           string  // YYYY-MM-DD
  accumulationIn: number
}

export interface LightningAlert {
  id:        string
  event:     string  // "Severe Thunderstorm Warning" | "Tornado Warning"
  headline:  string
  expiresAt: string  // ISO
}

// ─── Aggregated snapshot ─────────────────────────────────────────────────────

export interface WeatherSnapshot {
  coordinates:     Coordinates
  current:         CurrentConditions
  windHourly:      WindHourly[]   // next ~24h
  windDaily:       WindDaily[]    // next 5d
  rainHourly:      RainHourly[]   // next ~24h
  snowDaily:       SnowDaily[]    // next 7d
  lightningAlerts: LightningAlert[]
  fetchedAt:       string         // ISO of when this snapshot was assembled
  stale:           boolean        // true when served from cache after a fetch error
}

// ─── Threshold evaluation results ────────────────────────────────────────────
// One result per badge. `reason` is a short, human-readable rationale the UI
// can surface so drivers don't have to guess why something is amber/red.

export interface ConditionStatus {
  level:  StatusLevel
  reason: string
}
