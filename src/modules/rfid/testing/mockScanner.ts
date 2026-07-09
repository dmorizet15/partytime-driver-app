// ─── MockScanner — full in-memory RfidScanner, the session's verification vehicle
// Deterministic by design: nothing fires on a timer; tests emit reads on
// demand. Behavioral honesty rules:
//   • reads are delivered ONLY while inventory is running (like hardware)
//   • duplicate emissions are delivered as-is — deduplication is the scan
//     session's job upstream, and tests must be able to exercise it
//   • initialize()/release() gate everything, mirroring the XR2 power rules

import {
  NotSupportedError,
  type InventoryParameters,
  type InventorySession,
  type MemoryBank,
  type RfidScanner,
  type ScannerCapabilities,
  type TagRead,
} from '../hal/types'

interface MockTag {
  tid: string | null
  banks: Partial<Record<MemoryBank, string>>
}

export class MockScanner implements RfidScanner {
  readonly deviceName = 'MockScanner'
  readonly capabilities: ScannerCapabilities = {
    rfid: true,
    barcode: true,
    tagMemoryAccess: true,
    inventoryTuning: true,
    powerRange: { min: 0, max: 33 },
  }

  private initialized = false
  private inventoryRunning = false
  private power = 20
  private params: InventoryParameters = {}
  private session: InventorySession | undefined
  private masks: string[] = []
  private listeners = new Set<(read: TagRead) => void>()
  private locateTargets = new Map<string, (rssi: number) => void>()
  private tags = new Map<string, MockTag>()
  private now = 1_000_000 // deterministic clock, advances per emission

  /** Register a tag the "airspace" knows about (optional — emitTag works without). */
  seedTag(epc: string, tid: string | null = null, banks: Partial<Record<MemoryBank, string>> = {}): void {
    this.tags.set(epc, { tid, banks })
  }

  // ── Test emission API ──────────────────────────────────────────────────────

  /** Emit one read. Returns true when delivered (inventory running + not masked out). */
  emitTag(epc: string, opts: { rssi?: number; tid?: string | null } = {}): boolean {
    if (!this.initialized || !this.inventoryRunning) return false
    if (this.masks.length > 0 && !this.masks.some((m) => epc.startsWith(m))) return false
    const read: TagRead = {
      epc,
      tid: opts.tid !== undefined ? opts.tid : this.tags.get(epc)?.tid ?? null,
      rssi: opts.rssi ?? 60,
      timestamp: (this.now += 7),
    }
    this.listeners.forEach((cb) => cb(read))
    return true
  }

  /** Emit a burst of distinct tags. */
  emitBurst(epcs: string[]): number {
    return epcs.filter((e) => this.emitTag(e)).length
  }

  /** Emit the same EPC n times (duplicate-read case). */
  emitDuplicates(epc: string, n: number): number {
    let delivered = 0
    for (let i = 0; i < n; i++) if (this.emitTag(epc)) delivered++
    return delivered
  }

  /** Drive an active findEpc() loop. No-op if that EPC isn't being located. */
  emitLocateRssi(epc: string, rssi: number): void {
    this.locateTargets.get(epc)?.(rssi)
  }

  // ── Introspection for assertions ───────────────────────────────────────────

  get state() {
    return {
      initialized: this.initialized,
      inventoryRunning: this.inventoryRunning,
      power: this.power,
      session: this.session,
      params: { ...this.params },
      masks: [...this.masks],
      locating: Array.from(this.locateTargets.keys()),
    }
  }

  // ── RfidScanner implementation ────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.initialized = true
  }

  async release(): Promise<void> {
    this.initialized = false
    this.inventoryRunning = false
    this.locateTargets.clear()
  }

  async startInventory(session?: InventorySession): Promise<void> {
    this.assertReady('startInventory')
    this.session = session
    this.inventoryRunning = true
  }

  async stopInventory(): Promise<void> {
    this.inventoryRunning = false
  }

  onTagRead(callback: (read: TagRead) => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  async readTag(epc: string, bank: MemoryBank, offsetWords: number, lengthWords: number): Promise<string> {
    this.assertReady('readTag')
    const data = this.tags.get(epc)?.banks[bank]
    if (data === undefined) throw new Error(`readTag: no ${bank} data for ${epc}`)
    return data.slice(offsetWords * 4, (offsetWords + lengthWords) * 4)
  }

  async writeTag(epc: string, bank: MemoryBank, offsetWords: number, dataHex: string): Promise<void> {
    this.assertReady('writeTag')
    const tag = this.tags.get(epc) ?? { tid: null, banks: {} }
    const existing = tag.banks[bank] ?? ''
    const pre = existing.slice(0, offsetWords * 4).padEnd(offsetWords * 4, '0')
    tag.banks[bank] = pre + dataHex + existing.slice(offsetWords * 4 + dataHex.length)
    this.tags.set(epc, tag)
  }

  async writeTagEpc(currentEpc: string, newEpc: string): Promise<void> {
    this.assertReady('writeTagEpc')
    const tag = this.tags.get(currentEpc) ?? { tid: null, banks: {} }
    this.tags.delete(currentEpc)
    this.tags.set(newEpc, tag)
  }

  async setOutputPower(level: number): Promise<void> {
    this.assertReady('setOutputPower')
    const { min, max } = this.capabilities.powerRange
    this.power = Math.min(max, Math.max(min, Math.round(level)))
  }

  async getOutputPower(): Promise<number> {
    return this.power
  }

  async setInventoryParameter(params: InventoryParameters): Promise<void> {
    this.assertReady('setInventoryParameter')
    this.params = { ...this.params, ...params }
    if (params.session !== undefined) this.session = params.session
  }

  async addMask(epcPrefix: string): Promise<void> {
    this.assertReady('addMask')
    this.masks.push(epcPrefix.toUpperCase())
  }

  async clearMask(): Promise<void> {
    this.masks = []
  }

  findEpc(epc: string, callback: (rssi: number) => void): () => void {
    if (!this.initialized) throw new NotSupportedError('findEpc', this.deviceName, 'not initialized')
    this.locateTargets.set(epc, callback)
    return () => this.locateTargets.delete(epc)
  }

  private assertReady(op: string): void {
    if (!this.initialized) throw new Error(`${op}: MockScanner not initialized — call initialize() first`)
  }
}
