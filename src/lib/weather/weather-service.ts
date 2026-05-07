// ─── WeatherService — single facade over Tomorrow.io + NWS ───────────────────
// Callers consume `getWeatherSnapshot(lat, lng)` and never need to know which
// vendor backed which condition. Server-side only.
//
// Behavior:
//  1. Fresh cache hit (<15min) → returned immediately, no network calls.
//  2. Otherwise: parallel fetch (Tomorrow.io + NWS), merge into snapshot,
//     cache it, return it.
//  3. Adapter failure: serve last-known cached snapshot (any age) with
//     `stale: true`. Only throws if both adapters fail AND we have no
//     prior cached data.

import { getAnyCached, getCached, setCached } from './cache'
import { fetchNwsAlerts } from './adapters/nwsAlertsAdapter'
import { fetchTomorrowIoForecast } from './adapters/tomorrowIoAdapter'
import type { Coordinates, WeatherSnapshot } from './types'

export async function getWeatherSnapshot(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const fresh = getCached(lat, lng)
  if (fresh) return fresh

  const [forecastResult, alertsResult] = await Promise.allSettled([
    fetchTomorrowIoForecast(lat, lng),
    fetchNwsAlerts(lat, lng),
  ])

  const stale = getAnyCached(lat, lng)

  // If the forecast call failed, we cannot assemble a fresh snapshot. Serve
  // last-known data with stale=true, or surface the error if there's nothing.
  if (forecastResult.status === 'rejected') {
    if (stale) {
      // eslint-disable-next-line no-console
      console.warn('[WeatherService] Tomorrow.io fetch failed; serving stale cache.', forecastResult.reason)
      return { ...stale, stale: true }
    }
    throw new Error(
      `Weather fetch failed and no cached data available: ${describeReason(forecastResult.reason)}`
    )
  }

  // NWS failure is non-fatal — degrade lightning to "no alerts" rather than
  // blocking the whole snapshot. Forecast cards are still useful.
  const lightningAlerts =
    alertsResult.status === 'fulfilled'
      ? alertsResult.value
      : (logNwsFailure(alertsResult.reason), [])

  const coordinates: Coordinates = { lat, lng }
  const snapshot: WeatherSnapshot = {
    coordinates,
    current:         forecastResult.value.current,
    windHourly:      forecastResult.value.windHourly,
    windDaily:       forecastResult.value.windDaily,
    rainHourly:      forecastResult.value.rainHourly,
    snowDaily:       forecastResult.value.snowDaily,
    lightningAlerts,
    fetchedAt:       new Date().toISOString(),
    stale:           false,
  }

  setCached(lat, lng, snapshot)
  return snapshot
}

function logNwsFailure(reason: unknown): void {
  // eslint-disable-next-line no-console
  console.warn('[WeatherService] NWS alerts fetch failed; treating as no active alerts.', describeReason(reason))
}

function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  return String(reason)
}
