// ─── Generator Stop Actions — offline photo queue (IndexedDB) ───────────────
// Every other driver-app offline queue (ptd_equipreturn_queue, ptd_checkoff_
// queue, completeQueue.ts) holds small JSON in localStorage. That doesn't
// work here: a required capture photo is a Blob, and localStorage can't hold
// binary data at any real size without a lossy/expensive base64 round-trip
// that risks blowing the ~5-10MB total localStorage quota on one photo.
// IndexedDB is the correct substrate for binary — this is a genuinely new
// mechanism, not a drop-in reuse of the existing queue pattern, even though
// it's driven by the same trigger (loadDay, on reconnect/app-load).
//
// One record per (stop, asset, action) — mirrors the table's own
// UNIQUE(stop_id, asset_id, action_type). A record is either a real capture
// (photoBlob + hourMeter + fuelLevel) or a skip (skipReason + skipNote);
// never both, mirroring the table's capture-or-skip CHECK constraint.

const DB_NAME = 'ptd-generator-actions'
const DB_VERSION = 1
const STORE = 'queue'

export type GeneratorActionType = 'delivery_out' | 'pickup_in'
export type FuelLevel = 'full' | 'three_quarter' | 'half' | 'quarter' | 'empty'
export type SkipReason = 'no_meter' | 'unreadable' | 'other'

export interface QueuedGeneratorAction {
  id: string   // `${stopId}:${assetId}:${actionType}` — same key shape as the table's unique constraint
  stopId: string
  assetId: string
  actionType: GeneratorActionType
  itemName: string
  unitLabel: string
  photoBlob?: Blob
  photoExt?: string
  hourMeter?: number
  fuelLevel?: FuelLevel
  skipReason?: SkipReason
  skipNote?: string
  reservationId?: string | null
  queuedAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function queueKey(stopId: string, assetId: string, actionType: GeneratorActionType): string {
  return `${stopId}:${assetId}:${actionType}`
}

export async function enqueueGeneratorAction(record: QueuedGeneratorAction): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    // IndexedDB unavailable (private browsing quota, etc.) — the capture
    // still resolved the local gate optimistically; it just can't survive a
    // hard reload before reconnecting. Logged, not thrown — never blocks the
    // driver from advancing.
    console.error('[generator-actions] IndexedDB enqueue failed', err)
  }
}

export async function listQueuedGeneratorActions(): Promise<QueuedGeneratorAction[]> {
  try {
    const db = await openDb()
    const result = await new Promise<QueuedGeneratorAction[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as QueuedGeneratorAction[])
      req.onerror = () => reject(req.error)
    })
    db.close()
    return result
  } catch (err) {
    console.error('[generator-actions] IndexedDB read failed', err)
    return []
  }
}

export async function removeQueuedGeneratorAction(id: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.error('[generator-actions] IndexedDB delete failed', err)
  }
}

// For the stop-detail screen to know, on mount, whether a unit's resolution
// already happened this session but hasn't flushed yet (survives a back-out
// within the same app session; a hard reload before flush loses it — same
// honest limitation as sessionStorage drafts elsewhere in this app).
export async function getQueuedGeneratorAction(
  stopId: string, assetId: string, actionType: GeneratorActionType,
): Promise<QueuedGeneratorAction | null> {
  const all = await listQueuedGeneratorActions()
  return all.find((r) => r.id === queueKey(stopId, assetId, actionType)) ?? null
}
