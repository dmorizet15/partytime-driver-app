// ─── WriteQueue — durable, idempotent, driver-visible ────────────────────────
// Scans, status changes, GPS captures, and completions enqueue here and drain
// when connectivity returns. Durability: IndexedDB, survives app restarts.
//
// Exactly-once reasoning (and its honest limits): an entry leaves the queue
// only after its backend call succeeds, and the drain loop is single-flight,
// so the normal path sends each entry exactly once. If the app dies BETWEEN
// send and acknowledgment, the entry is found in 'syncing' state on restart,
// reverted to 'pending', and re-sent — at-least-once in that crash window.
// That is safe because every payload is ABSOLUTE, not incremental: item-status
// writes are upserts keyed on EPC (replay converges to the same row) and
// order write-back lines carry absolute quantities (replay re-states the same
// numbers). No payload in this queue double-applies on replay.
//
// Failure policy:
//   network/auth errors  → retry with backoff [30s, 2m, 10m, 30m, 30m…],
//                          surfaced as 'failed' after MAX_ATTEMPTS (manual retry re-arms)
//   body-checked rejection (HTTP 200 + success:false) → 'failed' IMMEDIATELY;
//                          an identical replay cannot succeed, a human must look
//   guard refusal (non-sandbox host) → 'failed' immediately; never retried

import { TagBackendError, type ItemStatusWrite, type TagBackendPort } from '../ports/tagBackend'
import type { OrderSystemPort, StopCompletionReport } from '../ports/orderSystem'
import { STORE_QUEUE, type RfidDb } from './db'
import type { QueueCounts, QueuedWrite, QueuedWriteKind } from './types'
import type { ItemReplica } from './replica'

const MAX_ATTEMPTS = 5
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000] // then repeats the last value

export interface DrainDeps {
  tagBackend: TagBackendPort
  orderSystem: OrderSystemPort
  /** Replica to flip item syncState on outcomes. */
  replica: ItemReplica
}

export interface DrainReport {
  sent: number
  failed: number
  skippedNotDue: number
}

function backoff(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]
}

function epcsOf(entry: QueuedWrite): string[] {
  return entry.kind === 'item-status'
    ? (entry.payload as ItemStatusWrite[]).map((w) => w.epc)
    : []
}

export class WriteQueue {
  private drainPromise: Promise<DrainReport> | null = null
  private listeners = new Set<() => void>()
  private seq = 0

