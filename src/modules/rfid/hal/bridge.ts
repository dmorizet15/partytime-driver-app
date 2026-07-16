// ─── NativeBridge — device-NEUTRAL transport to the native wrapper ──────────
// The bridge is a transport, not a device: it is deliberately not XR2-shaped.
// Xr2Scanner consumes this interface; a future C72 wrapper implements the SAME
// events/calls from its own native side and C72Scanner consumes it unchanged.
//
// Module code receives a NativeBridge through <RfidModuleProvider> — nothing
// outside windowRfidBridge.ts may read window.rfidBridge, and nothing anywhere
// reads it directly from a component or flow. Tests inject a scripted bridge.

/** Events the native layer fires into the web layer. */
export interface BridgeEventMap {
  /** RFID inventory read. */
  'rfid-scan': { epc: string; rssi: number; timestamp: number }
  /** Barcode decode. */
  'barcode-scan': { value: string; format: string; timestamp: number }
  /** NFC tap. */
  'nfc-scan': { uid: string; tagType: string; timestamp: number }
  /** Locate-mode proximity stream while findEpc is active (proximity 0.0–1.0). */
  'rfid-locate': { epc: string; proximity: number; timestamp: number }
  /**
   * Physical trigger edge (XR2 side trigger). The native layer edge-filters
   * key repeats — first DOWN and the UP only. Press-and-hold semantics are
   * decided in the web layer (Session 11 scan model).
   */
  'trigger-event': { pressed: boolean; timestamp: number }
}

export type BridgeEventName = keyof BridgeEventMap

/**
 * Calls the web layer makes into the native layer. Fire-and-forget by
 * contract — no return values, no callbacks (results come back as events).
 */
export interface NativeBridgeCalls {
  startRfid(): void
  stopRfid(): void
  /** Output power 0–33. */
  setPower(level: number): void
  /** Arm locate mode for one EPC; 'rfid-locate' events stream until stopRfid. */
  findEpc(epc: string): void
  startBarcode(): void
  stopBarcode(): void
  enableNfc(): void
  disableNfc(): void
}

export interface NativeBridge extends NativeBridgeCalls {
  /** True when a native wrapper injected the bridge (i.e. running inside the Android WebView host). */
  isAvailable(): boolean
  /** Subscribe to a native event. Returns unsubscribe. */
  on<E extends BridgeEventName>(event: E, callback: (detail: BridgeEventMap[E]) => void): () => void
}
