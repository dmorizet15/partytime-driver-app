// ─── LIVE harness — real Item Master → replica → MockScanner resolution ─────
// Gated behind RFID_LIVE=1 because it needs (a) the dev server running on
// localhost:3000 and (b) real Easy RFID Pro credentials in .env.local. It is
// SKIPPED (visibly, never faked green) in normal `npm test` / CI runs.
//
//   RFID_LIVE=1 npx vitest run src/modules/rfid/tests/liveResolution.test.ts
//
// What it proves (first proven 2026-07-15, 13,024-row production Item Master):
//   1. The real API seeds the real replica code end-to-end (auth, paging past
//      the server's silent 200-row limit cap, wire→module field mapping).
//   2. A MockScanner EPC emission resolves through ScanSession against the
//      replica to the correct real item (rental class, common name, quality,
//      status).
//   3. Resolution needs ZERO network after the seed: fetch is sabotaged, the
//      DB handle is closed and reopened (app restart), and resolution still
//      works from the persisted replica.
// READ-ONLY: nothing here writes to Easy RFID Pro or TapGoods.

import { afterAll, describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { openRfidDb } from '../offline/db'
import { ItemReplica } from '../offline/replica'
import { HttpTagBackend } from '../server/httpTagBackend'
import { ScanSession, type ScanHit } from '../flows/scanSession'
import { MockScanner } from '../testing/mockScanner'
import { ScriptedBridge } from '../testing/scriptedBridge'

const LIVE = process.env.RFID_LIVE === '1'
const BASE = process.env.RFID_LIVE_BASE ?? 'http://localhost:3000/api/rfid-module'

const realFetch = globalThis.fetch

async function hitFor(session: ScanSession, scanner: MockScanner, epc: string): Promise<ScanHit> {
  // ingest is async — the hit lands on a microtask after emitTag.
  const hit = new Promise<ScanHit>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no hit for ${epc} within 2s`)), 2000)
    hits.push((h) => {
      clearTimeout(timer)
      resolve(h)
    })
  })
  expect(scanner.emitTag(epc)).toBe(true)
  return hit
}

const hits: Array<(h: ScanHit) => void> = []
const onHit = (h: ScanHit) => hits.shift()?.(h)

describe.skipIf(!LIVE)('LIVE: real Item Master → replica → resolution (read-only)', () => {
  const factory = new IDBFactory()

  afterAll(() => {
    globalThis.fetch = realFetch
  })

  it('seeds the full real Item Master, resolves a real EPC via MockScanner, then resolves again with the network dead', async () => {
    // ── 1. Seed from the real API through the module's own client path ──────
    const db = await openRfidDb('rfid-live-harness', factory)
    const replica = new ItemReplica(db)
    const backend = new HttpTagBackend({ basePath: BASE })
    const t0 = Date.now()
    const written = await replica.seedFromBackend(backend)
    const seedMs = Date.now() - t0
    // eslint-disable-next-line no-console
    console.info(`[live] seeded ${written} records in ${seedMs}ms`)
    expect(written).toBeGreaterThan(10_000) // fleet is ~13k; 200 would be the truncation bug

    // ── 2. Pick a known-good record out of the seeded replica ───────────────
    const all = await replica.getAll()
    const target = all.find((i) => i.epc && i.commonName && i.rentalClassId && i.quality)
    expect(target).toBeDefined()
    const epc = (target as NonNullable<typeof target>).epc

    // ── 3. MockScanner emission resolves to the correct real item ───────────
    const scanner = new MockScanner()
    const session = new ScanSession({
      scanner,
      bridge: new ScriptedBridge(),
      replica,
      onHit,
      dedupeMode: 'window',
    })
    await session.startRfid()
    const hit = await hitFor(session, scanner, epc)
    expect(hit.modality).toBe('rfid')
    expect(hit.item).not.toBeNull()
    expect(hit.item?.epc).toBe(epc)
    expect(hit.item?.commonName).toBe(target?.commonName)
    expect(hit.item?.rentalClassId).toBe(target?.rentalClassId)
    expect(hit.item?.quality).toBe(target?.quality)
    expect(hit.item?.currentStatus).toBe(target?.currentStatus)
    await session.dispose()

    // ── 4. Kill the network + restart the app; resolution still works ───────
    globalThis.fetch = (async () => {
      throw new Error('network disabled by test')
    }) as typeof fetch
    db.close()
    const db2 = await openRfidDb('rfid-live-harness', factory) // same persisted data, fresh handles
    const replica2 = new ItemReplica(db2)
    await expect(replica2.seedFromBackend(new HttpTagBackend({ basePath: BASE }))).rejects.toThrow() // proves fetch is really dead
    const scanner2 = new MockScanner()
    const session2 = new ScanSession({
      scanner: scanner2,
      bridge: new ScriptedBridge(),
      replica: replica2,
      onHit,
      dedupeMode: 'window',
    })
    await session2.startRfid()
    const offlineHit = await hitFor(session2, scanner2, epc)
    expect(offlineHit.item?.commonName).toBe(target?.commonName)
    expect(offlineHit.item?.currentStatus).toBe(target?.currentStatus)
    await session2.dispose()
    db2.close()
  }, 120_000)
})
