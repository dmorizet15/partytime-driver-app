// ─── Offline core acceptance tests ───────────────────────────────────────────
// Acceptance criterion 5 made executable: the replica seeds, a scan while
// offline enqueues, the app restarts, the queue survives, connectivity
// returns, the queue drains exactly once. Plus the failure-policy contract:
// backoff, retries-exhausted surfacing, immediate 'failed' on body-checked
// rejection, crash-mid-drain recovery.
//
// These tests run the REAL IndexedDB code against fake-indexeddb. "App
// restart" = close the DB handle, throw away every in-memory object, and
// rebuild from the same IDBFactory (same persisted data, fresh process state).

import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openRfidDb, type RfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import { WriteQueue } from '../offline/writeQueue'
import { SyncEngine } from '../offline/syncEngine'
import { FakeConnectivity } from '../offline/connectivity'
import { FakeTagBackend } from '../testing/fakeTagBackend'
import { RecordingOrderSystem } from '../testing/recordingOrderSystem'
import { EPC, fixtureItems } from '../testing/fixtures'
import type { ItemStatusWrite } from '../ports/tagBackend'

let clock = 1_700_000_000_000
const now = () => clock

function statusWrite(epc: string, status: string): ItemStatusWrite {
  return { epc, status, scannedBy: 'test-driver', scannedAt: '2026-07-09 12:00:00' }
}

interface World {
  factory: IDBFactory
  db: RfidDb
  replica: ItemReplica
  queue: WriteQueue
  backend: FakeTagBackend
  orders: RecordingOrderSystem
  net: FakeConnectivity
  engine: SyncEngine
}

async function makeWorld(factory = new IDBFactory(), online = true): Promise<World> {
  const db = await openRfidDb('rfid-test', factory)
  const replica = new ItemReplica(db, now)
  const queue = new WriteQueue(db, now)
  await queue.recover()
  const backend = new FakeTagBackend(fixtureItems())
  const orders = new RecordingOrderSystem()
  const net = new FakeConnectivity(online)
  const engine = new SyncEngine(queue, net, { tagBackend: backend, orderSystem: orders, replica }).start()
  return { factory, db, replica, queue, backend, orders, net, engine }
}

/** Simulate process death + relaunch over the same persisted data. */
async function restart(w: World, online: boolean): Promise<World> {
  w.engine.stop()
  w.db.close()
  return makeWorld(w.factory, online)
}

describe('replica', () => {
  it('seeds from the backend and serves reads with the network dead', async () => {
    const w = await makeWorld()
    const written = await w.replica.seedFromBackend(w.backend)
    expect(written).toBe(6)
    expect((await w.replica.meta()).itemCount).toBe(6)

    // Kill the network completely — reads must not care.
    w.backend.setDefaultOutcome('timeout')
    w.net.setOnline(false)

    const item = await w.replica.getByEpc(EPC.rentable)
    expect(item?.commonName).toBe('TENT 20X20 FRAME')
    expect(item?.syncState).toBe('synced')
    expect(await w.replica.getByEpc('E280NOTINDB')).toBeUndefined()
    expect(await w.replica.getByRentalClass('RC-CHAIR-GARDEN')).toHaveLength(2)
  })

  it('refresh does not clobber items with unsynced local changes', async () => {
    const w = await makeWorld()
    await w.replica.seedFromBackend(w.backend)
    await w.replica.applyLocalChange(EPC.rentable, { currentStatus: 'Staged' }, 'pending')

    await w.replica.seedFromBackend(w.backend) // backend still says 'Ready to Rent'
    const item = await w.replica.getByEpc(EPC.rentable)
    expect(item?.currentStatus).toBe('Staged') // local overlay survived
    expect(item?.syncState).toBe('pending')

    // Untouched items DID refresh.
    expect((await w.replica.getByEpc(EPC.inWash))?.syncState).toBe('synced')
  })
})

