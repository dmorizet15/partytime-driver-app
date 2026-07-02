// ─── Equipment Return Tracking — reservation-scoped ledger ───────────────────
// THE MODEL (do not revert to pairwise stop matching): equipment return
// balance is a running ledger per (reservation_id, equipment_key) across ALL
// of the reservation's delivery and pickup stops — NOT a comparison between a
// pickup and its single linked delivery. Jobs split equipment across stops
// (tent delivered separately from inflatable, inflatable picked up before the
// tent): the last crew must see whatever is LEFT after earlier pickups.
//
//   total_delivered = SUM(quantity) over rows on DELIVERY stops
//   total_retrieved = SUM(quantity) over rows on COMPLETED PICKUP stops
//                     (excluding the current stop when computing what a crew
//                     should still expect to find)
//   running_balance = total_delivered − total_retrieved
//
// A stop with no rows contributes 0 either direction — no special handling.
// Pure functions; the API route feeds them rows and the smoke tests exercise
// them directly.

export interface LedgerStopInfo {
  id: string
  stop_type: string | null
  completed_at: string | null
  scheduled_date: string | null
}

export interface LedgerRow {
  equipment_key: string
  quantity: number
  stop: LedgerStopInfo
}

export interface EquipmentBalance {
  equipment_key: string
  delivered: number
  retrieved: number
  balance: number
}

export interface ComputeBalancesOptions {
  // Exclude this stop's own pickup rows — a crew's expected balance must not
  // be reduced by their own earlier entry (re-opening a stop).
  excludeStopId?: string | null
  // GET (what should this crew expect?): only COMPLETED pickups count as
  // retrieved. Final-pickup recompute (POST): include every pickup row — the
  // current stop's completed_at may not be stamped yet when its equipment
  // write lands, and rows only exist once a crew committed them anyway.
  completedPickupsOnly: boolean
}

export function computeBalances(rows: LedgerRow[], opts: ComputeBalancesOptions): EquipmentBalance[] {
  const byKey = new Map<string, EquipmentBalance>()
  const get = (key: string): EquipmentBalance => {
    let b = byKey.get(key)
    if (!b) {
      b = { equipment_key: key, delivered: 0, retrieved: 0, balance: 0 }
      byKey.set(key, b)
    }
    return b
  }

  for (const row of rows) {
    const qty = Math.max(0, Math.floor(row.quantity ?? 0))
    const stop = row.stop
    if (!stop) continue
    if (stop.stop_type === 'delivery') {
      get(row.equipment_key).delivered += qty
    } else if (stop.stop_type === 'pickup') {
      if (opts.excludeStopId && stop.id === opts.excludeStopId) continue
      if (opts.completedPickupsOnly && !stop.completed_at) continue
      get(row.equipment_key).retrieved += qty
    }
    // Any other stop type carries no ledger meaning — ignored.
  }

  const out = Array.from(byKey.values())
  for (const b of out) b.balance = b.delivered - b.retrieved
  return out
}

// Per-stop trace for the discrepancy email — which stops/dates contributed
// what, so dispatch can follow the trail instead of just seeing a net number.
export interface LedgerTraceLine {
  equipment_key: string
  stop_id: string
  stop_type: string
  scheduled_date: string | null
  quantity: number
}

export function traceLines(rows: LedgerRow[]): LedgerTraceLine[] {
  return rows
    .filter((r) => r.stop && (r.stop.stop_type === 'delivery' || r.stop.stop_type === 'pickup'))
    .map((r) => ({
      equipment_key: r.equipment_key,
      stop_id: r.stop.id,
      stop_type: r.stop.stop_type as string,
      scheduled_date: r.stop.scheduled_date,
      quantity: Math.max(0, Math.floor(r.quantity ?? 0)),
    }))
    .sort((a, b) =>
      a.equipment_key.localeCompare(b.equipment_key)
      || (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '')
      || (a.stop_type === 'delivery' ? -1 : 1) - (b.stop_type === 'delivery' ? -1 : 1)
    )
}
