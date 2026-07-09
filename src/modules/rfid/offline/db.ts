// ─── IndexedDB plumbing — tiny promise wrapper, injectable factory ──────────
// The replica can exceed 8k records (Easy RFID Pro live count observed 8,397),
// which rules out localStorage. The IDBFactory is injectable so tests run the
// REAL IndexedDB code against fake-indexeddb, including restart simulation
// (close + reopen over the same factory = same persisted data).

const DB_VERSION = 1

export const STORE_ITEMS = 'items'
export const STORE_QUEUE = 'writeQueue'
export const STORE_META = 'meta'

export interface RfidDb {
  readonly raw: IDBDatabase
  get<T>(store: string, key: IDBValidKey): Promise<T | undefined>
  getAll<T>(store: string): Promise<T[]>
  put(store: string, value: unknown): Promise<void>
  putWithKey(store: string, key: IDBValidKey, value: unknown): Promise<void>
  bulkPut(store: string, values: unknown[]): Promise<void>
  delete(store: string, key: IDBValidKey): Promise<void>
  count(store: string): Promise<number>
  close(): void
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
  })
}

export async function openRfidDb(
  name = 'rfid-module',
  factory: IDBFactory = globalThis.indexedDB,
): Promise<RfidDb> {
  if (!factory) throw new Error('IndexedDB unavailable — offline core cannot start')

  const open = factory.open(name, DB_VERSION)
  open.onupgradeneeded = () => {
    const db = open.result
    if (!db.objectStoreNames.contains(STORE_ITEMS)) {
      const items = db.createObjectStore(STORE_ITEMS, { keyPath: 'epc' })
      items.createIndex('rentalClassId', 'rentalClassId', { unique: false })
      items.createIndex('syncState', 'syncState', { unique: false })
      items.createIndex('lastContractNum', 'lastContractNum', { unique: false })
    }
    if (!db.objectStoreNames.contains(STORE_QUEUE)) {
      db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
    }
    if (!db.objectStoreNames.contains(STORE_META)) {
      db.createObjectStore(STORE_META)
    }
  }
  const db = await req(open)

  return {
    raw: db,
    async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
      return req(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>
    },
    async getAll<T>(store: string): Promise<T[]> {
      return req(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>
    },
    async put(store: string, value: unknown): Promise<void> {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      await txDone(tx)
    },
    async putWithKey(store: string, key: IDBValidKey, value: unknown): Promise<void> {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      await txDone(tx)
    },
    async bulkPut(store: string, values: unknown[]): Promise<void> {
      const tx = db.transaction(store, 'readwrite')
      const s = tx.objectStore(store)
      for (const v of values) s.put(v)
      await txDone(tx)
    },
    async delete(store: string, key: IDBValidKey): Promise<void> {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      await txDone(tx)
    },
    async count(store: string): Promise<number> {
      return req(db.transaction(store, 'readonly').objectStore(store).count())
    },
    close(): void {
      db.close()
    },
  }
}
