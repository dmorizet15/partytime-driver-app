// Date display helpers for the Will Call screens. All will_call_orders date
// columns are date-grain strings (YYYY-MM-DD, sometimes full ISO) — parse the
// date part directly rather than new Date(iso) so a bare date never shifts a
// day across timezones (same discipline as the dashboard's WillCallCard).

import type { WillCallOrder } from './types'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dateKey(iso: string | null): string | null {
  if (!iso || iso.length < 10) return null
  return iso.slice(0, 10)
}

export function fmtDay(iso: string | null): string {
  const key = dateKey(iso)
  if (!key) return '—'
  if (key === localToday()) return 'Today'
  const [, m, d] = key.split('-').map(Number)
  if (!m || !d) return '—'
  return `${SHORT_MONTHS[m - 1]} ${d}`
}

// "Today · 1:00 PM" — date from expected_pickup_date, time-of-day from
// checkout_window_start when it carries a timestamp.
export function fmtPickup(order: WillCallOrder): string {
  const day = fmtDay(order.expected_pickup_date)
  const time = fmtTimeOfDay(order.checkout_window_start)
  return time ? `${day} · ${time}` : day
}

// Due-back date: checkin_window_end is the real one (checkin_window_start is
// the event-range end dashboard-side); fall back to return_reminder_date.
export function returnByIso(order: WillCallOrder): string | null {
  return order.checkin_window_end ?? order.return_reminder_date
}

export function fmtReturnBy(order: WillCallOrder): string {
  return fmtDay(returnByIso(order))
}

function fmtTimeOfDay(iso: string | null): string | null {
  if (!iso || !iso.includes('T')) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
