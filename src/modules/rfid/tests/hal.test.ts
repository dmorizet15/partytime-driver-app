// ─── HAL tests — Xr2Scanner over the bridge, C72 stub, device selection ─────

import { describe, expect, it } from 'vitest'
import { ScriptedBridge } from '../testing/scriptedBridge'
import { Xr2Scanner } from '../hal/xr2Scanner'
import { C72Scanner } from '../hal/c72Scanner'
import { MockScanner } from '../testing/mockScanner'
import { NotImplementedError, NotSupportedError, type TagRead } from '../hal/types'
import { ScannerUnavailableError, selectScanner } from '../hal/deviceSelect'
import { windowRfidBridge, type BridgeWindow } from '../hal/windowRfidBridge'

describe('Xr2Scanner', () => {
  it('refuses to initialize without the native bridge', async () => {
    const bridge = new ScriptedBridge()
    bridge.setAvailable(false)
    await expect(new Xr2Scanner(bridge).initialize()).rejects.toThrow(/native bridge not present/)
  })

  it('maps bridge rfid-scan events to normalized TagReads (tid null, EPC uppercased)', async () => {
    const bridge = new ScriptedBridge()
    const s = new Xr2Scanner(bridge)
    await s.initialize()
    const reads: TagRead[] = []
    s.onTagRead((r) => reads.push(r))

    await s.startInventory()
    expect(bridge.callsTo('startRfid')).toHaveLength(1)
    bridge.emit('rfid-scan', { epc: 'e280117000000000000000aa', rssi: 61 })

    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatchObject({ epc: 'E280117000000000000000AA', tid: null, rssi: 61 })
    expect(reads[0].timestamp).toBeGreaterThan(0)

    await s.stopInventory()
    expect(bridge.callsTo('stopRfid')).toHaveLength(1)
  })

  it('applies default power at init, clamps setOutputPower to 0–33', async () => {
    const bridge = new ScriptedBridge()
    const s = new Xr2Scanner(bridge)
    await s.initialize()
    expect(bridge.callsTo('setPower')[0].args).toEqual([20]) // init default

    await s.setOutputPower(99)
    expect(await s.getOutputPower()).toBe(33)
    await s.setOutputPower(-2)
    expect(await s.getOutputPower()).toBe(0)
    expect(bridge.callsTo('setPower').map((c) => c.args[0])).toEqual([20, 33, 0])
  })

  it('findEpc arms locate, filters other EPCs, converts proximity to the 0–100 scale, stop ends the mode', async () => {
    const bridge = new ScriptedBridge()
    const s = new Xr2Scanner(bridge)
    await s.initialize()
    const rssi: number[] = []
    const stop = s.findEpc('e2801170000000000000AAAA', (v) => rssi.push(v))

    expect(bridge.callsTo('findEpc')[0].args).toEqual(['E2801170000000000000AAAA'])
    bridge.emit('rfid-locate', { epc: 'E2801170000000000000AAAA', proximity: 0.62 })
    bridge.emit('rfid-locate', { epc: 'E280117000000000000000FF', proximity: 0.99 }) // other tag — ignored
    bridge.emit('rfid-locate', { epc: 'E2801170000000000000AAAA', proximity: 0 })

    stop()
    bridge.emit('rfid-locate', { epc: 'E2801170000000000000AAAA', proximity: 1 }) // after stop — ignored
    expect(rssi).toEqual([62, 0])
    expect(bridge.callsTo('stopRfid')).toHaveLength(1) // locate streams until stopRfid
  })

  it('throws typed NotSupportedError for ops the bridge cannot carry', async () => {
    const bridge = new ScriptedBridge()
    const s = new Xr2Scanner(bridge)
    await s.initialize()
    expect(s.capabilities.tagMemoryAccess).toBe(false)
    expect(s.capabilities.inventoryTuning).toBe(false)
    await expect(s.readTag()).rejects.toThrow(NotSupportedError)
    await expect(s.writeTag('E', 'user', 0, 'AB')).rejects.toThrow(NotSupportedError)
    await expect(s.writeTagEpc()).rejects.toThrow(NotSupportedError)
    await expect(s.setInventoryParameter({ session: 1 })).rejects.toThrow(NotSupportedError)
    await expect(s.addMask()).rejects.toThrow(NotSupportedError)
  })

  it('release stops RFID and detaches the event subscription', async () => {
    const bridge = new ScriptedBridge()
    const s = new Xr2Scanner(bridge)
    await s.initialize()
    const reads: TagRead[] = []
    s.onTagRead((r) => reads.push(r))
    await s.startInventory()
    await s.release()
    bridge.emit('rfid-scan', { epc: 'E2', rssi: 50 })
    expect(reads).toHaveLength(0)
    expect(bridge.callsTo('stopRfid').length).toBeGreaterThan(0)
  })
})

