import { supabase } from '@/lib/supabase'

// Google Calendar sync — self-serve connect / on-off / disconnect.
//
// All four calls are CROSS-APP to the dashboard's /api/calendar-sync/* routes,
// authenticated with the driver's supabase access token as a Bearer (same pattern
// as src/lib/willCall/api.ts + /api/work-orders — the dashboard is a different
// origin, so cookies can't reach it). The dashboard owns the Google grant + the
// refresh token; nothing sensitive touches this client.
//
//   fetchCalendarConnection()   GET    → connected / not_connected / no_wiw_link
//   startCalendarConnect(path)  POST   → { authUrl } to navigate to for consent
//   setCalendarSyncEnabled(on)  PATCH  → toggle sync on/off
//   disconnectCalendar()        DELETE → remove the grant

export interface CalendarConnectionStatus {
  wiw_user_id: number
  google_email: string
  google_calendar_id: string
  enabled: boolean
  connected_at: string
  updated_at: string
  last_error: string | null
}

// Discriminated result of a status read. `no_wiw_link` = the driver's profile
// isn't linked to a WhenIWork user yet (an admin links it once) — surfaced as a
// distinct, non-error state so the UI can explain it rather than showing a failure.
export type ConnectionState =
  | { kind: 'connected'; status: CalendarConnectionStatus }
  | { kind: 'not_connected' }
  | { kind: 'no_wiw_link' }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function dashboardOrigin(): string {
  const v = process.env.NEXT_PUBLIC_DASHBOARD_URL
  if (!v) {
    throw new Error(
      'NEXT_PUBLIC_DASHBOARD_URL is not configured. Add it to .env.local ' +
      'and to the driver-app Vercel env vars.',
    )
  }
  return v.replace(/\/$/, '')
}

async function bearer(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not signed in.')
  return token
}

export async function fetchCalendarConnection(): Promise<ConnectionState> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/calendar-sync/connections`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const json: unknown = await res.json().catch(() => null)

  if (res.status === 400 && isObj(json) && json.error === 'no_wiw_link') {
    return { kind: 'no_wiw_link' }
  }
  if (!res.ok) {
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Couldn’t load calendar sync status (HTTP ${res.status}).`
    throw new Error(msg)
  }
  if (isObj(json) && json.connected && isObj(json.status)) {
    return { kind: 'connected', status: json.status as unknown as CalendarConnectionStatus }
  }
  return { kind: 'not_connected' }
}

// Returns the Google consent URL to navigate the browser to. The dashboard signs
// the caller's identity + return target into the OAuth state, so after consent the
// callback bounces back to `${returnPath}?calendar_sync=connected|error&reason=…`.
export async function startCalendarConnect(returnPath: string): Promise<string> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/calendar-sync/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ return: returnPath }),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok || !isObj(json) || typeof json.authUrl !== 'string') {
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Couldn’t start Google connect (HTTP ${res.status}).`
    throw new Error(msg)
  }
  return json.authUrl
}

export async function setCalendarSyncEnabled(enabled: boolean): Promise<CalendarConnectionStatus | null> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/calendar-sync/connections`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enabled }),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Couldn’t update calendar sync (HTTP ${res.status}).`
    throw new Error(msg)
  }
  return isObj(json) && isObj(json.status)
    ? (json.status as unknown as CalendarConnectionStatus)
    : null
}

export async function disconnectCalendar(): Promise<void> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/calendar-sync/connections`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null)
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Couldn’t disconnect calendar (HTTP ${res.status}).`
    throw new Error(msg)
  }
}
