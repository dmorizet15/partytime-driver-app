// Time-window constraint helpers — read-only port from the dashboard repo.
// The driver app never writes constraint columns; it only displays the
// effective window + tier surfaced by the trigger-computed Phase 1/2 fields.
//
// Source-priority decision tree (Notion spec — "Source Priority"):
// 1. dispatcher_time_override (manual)
// 2. dispatcher_constraint_dismissed → constraint suppressed (handled by
//    the trigger setting constraint_confidence = null, so callers can rely
//    on the `tier == null → render nothing` short-circuit)
// 3. structured_schedule windows (delivery_/pickup_window_*)
// 4. notes_classification.extracted (LLM)

import type { Stop } from '@/types'

export type ConstraintTier = 'verified' | 'inferred' | 'suggested' | 'manual'

export interface NotesClassification {
  has_time_constraint?: boolean
  source?: string | null
  constraint_type?:
    | 'delivery_after' | 'delivery_by' | 'delivery_window'
    | 'pickup_after'   | 'pickup_by'   | 'pickup_window'
    | null
  confidence?: number | null
  reasoning?: string | null
  extracted?: {
    must_deliver_after?: string | null
    must_deliver_by?:    string | null
    must_pickup_after?:  string | null
    must_pickup_by?:     string | null
  } | null
}

export interface DispatcherTimeOverride {
  must_deliver_after?: string | null
  must_deliver_by?:    string | null
  must_pickup_after?:  string | null
  must_pickup_by?:     string | null
  set_by?:             string | null
  set_at?:             string | null
}

export interface EffectiveWindow {
  startsAt: string | null  // ISO timestamptz
  endsAt:   string | null  // ISO timestamptz
  source:   'dispatcher_override' | 'structured' | 'notes' | null
}

// Structural subset of `Stop` carrying exactly the fields the window resolver
// reads. `Stop` satisfies this, so every existing caller is unaffected — but a
// lighter row shape (e.g. the Pickup Answer card's reservation-scoped pickup
// rows, which aren't full driver `Stop`s) can reuse this ONE resolver so the
// committed-time value can never drift from the early-pickup guard.
export interface WindowResolvable {
  stop_type?:                string | null
  dispatcher_time_override?: DispatcherTimeOverride | null
  notes_classification?:     NotesClassification | null
  pickup_window_start?:      string | null
  pickup_window_end?:        string | null
  delivery_window_start?:    string | null
  delivery_window_end?:      string | null
}

export function effectiveWindow(stop: WindowResolvable): EffectiveWindow {
  const isPickup = stop.stop_type === 'pickup'
  const override = stop.dispatcher_time_override
  if (override) {
    if (isPickup) {
      const startsAt = override.must_pickup_after ?? null
      const endsAt   = override.must_pickup_by ?? null
      if (startsAt || endsAt) return { startsAt, endsAt, source: 'dispatcher_override' }
    } else {
      const startsAt = override.must_deliver_after ?? null
      const endsAt   = override.must_deliver_by ?? null
      if (startsAt || endsAt) return { startsAt, endsAt, source: 'dispatcher_override' }
    }
  }

  if (isPickup) {
    if (stop.pickup_window_start || stop.pickup_window_end) {
      return {
        startsAt: stop.pickup_window_start ?? null,
        endsAt:   stop.pickup_window_end ?? null,
        source:   'structured',
      }
    }
  } else if (stop.delivery_window_start || stop.delivery_window_end) {
    return {
      startsAt: stop.delivery_window_start ?? null,
      endsAt:   stop.delivery_window_end ?? null,
      source:   'structured',
    }
  }

  const ex = stop.notes_classification?.extracted ?? null
  if (ex) {
    if (isPickup) {
      const startsAt = ex.must_pickup_after ?? null
      const endsAt   = ex.must_pickup_by ?? null
      if (startsAt || endsAt) return { startsAt, endsAt, source: 'notes' }
    } else {
      const startsAt = ex.must_deliver_after ?? null
      const endsAt   = ex.must_deliver_by ?? null
      if (startsAt || endsAt) return { startsAt, endsAt, source: 'notes' }
    }
  }

  return { startsAt: null, endsAt: null, source: null }
}

// verified / inferred / manual = solid amber. suggested = dashed outline.
export function isHardConstraintTier(tier: ConstraintTier | null | undefined): boolean {
  return tier === 'verified' || tier === 'inferred' || tier === 'manual'
}

// "1:45 PM" formatter for ISO timestamptz values. Local TZ.
export function formatLocalClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  let h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

// Compact label for the driver-app badge. Spec:
//   delivery → "Deliver by X" / "Deliver after X" / "Deliver 9:00 AM–11:00 AM"
//   pickup   → "Pickup by X"  / "Pickup after X"  / "Pickup 1:00 PM–5:00 PM"
export interface BadgeContent {
  label: string
  tier: ConstraintTier
  isHard: boolean
  startsAt: string | null
  endsAt:   string | null
}

export function buildBadgeContent(stop: Stop): BadgeContent | null {
  const tier = stop.constraint_confidence
  if (!tier) return null
  const w = effectiveWindow(stop)
  if (!w.startsAt && !w.endsAt) return null

  const isPickup = stop.stop_type === 'pickup'
  const verb = isPickup ? 'Pickup' : 'Deliver'
  const startsClock = formatLocalClock(w.startsAt)
  const endsClock   = formatLocalClock(w.endsAt)

  let label: string
  if (startsClock && endsClock) {
    label = `${verb} ${startsClock}–${endsClock}`
  } else if (endsClock) {
    label = `${verb} by ${endsClock}`
  } else if (startsClock) {
    label = `${verb} after ${startsClock}`
  } else {
    // Defensive — the early return above guarantees one is set, but keep
    // the branch so the type narrowing is exhaustive.
    label = `${verb} window`
  }

  return {
    label,
    tier,
    isHard: isHardConstraintTier(tier),
    startsAt: w.startsAt,
    endsAt:   w.endsAt,
  }
}

// True when pickup window has a start, and that start is in the future.
// Driver-app standby + navigate-gate keys off this.
export function isEarlyForPickup(stop: Stop, now: Date = new Date()): boolean {
  if (stop.stop_type !== 'pickup') return false
  const w = effectiveWindow(stop)
  if (!w.startsAt) return false
  const start = new Date(w.startsAt)
  if (isNaN(start.getTime())) return false
  return start.getTime() > now.getTime()
}

// Minutes between `now` and the pickup window start. Negative when the
// window has already opened. Caller can short-circuit on null.
export function minutesUntilPickupOpen(stop: Stop, now: Date = new Date()): number | null {
  if (stop.stop_type !== 'pickup') return null
  const w = effectiveWindow(stop)
  if (!w.startsAt) return null
  const start = new Date(w.startsAt)
  if (isNaN(start.getTime())) return null
  return Math.round((start.getTime() - now.getTime()) / 60_000)
}

// "HH:MM:SS" countdown formatter. Clamps at 00:00:00 once `target <= now`.
export function formatCountdown(target: string, now: Date = new Date()): string {
  const t = new Date(target).getTime()
  if (isNaN(t)) return '00:00:00'
  const diffMs = Math.max(0, t - now.getTime())
  const totalSec = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}
