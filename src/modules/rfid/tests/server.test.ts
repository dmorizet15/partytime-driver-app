// ─── Server-layer tests — guardrails made executable ────────────────────────
// The two rules that fail the run if violated:
//   1. Easy RFID Pro writes go ONLY to the sandbox host (EASY_RFID_BASE_URL)
//   2. TapGoods is dry-run only — zero live writes, impossible to flip with
//      one flag
// Plus the live API's confirmed gotchas: wrapped-401-in-200, write failures
// inside HTTP 200 (isWriteSuccess body check), timeout mapping.

import { describe, expect, it } from 'vitest'
import { EzrfidClient, SANDBOX_HOST, isWriteSuccess } from '../server/ezrfidClient'
import { EasyRfidProBackend, statusWriteToWireRow, wireToItemRecord } from '../server/easyRfidProBackend'
import { createRfidRouteHandlers } from '../server/routeHandlers'
import { HttpTagBackend } from '../server/httpTagBackend'
import { TapGoodsOrderSystem } from '../server/tapGoodsOrderSystem'
import { TagBackendError } from '../ports/tagBackend'
import type { StopCompletionReport } from '../ports/orderSystem'

// ── Scriptable fetch ───────────────────────────────────────────────────────

type Scripted = { match: (url: string, init?: RequestInit) => boolean; respond: () => Response | Error }

function scriptedFetch(scripts: Scripted[], calls: Array<{ url: string; init?: RequestInit }> = []) {
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    for (const s of scripts) {
      if (s.match(url, init)) {
        const out = s.respond()
        if (out instanceof Error) throw out
        return out
      }
    }
    throw new Error(`no script for ${url}`)
  }) as typeof fetch
  return { impl, calls }
}

const okLogin = (): Response => Response.json({ access_token: 'tok-1' })
const goodWrite = (): Response =>
  Response.json({ result: { success: true }, success_count: 1, failed_count: 0 })
const rejectedWrite = (): Response =>
  Response.json({ result: { success: false, code: 4002, message: 'Invalid update field.' }, failed_count: 1 })
const wrapped401 = (): Response =>
  Response.json({ result: { success: false, code: 0, message: 'CURL Error: (401) Invalid user or API token blah' } })

function sandboxClient(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new EzrfidClient({
    baseUrl: `https://${SANDBOX_HOST}`,
    username: 'u',
    password: 'p',
    fetchImpl,
    ...overrides,
  })
}

describe('Easy RFID Pro client — sandbox guard', () => {
  it('REFUSES writes when the resolved host is not the sandbox', async () => {
    const { impl } = scriptedFetch([{ match: () => true, respond: okLogin }])
    const client = new EzrfidClient({
      baseUrl: 'https://cs.iot.ptshome.com', // production host
      username: 'u',
      password: 'p',
      fetchImpl: impl,
    })
    expect(client.isSandbox).toBe(false)
    await expect(client.upsertItemMasterRows([{ tag_id: 'E2' }])).rejects.toThrowError(
      expect.objectContaining({ name: 'TagBackendError', kind: 'guard' }),
    )
  })

  it('allows sandbox writes; EASY_RFID_ALLOW_PRODUCTION is the only production escape hatch', async () => {
    const { impl, calls } = scriptedFetch([
      { match: (u) => u.includes('/login'), respond: okLogin },
      { match: (u, i) => i?.method === 'POST' && u.includes('/data/'), respond: goodWrite },
    ])
    const sandbox = sandboxClient(impl)
    expect((await sandbox.upsertItemMasterRows([{ tag_id: 'E2' }])).ok).toBe(true)
    expect(calls.every((c) => c.url.includes(SANDBOX_HOST))).toBe(true)

    const prodAllowed = new EzrfidClient({
      baseUrl: 'https://cs.iot.ptshome.com',
      allowProduction: true, // NOT set this session — this test just pins the mechanism
      username: 'u',
      password: 'p',
      fetchImpl: impl,
    })
    expect(() => prodAllowed.assertWriteAllowed()).not.toThrow()
  })

  it('defaults the base URL to the sandbox — no hardcoded host anywhere else', () => {
    const client = new EzrfidClient({ username: 'u', password: 'p', fetchImpl: fetch })
    expect(client.resolvedHost).toBe(SANDBOX_HOST)
    expect(client.isSandbox).toBe(true)
  })
})

