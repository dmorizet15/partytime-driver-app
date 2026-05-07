// ─── NWS Alerts adapter — server-side only ──────────────────────────────────
// US National Weather Service active alerts at a point.
// No API key required, but a descriptive User-Agent with a contact email is
// mandated by NWS terms of service.
//
// Endpoint: https://api.weather.gov/alerts/active?point={lat},{lng}

import type { LightningAlert } from '../types'

const ENDPOINT   = 'https://api.weather.gov/alerts/active'
const USER_AGENT = 'PartyTimeDriverApp (admin@partytimerentals.com)'

interface NwsFeature {
  id?:         string
  properties?: {
    event?:    string
    headline?: string
    expires?:  string
  }
}

interface NwsResponse {
  features?: NwsFeature[]
}

export async function fetchNwsAlerts(
  lat: number,
  lng: number,
): Promise<LightningAlert[]> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('point', `${lat},${lng}`)

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      'Accept':     'application/geo+json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`NWS HTTP ${res.status}: ${res.statusText}`)
  }

  const json = (await res.json()) as NwsResponse
  const features = json.features ?? []

  return features
    .map((f, i) => ({
      id:        f.id ?? `nws-${i}`,
      event:     f.properties?.event    ?? '',
      headline:  f.properties?.headline ?? '',
      expiresAt: f.properties?.expires  ?? '',
    }))
    .filter((a) => a.event.length > 0)
}
