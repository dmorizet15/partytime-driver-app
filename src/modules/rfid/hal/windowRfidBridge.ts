// ─── WindowRfidBridge — THE one sanctioned window.rfidBridge reader ─────────
// Everything else receives a NativeBridge via <RfidModuleProvider>. If you are
// about to read window.rfidBridge anywhere else in this module: stop, inject.
//
// Contract facts (partytime-rfid CLAUDE.md, hardware-verified 2026-06-12):
//   • `window.rfidBridge` is the @JavascriptInterface object name — never renamed
//   • native → web events are CustomEvents on window; detail may arrive as a
//     STRINGIFIED JSON payload — parse defensively
//   • web → native calls are fire-and-forget, no return values

import type { BridgeEventMap, BridgeEventName, NativeBridge } from './bridge'

/** The subset of Window this file needs — injectable for tests. */
export interface BridgeWindow {
  rfidBridge?: Record<string, (...args: unknown[]) => void>
  addEventListener(type: string, cb: (e: Event) => void): void
  removeEventListener(type: string, cb: (e: Event) => void): void
}

function parseDetail<E extends BridgeEventName>(raw: unknown): BridgeEventMap[E] | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    return value && typeof value === 'object' ? (value as BridgeEventMap[E]) : null
  } catch {
    return null
  }
}

export function windowRfidBridge(
  win: BridgeWindow | undefined = typeof window === 'undefined'
    ? undefined
    : (window as unknown as BridgeWindow),
): NativeBridge {
  const call = (method: string, ...args: unknown[]): void => {
    const bridge = win?.rfidBridge
    const fn = bridge?.[method]
    if (typeof fn === 'function') {
      try {
        fn.apply(bridge, args)
      } catch (err) {
        // Fire-and-forget contract: a native-side throw must never break a flow.
        console.warn(`[rfid] bridge call ${method} threw`, err)
      }
    }
  }

  return {
    isAvailable: () => typeof win?.rfidBridge === 'object' && win.rfidBridge !== null,

    on<E extends BridgeEventName>(event: E, callback: (detail: BridgeEventMap[E]) => void) {
      if (!win) return () => {}
      const handler = (e: Event) => {
        const detail = parseDetail<E>((e as CustomEvent).detail)
        if (detail) callback(detail)
      }
      win.addEventListener(event, handler)
      return () => win.removeEventListener(event, handler)
    },

    startRfid: () => call('startRfid'),
    stopRfid: () => call('stopRfid'),
    setPower: (level: number) => call('setPower', level),
    findEpc: (epc: string) => call('findEpc', epc),
    startBarcode: () => call('startBarcode'),
    stopBarcode: () => call('stopBarcode'),
    enableNfc: () => call('enableNfc'),
    disableNfc: () => call('disableNfc'),
  }
}
