// ─── FakeTagBackend — TagBackendPort test double ─────────────────────────────
// Scriptable per-call outcomes modeled on the REAL Easy RFID Pro behaviors:
//   'success'  → normal write/read
//   'rejected' → the HTTP-200-with-success:false case (body-checked failure)
//   'timeout'  → network failure / 10s timeout
// Records every write so queue tests can prove exactly-once application.

import {
  TagBackendError,
  type ItemRecord,
  type ItemStatusWrite,
  type TagBackendPort,
  type TagBackendWriteResult,
} from '../ports/tagBackend'

export type FakeOutcome = 'success' | 'rejected' | 'timeout'

export class FakeTagBackend implements TagBackendPort {
  /** Every write batch that reached the backend AND succeeded. */
  readonly appliedWrites: ItemStatusWrite[][] = []
  /** Every attempt, including failed ones (for retry-count assertions). */
  readonly attempts: ItemStatusWrite[][] = []
  fetchCount = 0

  private items: ItemRecord[]
  private nextOutcomes: FakeOutcome[] = []
  private defaultOutcome: FakeOutcome = 'success'

  constructor(items: ItemRecord[] = []) {
    this.items = items
  }

  setItems(items: ItemRecord[]): void {
    this.items = items
  }

  /** Queue outcomes for upcoming calls (first-in-first-out); falls back to default. */
  scriptOutcomes(...outcomes: FakeOutcome[]): void {
    this.nextOutcomes.push(...outcomes)
  }

  setDefaultOutcome(outcome: FakeOutcome): void {
    this.defaultOutcome = outcome
  }

  private takeOutcome(): FakeOutcome {
    return this.nextOutcomes.shift() ?? this.defaultOutcome
  }

  async fetchAllItems(): Promise<ItemRecord[]> {
    const outcome = this.takeOutcome()
    this.fetchCount++
    if (outcome === 'timeout') throw new TagBackendError('request failed (network or timeout)', 'network')
    if (outcome === 'rejected') throw new TagBackendError('backend rejected the read', 'rejected')
    // Deep-ish copy so tests can't accidentally share references with the replica.
    return this.items.map((i) => ({ ...i }))
  }

  async writeItemStatuses(writes: ItemStatusWrite[]): Promise<TagBackendWriteResult> {
    const outcome = this.takeOutcome()
    this.attempts.push(writes.map((w) => ({ ...w })))
    if (outcome === 'timeout') throw new TagBackendError('request failed (network or timeout)', 'network')
    if (outcome === 'rejected') {
      // Mirrors the live contract: the call "completes" but the body says no.
      return { ok: false, successCount: 0, failedCount: writes.length, raw: { result: { success: false } } }
    }
    this.appliedWrites.push(writes.map((w) => ({ ...w })))
    // Upsert semantics: reflect status changes into the item set.
    for (const w of writes) {
      const item = this.items.find((i) => i.epc === w.epc)
      if (item) {
        if (w.status !== undefined) item.currentStatus = w.status
        if (w.quality !== undefined) item.quality = w.quality
        if (w.statusNotes !== undefined) item.statusNotes = w.statusNotes
        if (w.notes !== undefined) item.notes = w.notes
        if (w.contractNumber !== undefined) item.lastContractNum = w.contractNumber
        item.lastScanBy = w.scannedBy
        item.lastScanDate = w.scannedAt
        if (w.lat !== undefined) item.gpsLat = w.lat
        if (w.lng !== undefined) item.gpsLng = w.lng
      }
    }
    return { ok: true, successCount: writes.length, failedCount: 0 }
  }
}
