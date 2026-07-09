// ─── CheckoutFlow — delivery/pickup engine, framework-free ──────────────────
// Owns the business state both stop flows share: expected lines from the
// injected stop context (NO manual contract/client entry — the host already
// knows both), scan-vs-expectation matching, exceptions, delivery conflict
// checks against the replica, pickup status flagging with the required
// Wash/Repair reason tree, and completion writes (status batch + order
// completion) into the offline queue.
//
// Status vocabulary is the EXACT live-app set (fixtures.ITEM_STATUSES).
// The delivery status string is doctrine ("Delivered", partytime-rfid
// CLAUDE.md) but flagged in docs/ASSUMPTIONS.md pending live confirmation —
// it is free text on the backend, not an enum.

import type { GeoPoint, LocationAdapter, StopContext } from '../adapters/types'
import type { ItemReplica } from '../offline/replica'
import type { ReplicaItem } from '../offline/types'
import type { WriteQueue } from '../offline/writeQueue'
import type { ItemStatusWrite } from '../ports/tagBackend'
import { NON_RENTABLE_STATUSES, REASON_REQUIRED_STATUSES } from './statusVocabulary'
import type { ScanHit } from './scanSession'

export type CheckoutMode = 'delivery' | 'pickup'

/** Doctrine value (partytime-rfid CLAUDE.md); free text upstream — see ASSUMPTIONS.md. */
export const DELIVERY_STATUS = 'Delivered'
/** Default status for items scanned back in unflagged — configurable; see ASSUMPTIONS.md. */
export const DEFAULT_RETURN_STATUS = 'Needs to be Inspected'

export interface ExpectedLine {
  key: string
  name: string
  lineId: string | null
  rentalClassId: string | null
  expectedQty: number
  /** Units auto-confirmed by scans. */
  scannedEpcs: string[]
  /** Manual quantity for non-taggable lines (null = untouched). */
  manualQty: number | null
}

export type UnexpectedReason = 'unknown-tag' | 'not-on-order' | 'overscan'

export interface UnexpectedScan {
  hit: ScanHit
  reason: UnexpectedReason
}

/** A non-rentable unit the driver tried to send out (delivery only). */
export interface Conflict {
  hit: ScanHit
  status: string
  resolution: 'blocked' | 'overridden' | null
}

export interface StatusFlag {
  status: string
  /** Required non-empty for Wash and Repair. */
  reasons: string[]
  freeText: string | null
}

export interface SummaryRow {
  itemNumber: string
  name: string
  status: string
  expectedQty: number
  confirmedQty: number
  exception: string | null
}

