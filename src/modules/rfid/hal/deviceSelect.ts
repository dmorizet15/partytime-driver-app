// ─── Device selection — never silent ─────────────────────────────────────────
// Order of authority:
//   1. Manual override (Settings screen; module-owned localStorage key)
//   2. Auto-detect: native bridge present → XR2 (the only shipped wrapper —
//      the bridge has no device-model query yet, see ASSUMPTIONS.md)
//   3. No device: dev builds fall back to MockScanner WITH a loud log;
//      production throws ScannerUnavailableError for the UI to surface.
// Silently picking a device is a bug by definition.

import type { NativeBridge } from './bridge'
import type { RfidScanner } from './types'
import { Xr2Scanner } from './xr2Scanner'
import { C72Scanner } from './c72Scanner'
import { MockScanner } from '../testing/mockScanner'

export type ScannerOverride = 'auto' | 'xr2' | 'c72' | 'mock'

const OVERRIDE_KEY = 'rfid_scanner_override'

export class ScannerUnavailableError extends Error {
  constructor() {
    super(
      'No RFID scanner available: the native bridge is not present and no manual override is set. ' +
        'Run inside the Android scanner wrapper, or pick a device in Settings.',
    )
    this.name = 'ScannerUnavailableError'
  }
}

export function getScannerOverride(): ScannerOverride {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(OVERRIDE_KEY)
    return v === 'xr2' || v === 'c72' || v === 'mock' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function setScannerOverride(value: ScannerOverride): void {
  try {
    if (value === 'auto') localStorage.removeItem(OVERRIDE_KEY)
    else localStorage.setItem(OVERRIDE_KEY, value)
  } catch {
    // Storage unavailable — override simply won't persist; selection stays explicit per session.
  }
}

export interface SelectScannerOptions {
  bridge: NativeBridge
  /** Defaults to the persisted Settings value. */
  override?: ScannerOverride
  /** Dev builds may fall back to MockScanner; production must not. */
  isDevBuild: boolean
}

export function selectScanner({ bridge, override, isDevBuild }: SelectScannerOptions): RfidScanner {
  const choice = override ?? getScannerOverride()

  switch (choice) {
    case 'xr2':
      return new Xr2Scanner(bridge)
    case 'c72':
      return new C72Scanner(bridge)
    case 'mock':
      console.warn('[rfid] scanner override = mock — synthetic reads only')
      return new MockScanner()
    case 'auto':
      break
  }

  if (bridge.isAvailable()) {
    // Only the XR2 wrapper injects window.rfidBridge today. When a second
    // native wrapper ships, the bridge needs a device-identity call — logged
    // in ASSUMPTIONS.md; auto-detect stays honest until then.
    return new Xr2Scanner(bridge)
  }

  if (isDevBuild) {
    console.warn('[rfid] no native bridge — DEV fallback to MockScanner (synthetic reads only)')
    return new MockScanner()
  }

  throw new ScannerUnavailableError()
}
