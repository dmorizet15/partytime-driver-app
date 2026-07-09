// ─── Harness self-tests ───────────────────────────────────────────────────────
// The verification vehicle has to be trustworthy before anything is verified
// with it. These tests pin the behavioral rules of every double: MockScanner's
// hardware-honest delivery gates, ScriptedBridge event plumbing,
// FakeTagBackend's scripted outcomes (incl. the 200+success:false case), and
// the FakeConnectivity network toggle.

import { describe, expect, it } from 'vitest'
import { MockScanner } from '../testing/mockScanner'
import { ScriptedBridge } from '../testing/scriptedBridge'
import { FakeTagBackend } from '../testing/fakeTagBackend'
import { RecordingOrderSystem } from '../testing/recordingOrderSystem'
import { FakeConnectivity } from '../offline/connectivity'
import { EPC, NON_RENTABLE_STATUSES, UNKNOWN_EPC, fixtureItems } from '../testing/fixtures'
import { TagBackendError } from '../ports/tagBackend'

describe('MockScanner', () => {
  it('delivers reads only while initialized AND inventory is running', async () => {
    const s = new MockScanner()
    const reads: string[] = []
    s.onTagRead((r) => reads.push(r.epc))

    expect(s.emitTag(EPC.rentable)).toBe(false) // not initialized
    await s.initialize()
    expect(s.emitTag(EPC.rentable)).toBe(false) // inventory not running
    await s.startInventory(1)
    expect(s.emitTag(EPC.rentable)).toBe(true)
    await s.stopInventory()
    expect(s.emitTag(EPC.rentable)).toBe(false)
    expect(reads).toEqual([EPC.rentable])
  })

  it('supports bursts, duplicates, unknown EPCs, and non-rentable EPCs', async () => {
    const s = new MockScanner()
    const reads: string[] = []
    s.onTagRead((r) => reads.push(r.epc))
    await s.initialize()
    await s.startInventory()

    expect(s.emitBurst([EPC.rentable, EPC.qualityA, EPC.qualityB])).toBe(3)
    expect(s.emitDuplicates(EPC.rentable, 3)).toBe(3) // duplicates delivered raw
    expect(s.emitTag(UNKNOWN_EPC)).toBe(true) // scanner doesn't know the replica
    expect(s.emitTag(EPC.inWash)).toBe(true) // non-rentable is a replica concept
    expect(reads).toHaveLength(8)
  })

  it('release() powers down: inventory stops, locate loops die', async () => {
    const s = new MockScanner()
    await s.initialize()
    await s.startInventory()
    const rssi: number[] = []
    s.findEpc(EPC.rentable, (v) => rssi.push(v))
    s.emitLocateRssi(EPC.rentable, 80)
    await s.release()
    s.emitLocateRssi(EPC.rentable, 90) // dead loop — must not fire
    expect(s.emitTag(EPC.rentable)).toBe(false)
    expect(rssi).toEqual([80])
    expect(s.state.initialized).toBe(false)
  })

  it('clamps power to the device range and applies masks to reads', async () => {
    const s = new MockScanner()
    await s.initialize()
    await s.setOutputPower(99)
    expect(await s.getOutputPower()).toBe(33)
    await s.setOutputPower(-5)
    expect(await s.getOutputPower()).toBe(0)

    await s.startInventory()
    await s.addMask('E2801170000000000000000') // matches fixtures, not UNKNOWN
    expect(s.emitTag(EPC.rentable)).toBe(true)
    expect(s.emitTag('AAAA00000000000000000000')).toBe(false)
    await s.clearMask()
    expect(s.emitTag('AAAA00000000000000000000')).toBe(true)
  })

  it('tag memory: writeTagEpc re-keys the tag', async () => {
    const s = new MockScanner()
    s.seedTag(EPC.rentable, 'TID-1', { user: 'DEADBEEF' })
    await s.initialize()
    expect(await s.readTag(EPC.rentable, 'user', 0, 2)).toBe('DEADBEEF')
    await s.writeTagEpc(EPC.rentable, UNKNOWN_EPC)
    expect(await s.readTag(UNKNOWN_EPC, 'user', 0, 2)).toBe('DEADBEEF')
    await expect(s.readTag(EPC.rentable, 'user', 0, 2)).rejects.toThrow()
  })
})

