// ─── Deferred feature interfaces — scoped, specced, NOT built ────────────────
// Each interface matches its spec in partytime-rfid/docs/feature-specs/
// (assign-tag.md, on-rent.md, return-to-stock.md, locate.md, reports.md).
// A later pass implements against these shapes without moving the module
// boundary. The factory throws — deliberately, loudly — so nothing can ship a
// half-feature by accident.

import type { ItemStatus } from './statusVocabulary'
import type { ReplicaItem } from '../offline/types'

export class DeferredFeatureError extends Error {
  constructor(feature: string, spec: string) {
    super(`${feature} is scoped but not built — see partytime-rfid/docs/feature-specs/${spec}`)
    this.name = 'DeferredFeatureError'
  }
}

/** assign-tag.md — seed-data workflow: search → class → quality → scan → post. */
export interface AssignTagFlow {
  searchCatalog(partialDescription: string): Promise<ReplicaItem[]>
  selectRentalClass(rentalClassId: string): void
  setQuality(quality: string): void
  captureIdentifier(kind: 'epc' | 'barcode' | 'nfc', value: string): void
  postScans(): Promise<{ queued: number }>
}

/** on-rent.md — standalone on-rent scanning outside the delivery flow. */
export interface OnRentFlow {
  setContractNumber(contractNumber: string): void
  recentContracts(): Promise<string[]>
  complete(): Promise<{ queued: number }>
}

/** return-to-stock.md — warehouse close-loop back to Ready to Rent. */
export interface ReturnToStockFlow {
  scannedByStatus(): Map<string, ReplicaItem[]>
  batchTransition(epcs: string[], to: ItemStatus): Promise<{ queued: number }>
}

/** locate.md — geiger locate; needs hardware to tune, plumbing exists (findEpc). */
export interface LocateFlow {
  locateSingle(epc: string, onProximity: (pct: number) => void): () => void
  locateMulti(epcs: string[], onFound: (epc: string) => void): () => void
  setPower(level: number): Promise<void>
}

/** reports.md — Status / Status-by-Contract / Item History / Complete Inventory. */
export interface ReportsFlow {
  statusReport(): Promise<Array<{ status: string; count: number }>>
  statusByContract(contractNumber: string): Promise<ReplicaItem[]>
  /** Online-only (Transactions endpoint) — the one non-replica report. */
  itemHistory(epc: string): Promise<unknown[]>
  completeInventoryCsv(): Promise<string>
}

export function createDeferredFlow(feature: 'assign-tag'): AssignTagFlow
export function createDeferredFlow(feature: 'on-rent'): OnRentFlow
export function createDeferredFlow(feature: 'return-to-stock'): ReturnToStockFlow
export function createDeferredFlow(feature: 'locate'): LocateFlow
export function createDeferredFlow(feature: 'reports'): ReportsFlow
export function createDeferredFlow(feature: string): unknown {
  throw new DeferredFeatureError(feature, `${feature}.md`)
}
