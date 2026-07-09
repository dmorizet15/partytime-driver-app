// ─── TagBackendPort — the tag/item system of record, vendor-neutral ─────────
// Business logic (replica sync, write queue, checkout/pickup flows) depends on
// THIS interface only. Easy RFID Pro is one implementation
// (server/easyRfidProBackend.ts, sandbox-guarded); tests use FakeTagBackend.
// The vendor name may appear ONLY in implementation files and the composition
// root — never in flows, hooks, or UI.

/**
 * One item record as the backend knows it. Field names are the module's own
 * canon (camelCase); implementations map to/from vendor wire names
 * (`tag_id`, `rental_class_num`, `date_last_scanned`, ...).
 */
export interface ItemRecord {
  epc: string
  tid: string | null
  rentalClassId: string
  commonName: string
  quality: string
  currentStatus: string
  lastContractNum: string
  lastScanBy: string
  lastScanDate: string
  serialNum: string
  binLocation: string
  notes: string
  statusNotes: string
  gpsLat: string
  gpsLng: string
}

/** One status write. Only defined fields are written; undefined = leave as-is. */
export interface ItemStatusWrite {
  epc: string
  status?: string
  quality?: string
  statusNotes?: string
  notes?: string
  contractNumber?: string
  scannedBy: string
  /** Backend-local timestamp string ("yyyy-mm-dd hh:mm:ss" for Easy RFID Pro). */
  scannedAt: string
  lat?: string
  lng?: string
}

export type TagBackendErrorKind =
  | 'network'      // offline / timeout — retryable
  | 'auth'         // credentials/token rejected — retryable after re-auth, surfaced if persistent
  | 'rejected'     // backend answered and said no (e.g. 200 + success:false) — surfaced, retry per policy
  | 'guard'        // production-write guard refused to send — NEVER retried

export class TagBackendError extends Error {
  constructor(
    message: string,
    public readonly kind: TagBackendErrorKind,
  ) {
    super(message)
    this.name = 'TagBackendError'
  }
}

export interface TagBackendWriteResult {
  ok: boolean
  /** Rows the backend confirmed. */
  successCount: number
  /** Rows the backend rejected (body-checked — HTTP 200 can carry failures). */
  failedCount: number
  /** Raw response body for diagnostics; never parsed by business logic. */
  raw?: unknown
}

export interface TagBackendPort {
  /**
   * Fetch the full item table (seed / "Sync Item List"). Implementations
   * paginate internally; callers get the complete set.
   */
  fetchAllItems(): Promise<ItemRecord[]>
  /**
   * Write item statuses (single or batch — one call, N rows). Idempotent by
   * design: replaying the same write set must converge to the same state
   * (upsert semantics keyed on EPC).
   */
  writeItemStatuses(writes: ItemStatusWrite[]): Promise<TagBackendWriteResult>
}
