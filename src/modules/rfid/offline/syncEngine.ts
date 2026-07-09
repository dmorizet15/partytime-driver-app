// ─── SyncEngine — wires connectivity to the queue ────────────────────────────
// Owns the reconnect trigger: when the network comes back, drain. Also drains
// on an explicit kick (app foreground, screen mount, manual "sync now").
// Deliberately thin — all durability/idempotency logic lives in WriteQueue.

import type { ConnectivityPort } from './connectivity'
import type { DrainDeps, DrainReport, WriteQueue } from './writeQueue'

export class SyncEngine {
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly queue: WriteQueue,
    private readonly connectivity: ConnectivityPort,
    private readonly deps: DrainDeps,
  ) {}

  /** Start listening for reconnects. Returns this for chaining. */
  start(): this {
    this.unsubscribe?.()
    this.unsubscribe = this.connectivity.onChange((online) => {
      if (online) void this.kick()
    })
    return this
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Drain now if online; no-op offline (entries wait, nothing is lost). */
  async kick(): Promise<DrainReport> {
    if (!this.connectivity.isOnline()) return { sent: 0, failed: 0, skippedNotDue: 0 }
    return this.queue.drain(this.deps)
  }
}
