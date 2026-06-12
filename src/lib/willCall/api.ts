import { supabase } from '@/lib/supabase'
import { parseItems, type WillCallOrder } from './types'

// Will Call data layer.
//
// READS go through the driver app's own GET /api/will-call (cookie session +
// will_call role gate; admin-client read server-side — no RLS policy change,
// no realtime subscription; the screen refetches on focus + a 30s interval).
//
// WRITES (stage / pickup / return) cross-app POST to the dashboard's
// /api/willcall/[id]/* routes with the supabase access token, same pattern as
// /api/work-orders — the dashboard owns the SMS + email side effects, so we
// never shortcut to a direct supabase write or call partytime-sms ourselves.

function dashboardOrigin(): string {
  const v = process.env.NEXT_PUBLIC_DASHBOARD_URL
  if (!v) {
    throw new Error(
      'NEXT_PUBLIC_DASHBOARD_URL is not configured. Add it to .env.local ' +
      'and to the driver-app Vercel env vars.'
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

export async function fetchWillCallOrders(): Promise<WillCallOrder[]> {
  const res = await fetch('/api/will-call', { cache: 'no-store' })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Failed to load Will Call orders (HTTP ${res.status}).`
    throw new Error(msg)
  }
  const rows = isObj(json) && Array.isArray(json.orders) ? json.orders : []
  return rows.map((r) => ({
    ...(r as WillCallOrder),
    items: parseItems((r as { items?: unknown }).items),
  }))
}

async function postAction(id: string, action: 'stage' | 'pickup' | 'return', body?: object): Promise<void> {
  const token = await bearer()
  const res = await fetch(`${dashboardOrigin()}/api/willcall/${id}/${action}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  })
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null)
    const msg = isObj(json) && typeof json.error === 'string'
      ? json.error
      : `Will Call ${action} failed (HTTP ${res.status}).`
    throw new Error(msg)
  }
}

// Stage — the dashboard route picks the notification channel itself when
// `notify` is omitted-equivalent: we send 'sms' and it falls back per its own
// branches. Passing nothing keeps the route's default ('sms').
export async function stageWillCallOrder(id: string): Promise<void> {
  return postAction(id, 'stage')
}

export async function pickupWillCallOrder(id: string): Promise<void> {
  return postAction(id, 'pickup')
}

// Return — non-empty returnNotes flips has_discrepancy=true server-side and
// fires the discrepancy email to dispatch; the return-confirmation SMS fires
// either way.
export async function returnWillCallOrder(id: string, returnNotes: string): Promise<void> {
  return postAction(id, 'return', { returnNotes })
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
