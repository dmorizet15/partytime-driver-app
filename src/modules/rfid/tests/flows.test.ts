// ─── Flow tests — ScanSession + CheckoutFlow against MockScanner + fixtures ──
// Acceptance criteria 6/7 at the logic layer: expected list from stop context
// (no manual entry), scans check off against expectation, ConflictInterrupt on
// non-rentable EPC, exceptions in the summary, completion writes ride the
// queue (status batch + order completion + GPS). Corrected scan model
// (2026-07-13): the status is ARMED BEFORE scanning — delivery is implicitly
// 'Delivered', pickup refuses scans until a vocabulary status (with required
// reasons for Wash/Repair) is armed, every counted scan is stamped with the
// armed status, and unscanned items get NO write (they retain 'Delivered').

import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openRfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import { WriteQueue } from '../offline/writeQueue'
import { FakeTagBackend } from '../testing/fakeTagBackend'
import { MockScanner } from '../testing/mockScanner'
import { ScriptedBridge } from '../testing/scriptedBridge'
import { RecordingOrderSystem } from '../testing/recordingOrderSystem'
import { FakeConnectivity } from '../offline/connectivity'
import { SyncEngine } from '../offline/syncEngine'
import { ScanSession, type ScanHit } from '../flows/scanSession'
import { CheckoutFlow, DELIVERY_STATUS } from '../flows/checkoutFlow'
import { BARCODE, EPC, NFC_UID, UNKNOWN_EPC, fixtureItems, FIXTURE_CONTRACT } from '../testing/fixtures'
import type { GeoPoint, LocationAdapter, StopContext } from '../adapters/types'
import type { ItemStatusWrite } from '../ports/tagBackend'

const gpsFix: GeoPoint = { lat: 35.0456, lng: -85.3097, capturedAt: 1 }
const location: LocationAdapter = { getCurrentPosition: async () => gpsFix }
const noLocation: LocationAdapter = { getCurrentPosition: async () => null }

function deliveryStop(): StopContext {
  return {
    stopId: 'stop-77',
    kind: 'delivery',
    orderId: 'TG-9001',
    contractNumber: FIXTURE_CONTRACT,
    clientName: 'Chattanooga Whiskey Co',
    expectedItems: [
      { lineId: '501', rentalClassId: 'RC-TENT-20X20', name: 'TENT 20X20 FRAME', quantity: 1 },
      { lineId: '502', rentalClassId: 'RC-CHAIR-GARDEN', name: 'CHAIR WHITE PADDED GARDEN', quantity: 2 },
      { lineId: null, rentalClassId: null, name: 'DANCE FLOOR 12X12', quantity: 1 }, // non-taggable → manual
    ],
  }
}

async function world() {
  const db = await openRfidDb('flow-test', new IDBFactory())
  const replica = new ItemReplica(db)
  const backend = new FakeTagBackend(fixtureItems())
  await replica.seedFromBackend(backend)
  const queue = new WriteQueue(db)
  const scanner = new MockScanner()
  const bridge = new ScriptedBridge()
  return { db, replica, backend, queue, scanner, bridge }
}

async function makeSession(
  w: Awaited<ReturnType<typeof world>>,
  onHit: (h: ScanHit) => void,
  dedupeMode: 'session' | 'window' = 'session',
) {
  const session = new ScanSession({
    scanner: w.scanner,
    bridge: w.bridge,
    replica: w.replica,
    onHit,
    dedupeMode,
    dedupeWindowMs: 0, // deterministic: rely on session-mode dedupe in these tests
  })
  return session
}

