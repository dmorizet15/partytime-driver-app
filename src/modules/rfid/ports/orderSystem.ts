// ─── OrderSystemPort — order management system, vendor-neutral ──────────────
// Business logic depends on THIS interface only. TapGoods is one
// implementation (server/tapGoodsOrderSystem.ts — DRY-RUN ONLY this session);
// tests use RecordingOrderSystem. The standalone product substitutes its own
// order service behind the same port. The vendor name may appear ONLY in
// implementation files and the composition root.

import type { GeoPoint } from '../adapters/types'

/** One confirmed line to report back to the order system. */
export interface OrderWriteLine {
  /** Order-system line id (TapGoods pick-list line id). Null lines are counted locally but never sent. */
  lineId: string | null
  quantity: number
}

export interface StopCompletionReport {
  stopId: string
  orderId: string
  lines: OrderWriteLine[]
  /** ISO timestamp of the driver's completion action. */
  completedAt: string
  gps: GeoPoint | null
}

export interface OrderSystemResult {
  ok: boolean
  /** True when the write was recorded/logged but deliberately not sent (dry-run). */
  dryRun: boolean
  /** Machine reason on !ok ('network', 'auth', 'rejected:<detail>', ...). */
  reason?: string
  /** The exact payload that was (or would have been) sent — logged for manual verification. */
  payload?: unknown
}

export interface OrderSystemPort {
  /** Report a completed delivery (items went out). */
  recordDeliveryCompletion(report: StopCompletionReport): Promise<OrderSystemResult>
  /** Report a completed pickup (items came back). */
  recordPickupCompletion(report: StopCompletionReport): Promise<OrderSystemResult>
}
