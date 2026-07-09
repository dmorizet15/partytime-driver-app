// ─── RecordingOrderSystem — OrderSystemPort test double ──────────────────────
// Records every payload and NEVER sends anything anywhere — the TapGoods
// analog of dry-run, usable in tests to assert exact payload construction.

import type {
  OrderSystemPort,
  OrderSystemResult,
  StopCompletionReport,
} from '../ports/orderSystem'

export type OrderOutcome = 'success' | 'network' | 'rejected'

export class RecordingOrderSystem implements OrderSystemPort {
  readonly deliveries: StopCompletionReport[] = []
  readonly pickups: StopCompletionReport[] = []
  private nextOutcomes: OrderOutcome[] = []

  scriptOutcomes(...outcomes: OrderOutcome[]): void {
    this.nextOutcomes.push(...outcomes)
  }

  private result(payload: unknown): OrderSystemResult {
    const outcome = this.nextOutcomes.shift() ?? 'success'
    if (outcome === 'success') return { ok: true, dryRun: true, payload }
    return { ok: false, dryRun: true, reason: outcome, payload }
  }

  async recordDeliveryCompletion(report: StopCompletionReport): Promise<OrderSystemResult> {
    this.deliveries.push(structuredClone(report))
    return this.result(report)
  }

  async recordPickupCompletion(report: StopCompletionReport): Promise<OrderSystemResult> {
    this.pickups.push(structuredClone(report))
    return this.result(report)
  }
}
