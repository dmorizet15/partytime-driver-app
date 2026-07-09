// ─── ItemReplica — the local item table every read path hits first ──────────
// Seeded from TagBackendPort.fetchAllItems() (the "Get Seed Data" / "Sync
// Item List" actions), refreshable on demand. App reads come from HERE, never
// the network. Local status changes overlay the replica immediately (the
// driver sees their own writes) and carry a syncState until the queue drains.

import type { ItemRecord } from '../ports/tagBackend'
import type { TagBackendPort } from '../ports/tagBackend'
import { STORE_ITEMS, STORE_META, type RfidDb } from './db'
import type { ReplicaItem, ReplicaMeta, SyncState } from './types'

const META_KEY = 'replica'

function toReplicaItem(record: ItemRecord, now: number): ReplicaItem {
  return { ...record, syncState: 'synced', updatedAt: now }
}

export class ItemReplica {
  constructor(
    private readonly db: RfidDb,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Seed/refresh from the backend. Items with an unsynced local change are
   * NOT clobbered — the local overlay wins until its queued write lands.
   * Returns the number of records written.
   */
  async seedFromBackend(backend: TagBackendPort): Promise<number> {
    const records = await backend.fetchAllItems()
    const existing = await this.db.getAll<ReplicaItem>(STORE_ITEMS)
    const locallyDirty = new Set(
      existing.filter((i) => i.syncState !== 'synced').map((i) => i.epc),
    )
    const stamp = this.now()
    const fresh = records.filter((r) => !locallyDirty.has(r.epc))
    await this.db.bulkPut(STORE_ITEMS, fresh.map((r) => toReplicaItem(r, stamp)))
    await this.db.putWithKey(STORE_META, META_KEY, {
      seededAt: stamp,
      itemCount: await this.db.count(STORE_ITEMS),
    } satisfies ReplicaMeta)
    return fresh.length
  }

  async meta(): Promise<ReplicaMeta> {
    return (
      (await this.db.get<ReplicaMeta>(STORE_META, META_KEY)) ?? { seededAt: null, itemCount: 0 }
    )
  }

  async getByEpc(epc: string): Promise<ReplicaItem | undefined> {
    return this.db.get<ReplicaItem>(STORE_ITEMS, epc.toUpperCase())
  }

  async getAll(): Promise<ReplicaItem[]> {
    return this.db.getAll<ReplicaItem>(STORE_ITEMS)
  }

  /** Items expected back on a pickup — replica-side filter by last contract. */
  async getByLastContract(contractNumber: string): Promise<ReplicaItem[]> {
    const all = await this.getAll()
    return all.filter((i) => i.lastContractNum === contractNumber)
  }

  async getByRentalClass(rentalClassId: string): Promise<ReplicaItem[]> {
    const all = await this.getAll()
    return all.filter((i) => i.rentalClassId === rentalClassId)
  }

  /** Any-modality resolution — every lookup lands on the same item record. */
  async getByBarcode(barcode: string): Promise<ReplicaItem | undefined> {
    const all = await this.getAll()
    return all.find((i) => i.barcode !== null && i.barcode === barcode)
  }

  async getByNfcUid(nfcUid: string): Promise<ReplicaItem | undefined> {
    const normalized = nfcUid.toUpperCase()
    const all = await this.getAll()
    return all.find((i) => i.nfcUid !== null && i.nfcUid.toUpperCase() === normalized)
  }

  /**
   * Apply a local mutation (status/quality/notes change) as an overlay:
   * visible to every read immediately, marked with the given sync state so
   * the UI can badge it until the corresponding queue entry lands.
   */
  async applyLocalChange(
    epc: string,
    change: Partial<Pick<ReplicaItem, 'currentStatus' | 'quality' | 'statusNotes' | 'notes' | 'lastContractNum' | 'lastScanBy' | 'lastScanDate' | 'gpsLat' | 'gpsLng'>>,
    syncState: SyncState = 'pending',
  ): Promise<void> {
    const item = await this.getByEpc(epc)
    if (!item) return // unknown-EPC writes still ride the queue; nothing to overlay
    await this.db.put(STORE_ITEMS, { ...item, ...change, syncState, updatedAt: this.now() })
  }

  /** Flip items' sync state (queue drain reporting success/failure). */
  async setSyncState(epcs: string[], syncState: SyncState): Promise<void> {
    for (const epc of epcs) {
      const item = await this.getByEpc(epc)
      if (item) await this.db.put(STORE_ITEMS, { ...item, syncState, updatedAt: this.now() })
    }
  }
}
