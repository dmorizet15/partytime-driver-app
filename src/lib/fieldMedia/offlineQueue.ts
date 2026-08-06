// ─── Field media — capture queue (IndexedDB) ─────────────────────────────────
// Same substrate and the same reasons as generatorActions/offlineQueue.ts: the
// payload is a Blob, and localStorage can't hold binary at this size without a
// base64 round-trip that would blow the ~5–10 MB quota on a single photo — let
// alone a 50 MB clip.
//
// Its own database rather than a second store inside ptd-generator-actions:
// bumping that DB's version to add a store would force an upgrade transaction
// on every driver whose generator queue is mid-flight, for no benefit. The two
// features are independent.
//
// One record per capture (`${stopId}:${capturedAtMs}`) — a stop can carry
// several photos and clips, unlike generator actions where the key is
// deliberately one-per-unit-per-action.
//
// Every op opens and closes the db and swallows its own errors: a queue that
// throws would block the driver, and the whole point of this feature is that
// it never does.

import type { QueuedFieldMedia } from './types'

const DB_NAME = 'ptd-field-media'
const DB_VERSION = 1
const STORE = 'queue'

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

export function fieldMediaKey(stopId: string, capturedAtMs: number): string {
  return `${stopId}:${capturedAtMs}`
}

export async function enqueueFieldMedia(record: QueuedFieldMedia): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
    return true
  } catch (err) {
    // IndexedDB unavailable (private browsing, quota) — unlike a generator
    // capture there is no optimistic local state to fall back on, so the
    // caller MUST surface this. Returning false rather than throwing keeps
    // the failure explicit at the call site.
    console.error('[field-media] IndexedDB enqueue failed', err)
    return false
  }
}

export async function listQueuedFieldMedia(): Promise<QueuedFieldMedia[]> {
  try {
    const db = await openDb()
    const result = await new Promise<QueuedFieldMedia[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result as QueuedFieldMedia[])
      req.onerror = () => reject(req.error)
    })
    db.close()
    // Oldest first — a driver's morning clip should not sit behind the
    // afternoon's.
    return result.sort((a, b) => a.capturedAtMs - b.capturedAtMs)
  } catch (err) {
    console.error('[field-media] IndexedDB read failed', err)
    return []
  }
}

export async function removeQueuedFieldMedia(id: string): Promise<void> {
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
    console.error('[field-media] IndexedDB delete failed', err)
  }
}

export async function countQueuedFieldMedia(): Promise<number> {
  return (await listQueuedFieldMedia()).length
}