describe('C72Scanner stub (acceptance criterion 3)', () => {
  it('constructs against the neutral bridge and throws NotImplementedError on use', async () => {
    const s = new C72Scanner(new ScriptedBridge())
    expect(s.deviceName).toBe('Chainway C72')
    await expect(s.initialize()).rejects.toThrow(NotImplementedError)
    expect(() => s.onTagRead(() => {})).toThrow(NotImplementedError)
    await expect(s.setOutputPower(10)).rejects.toThrow(NotImplementedError)
  })
})

describe('device selection', () => {
  const withBridge = (available: boolean) => {
    const b = new ScriptedBridge()
    b.setAvailable(available)
    return b
  }

  it('auto-detects XR2 when the native bridge is present', () => {
    const s = selectScanner({ bridge: withBridge(true), override: 'auto', isDevBuild: false })
    expect(s).toBeInstanceOf(Xr2Scanner)
  })

  it('falls back to MockScanner in dev builds when no bridge', () => {
    const s = selectScanner({ bridge: withBridge(false), override: 'auto', isDevBuild: true })
    expect(s).toBeInstanceOf(MockScanner)
  })

  it('throws an explicit error in production when no bridge and no override', () => {
    expect(() =>
      selectScanner({ bridge: withBridge(false), override: 'auto', isDevBuild: false }),
    ).toThrow(ScannerUnavailableError)
  })

  it('manual override wins over auto-detect', () => {
    expect(selectScanner({ bridge: withBridge(true), override: 'mock', isDevBuild: false })).toBeInstanceOf(MockScanner)
    expect(selectScanner({ bridge: withBridge(false), override: 'xr2', isDevBuild: false })).toBeInstanceOf(Xr2Scanner)
    expect(selectScanner({ bridge: withBridge(false), override: 'c72', isDevBuild: false })).toBeInstanceOf(C72Scanner)
  })
})

describe('windowRfidBridge (the one sanctioned window reader)', () => {
  function fakeWindow(): BridgeWindow & {
    dispatch(type: string, detail: unknown): void
    calls: Array<{ m: string; args: unknown[] }>
  } {
    const listeners = new Map<string, Set<(e: Event) => void>>()
    const calls: Array<{ m: string; args: unknown[] }> = []
    return {
      calls,
      rfidBridge: {
        startRfid: (...a: unknown[]) => calls.push({ m: 'startRfid', args: a }),
        setPower: (...a: unknown[]) => calls.push({ m: 'setPower', args: a }),
      },
      addEventListener: (t, cb) => {
        const set = listeners.get(t) ?? new Set()
        set.add(cb)
        listeners.set(t, set)
      },
      removeEventListener: (t, cb) => listeners.get(t)?.delete(cb),
      dispatch: (t, detail) => listeners.get(t)?.forEach((cb) => cb({ detail } as unknown as Event)),
    }
  }

  it('reports availability, forwards calls, and parses BOTH object and stringified-JSON details', () => {
    const win = fakeWindow()
    const bridge = windowRfidBridge(win)
    expect(bridge.isAvailable()).toBe(true)

    bridge.startRfid()
    bridge.setPower(15)
    expect(win.calls).toEqual([
      { m: 'startRfid', args: [] },
      { m: 'setPower', args: [15] },
    ])

    const seen: number[] = []
    const off = bridge.on('rfid-scan', (d) => seen.push(d.rssi))
    win.dispatch('rfid-scan', { epc: 'E2', rssi: 42, timestamp: 1 }) // object detail
    win.dispatch('rfid-scan', JSON.stringify({ epc: 'E2', rssi: 43, timestamp: 2 })) // stringified detail
    win.dispatch('rfid-scan', 'not-json{') // garbage — dropped, no throw
    off()
    win.dispatch('rfid-scan', { epc: 'E2', rssi: 44, timestamp: 3 })
    expect(seen).toEqual([42, 43])
  })

  it('is unavailable (and inert) outside the wrapper', () => {
    const bridge = windowRfidBridge(undefined)
    expect(bridge.isAvailable()).toBe(false)
    expect(() => bridge.startRfid()).not.toThrow()
    expect(bridge.on('rfid-scan', () => {})).toBeTypeOf('function')
  })
})
