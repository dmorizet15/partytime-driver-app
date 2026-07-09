// ─── RFID module — public entry ──────────────────────────────────────────────
// The host app imports from HERE (or from './adapters', './ports', './hal'
// type barrels) and nowhere deeper. The module never imports from the host —
// see README.md for the boundary contract and tests/boundary.test.ts for its
// enforcement.

export {
  DEFAULT_RFID_THEME,
  type AuthAdapter,
  type DriverIdentity,
  type ExpectedItem,
  type GeoPoint,
  type IdentityAdapter,
  type LocationAdapter,
  type NavigationAdapter,
  type RfidModuleAdapters,
  type RfidTheme,
  type StopContext,
  type StopContextAdapter,
  type StopKind,
  type ThemeAdapter,
} from './adapters/types'

export {
  RfidModuleProvider,
  type RfidModuleWiring,
} from './provider/RfidModuleProvider'

export {
  TagBackendError,
  type ItemRecord,
  type ItemStatusWrite,
  type TagBackendPort,
  type TagBackendWriteResult,
} from './ports/tagBackend'

export {
  type OrderSystemPort,
  type OrderSystemResult,
  type OrderWriteLine,
  type StopCompletionReport,
} from './ports/orderSystem'

export {
  NotImplementedError,
  NotSupportedError,
  type InventoryParameters,
  type InventorySession,
  type RfidScanner,
  type ScannerCapabilities,
  type TagRead,
} from './hal/types'

export { type BridgeEventMap, type NativeBridge } from './hal/bridge'
