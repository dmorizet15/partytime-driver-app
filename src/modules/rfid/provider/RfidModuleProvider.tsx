'use client'

// ─── Composition root — the ONE place host wiring meets module code ─────────
// The host renders <RfidModuleProvider> with its adapter implementations and
// (optionally) explicit bridge/scanner/port overrides — tests inject fakes
// through the same props. Module components and flows reach everything below
// through the use* hooks; nothing else in the module may touch window globals
// or construct vendor clients.

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  DEFAULT_RFID_THEME,
  type RfidModuleAdapters,
  type RfidTheme,
} from '../adapters/types'
import type { NativeBridge } from '../hal/bridge'
import type { RfidScanner } from '../hal/types'
import type { OrderSystemPort } from '../ports/orderSystem'
import type { TagBackendPort } from '../ports/tagBackend'

export interface RfidModuleWiring {
  adapters: RfidModuleAdapters
  /**
   * Transport to the native wrapper. When omitted, the module wires the
   * window-backed bridge at mount (the only sanctioned window.rfidBridge
   * reader). Tests pass a scripted bridge.
   */
  bridge?: NativeBridge
  /**
   * Scanner override. When omitted, the module auto-detects (bridge present →
   * Xr2Scanner; dev builds fall back to MockScanner; production shows an
   * explicit error). Never silently picks a device outside those rules.
   */
  scanner?: RfidScanner
  /** Tag system of record. When omitted, the module wires its Easy RFID Pro implementation (sandbox-guarded). */
  tagBackend?: TagBackendPort
  /** Order system. When omitted, the module wires its TapGoods implementation (dry-run-gated). */
  orderSystem?: OrderSystemPort
}

interface RfidModuleContextValue extends RfidModuleWiring {
  theme: RfidTheme
}

const RfidModuleContext = createContext<RfidModuleContextValue | null>(null)

export function RfidModuleProvider({
  children,
  ...wiring
}: RfidModuleWiring & { children: ReactNode }) {
  const value = useMemo<RfidModuleContextValue>(
    () => ({
      ...wiring,
      theme: wiring.adapters.theme?.getTheme() ?? DEFAULT_RFID_THEME,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wiring objects are stable by convention (host constructs once)
    [wiring.adapters, wiring.bridge, wiring.scanner, wiring.tagBackend, wiring.orderSystem],
  )
  return <RfidModuleContext.Provider value={value}>{children}</RfidModuleContext.Provider>
}

function useModuleContext(caller: string): RfidModuleContextValue {
  const ctx = useContext(RfidModuleContext)
  if (!ctx) {
    throw new Error(
      `${caller} must be used inside <RfidModuleProvider> — the host wires adapters there`,
    )
  }
  return ctx
}

export function useAdapters(): RfidModuleAdapters {
  return useModuleContext('useAdapters').adapters
}

export function useTheme(): RfidTheme {
  return useModuleContext('useTheme').theme
}

/** Wiring handles for module internals (scan session, sync engine). Not part of the host-facing API. */
export function useModuleWiring(): RfidModuleContextValue {
  return useModuleContext('useModuleWiring')
}
