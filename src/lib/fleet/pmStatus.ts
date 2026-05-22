// ─── Fleet Maintenance — PM status derivation (pure) ────────────────────────
// Read-only derivation. The dashboard's Migration-068 trigger owns the heavy
// lifting: it writes next_due_date / next_due_miles / next_due_hours onto every
// maintenance_schedules row when a service record lands. The driver app only
// compares those computed values to today / the asset's current mileage+hours
// to render the amber/red badge tiers from the Build Spec.
//
// If the dashboard's PM badge tier logic shifts, mirror it here in the same
// session (this file is a presentation-layer subset, not byte-identical).

import type { AssetHealth, PmLevel } from './types'

const SEVERITY: Record<PmLevel, number> = { ok: 0, due_soon: 1, overdue: 2 }

// Build Spec defaults when a schedule leaves the warning thresholds null.
const DEFAULT_WARNING_DAYS  = 30
const DEFAULT_WARNING_MILES = 1000

export function mostSevere(levels: PmLevel[]): PmLevel {
  return levels.reduce<PmLevel>((acc, l) => (SEVERITY[l] > SEVERITY[acc] ? l : acc), 'ok')
}

export interface PmScheduleInput {
  active:                  boolean
  next_due_date:           string | null
  next_due_miles:          number | null
  next_due_hours:          number | null
  warning_threshold_days:  number | null
  warning_threshold_miles: number | null
}

export interface PmAssetContext {
  currentMileage: number | null
  currentHours:   number | null
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * PM tier for a single maintenance schedule — whichever threshold
 * (date / mileage / hours) is crossed first wins.
 */
export function pmLevelForSchedule(
  s: PmScheduleInput,
  ctx: PmAssetContext,
  now: Date = new Date(),
): PmLevel {
  if (!s.active) return 'ok'
  const levels: PmLevel[] = []

  // Date threshold — overdue once past, due_soon inside the warning window.
  if (s.next_due_date) {
    const due   = startOfDay(new Date(`${s.next_due_date}T00:00:00`))
    const today = startOfDay(now)
    if (!isNaN(due.getTime())) {
      const warnDays = s.warning_threshold_days ?? DEFAULT_WARNING_DAYS
      const warnDate = new Date(due)
      warnDate.setDate(warnDate.getDate() - warnDays)
      if (today.getTime() > due.getTime())            levels.push('overdue')
      else if (today.getTime() >= warnDate.getTime()) levels.push('due_soon')
      else                                            levels.push('ok')
    }
  }

  // Mileage threshold — trucks only; needs trucks.current_mileage populated.
  if (s.next_due_miles != null && ctx.currentMileage != null) {
    const warnMiles = s.warning_threshold_miles ?? DEFAULT_WARNING_MILES
    if (ctx.currentMileage >= s.next_due_miles)               levels.push('overdue')
    else if (ctx.currentMileage >= s.next_due_miles - warnMiles) levels.push('due_soon')
    else                                                      levels.push('ok')
  }

  // Hours threshold — equipment only. No warning column in the schema, so
  // overdue-only (hours-based PM is dormant until current_hours is written).
  if (s.next_due_hours != null && ctx.currentHours != null) {
    levels.push(ctx.currentHours >= s.next_due_hours ? 'overdue' : 'ok')
  }

  return levels.length ? mostSevere(levels) : 'ok'
}

/** Per-asset rollup: open work order beats any PM-due state beats OK. */
export function assetHealth(hasOpenWorkOrder: boolean, pmLevel: PmLevel): AssetHealth {
  if (hasOpenWorkOrder)  return 'work_order'
  if (pmLevel !== 'ok')  return 'pm_due'
  return 'ok'
}