/** ScanSession.ingest resolves the replica asynchronously — settle microtasks. */
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('ScanSession', () => {
  it('resolves all three modalities to the same item and dedupes per session', async () => {
    const w = await world()
    const hits: ScanHit[] = []
    const s = await makeSession(w, (h) => hits.push(h))

    await s.startRfid()
    s.startBarcode()
    s.enableNfc()
    expect(w.bridge.callsTo('startBarcode')).toHaveLength(1)
    expect(w.bridge.callsTo('enableNfc')).toHaveLength(1)

    w.scanner.emitTag(EPC.rentable)
    w.scanner.emitDuplicates(EPC.rentable, 5) // Android would rapid-fire; session dedupes
    w.bridge.emit('barcode-scan', { value: BARCODE.rentable, format: 'CODE_128' })
    w.bridge.emit('nfc-scan', { uid: NFC_UID.rentable, tagType: 'ISO14443' })
    await settle()

    expect(hits).toHaveLength(3) // one per modality — identifiers differ, item is the same
    const epcs = new Set(hits.map((h) => h.item?.epc))
    expect(epcs).toEqual(new Set([EPC.rentable]))

    await s.dispose()
    expect(w.bridge.callsTo('disableNfc')).toHaveLength(1)
    expect(w.bridge.callsTo('stopBarcode')).toHaveLength(1)
  })

  it('press-and-hold start/stop cycles never multiply reads (single subscription per session)', async () => {
    const w = await world()
    const hits: ScanHit[] = []
    const s = await makeSession(w, (h) => hits.push(h), 'window')

    // Three trigger pulls — like three press-and-hold gestures.
    for (let i = 0; i < 3; i++) {
      await s.startRfid()
      w.scanner.emitTag(EPC.rentable)
      await s.stopRfid()
    }
    await settle()
    // Window dedupe is 0ms here, so every emission lands — but exactly ONCE
    // each. A per-start subscription would have delivered 1+2+3 = 6 hits.
    expect(hits).toHaveLength(3)
    await s.dispose()
  })

  it('reports unknown identifiers with item:null', async () => {
    const w = await world()
    const hits: ScanHit[] = []
    const s = await makeSession(w, (h) => hits.push(h))
    await s.startRfid()
    w.scanner.emitTag(UNKNOWN_EPC)
    await settle()
    expect(hits[0].item).toBeNull()
    await s.dispose()
  })
})