export interface CheckoutSummary {
  rows: SummaryRow[]
  unexpected: UnexpectedScan[]
  conflicts: Conflict[]
  exceptionCount: number
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export class CheckoutFlow {
  readonly lines: ExpectedLine[]
  readonly unexpected: UnexpectedScan[] = []
  readonly conflicts: Conflict[] = []
  /** epc → flag. Pickup status flagging (swipe-left / batch apply). */
  readonly flags = new Map<string, StatusFlag>()
  /** epc → GPS captured at scan time. */
  private readonly scanGps = new Map<string, GeoPoint>()
  private readonly scannedEpcs = new Set<string>()

  constructor(
    readonly mode: CheckoutMode,
    readonly stop: StopContext,
    private readonly location: LocationAdapter,
    private readonly nonRentable: ReadonlySet<string> = NON_RENTABLE_STATUSES,
  ) {
    this.lines = stop.expectedItems.map((item, i) => ({
      key: `${i}:${item.lineId ?? item.name}`,
      name: item.name,
      lineId: item.lineId,
      rentalClassId: item.rentalClassId,
      expectedQty: item.quantity,
      scannedEpcs: [],
      manualQty: null,
    }))
  }

  // ── Scan intake ────────────────────────────────────────────────────────────

  /**
   * Feed a hit from the ScanSession. Returns what happened so the UI can
   * react (row check-off, unmatched queue, conflict interrupt).
   */
  async ingest(hit: ScanHit): Promise<'matched' | 'unexpected' | 'conflict' | 'duplicate'> {
    const epc = hit.item?.epc ?? (hit.modality === 'rfid' ? hit.identifier : null)

    if (epc && this.scannedEpcs.has(epc)) return 'duplicate'

    // GPS at scan time — fire the capture immediately, best-effort.
    if (epc) {
      void this.location.getCurrentPosition().then((gps) => {
        if (gps) this.scanGps.set(epc, gps)
      })
    }

    if (!hit.item) {
      this.unexpected.push({ hit, reason: 'unknown-tag' })
      return 'unexpected'
    }

    // Delivery conflict check BEFORE counting: non-rentable status blocks the unit.
    if (this.mode === 'delivery' && this.nonRentable.has(hit.item.currentStatus)) {
      this.conflicts.push({ hit, status: hit.item.currentStatus, resolution: null })
      return 'conflict'
    }

    return this.countItem(hit)
  }

  /** Two-tap override from ConflictInterrupt: count the blocked unit anyway. */
  async overrideConflict(conflictIndex: number): Promise<void> {
    const conflict = this.conflicts[conflictIndex]
    if (!conflict || conflict.resolution !== null) return
    conflict.resolution = 'overridden'
    await this.countItem(conflict.hit)
  }

  blockConflict(conflictIndex: number): void {
    const conflict = this.conflicts[conflictIndex]
    if (conflict && conflict.resolution === null) conflict.resolution = 'blocked'
  }

  private countItem(hit: ScanHit): 'matched' | 'unexpected' {
    const item = hit.item as ReplicaItem
    this.scannedEpcs.add(item.epc)

    const line = this.matchLine(item)
    if (!line) {
      this.unexpected.push({ hit, reason: 'not-on-order' })
      return 'unexpected'
    }
    if (line.scannedEpcs.length >= line.expectedQty) {
      this.unexpected.push({ hit, reason: 'overscan' })
      return 'unexpected'
    }
    line.scannedEpcs.push(item.epc)
    return 'matched'
  }

  private matchLine(item: ReplicaItem): ExpectedLine | undefined {
    // Primary key: rentalClassId (when the host supplied it). Fallback:
    // normalized name (see ASSUMPTIONS.md — mapping join lands at merge time).
    const byClass = this.lines.find(
      (l) => l.rentalClassId !== null && l.rentalClassId === item.rentalClassId,
    )
    if (byClass) return byClass
    const wanted = normalizeName(item.commonName)
    return this.lines.find((l) => normalizeName(l.name) === wanted)
  }

  // ── Manual entry (non-taggable lines) ─────────────────────────────────────

  setManualQty(lineKey: string, qty: number): void {
    const line = this.lines.find((l) => l.key === lineKey)
    if (line) line.manualQty = Math.max(0, Math.floor(qty))
  }

  // ── Pickup status flagging ─────────────────────────────────────────────────

  /**
   * Flag one scanned unit (swipe-left). Wash and Repair REQUIRE at least one
   * reason — throws otherwise so the UI cannot silently under-collect.
   */
  flagStatus(epc: string, status: string, reasons: string[] = [], freeText: string | null = null): void {
    if (this.mode !== 'pickup') throw new Error('status flagging is a pickup-mode operation')
    if (!this.scannedEpcs.has(epc)) throw new Error(`cannot flag ${epc} — not scanned in this session`)
    if (REASON_REQUIRED_STATUSES.has(status) && reasons.length === 0 && !freeText) {
      throw new Error(`${status} requires at least one reason`)
    }
    this.flags.set(epc, { status, reasons, freeText })
  }

  /** Batch-apply one status to a selection of scanned units (same validation). */
  batchFlagStatus(epcs: string[], status: string, reasons: string[] = [], freeText: string | null = null): void {
    for (const epc of epcs) this.flagStatus(epc, status, reasons, freeText)
  }

  // ── Summary / exceptions ───────────────────────────────────────────────────

  confirmedQty(line: ExpectedLine): number {
    return line.manualQty !== null ? line.manualQty : line.scannedEpcs.length
  }

  summary(): CheckoutSummary {
    const rows: SummaryRow[] = this.lines.map((line) => {
      const confirmed = this.confirmedQty(line)
      let exception: string | null = null
      if (confirmed < line.expectedQty) exception = `Short ${line.expectedQty - confirmed}`
      else if (confirmed > line.expectedQty) exception = `Over ${confirmed - line.expectedQty}`
      return {
        itemNumber: line.rentalClassId ?? line.lineId ?? '—',
        name: line.name,
        status: confirmed >= line.expectedQty ? 'Complete' : 'Incomplete',
        expectedQty: line.expectedQty,
        confirmedQty: confirmed,
        exception,
      }
    })
    const openConflicts = this.conflicts.filter((c) => c.resolution === null || c.resolution === 'blocked')
    const exceptionCount =
      rows.filter((r) => r.exception !== null).length + this.unexpected.length + openConflicts.length
    return { rows, unexpected: [...this.unexpected], conflicts: [...this.conflicts], exceptionCount }
  }

  // ── Completion ────────────────────────────────────────────────────────────

  /**
   * Enqueue the completion writes (status batch + order completion) and
   * return the queued payloads. Networkless by design — the queue drains
   * when connectivity allows; the driver is never trapped behind sync.
   */
  async complete(deps: {
    queue: WriteQueue
    replica: ItemReplica
    scannedBy: string
    timestamp: string
    completedAtIso: string
  }): Promise<{ statusWrites: ItemStatusWrite[]; orderKind: 'order-delivery' | 'order-pickup' }> {
    const fallbackGps = await this.location.getCurrentPosition()
    const statusWrites: ItemStatusWrite[] = []

    for (const epc of Array.from(this.scannedEpcs)) {
      const gps = this.scanGps.get(epc) ?? fallbackGps ?? undefined
      const base: ItemStatusWrite = {
        epc,
        contractNumber: this.stop.contractNumber,
        scannedBy: deps.scannedBy,
        scannedAt: deps.timestamp,
        lat: gps ? String(gps.lat) : undefined,
        lng: gps ? String(gps.lng) : undefined,
      }
      if (this.mode === 'delivery') {
        statusWrites.push({ ...base, status: DELIVERY_STATUS })
      } else {
        const flag = this.flags.get(epc)
        statusWrites.push({
          ...base,
          status: flag?.status ?? DEFAULT_RETURN_STATUS,
          statusNotes: flag ? formatStatusNotes(flag) : undefined,
        })
      }
    }

    if (statusWrites.length > 0) {
      // One upsert call, N rows (ASSUMPTIONS.md: batch shape). Overlay locally first.
      for (const w of statusWrites) {
        await deps.replica.applyLocalChange(w.epc, {
          currentStatus: w.status,
          statusNotes: w.statusNotes,
          lastContractNum: w.contractNumber,
          lastScanBy: w.scannedBy,
          lastScanDate: w.scannedAt,
          gpsLat: w.lat,
          gpsLng: w.lng,
        })
      }
      await deps.queue.enqueueItemStatusWrites(statusWrites)
    }

    const orderKind = this.mode === 'delivery' ? 'order-delivery' : 'order-pickup'
    await deps.queue.enqueueOrderCompletion(orderKind, {
      stopId: this.stop.stopId,
      orderId: this.stop.orderId,
      lines: this.lines.map((l) => ({ lineId: l.lineId, quantity: this.confirmedQty(l) })),
      completedAt: deps.completedAtIso,
      gps: fallbackGps,
    })

    return { statusWrites, orderKind }
  }
}

export function formatStatusNotes(flag: StatusFlag): string {
  const parts = [...flag.reasons]
  if (flag.freeText) {
    parts.push(flag.status === 'Repair' ? `Location of Repair: ${flag.freeText}` : `Other: ${flag.freeText}`)
  }
  return `${flag.status}: ${parts.join(', ')}`
}