describe('Easy RFID Pro client — live-API gotchas', () => {
  it('write failures arrive as HTTP 200: isWriteSuccess body-checks, result.ok is false', async () => {
    const { impl } = scriptedFetch([
      { match: (u) => u.includes('/login'), respond: okLogin },
      { match: (u, i) => i?.method === 'POST' && u.includes('/data/'), respond: rejectedWrite },
    ])
    const res = await sandboxClient(impl).upsertItemMasterRows([{ tag_id: 'E2' }])
    expect(res.ok).toBe(false) // HTTP was 200 — the body says no
    expect(isWriteSuccess(res.raw)).toBe(false)
  })

  it('wrapped-401-in-200 triggers ONE re-auth then succeeds transparently', async () => {
    let dataCalls = 0
    const { impl, calls } = scriptedFetch([
      { match: (u) => u.includes('/login'), respond: okLogin },
      {
        match: (u, i) => i?.method === 'POST' && u.includes('/data/'),
        respond: () => (++dataCalls === 1 ? wrapped401() : goodWrite()),
      },
    ])
    const res = await sandboxClient(impl).upsertItemMasterRows([{ tag_id: 'E2' }])
    expect(res.ok).toBe(true)
    expect(calls.filter((c) => c.url.includes('/login'))).toHaveLength(2) // initial + re-auth
    expect(dataCalls).toBe(2)
  })

  it('network failure maps to TagBackendError kind network (queue retries)', async () => {
    const { impl } = scriptedFetch([
      { match: (u) => u.includes('/login'), respond: okLogin },
      { match: (u) => u.includes('/data/'), respond: () => new Error('boom') },
    ])
    await expect(sandboxClient(impl).upsertItemMasterRows([{ tag_id: 'E2' }])).rejects.toThrowError(
      expect.objectContaining({ kind: 'network' }),
    )
  })
})

describe('wire mapping', () => {
  it('maps Item Master wire names to module fields and back', () => {
    const record = wireToItemRecord({
      tag_id: 'e280117000000000000000aa',
      rental_class_num: 'RC-1',
      common_name: 'TENT',
      quality: 'A',
      status: 'Ready to Rent',
      last_contract_num: 'C-1',
      last_scanned_by: 'darren',
      date_last_scanned: '2026-07-01 10:00:00',
      serial_number: 'SN',
      bin_location: 'A-01',
      notes: 'n',
      status_notes: 'sn',
      lat: '35.1',
      long: '-85.2',
    })
    expect(record.epc).toBe('E280117000000000000000AA')
    expect(record.gpsLng).toBe('-85.2')

    const row = statusWriteToWireRow({
      epc: 'E2',
      status: 'Wash',
      statusNotes: 'Wash: Leaves',
      contractNumber: 'C-2',
      scannedBy: 'Darren M',
      scannedAt: '2026-07-09 12:00:00',
      lat: '35.0',
      lng: '-85.3',
    })
    expect(row).toEqual({
      tag_id: 'E2',
      status: 'Wash',
      status_notes: 'Wash: Leaves',
      last_contract_num: 'C-2',
      last_scanned_by: 'Darren M',
      date_last_scanned: '2026-07-09 12:00:00',
      lat: '35.0',
      long: '-85.3',
    })
    // Absent optionals stay absent — upsert must not blank fields.
    expect('quality' in statusWriteToWireRow({ epc: 'E2', scannedBy: 'd', scannedAt: 't' })).toBe(false)
  })
})