describe('CheckoutFlow — delivery', () => {
  async function scanInto(flow: CheckoutFlow, w: Awaited<ReturnType<typeof world>>, epc: string) {
    const item = (await w.replica.getByEpc(epc)) ?? null
    return flow.ingest({ modality: 'rfid', identifier: epc, item, at: 1 })
  }

  it('checks scans off against the expected list — no manual contract/client entry anywhere', async () => {
    const w = await world()
    const flow = new CheckoutFlow('delivery', deliveryStop(), location)

    // The flow was born knowing the contract + client from the stop context.
    expect(flow.stop.contractNumber).toBe(FIXTURE_CONTRACT)
    expect(flow.stop.clientName).toBe('Chattanooga Whiskey Co')

    expect(await scanInto(flow, w, EPC.rentable)).toBe('matched')
    expect(await scanInto(flow, w, EPC.qualityA)).toBe('matched')
    expect(await scanInto(flow, w, EPC.qualityA)).toBe('duplicate') // same unit twice
    expect(await scanInto(flow, w, EPC.qualityB)).toBe('matched')

    const tent = flow.lines.find((l) => l.rentalClassId === 'RC-TENT-20X20')
    const chairs = flow.lines.find((l) => l.rentalClassId === 'RC-CHAIR-GARDEN')
    expect(tent?.scannedEpcs).toEqual([EPC.rentable])
    expect(chairs?.scannedEpcs).toHaveLength(2)
  })

  it('raises ConflictInterrupt on non-rentable EPCs; two-tap override counts the unit', async () => {
    const w = await world()
    const flow = new CheckoutFlow('delivery', {
      ...deliveryStop(),
      expectedItems: [
        { lineId: '600', rentalClassId: 'RC-LINEN-90RND', name: 'LINEN 90IN ROUND WHITE', quantity: 1 },
      ],
    }, location)

    expect(await scanInto(flow, w, EPC.inWash)).toBe('conflict') // status = Wash → blocked
    expect(flow.conflicts).toHaveLength(1)
    expect(flow.conflicts[0].status).toBe('Wash')
    expect(flow.lines[0].scannedEpcs).toHaveLength(0) // NOT counted while blocked

    await flow.overrideConflict(0)
    expect(flow.conflicts[0].resolution).toBe('overridden')
    expect(flow.lines[0].scannedEpcs).toEqual([EPC.inWash])
  })

  it('surfaces discrepancies: unknown tag, not-on-order, overscan, short lines', async () => {
    const w = await world()
    const flow = new CheckoutFlow('delivery', deliveryStop(), location)

    await flow.ingest({ modality: 'rfid', identifier: UNKNOWN_EPC, item: null, at: 1 })
    expect(await scanInto(flow, w, EPC.wetItem)).toBe('conflict') // wet tent — conflict, leave blocked
    flow.blockConflict(0)
    expect(await scanInto(flow, w, EPC.rentable)).toBe('matched') // tent 1/1
    // Chairs never scanned; dance floor gets manual qty.
    flow.setManualQty(flow.lines[2].key, 1)

    const summary = flow.summary()
    expect(summary.rows.find((r) => r.name.startsWith('CHAIR'))?.exception).toBe('Short 2')
    expect(summary.rows.find((r) => r.name.startsWith('DANCE'))?.exception).toBeNull()
    expect(summary.unexpected.map((u) => u.reason)).toEqual(['unknown-tag'])
    expect(summary.conflicts.filter((c) => c.resolution === 'blocked')).toHaveLength(1)
    expect(summary.exceptionCount).toBe(3) // short chairs + unknown tag + blocked conflict
  })

  it('non-RFID lines never enter the scan path: scans cannot match them, manual entry cannot touch taggable lines', async () => {
    const w = await world()
    // The tent line is marked non-taggable by the host — a scanned tent must
    // NOT check it off, even though the rental class matches.
    const stop = deliveryStop()
    stop.expectedItems = [
      { lineId: '501', rentalClassId: 'RC-TENT-20X20', name: 'TENT 20X20 FRAME', quantity: 1, taggable: false },
    ]
    const flow = new CheckoutFlow('delivery', stop, location)
    expect(flow.lines[0].taggable).toBe(false)
    expect(await scanInto(flow, w, EPC.rentable)).toBe('unexpected') // not-on-order, not a match
    expect(flow.lines[0].scannedEpcs).toHaveLength(0)

    // Default heuristic: rentalClassId null → non-taggable; present → taggable.
    const heuristic = new CheckoutFlow('delivery', deliveryStop(), location)
    expect(heuristic.lines.map((l) => l.taggable)).toEqual([true, true, false])
    // Manual entry refuses RFID-tracked lines.
    expect(() => heuristic.setManualQty(heuristic.lines[0].key, 1)).toThrow(/RFID-tracked/)
    expect(() => heuristic.addManualUnit(heuristic.lines[0].key, 'SN-X')).toThrow(/RFID-tracked/)
  })

  it('manual selection: bulk quantity OR individual serialized units, mutually exclusive', async () => {
    const flow = new CheckoutFlow('delivery', deliveryStop(), location)
    const dance = flow.lines[2] // non-taggable

    flow.setManualQty(dance.key, 2)
    expect(flow.confirmedQty(dance)).toBe(2)

    // Switching to per-unit selection clears the bulk figure.
    flow.addManualUnit(dance.key, 'DF-0007')
    flow.addManualUnit(dance.key, 'DF-0011')
    expect(dance.manualQty).toBeNull()
    expect(flow.confirmedQty(dance)).toBe(2)
    expect(dance.manualUnits).toEqual(['DF-0007', 'DF-0011'])

    flow.removeManualUnit(dance.key, 0)
    expect(flow.confirmedQty(dance)).toBe(1)

    // And bulk clears the units.
    flow.setManualQty(dance.key, 1)
    expect(dance.manualUnits).toEqual([])
    expect(flow.confirmedQty(dance)).toBe(1)
  })

  it('complete(): one status batch with GPS + contract rides the queue, then the order completion', async () => {
    const w = await world()
    const flow = new CheckoutFlow('delivery', deliveryStop(), location)
    await scanInto(flow, w, EPC.rentable)
    await scanInto(flow, w, EPC.qualityA)
    flow.setManualQty(flow.lines[2].key, 1)
    await new Promise((r) => setTimeout(r, 0)) // let scan-time GPS captures land

    const { statusWrites } = await flow.complete({
      queue: w.queue,
      replica: w.replica,
      scannedBy: 'Darren M',
      timestamp: '2026-07-09 15:30:00',
      completedAtIso: '2026-07-09T15:30:00Z',
    })

    expect(statusWrites).toHaveLength(2)
    for (const write of statusWrites) {
      expect(write.status).toBe(DELIVERY_STATUS)
      expect(write.contractNumber).toBe(FIXTURE_CONTRACT)
      expect(write.lat).toBe('35.0456') // GPS captured at scan time, on every write
      expect(write.lng).toBe('-85.3097')
      expect(write.scannedBy).toBe('Darren M') // real identity, not 'ptr-driver'
    }

    // Local overlay is immediate; queue holds exactly two entries (status batch + order).
    expect((await w.replica.getByEpc(EPC.rentable))?.currentStatus).toBe(DELIVERY_STATUS)
    expect((await w.replica.getByEpc(EPC.rentable))?.syncState).toBe('pending')
    const entries = await w.queue.entries()
    expect(entries.map((e) => e.kind)).toEqual(['item-status', 'order-delivery'])

    // Drain → backend gets ONE upsert batch; order system gets the completion with absolute quantities.
    const orders = new RecordingOrderSystem()
    const net = new FakeConnectivity(true)
    const engine = new SyncEngine(w.queue, net, {
      tagBackend: w.backend,
      orderSystem: orders,
      replica: w.replica,
    })
    await engine.kick()
    expect(w.backend.appliedWrites).toHaveLength(1)
    expect(w.backend.appliedWrites[0]).toHaveLength(2)
    expect(orders.deliveries).toHaveLength(1)
    expect(orders.deliveries[0].lines).toEqual([
      { lineId: '501', quantity: 1 },
      { lineId: '502', quantity: 1 },
      { lineId: null, quantity: 1 },
    ])
    expect((await w.queue.counts()).unsynced).toBe(0)
  })

  it('completes without coordinates when GPS is unavailable — write proceeds, fields absent', async () => {
    const w = await world()
    const flow = new CheckoutFlow('delivery', deliveryStop(), noLocation)
    await scanInto(flow, w, EPC.rentable)
    const { statusWrites } = await flow.complete({
      queue: w.queue,
      replica: w.replica,
      scannedBy: 'Darren M',
      timestamp: '2026-07-09 15:30:00',
      completedAtIso: '2026-07-09T15:30:00Z',
    })
    expect(statusWrites[0].lat).toBeUndefined()
    expect(statusWrites[0].lng).toBeUndefined()
  })
})

