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

export {
  ScannerUnavailableError,
  getScannerOverride,
  selectScanner,
  setScannerOverride,
  type ScannerOverride,
} from './hal/deviceSelect'

export { createRfidRouteHandlers, type RfidRouteHandlers } from './server/routeHandlers'
export { HttpTagBackend } from './server/httpTagBackend'
export { TapGoodsOrderSystem } from './server/tapGoodsOrderSystem'
export { EasyRfidProBackend } from './server/easyRfidProBackend'
export { EzrfidClient, SANDBOX_HOST } from './server/ezrfidClient'

export {
  ITEM_STATUSES,
  NON_RENTABLE_STATUSES,
  REPAIR_REASONS,
  WASH_REASONS,
  type ItemStatus,
} from './flows/statusVocabulary'

export type { QueueCounts, ReplicaItem, SyncState } from './offline/types'