describe('route handlers + HttpTagBackend round trip', () => {
  function mountedBackend(fetchScripts: Scripted[]) {
    const { impl } = scriptedFetch(fetchScripts)
    const handlers = createRfidRouteHandlers(new EasyRfidProBackend(sandboxClient(impl)))
    // Wire HttpTagBackend's fetch to the handlers as if Next had mounted them.
    const routeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/items')) return handlers.itemsGET(new Request('http://x/items'))
      if (url.endsWith('/status-writes')) {
        return handlers.statusWritesPOST(new Request('http://x/status-writes', init))
      }
      throw new Error(`unmounted route ${url}`)
    }) as typeof fetch
    return new HttpTagBackend({ fetchImpl: routeFetch })
  }

  it('serves items and status writes through the mounted handlers', async () => {
    const backend = mountedBackend([
      { match: (u) => u.includes('/login'), respond: okLogin },
      {
        match: (u, i) => u.includes('/data/') && i?.method !== 'POST',
        respond: () =>
          Response.json({ data: [{ tag_id: 'E2A', common_name: 'TENT', status: 'Ready to Rent' }] }),
      },
      { match: (u, i) => u.includes('/data/') && i?.method === 'POST', respond: goodWrite },
    ])
    const items = await backend.fetchAllItems()
    expect(items).toHaveLength(1)
    expect(items[0].epc).toBe('E2A')

    const res = await backend.writeItemStatuses([{ epc: 'E2A', status: 'Staged', scannedBy: 'd', scannedAt: 't' }])
    expect(res.ok).toBe(true)
  })

  it('propagates the guard refusal as kind guard through the HTTP layer', async () => {
    const { impl } = scriptedFetch([{ match: () => true, respond: okLogin }])
    const prodBackend = new EasyRfidProBackend(
      new EzrfidClient({ baseUrl: 'https://cs.iot.ptshome.com', username: 'u', password: 'p', fetchImpl: impl }),
    )
    const handlers = createRfidRouteHandlers(prodBackend)
    const routeFetch = (async (_: RequestInfo | URL, init?: RequestInit) =>
      handlers.statusWritesPOST(new Request('http://x/status-writes', init))) as typeof fetch
    const http = new HttpTagBackend({ fetchImpl: routeFetch })

    await expect(
      http.writeItemStatuses([{ epc: 'E2', status: 'Staged', scannedBy: 'd', scannedAt: 't' }]),
    ).rejects.toThrowError(expect.objectContaining({ kind: 'guard' }))
  })

  it('body-checked upstream rejection comes back ok:false (not a throw) so the queue can dead-letter it', async () => {
    const backend = mountedBackend([
      { match: (u) => u.includes('/login'), respond: okLogin },
      { match: (u, i) => u.includes('/data/') && i?.method === 'POST', respond: rejectedWrite },
    ])
    const res = await backend.writeItemStatuses([{ epc: 'E2', status: 'Staged', scannedBy: 'd', scannedAt: 't' }])
    expect(res.ok).toBe(false)
    expect(res.failedCount).toBe(1)
  })
})

describe('TapGoods — dry-run lock', () => {
  const report: StopCompletionReport = {
    stopId: 'stop-1',
    orderId: 'TG-1',
    lines: [
      { lineId: '4001', quantity: 3 },
      { lineId: null, quantity: 1 },
    ],
    completedAt: '2026-07-09T15:00:00Z',
    gps: { lat: 35, lng: -85, capturedAt: 1 },
  }
  const auth = { getAccessToken: async () => 'host-token' }

  it('defaults to dry-run: constructs + logs the exact payload, sends NOTHING', async () => {
    const logs: unknown[] = []
    const { impl, calls } = scriptedFetch([]) // any fetch would throw 'no script'
    const tg = new TapGoodsOrderSystem({
      auth,
      dryRunEnv: undefined, // env unset → dry-run
      fetchImpl: impl,
      logSink: (_m, p) => logs.push(p),
    })

    const res = await tg.recordDeliveryCompletion(report)
    expect(res.ok).toBe(true)
    expect(res.dryRun).toBe(true)
    expect(calls).toHaveLength(0) // ZERO network calls

    const logged = logs[0] as {
      payload: { stop_id: string; lines: unknown[] }
      speculative: { statusTransition: string }
    }
    expect(logged.payload).toEqual({
      stop_id: 'stop-1',
      lines: [
        { tapgoods_pick_list_item_id: 4001, qty: 3 },
        { tapgoods_pick_list_item_id: null, qty: 1 },
      ],
    })
    expect(logged.speculative.statusTransition).toBe('in_use')

    const pickup = await tg.recordPickupCompletion(report)
    expect(pickup.dryRun).toBe(true)
    expect((logs[1] as typeof logged).speculative.statusTransition).toBe('checked_in')
  })

  it('one flag cannot flip it live: TAPGOODS_DRY_RUN=false alone stays dry-run', async () => {
    const { impl, calls } = scriptedFetch([])
    const tg = new TapGoodsOrderSystem({
      auth,
      dryRunEnv: 'false', // env gate open…
      // …but allowLive not passed — second gate closed
      fetchImpl: impl,
      logSink: () => {},
    })
    const res = await tg.recordDeliveryCompletion(report)
    expect(res.dryRun).toBe(true)
    expect(calls).toHaveLength(0)
  })
})
