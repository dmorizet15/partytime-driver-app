// ─── Xr2Scanner — RfidScanner over the device-neutral NativeBridge ───────────
// The Janam XR2 path. The native wrapper (partytime-rfid Android layer) owns
// the actual SDK; this class maps HAL calls onto the bridge contract and
// normalizes events into TagReads. SDK ground truth (signatures, error codes,
// RSSI scales) lives in partytime-rfid/docs/xr2-sdk-notes.md — read that, not
// the vendor PDF.
//
// Bridge-capability honesty: the current bridge carries inventory start/stop,
// power, locate, barcode, and NFC. Tag-memory access and inventory tuning
// have NO bridge methods yet (docs/ASSUMPTIONS.md) — those HAL calls throw
// NotSupportedError and the capabilities flags say so up front. TagRead.tid
// is always null on this path (the rfid-scan event carries no TID).

import type { BridgeEventMap, NativeBridge } from './bridge'
import {
  NotSupportedError,
  type InventoryParameters,
  type InventorySession,
  type MemoryBank,
  type RfidScanner,
  type ScannerCapabilities,
  type TagRead,
} from './types'

const DEFAULT_POWER = 20

export class Xr2Scanner implements RfidScanner {
  readonly deviceName = 'Janam XR2'
  readonly capabilities: ScannerCapabilities = {
    rfid: true,
    barcode: true,
    tagMemoryAccess: false, // no bridge methods yet — see ASSUMPTIONS.md
    inventoryTuning: false, // no bridge methods yet — see ASSUMPTIONS.md
    powerRange: { min: 0, max: 33 },
  }

  private initialized = false
  private listeners = new Set<(read: TagRead) => void>()
  private unsubscribeScan: (() => void) | null = null
  private power = DEFAULT_POWER

  constructor(private readonly bridge: NativeBridge) {}

  async initialize(): Promise<void> {
    if (this.initialized) return
    if (!this.bridge.isAvailable()) {
      throw new Error('Xr2Scanner: native bridge not present — not running inside the Android wrapper')
    }
    this.unsubscribeScan = this.bridge.on('rfid-scan', (d: BridgeEventMap['rfid-scan']) => {
      const read: TagRead = {
        epc: d.epc.toUpperCase(),
        tid: null, // bridge event carries no TID (ASSUMPTIONS.md)
        rssi: d.rssi,
        timestamp: d.timestamp,
      }
      this.listeners.forEach((cb) => cb(read))
    })
    this.bridge.setPower(this.power)
    this.initialized = true
  }

  async release(): Promise<void> {
    // Native side powers the module down on stopRfid + activity lifecycle
    // (disConnect + RFIDSDKManager.release — the XR2 has no lighter switch).
    this.bridge.stopRfid()
    this.unsubscribeScan?.()
    this.unsubscribeScan = null
    this.initialized = false
  }

  async startInventory(session?: InventorySession): Promise<void> {
    this.assertReady('startInventory')
    if (session !== undefined) {
      // Inventory tuning has no bridge support; callers should feature-gate on
      // capabilities.inventoryTuning. Loud, not silent:
      console.warn(`[rfid] XR2 bridge cannot set inventory session (asked for S${session}) — using device default`)
    }
    this.bridge.startRfid()
  }

  async stopInventory(): Promise<void> {
    this.bridge.stopRfid()
  }

  onTagRead(callback: (read: TagRead) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  async readTag(): Promise<string> {
    throw new NotSupportedError('readTag', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  async writeTag(_epc: string, _bank: MemoryBank, _offsetWords: number, _dataHex: string): Promise<void> {
    throw new NotSupportedError('writeTag', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  async writeTagEpc(): Promise<void> {
    throw new NotSupportedError('writeTagEpc', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  async setOutputPower(level: number): Promise<void> {
    this.assertReady('setOutputPower')
    const { min, max } = this.capabilities.powerRange
    this.power = Math.min(max, Math.max(min, Math.round(level)))
    this.bridge.setPower(this.power)
  }

  async getOutputPower(): Promise<number> {
    // The bridge has no power getter — this is the last value WE set (applied
    // at initialize and on every setOutputPower), not a device readback.
    return this.power
  }

  async setInventoryParameter(_params: InventoryParameters): Promise<void> {
    throw new NotSupportedError('setInventoryParameter', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  async addMask(): Promise<void> {
    throw new NotSupportedError('addMask', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  async clearMask(): Promise<void> {
    throw new NotSupportedError('clearMask', this.deviceName, 'bridge extension required (ASSUMPTIONS.md)')
  }

  findEpc(epc: string, callback: (rssi: number) => void): () => void {
    this.assertReady('findEpc')
    const target = epc.toUpperCase()
    const unsubscribe = this.bridge.on('rfid-locate', (d: BridgeEventMap['rfid-locate']) => {
      if (d.epc.toUpperCase() !== target) return
      // Locate events deliver proximity 0.0–1.0 (native side already converted
      // per xr2-sdk-notes.md §6.4); HAL contract is the 0–100 locate scale.
      callback(Math.round(d.proximity * 100))
    })
    this.bridge.findEpc(target)
    return () => {
      unsubscribe()
      this.bridge.stopRfid() // locate mode streams until stopRfid
    }
  }

  private assertReady(op: string): void {
    if (!this.initialized) throw new Error(`${op}: Xr2Scanner not initialized — call initialize() first`)
  }
}
