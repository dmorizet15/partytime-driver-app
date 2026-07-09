// ─── C72Scanner — deliberate stub ────────────────────────────────────────────
// Proves the abstraction holds for a second device WITHOUT building it: the
// Chainway C72 wrapper is out of scope this session. It consumes the SAME
// device-neutral NativeBridge as the XR2 (a future C72 native wrapper
// implements the same events/calls); every operation throws
// NotImplementedError until then. Do not "helpfully" implement pieces of
// this — partial device support is worse than an honest throw.

import type { NativeBridge } from './bridge'
import {
  NotImplementedError,
  type InventoryParameters,
  type InventorySession,
  type MemoryBank,
  type RfidScanner,
  type ScannerCapabilities,
  type TagRead,
} from './types'

export class C72Scanner implements RfidScanner {
  readonly deviceName = 'Chainway C72'
  readonly capabilities: ScannerCapabilities = {
    rfid: false,
    barcode: false,
    tagMemoryAccess: false,
    inventoryTuning: false,
    powerRange: { min: 0, max: 30 },
  }

  // The bridge is accepted (and kept) to pin the architecture: device
  // implementations sit BEHIND the neutral transport, never beside it.
  constructor(private readonly bridge: NativeBridge) {
    void this.bridge
  }

  private die(): never {
    throw new NotImplementedError(this.deviceName)
  }

  async initialize(): Promise<void> {
    this.die()
  }
  async release(): Promise<void> {
    this.die()
  }
  async startInventory(_session?: InventorySession): Promise<void> {
    this.die()
  }
  async stopInventory(): Promise<void> {
    this.die()
  }
  onTagRead(_callback: (read: TagRead) => void): () => void {
    this.die()
  }
  async readTag(_epc: string, _bank: MemoryBank, _offsetWords: number, _lengthWords: number): Promise<string> {
    this.die()
  }
  async writeTag(_epc: string, _bank: MemoryBank, _offsetWords: number, _dataHex: string): Promise<void> {
    this.die()
  }
  async writeTagEpc(_currentEpc: string, _newEpc: string): Promise<void> {
    this.die()
  }
  async setOutputPower(_level: number): Promise<void> {
    this.die()
  }
  async getOutputPower(): Promise<number> {
    this.die()
  }
  async setInventoryParameter(_params: InventoryParameters): Promise<void> {
    this.die()
  }
  async addMask(_epcPrefix: string): Promise<void> {
    this.die()
  }
  async clearMask(): Promise<void> {
    this.die()
  }
  findEpc(_epc: string, _callback: (rssi: number) => void): () => void {
    this.die()
  }
}
