// ─── ScriptedBridge — NativeBridge test double ────────────────────────────────
// Drives barcode/NFC/locate event paths deterministically and records every
// call the module makes into the native layer, so tests can assert on the
// exact call sequence (e.g. "stopRfid fired on unmount").

import type { BridgeEventMap, BridgeEventName, NativeBridge } from '../hal/bridge'

type Listener<E extends BridgeEventName> = (detail: BridgeEventMap[E]) => void

export class ScriptedBridge implements NativeBridge {
  readonly calls: Array<{ method: string; args: unknown[] }> = []
  private available = true
  private listeners = new Map<BridgeEventName, Set<Listener<BridgeEventName>>>()
  private now = 2_000_000

  setAvailable(v: boolean): void {
    this.available = v
  }

  // ── Test emission API ──────────────────────────────────────────────────────

  emit<E extends BridgeEventName>(event: E, detail: Omit<BridgeEventMap[E], 'timestamp'>): void {
    const full = { ...detail, timestamp: (this.now += 13) } as BridgeEventMap[E]
    this.listeners.get(event)?.forEach((cb) => cb(full))
  }

  callsTo(method: string): Array<{ method: string; args: unknown[] }> {
    return this.calls.filter((c) => c.method === method)
  }

  // ── NativeBridge implementation ───────────────────────────────────────────

  isAvailable(): boolean {
    return this.available
  }

  on<E extends BridgeEventName>(event: E, callback: (detail: BridgeEventMap[E]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(callback as Listener<BridgeEventName>)
    this.listeners.set(event, set)
    return () => set.delete(callback as Listener<BridgeEventName>)
  }

  startRfid(): void {
    this.record('startRfid')
  }
  stopRfid(): void {
    this.record('stopRfid')
  }
  setPower(level: number): void {
    this.record('setPower', level)
  }
  findEpc(epc: string): void {
    this.record('findEpc', epc)
  }
  startBarcode(): void {
    this.record('startBarcode')
  }
  stopBarcode(): void {
    this.record('stopBarcode')
  }
  enableNfc(): void {
    this.record('enableNfc')
  }
  disableNfc(): void {
    this.record('disableNfc')
  }

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args })
  }
}