describe('ScriptedBridge', () => {
  it('records calls and delivers typed events with timestamps', () => {
    const b = new ScriptedBridge()
    const barcodes: string[] = []
    const nfc: string[] = []
    const off = b.on('barcode-scan', (d) => barcodes.push(d.value))
    b.on('nfc-scan', (d) => nfc.push(d.uid))

    b.startRfid()
    b.setPower(15)
    b.emit('barcode-scan', { value: '123456', format: 'CODE_128' })
    b.emit('nfc-scan', { uid: '04:A3:22:B1', tagType: 'ISO14443' })
    off()
    b.emit('barcode-scan', { value: 'after-unsub', format: 'CODE_128' })

    expect(b.callsTo('startRfid')).toHaveLength(1)
    expect(b.callsTo('setPower')[0].args).toEqual([15])
    expect(barcodes).toEqual(['123456'])
    expect(nfc).toEqual(['04:A3:22:B1'])
  })
})

describe('FakeTagBackend', () => {
  it('returns fixtures on success and mutates them on upsert (like the real backend)', async () => {
    const backend = new FakeTagBackend(fixtureItems())
    const items = await backend.fetchAllItems()
    expect(items).toHaveLength(6)
    expect(items.filter((i) => NON_RENTABLE_STATUSES.has(i.currentStatus))).toHaveLength(3)

    const res = await backend.writeItemStatuses([
      { epc: EPC.inWash, status: 'Ready to Rent', scannedBy: 'test', scannedAt: '2026-07-09 12:00:00' },
    ])
    expect(res).toMatchObject({ ok: true, successCount: 1, failedCount: 0 })
    const after = await backend.fetchAllItems()
    expect(after.find((i) => i.epc === EPC.inWash)?.currentStatus).toBe('Ready to Rent')
  })

  it("scripts the live API's failure modes: 200+success:false and timeout", async () => {
    const backend = new FakeTagBackend(fixtureItems())
    backend.scriptOutcomes('rejected', 'timeout', 'success')

    const write = [{ epc: EPC.rentable, status: 'Staged', scannedBy: 't', scannedAt: 'x' }]
    const rejected = await backend.writeItemStatuses(write)
    expect(rejected.ok).toBe(false) // completed HTTP-wise, failed body-wise
    expect(rejected.failedCount).toBe(1)

    await expect(backend.writeItemStatuses(write)).rejects.toThrow(TagBackendError)

    const ok = await backend.writeItemStatuses(write)
    expect(ok.ok).toBe(true)
    expect(backend.attempts).toHaveLength(3) // every attempt recorded
    expect(backend.appliedWrites).toHaveLength(1) // only the success applied
  })
})

describe('RecordingOrderSystem', () => {
  it('records payloads, never sends, reports dry-run', async () => {
    const orders = new RecordingOrderSystem()
    const report = {
      stopId: 's1',
      orderId: 'o1',
      lines: [{ lineId: '77', quantity: 4 }],
      completedAt: '2026-07-09T12:00:00Z',
      gps: null,
    }
    const res = await orders.recordDeliveryCompletion(report)
    expect(res.ok).toBe(true)
    expect(res.dryRun).toBe(true)
    expect(orders.deliveries).toHaveLength(1)
    expect(orders.deliveries[0]).not.toBe(report) // stored copy, not the caller's object
  })
})

describe('FakeConnectivity (network toggle)', () => {
  it('toggles and notifies listeners once per transition', () => {
    const net = new FakeConnectivity(true)
    const events: boolean[] = []
    net.onChange((v) => events.push(v))
    net.setOnline(false)
    net.setOnline(false) // no-op, no duplicate event
    net.setOnline(true)
    expect(net.isOnline()).toBe(true)
    expect(events).toEqual([false, true])
  })
})
