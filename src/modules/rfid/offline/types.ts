// ─── Offline core — shared types ─────────────────────────────────────────────

import type { ItemStatusWrite } from '../ports/tagBackend'
import type { StopCompletionReport } from '../ports/orderSystem'

/**
 * Sync lifecycle of anything locally created/modified. Nothing is ever
 * silently dropped: an entry leaves the queue only by reaching 'synced' or by
 * an explicit, driver-visible 'failed' resolution.
 */
export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed'

/** Replica row = backend record + local sync overlay. */
export interface ReplicaItem {
  /** Canonical item record fields (flattened for IDB indexing). */
  epc: string
  tid: string | null
  barcode: string | null
  nfcUid: string | null
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
  /** 'synced' = mirrors the backend; anything else = local change riding the queue. */
  syncState: SyncState
  /** Epoch ms of the last local mutation or seed. */
  updatedAt: number
}

export type QueuedWriteKind = 'item-status' | 'order-delivery' | 'order-pickup'

export interface QueuedWrite {
  /** Monotonic unique id (also the IDB key). */
  id: string
  kind: QueuedWriteKind
  /** item-status → ItemStatusWrite[]; order-* → StopCompletionReport. */
  payload: ItemStatusWrite[] | StopCompletionReport
  state: SyncState
  /** Delivery attempts so far. */
  attempts: number
  /** Epoch ms before which drain must not retry this entry. */
  nextAttemptAt: number
  /** Human-readable last failure, surfaced to the driver on 'failed'. */
  lastError: string | null
  createdAt: number
}

export interface QueueCounts {
  pending: number
  syncing: number
  failed: number
  /** pending + syncing + failed — the at-a-glance "N unsynced" number. */
  unsynced: number
}

export interface ReplicaMeta {
  /** Epoch ms of last successful seed/refresh; null = never seeded. */
  seededAt: number | null
  itemCount: number
}
