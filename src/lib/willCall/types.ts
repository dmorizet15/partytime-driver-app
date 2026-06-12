// Will Call — driver-app read model. Mirrors the dashboard's
// src/types/willcall.ts subset that GET /api/will-call selects. The table
// (will_call_orders) is dashboard-owned; the driver app reads through its own
// API route and writes ONLY via the dashboard's /api/willcall/[id]/* action
// routes (SMS/email side effects live there).
//
// The role is `will_call` — `will_call_board` is only a realtime channel name
// in the dashboard repo, not a role.

export type WillCallStatus =
  | 'pending'
  | 'staged'
  | 'picked_up'
  | 'awaiting_return'
  | 'returned'

export interface WillCallItem {
  name:     string
  quantity: number
}

export interface WillCallOrder {
  id:                     string
  customer_name:          string | null
  company_name:           string | null
  customer_cell:          string | null
  customer_email:         string | null
  customer_phone:         string | null
  items:                  WillCallItem[]
  expected_pickup_date:   string | null
  checkout_window_start:  string | null
  checkout_window_end:    string | null
  checkin_window_start:   string | null
  checkin_window_end:     string | null
  return_reminder_date:   string | null
  payment_state:          string | null
  status:                 WillCallStatus
  staged_location:        string | null
  staged_at:              string | null
  picked_up_at:           string | null
  returned_at:            string | null
  return_notes:           string | null
  has_discrepancy:        boolean
  overdue_reminder_count: number
  needs_manual_followup:  boolean
}

// Per-line check-off state for the staging + return flows. Client-side only
// in Phase 1 — no per-item DB rows; exceptions are summarized into
// return_notes on the return POST. Backing out resets the flow.
export interface WillCallCheckLine {
  index:        number
  accepted:     boolean
  confirmedQty: number
  damaged:      boolean
}

export type WillCallCheckoffMode = 'staging' | 'return'

// Normalize the items JSONB defensively — synced from TapGoods, so rows can
// be null / partially shaped.
export function parseItems(raw: unknown): WillCallItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it) => {
      if (!it || typeof it !== 'object') return null
      const o = it as Record<string, unknown>
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      const qty  = typeof o.quantity === 'number' && o.quantity >= 0 ? Math.floor(o.quantity) : 0
      if (!name) return null
      return { name, quantity: qty }
    })
    .filter((x): x is WillCallItem => x !== null)
}