describe('write queue — the offline round trip', () => {
  it('offline enqueue → restart → reconnect → drains exactly once', async () => {
    let w = await makeWorld(new IDBFactory(), false) // starts OFFLINE
    await w.replica.seedFromBackend(w.backend) // (seed happened earlier while online in reality)

    // Scan applies locally + enqueues; nothing reaches the backend.
    await w.replica.applyLocalChange(EPC.rentable, { currentStatus: 'Staged' })
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.rentable, 'Staged')])
    await w.engine.kick() // offline kick = no-op
    expect(w.backend.attempts).toHaveLength(0)
    expect((await w.queue.counts()).unsynced).toBe(1)

    // ── App dies and relaunches (still offline) ──
    w = await restart(w, false)
    expect((await w.queue.counts()).unsynced).toBe(1) // queue survived the restart
    expect((await w.replica.getByEpc(EPC.rentable))?.currentStatus).toBe('Staged')

    // ── Connectivity returns ──
    w.net.setOnline(true)
    await new Promise((r) => setTimeout(r, 0)) // let the reconnect listener start its drain
    await w.engine.kick() // joins the in-flight drain (single-flight) — completion is now certain
    expect(w.backend.attempts).toHaveLength(1) // sent exactly once
    expect(w.backend.appliedWrites).toHaveLength(1)
    expect((await w.queue.counts()).unsynced).toBe(0)
    expect((await w.replica.getByEpc(EPC.rentable))?.syncState).toBe('synced')

    // Draining again sends nothing — the entry is gone, not re-sent.
    await w.engine.kick()
    await w.engine.kick()
    expect(w.backend.attempts).toHaveLength(1)
  })

  it('single-flight: overlapping drains do not double-send', async () => {
    const w = await makeWorld()
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.rentable, 'Staged')])
    await Promise.all([w.engine.kick(), w.engine.kick(), w.engine.kick()])
    expect(w.backend.attempts).toHaveLength(1)
  })

  it('crash mid-drain: syncing entry recovers to pending and re-sends (payload is idempotent)', async () => {
    let w = await makeWorld(new IDBFactory(), false)
    const entry = await w.queue.enqueueItemStatusWrites([statusWrite(EPC.rentable, 'Staged')])
    // Simulate death between send and ack: entry persisted as 'syncing'.
    await w.db.put('writeQueue', { ...entry, state: 'syncing' })

    w = await restart(w, true) // recover() runs inside makeWorld
    expect((await w.queue.counts()).pending).toBe(1)
    await w.engine.kick()
    expect(w.backend.appliedWrites).toHaveLength(1)
    expect((await w.queue.counts()).unsynced).toBe(0)
  })

  it('network failures back off, surface as failed after retries exhaust, and manual retry re-arms', async () => {
    const w = await makeWorld()
    await w.replica.seedFromBackend(w.backend)
    w.backend.setDefaultOutcome('timeout')
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.rentable, 'Staged')])

    // Attempt 1 fails → backoff 30s.
    await w.engine.kick()
    expect(w.backend.attempts).toHaveLength(1)
    expect((await w.queue.counts()).pending).toBe(1)

    // Not due yet → drain skips it (no hammering).
    clock += 10_000
    await w.engine.kick()
    expect(w.backend.attempts).toHaveLength(1)

    // Walk the clock through the backoff schedule until retries exhaust (5 attempts).
    for (let i = 0; i < 4; i++) {
      clock += 2_000_000 // beyond any backoff step
      await w.engine.kick()
    }
    expect(w.backend.attempts).toHaveLength(5)
    const counts = await w.queue.counts()
    expect(counts.failed).toBe(1) // surfaced, not silently dropped
    expect(counts.unsynced).toBe(1)
    expect((await w.replica.getByEpc(EPC.rentable))?.syncState).toBe('failed')

    // Driver taps retry after the outage ends.
    w.backend.setDefaultOutcome('success')
    expect(await w.queue.retryFailed()).toBe(1)
    await w.engine.kick()
    expect((await w.queue.counts()).unsynced).toBe(0)
  })

  it('body-checked rejection (HTTP 200 + success:false) fails immediately — no blind retries', async () => {
    const w = await makeWorld()
    w.backend.scriptOutcomes('rejected')
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.rentable, 'Staged')])
    await w.engine.kick()

    expect(w.backend.attempts).toHaveLength(1) // exactly one attempt
    const counts = await w.queue.counts()
    expect(counts.failed).toBe(1)
    const [entry] = await w.queue.entries()
    expect(entry.lastError).toMatch(/body-checked/)
  })

  it('order completions ride the same queue and drain to the order system', async () => {
    const w = await makeWorld(new IDBFactory(), false)
    await w.queue.enqueueOrderCompletion('order-delivery', {
      stopId: 'stop-1',
      orderId: 'TG-5001',
      lines: [{ lineId: '88', quantity: 10 }],
      completedAt: '2026-07-09T15:00:00Z',
      gps: { lat: 35.04, lng: -85.3, capturedAt: now() },
    })
    expect(w.orders.deliveries).toHaveLength(0)

    w.net.setOnline(true)
    await new Promise((r) => setTimeout(r, 0))
    await w.engine.kick()
    expect(w.orders.deliveries).toHaveLength(1)
    expect(w.orders.deliveries[0].lines[0]).toEqual({ lineId: '88', quantity: 10 })
    expect((await w.queue.counts()).unsynced).toBe(0)
  })

  it('FIFO order is preserved across kinds', async () => {
    const w = await makeWorld(new IDBFactory(), false)
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.qualityA, 'Staged')])
    clock += 5
    await w.queue.enqueueItemStatusWrites([statusWrite(EPC.qualityB, 'Wash')])
    const entries = await w.queue.entries()
    expect(entries.map((e) => (e.payload as ItemStatusWrite[])[0].epc)).toEqual([
      EPC.qualityA,
      EPC.qualityB,
    ])
  })
})