  constructor(
    private readonly db: RfidDb,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Crash recovery: entries stuck in 'syncing' (died mid-drain) become 'pending' again. Call once on startup. */
  async recover(): Promise<number> {
    const entries = await this.db.getAll<QueuedWrite>(STORE_QUEUE)
    const stuck = entries.filter((e) => e.state === 'syncing')
    for (const e of stuck) {
      await this.db.put(STORE_QUEUE, { ...e, state: 'pending', nextAttemptAt: 0 })
    }
    if (stuck.length) this.notify()
    return stuck.length
  }

  async enqueueItemStatusWrites(writes: ItemStatusWrite[]): Promise<QueuedWrite> {
    return this.enqueue('item-status', writes)
  }

  async enqueueOrderCompletion(
    kind: 'order-delivery' | 'order-pickup',
    report: StopCompletionReport,
  ): Promise<QueuedWrite> {
    return this.enqueue(kind, report)
  }

  private async enqueue(
    kind: QueuedWriteKind,
    payload: QueuedWrite['payload'],
  ): Promise<QueuedWrite> {
    const at = this.now()
    const entry: QueuedWrite = {
      // Monotonic even when two enqueues share a clock tick.
      id: `${at.toString(36)}-${(this.seq++).toString(36)}`,
      kind,
      payload,
      state: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      createdAt: at,
    }
    await this.db.put(STORE_QUEUE, entry)
    this.notify()
    return entry
  }

  async entries(): Promise<QueuedWrite[]> {
    const all = await this.db.getAll<QueuedWrite>(STORE_QUEUE)
    return all.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  /** The at-a-glance number: pending + syncing + failed. Nothing hides. */
  async counts(): Promise<QueueCounts> {
    const all = await this.entries()
    const pending = all.filter((e) => e.state === 'pending').length
    const syncing = all.filter((e) => e.state === 'syncing').length
    const failed = all.filter((e) => e.state === 'failed').length
    return { pending, syncing, failed, unsynced: pending + syncing + failed }
  }

  /** Re-arm every 'failed' entry for another drain pass (driver-initiated). */
  async retryFailed(): Promise<number> {
    const failed = (await this.entries()).filter((e) => e.state === 'failed')
    for (const e of failed) {
      await this.db.put(STORE_QUEUE, {
        ...e,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
      })
    }
    if (failed.length) this.notify()
    return failed.length
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Drain due entries in FIFO order. Single-flight: overlapping calls join
   * the in-flight drain (same report) rather than double-sending.
   * Never throws — failures land in entry state, not in the caller.
   */
  drain(deps: DrainDeps): Promise<DrainReport> {
    if (!this.drainPromise) {
      this.drainPromise = this.doDrain(deps).finally(() => {
        this.drainPromise = null
      })
    }
    return this.drainPromise
  }

  private async doDrain(deps: DrainDeps): Promise<DrainReport> {
    const report: DrainReport = { sent: 0, failed: 0, skippedNotDue: 0 }
    try {
      const due = (await this.entries()).filter((e) => e.state === 'pending')
      for (const entry of due) {
        if (entry.nextAttemptAt > this.now()) {
          report.skippedNotDue++
          continue
        }
        await this.db.put(STORE_QUEUE, { ...entry, state: 'syncing' })
        this.notify()
        const outcome = await this.send(entry, deps)
        if (outcome === 'synced') {
          await this.db.delete(STORE_QUEUE, entry.id)
          await deps.replica.setSyncState(epcsOf(entry), 'synced')
          report.sent++
        } else if (outcome === 'retry') {
          const attempts = entry.attempts + 1
          if (attempts >= MAX_ATTEMPTS) {
            await this.db.put(STORE_QUEUE, {
              ...entry,
              state: 'failed',
              attempts,
              lastError: entry.lastError ?? 'retries exhausted',
            })
            await deps.replica.setSyncState(epcsOf(entry), 'failed')
            report.failed++
          } else {
            await this.db.put(STORE_QUEUE, {
              ...entry,
              state: 'pending',
              attempts,
              nextAttemptAt: this.now() + backoff(attempts),
            })
          }
        } else {
          // 'dead' — semantic rejection or guard refusal; retrying can't help.
          await this.db.put(STORE_QUEUE, {
            ...entry,
            state: 'failed',
            attempts: entry.attempts + 1,
          })
          await deps.replica.setSyncState(epcsOf(entry), 'failed')
          report.failed++
        }
        this.notify()
      }
    } catch (err) {
      // Storage failure mid-drain (e.g. the DB handle closed during app
      // teardown). Stop quietly: any entry left in 'syncing' is reconciled
      // by recover() on next startup, and payloads are idempotent.
      console.warn('[rfid] drain stopped early (storage unavailable)', err)
    }
    return report
  }

  private async send(
    entry: QueuedWrite,
    deps: DrainDeps,
  ): Promise<'synced' | 'retry' | 'dead'> {
    try {
      if (entry.kind === 'item-status') {
        const res = await deps.tagBackend.writeItemStatuses(entry.payload as ItemStatusWrite[])
        if (res.ok) return 'synced'
        entry.lastError = `backend rejected ${res.failedCount} row(s) (body-checked)`
        return 'dead'
      }
      const reportPayload = entry.payload as StopCompletionReport
      const res =
        entry.kind === 'order-delivery'
          ? await deps.orderSystem.recordDeliveryCompletion(reportPayload)
          : await deps.orderSystem.recordPickupCompletion(reportPayload)
      if (res.ok) return 'synced'
      entry.lastError = res.reason ?? 'order system refused'
      return res.reason === 'network' || res.reason === 'auth' ? 'retry' : 'dead'
    } catch (err) {
      if (err instanceof TagBackendError) {
        entry.lastError = err.message
        if (err.kind === 'guard' || err.kind === 'rejected') return 'dead'
        return 'retry'
      }
      entry.lastError = err instanceof Error ? err.message : String(err)
      return 'retry'
    }
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb())
  }
}
