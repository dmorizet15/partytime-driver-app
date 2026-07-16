// ─── Hardware abstraction layer — device-agnostic scanner contract ───────────
// Normalizes reads before anything reaches the UI: the UI never knows which
// device it is running on. Implementations: Xr2Scanner (over the native
// bridge), MockScanner (in-memory, the session's verification vehicle),
// C72Scanner (stub — proves the abstraction holds without a second device).

/** A normalized tag read. `tid` is null when the transport doesn't carry it. */
export interface TagRead {
  epc: string
  tid: string | null
  /** Signal strength as delivered by the device path (XR2 bridge: int). */
  rssi: number
  /** Epoch ms. */
  timestamp: number
}

/** EPC Gen2 inventory session. */
export type InventorySession = 0 | 1 | 2 | 3

export interface InventoryParameters {
  session?: InventorySession
  qValue?: number
  scanTimeMs?: number
  intervalMs?: number
}

export type MemoryBank = 'reserved' | 'epc' | 'tid' | 'user'

export interface ScannerCapabilities {
  rfid: boolean
  barcode: boolean
  /** True when readTag/writeTag/writeTagEpc are actually usable on this path. */
  tagMemoryAccess: boolean
  /** True when setInventoryParameter / addMask / clearMask are usable. */
  inventoryTuning: boolean
  /** True when the device surfaces a physical scan trigger (XR2 side trigger) to onTrigger. */
  hardwareTrigger: boolean
  /** Output power range for this device (XR2: 0–33; short-range profile tops at 26). */
  powerRange: { min: number; max: number }
}

/** Thrown by operations a given device path cannot perform. Callers feature-gate on `capabilities`, so hitting this is a programming error, not a user-facing state. */
export class NotSupportedError extends Error {
  constructor(operation: string, device: string, detail?: string) {
    super(`${operation} is not supported on ${device}${detail ? ` — ${detail}` : ''}`)
    this.name = 'NotSupportedError'
  }
}

/** Thrown by deliberately unimplemented devices (C72Scanner stub). */
export class NotImplementedError extends Error {
  constructor(device: string) {
    super(`${device} is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

export interface RfidScanner {
  readonly deviceName: string
  readonly capabilities: ScannerCapabilities

  /** Power up / connect. Idempotent. */
  initialize(): Promise<void>
  /** Full power-down. MUST be called when the app backgrounds — the XR2 RFID module is power-hungry and its SDK has no lighter off-switch. Idempotent. */
  release(): Promise<void>

  startInventory(session?: InventorySession): Promise<void>
  stopInventory(): Promise<void>
  /** Subscribe to normalized tag reads (already deduplicated per device policy). Returns unsubscribe. */
  onTagRead(callback: (read: TagRead) => void): () => void

  /**
   * Subscribe to physical-trigger edges (true = pressed, false = released).
   * Deliberately ALIVE regardless of initialize()/release() — a trigger press
   * is typically what causes initialization. Devices without a hardware
   * trigger (`capabilities.hardwareTrigger` false) never fire; callers
   * feature-gate on the capability. Returns unsubscribe.
   */
  onTrigger(callback: (pressed: boolean) => void): () => void

  readTag(epc: string, bank: MemoryBank, offsetWords: number, lengthWords: number): Promise<string>
  writeTag(epc: string, bank: MemoryBank, offsetWords: number, dataHex: string): Promise<void>
  writeTagEpc(currentEpc: string, newEpc: string): Promise<void>

  /** XR2 short range 0–26, long range 0–33. Clamped to `capabilities.powerRange`. */
  setOutputPower(level: number): Promise<void>
  getOutputPower(): Promise<number>
  setInventoryParameter(params: InventoryParameters): Promise<void>

  /** Select-mask filtering (needed for locate). */
  addMask(epcPrefix: string): Promise<void>
  clearMask(): Promise<void>

  /**
   * Locate mode: poll RSSI for one EPC. `callback` receives signal strength
   * on the device's locate scale (XR2: 0–100, 0 = not currently seen).
   * Returns a stop function; locate ends when it's called.
   */
  findEpc(epc: string, callback: (rssi: number) => void): () => void
}
