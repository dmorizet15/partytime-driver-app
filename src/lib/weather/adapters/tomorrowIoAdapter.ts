// ─── Tomorrow.io adapter — server-side only ──────────────────────────────────
// Never import from a client component. The API key must not reach the browser.
//
// Endpoint: https://api.tomorrow.io/v4/weather/forecast
// Free tier: 500 calls/day, 25/hour. We log a warning at 80% of the daily
// budget; the counter is in-process only, so it resets on cold start.

import type {
  CurrentConditions,
  RainHourly,
  SnowDaily,
  WindDaily,
  WindHourly,
} from '../types'

const ENDPOINT      = 'https://api.tomorrow.io/v4/weather/forecast'
const DAILY_BUDGET  = 500
const WARN_AT_PCT   = 0.80

let dailyCallCount = 0
let countWindowDay = utcDayKey(Date.now())
let warnedThisWindow = false

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function bumpCallCounter(): void {
  const today = utcDayKey(Date.now())
  if (today !== countWindowDay) {
    countWindowDay   = today
    dailyCallCount   = 0
    warnedThisWindow = false
  }
  dailyCallCount += 1
  if (!warnedThisWindow && dailyCallCount >= DAILY_BUDGET * WARN_AT_PCT) {
    warnedThisWindow = true
    // eslint-disable-next-line no-console
    console.warn(
      `[Tomorrow.io] Approaching daily rate limit — ${dailyCallCount}/${DAILY_BUDGET} calls used today (${countWindowDay}).`
    )
  }
}

function getEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

// ─── Response shape we care about (subset) ───────────────────────────────────

interface TomorrowIoValues {
  temperature?:           number
  humidity?:              number
  windSpeed?:             number
  windSpeedAvg?:          number
  windSpeedMax?:          number
  windGust?:              number
  windGustMax?:           number
  precipitationIntensity?: number
  precipitationIntensityMax?: number
  snowAccumulation?:      number
  snowAccumulationSum?:   number
  snowAccumulationMax?:   number
  snowAccumulationAvg?:   number
}

interface TomorrowIoStep {
  time:   string
  values: TomorrowIoValues
}

interface TomorrowIoResponse {
  timelines?: {
    minutely?: TomorrowIoStep[]
    hourly?:   TomorrowIoStep[]
    daily?:    TomorrowIoStep[]
  }
}

export interface TomorrowIoSnapshot {
  current:    CurrentConditions
  windHourly: WindHourly[]
  windDaily:  WindDaily[]
  rainHourly: RainHourly[]
  snowDaily:  SnowDaily[]
}

// ─── Public ──────────────────────────────────────────────────────────────────

export async function fetchTomorrowIoForecast(
  lat: number,
  lng: number,
): Promise<TomorrowIoSnapshot> {
  const apiKey = getEnv('TOMORROW_IO_API_KEY')

  const url = new URL(ENDPOINT)
  url.searchParams.set('location', `${lat},${lng}`)
  url.searchParams.set('units', 'imperial')
  url.searchParams.set('apikey', apiKey)

  bumpCallCounter()

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: { 'Accept': 'application/json' },
    cache:   'no-store',
  })

  if (!res.ok) {
    throw new Error(`Tomorrow.io HTTP ${res.status}: ${res.statusText}`)
  }

  const json = (await res.json()) as TomorrowIoResponse
  return mapResponse(json)
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function mapResponse(json: TomorrowIoResponse): TomorrowIoSnapshot {
  const hourly = json.timelines?.hourly ?? []
  const daily  = json.timelines?.daily  ?? []

  // Current — first hourly bucket is the closest to "now"
  const first  = hourly[0]?.values ?? {}
  const firstT = hourly[0]?.time ?? new Date().toISOString()

  const current: CurrentConditions = {
    temperatureF:      numberOr(first.temperature, 0),
    humidityPct:       numberOr(first.humidity, 0),
    windSpeedMph:      numberOr(first.windSpeed, 0),
    windGustMph:       numberOr(first.windGust ?? first.windSpeed, 0),
    precipitationInHr: numberOr(first.precipitationIntensity, 0),
    observedAt:        firstT,
  }

  // Wind hourly — next 24h
  const windHourly: WindHourly[] = hourly.slice(0, 24).map((h) => ({
    time:         h.time,
    sustainedMph: numberOr(h.values.windSpeed, 0),
    gustMph:      numberOr(h.values.windGust ?? h.values.windSpeed, 0),
  }))

  // Wind daily — next 5d
  const windDaily: WindDaily[] = daily.slice(0, 5).map((d) => ({
    date:             d.time.slice(0, 10),
    peakSustainedMph: numberOr(d.values.windSpeedMax ?? d.values.windSpeedAvg ?? d.values.windSpeed, 0),
    peakGustMph:      numberOr(d.values.windGustMax ?? d.values.windGust ?? d.values.windSpeedMax, 0),
  }))

  // Rain hourly — next 24h
  const rainHourly: RainHourly[] = hourly.slice(0, 24).map((h) => ({
    time:          h.time,
    intensityInHr: numberOr(h.values.precipitationIntensity, 0),
  }))

  // Snow daily — next 7d. Prefer sum, then max, then avg, then 0.
  const snowDaily: SnowDaily[] = daily.slice(0, 7).map((d) => ({
    date:           d.time.slice(0, 10),
    accumulationIn: numberOr(
      d.values.snowAccumulationSum
        ?? d.values.snowAccumulationMax
        ?? d.values.snowAccumulationAvg
        ?? d.values.snowAccumulation,
      0,
    ),
  }))

  return { current, windHourly, windDaily, rainHourly, snowDaily }
}

function numberOr(v: number | undefined | null, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
