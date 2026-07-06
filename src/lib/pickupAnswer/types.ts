// Pickup Answer (driver-facing) — shared types for the pure derivation layer.
// Spec: MBC Part 3 "📞 Pickup Answer (Driver-Facing)" (locked 2026-07-05).
//
// The card answers "when are you picking up?" on a DELIVERY stop, sourced from
// the reservation's pickup stop(s). Read-only; no migration.

import type { WindowResolvable } from '../stopConstraints'

export interface PickupItem {
  category?: string | null
  name?:     string | null
  qty?:      number | null
}

// Minimal delivery-stop context the card renders on. Only reservation_id is
// load-bearing (the grouping key for the reservation's pickups).
export interface DeliveryStopInput {
  id?:             string
  reservation_id?: string | null
  stop_type?:      string | null
}

// A reservation pickup row. Extends WindowResolvable so `effectiveWindow()` —
// the SAME resolver the early-pickup guard uses — can be called on it directly,
// guaranteeing the "No earlier than" promise equals the value the guard blocks
// on. `scheduled_date` is NOT on the driver `Stop` type (the /api/routes SELECT
// only filters on it), so the card's service-role endpoint returns it here.
export interface PickupStopInput extends WindowResolvable {
  id?:             string
  reservation_id?: string | null
  scheduled_date?: string | null   // YYYY-MM-DD (drifts from the floor — see spec)
  calculated_eta?: string | null   // ISO timestamptz — live ETA, routed pickups only
  items?:          PickupItem[] | null
}

// clock glyph = 'inflatable' (time-specific). calendar glyph = 'tent' (the
// date-specific / general bucket — tent OR plain rental). 'mixed' = both.
// 'none' = no pickup scheduled for the reservation.
export type PickupKind = 'inflatable' | 'tent' | 'mixed' | 'none'

// 'locked'    — an inflatable committed floor (the "No earlier than" time the
//               guard hard-enforces). Firm.
// 'scheduled' — routed (has a live ETA), no locked floor.
// 'planned'   — not yet routed (no ETA), no locked floor.
// 'none'      — no pickup exists.
export type PickupStatus = 'planned' | 'scheduled' | 'locked' | 'none'

export interface PickupWindow {
  start: string | null  // ISO timestamptz (pickup_window_start)
  end:   string | null  // ISO timestamptz (pickup_window_end)
}

export interface PickupTrip {
  kind:      PickupKind
  status:    PickupStatus
  floorTime: string | null   // ISO — inflatable committed floor (effectiveWindow.startsAt); null for tent/general
  etaTime:   string | null   // ISO — calculated_eta (earliest in the collapsed group); null when unrouted
  day:       string | null   // YYYY-MM-DD — tent/general: scheduled_date; inflatable: ET calendar day of the floor
  window:    PickupWindow
  label:     string | null   // split label ('Inflatable pickup' / 'Tent pickup' / 'First trip' / …); null for a single trip
  scheduledDate: string | null
}

export interface PickupAnswer {
  kind:      PickupKind       // overall reservation kind (across every pickup item)
  status:    PickupStatus     // primary (soonest) trip's status
  floorTime: string | null    // primary trip's floor
  etaTime:   string | null     // primary trip's ETA
  day:       string | null     // primary trip's day
  window:    PickupWindow      // primary trip's window
  trips:     PickupTrip[]      // deduped, soonest-first; length 1 in the common case, ≥2 for split pickups
}