describe('CheckoutFlow — pickup', () => {
  function pickupStop(): StopContext {
    return {
      stopId: 'stop-88',
      kind: 'pickup',
      orderId: 'TG-9002',
      contractNumber: FIXTURE_CONTRACT,
      clientName: 'Chattanooga Whiskey Co',
      expectedItems: [
        { lineId: '701', rentalClassId: 'RC-TENT-20X20', name: 'TENT 20X20 FRAME', quantity: 1 },
        { lineId: '702', rentalClassId: 'RC-CHAIR-GARDEN', name: 'CHAIR WHITE PADDED GARDEN', quantity: 2 },
      ],
    }
  }

  async function scanInto(flow: CheckoutFlow, w: Awaited<ReturnType<typeof world>>, epc: string) {
    const item = (await w.replica.getByEpc(epc)) ?? null
    return flow.ingest({ modality: 'rfid', identifier: epc, item, at: 1 })
  }

  it('REFUSES scans until a status is armed — the status is chosen BEFORE scanning', async () => {
    const w = await world()
    const flow = new CheckoutFlow('pickup', pickupStop(), location)
    expect(flow.armedStatus).toBeNull()
    await expect(scanInto(flow, w, EPC.rentable)).rejects.toThrow(/no status armed/)

    flow.armStatus('Ready to Rent')
    expect(flow.armedStatus?.status).toBe('Ready to Rent')
    expect(await scanInto(flow, w, EPC.rentable)).toBe('matched')

    flow.disarmStatus()
    await expect(scanInto(flow, w, EPC.qualityA)).rejects.toThrow(/no status armed/)
  })

  it('accepts items back regardless of status (no delivery conflicts on pickup)', async () => {
    const w = await world()
    const flow = new CheckoutFlow('pickup', pickupStop(), location)
    flow.armStatus('Ready to Rent')
    // A wet tent coming BACK is normal — not a conflict.
    expect(await scanInto(flow, w, EPC.wetItem)).toBe('matched')
    expect(flow.conflicts).toHaveLength(0)
  })

  it('arming uses the exact vocabulary; Wash/Repair REQUIRE a reason AT ARM TIME', async () => {
    const w = await world()
    const flow = new CheckoutFlow('pickup', pickupStop(), location)

    // Reason-required statuses refuse to arm without one — before any scan.
    expect(() => flow.armStatus('Wash')).toThrow(/requires at least one reason/)
    expect(() => flow.armStatus('Repair')).toThrow(/requires at least one reason/)

    // Each scan is stamped with the status armed at that moment.
    flow.armStatus('Wash', ['Dirty / Mud', 'Leaves'])
    await scanInto(flow, w, EPC.rentable)
    flow.armStatus('Repair', ['Rip or Tear'], 'NW corner seam')
    await scanInto(flow, w, EPC.qualityA)
    flow.armStatus('Wet')
    await scanInto(flow, w, EPC.qualityB)

    expect(flow.flags.get(EPC.rentable)?.reasons).toEqual(['Dirty / Mud', 'Leaves'])
    expect(flow.flags.get(EPC.qualityA)?.status).toBe('Repair')
    expect(flow.flags.get(EPC.qualityB)?.status).toBe('Wet')
    expect(flow.flags.size).toBe(3)
  })

  it('complete(): stamped statuses + reason notes in ONE batch; UNSCANNED items get NO write (retain Delivered)', async () => {
    const w = await world()
    const flow = new CheckoutFlow('pickup', pickupStop(), location)
    flow.armStatus('Wash', ['Dirty / Mud'])
    await scanInto(flow, w, EPC.rentable)
    flow.armStatus('Repair', ['Grommet'], 'NE corner')
    await scanInto(flow, w, EPC.qualityA)
    // EPC.qualityB (the second chair) is never scanned back.

    const { statusWrites, orderKind } = await flow.complete({
      queue: w.queue,
      replica: w.replica,
      scannedBy: 'Darren M',
      timestamp: '2026-07-09 18:00:00',
      completedAtIso: '2026-07-09T18:00:00Z',
    })

    expect(orderKind).toBe('order-pickup')
    const byEpc = new Map(statusWrites.map((s: ItemStatusWrite) => [s.epc, s]))
    expect(byEpc.get(EPC.rentable)).toMatchObject({
      status: 'Wash',
      statusNotes: 'Wash: Dirty / Mud',
    })
    expect(byEpc.get(EPC.qualityA)).toMatchObject({
      status: 'Repair',
      statusNotes: 'Repair: Grommet, Location of Repair: NE corner',
    })
    // No default status exists: nothing was written for the unscanned chair,
    // so upstream it retains 'Delivered'.
    expect(statusWrites).toHaveLength(2)
    expect(byEpc.has(EPC.qualityB)).toBe(false)
    expect((await w.replica.getByEpc(EPC.qualityB))?.syncState).toBe('synced')

    // Batch shape: one item-status entry (N rows), one order entry.
    const entries = await w.queue.entries()
    expect(entries.map((e) => e.kind)).toEqual(['item-status', 'order-pickup'])
    expect((entries[0].payload as ItemStatusWrite[])).toHaveLength(2)
    // The summary is honest about the short line.
    expect(flow.summary().rows.find((r) => r.name.startsWith('CHAIR'))?.exception).toBe('Short 1')
  })

  it('pre-fetches expected items by last contract from the REPLICA (offline)', async () => {
    const w = await world()
    // FakeTagBackend fixtures: three items carry FIXTURE_PRIOR_CONTRACT.
    const expected = await w.replica.getByLastContract('C-3877')
    expect(expected.map((i) => i.epc).sort()).toEqual(
      [EPC.rentable, EPC.inWash, EPC.inRepair].sort(),
    )
  })
})
