// ─── CheckoutFlow — delivery/pickup engine, framework-free ──────────────────
// Owns the business state both stop flows share: expected lines from the
// injected stop context (NO manual contract/client entry — the host already
// knows both), scan-vs-expectation matching, exceptions, delivery conflict
// checks against the replica, and completion writes (status batch + order
// completion) into the offline queue.
//
// SCAN MODEL (corrected 2026-07-13): the status is chosen BEFORE scanning,
// never flagged after. Delivery arms 'Delivered' implicitly (the mode IS the
// status); pickup requires the driver to arm one of the six vocabulary
// statuses (Wash/Repair collect their required reasons AT ARM TIME) before
// any scan can be ingested. Every counted scan is stamped with the status
// armed at that moment. There is NO default return status: an item never
// scanned back gets NO write and therefore retains 'Delivered' upstream.
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

export interface ExpectedLine {
  key: string
  name: string
  lineId: string | null
  rentalClassId: string | null
  expectedQty: number
  /** RFID-taggable line? Non-taggable lines never enter the scan path. */
  taggable: boolean
  /** Units auto-confirmed by scans (taggable lines only). */
  scannedEpcs: string[]
  /** Bulk manual quantity for non-taggable lines (null = untouched). */
  manualQty: number | null
  /** Individually selected serialized assets for non-taggable lines (serial or unit label). */
  manualUnits: string[]
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
  /** epc → the status that was ARMED when the unit was scanned (pickup). */
  readonly flags = new Map<string, StatusFlag>()
  /** epc → GPS captured at scan time. */
  private readonly scanGps = new Map<string, GeoPoint>()
  private readonly scannedEpcs = new Set<string>()
  private armed: StatusFlag | null

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
      taggable: item.taggable ?? item.rentalClassId !== null,
      scannedEpcs: [],
      manualQty: null,
      manualUnits: [],
    }))
    // Delivery IS the status choice — armed from birth. Pickup starts unarmed.
    this.armed = mode === 'delivery' ? { status: DELIVERY_STATUS, reasons: [], freeText: null } : null
  }

  // ── Status arming (BEFORE scanning) ─────────────────────────────────────────

  /** The status every scan ingested right now will be stamped with. */
  get armedStatus(): StatusFlag | null {
    return this.armed
  }

  /**
   * Arm a pickup status. Wash and Repair REQUIRE at least one reason — the
   * form collects them here, before the first scan, so the UI cannot
   * silently under-collect.
   */
  armStatus(status: string, reasons: string[] = [], freeText: string | null = null): void {
    if (this.mode !== 'pickup') throw new Error('arming a status is a pickup-mode operation')
    if (REASON_REQUIRED_STATUSES.has(status) && reasons.length === 0 && !freeText) {
      throw new Error(`${status} requires at least one reason`)
    }
    this.armed = { status, reasons, freeText }
  }

  disarmStatus(): void {
    if (this.mode !== 'pickup') throw new Error('arming a status is a pickup-mode operation')
    this.armed = null
  }

  // ── Scan intake ────────────────────────────────────────────────────────────

  /** Already counted in this session? (Screens use this to drop stale pending pulls.) */
  isScanned(epc: string): boolean {
    return this.scannedEpcs.has(epc)
  }

  /**
   * Feed a committed hit. Returns what happened so the UI can react (row
   * check-off, unmatched queue, conflict interrupt). Pickup mode REFUSES
   * hits while no status is armed — screens gate the trigger, this is the
   * backstop.
   */
  async ingest(hit: ScanHit): Promise<'matched' | 'unexpected' | 'conflict' | 'duplicate'> {
    if (!this.armed) throw new Error('no status armed — choose a status before scanning')
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
    this.countItem(conflict.hit)
  }

  blockConflict(conflictIndex: number): void {
    const conflict = this.conflicts[conflictIndex]
    if (conflict && conflict.resolution === null) conflict.resolution = 'blocked'
  }

  private countItem(hit: ScanHit): 'matched' | 'unexpected' {
    const item = hit.item as ReplicaItem
    this.scannedEpcs.add(item.epc)
    // Stamp the armed status at the moment of the scan (pickup). Delivery's
    // armed value is constant, so stamping it is harmless and keeps one path.
    if (this.armed) this.flags.set(item.epc, this.armed)

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
    // Non-taggable lines never enter the scan path — a scan can only match a
    // taggable line. Primary key: rentalClassId (when the host supplied it).
    // Fallback: normalized name (see ASSUMPTIONS.md — mapping join lands at
    // merge time).
    const scannable = this.lines.filter((l) => l.taggable)
    const byClass = scannable.find(
      (l) => l.rentalClassId !== null && l.rentalClassId === item.rentalClassId,
    )
    if (byClass) return byClass
    const wanted = normalizeName(item.commonName)
    return scannable.find((l) => normalizeName(l.name) === wanted)
  }

  // ── Manual entry (non-taggable lines ONLY) ─────────────────────────────────

  /** Bulk quantity for a non-taggable line. */
  setManualQty(lineKey: string, qty: number): void {
    const line = this.requireManualLine(lineKey)
    line.manualQty = Math.max(0, Math.floor(qty))
    line.manualUnits = [] // bulk and per-unit selection are mutually exclusive
  }

  /** Select one serialized asset on a non-taggable line (serial # or unit label). */
  addManualUnit(lineKey: string, unitLabel: string): void {
    const line = this.requireManualLine(lineKey)
    line.manualUnits.push(unitLabel)
    line.manualQty = null
  }

  removeManualUnit(lineKey: string, index: number): void {
    const line = this.requireManualLine(lineKey)
    line.manualUnits.splice(index, 1)
  }

  private requireManualLine(lineKey: string): ExpectedLine {
    const line = this.lines.find((l) => l.key === lineKey)
    if (!line) throw new Error(`unknown line ${lineKey}`)
    if (line.taggable) throw new Error(`${line.name} is RFID-tracked — scan it, manual entry is for non-RFID lines`)
    return line
  }

  // ── Summary / exceptions ───────────────────────────────────────────────────

  confirmedQty(line: ExpectedLine): number {
    if (!line.taggable) {
      return line.manualUnits.length > 0 ? line.manualUnits.length : line.manualQty ?? 0
    }
    return line.scannedEpcs.length
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
   *
   * Only SCANNED units are written. An expected item never scanned back gets
   * NO status write at all — it retains 'Delivered' upstream (corrected
   * model, 2026-07-13; the old 'Needs to be Inspected' default is gone).
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
      const flag = this.flags.get(epc)
      if (!flag) throw new Error(`scanned unit ${epc} has no stamped status — arming is broken`)
      const gps = this.scanGps.get(epc) ?? fallbackGps ?? undefined
      statusWrites.push({
        epc,
        contractNumber: this.stop.contractNumber,
        scannedBy: deps.scannedBy,
        scannedAt: deps.timestamp,
        lat: gps ? String(gps.lat) : undefined,
        lng: gps ? String(gps.lng) : undefined,
        status: flag.status,
        statusNotes:
          this.mode === 'pickup' && (flag.reasons.length > 0 || flag.freeText)
            ? formatStatusNotes(flag)
            : undefined,
      })
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
