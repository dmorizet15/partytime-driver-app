// ─── RFID module — host adapter contract ─────────────────────────────────────
// The ONLY doorway between the host app and this module. The host implements
// these interfaces and injects them via <RfidModuleProvider>; module code may
// never import from host internals. Widening one of these interfaces is the
// correct response to needing new app knowledge — importing around the
// boundary is a red suite (see tests/boundary.test.ts).
//
// Extraction test: a fresh app adopts this module by implementing these
// adapters + mounting the exported API route handlers + setting env config,
// with ZERO module-code changes.

// ─── Shared value types ───────────────────────────────────────────────────────

/** GPS fix. `capturedAt` is epoch ms of acquisition, not of use. */
export interface GeoPoint {
  lat: number
  lng: number
  accuracyM?: number
  capturedAt: number
}

// ─── StopContextAdapter ───────────────────────────────────────────────────────

export type StopKind = 'delivery' | 'pickup' | 'other'

/**
 * One expected item line on the stop, as the host order system knows it.
 * The module resolves these against its own replica (EPC/rental-class
 * mapping); the host is not expected to know anything about tags.
 */
export interface ExpectedItem {
  /** Host order-system line id (TapGoods pick-list line id for PTR). Null when the line is not addressable in the order system. */
  lineId: string | null
  /** Catalog/rental-class identifier when the host knows it. Most hosts will not — the module's replica mapping is the source of truth. */
  rentalClassId: string | null
  name: string
  quantity: number
  /**
   * Whether units of this line carry RFID tags. Non-RFID lines NEVER enter
   * the scan path — they are completed manually (individual serialized assets
   * or bulk quantity). PTR derives this from the rfid_to_tapgoods_map join at
   * merge time (see docs/ASSUMPTIONS.md). Default when omitted:
   * `rentalClassId !== null`.
   */
  taggable?: boolean
}

/** Everything the module needs to know about the stop the driver is on. */
export interface StopContext {
  stopId: string
  kind: StopKind
  /** Order identifier in the host order system (TapGoods order id for PTR). */
  orderId: string
  /**
   * Contract number as written to the tag backend (`last_contract_num`
   * semantics). PTR passes the same value as `orderId`; the two fields exist
   * because a standalone host may number contracts independently.
   */
  contractNumber: string
  clientName: string
  expectedItems: ExpectedItem[]
}

/**
 * Supplies the current stop. This is the adapter that makes manual
 * Contract # / Client Name entry unnecessary — the host already knows both.
 */
export interface StopContextAdapter {
  /** Current stop, or null outside any stop context (e.g. standalone Touch Scan). */
  getCurrentStop(): StopContext | null
}

// ─── IdentityAdapter ──────────────────────────────────────────────────────────

export interface DriverIdentity {
  /** Stable unique id (Supabase auth uid for PTR). */
  id: string
  /** Human-readable name — written to `last_scanned_by` on the tag backend. */
  displayName: string
}

/**
 * Supplies the signed-in driver. Replaces the `DRIVER_ID = 'ptr-driver'`
 * placeholder — module code must never hardcode an identity.
 * Resolves null when no one is signed in; write paths must treat that as
 * a blocking error, not a silent fallback.
 */
export interface IdentityAdapter {
  getCurrentDriver(): Promise<DriverIdentity | null>
}

// ─── AuthAdapter ──────────────────────────────────────────────────────────────

/**
 * Supplies bearer tokens for host-mediated backend calls (PTR: the Supabase
 * session token the dashboard write-back proxy expects). Deliberately
 * separate from IdentityAdapter: identity and token supply are distinct
 * concerns that only coincide in PartyTime — a standalone host may have
 * identity with no token-bearing session at all.
 */
export interface AuthAdapter {
  /** Current bearer token, or null when no live session (offline / mid-refresh). Must never reject. */
  getAccessToken(): Promise<string | null>
}

// ─── LocationAdapter ──────────────────────────────────────────────────────────

/**
 * Supplies GPS. Implementations must resolve null on denial/timeout — never
 * reject — so write paths degrade to coordinate-less writes gracefully.
 */
export interface LocationAdapter {
  getCurrentPosition(): Promise<GeoPoint | null>
}

// ─── NavigationAdapter ────────────────────────────────────────────────────────

/** Navigation callbacks into the host. The module never touches the router. */
export interface NavigationAdapter {
  /** Leave the module surface and return to the host screen that opened it. */
  exitModule(): void
  /** Open an external map at the given point (Touch Scan "Launch Map"). */
  openMap(point: { lat: number; lng: number }, label?: string): void
}

// ─── ThemeAdapter ─────────────────────────────────────────────────────────────

/**
 * Design tokens injected by the host so module UI looks native inside the
 * host without importing the host's Tailwind config or duplicating its
 * values (duplication guarantees drift). The module ships a brand-neutral
 * DEFAULT_RFID_THEME used only when the host injects nothing.
 */
export interface RfidTheme {
  colors: {
    /** Primary action color (PTR Direction 03: blue). */
    primary: string
    /** Primary text. */
    ink: string
    /** Screen background. */
    background: string
    /** Card / sheet surface. */
    surface: string
    /** Muted surface (table stripes, disabled fills). */
    surfaceMuted: string
    /** Highlight accent (PTR: gold). */
    accent: string
    /** Soft accent fill behind accent text. */
    accentSoft: string
    /** Errors, conflicts, destructive actions. */
    danger: string
    /** Success / matched / synced. */
    success: string
    /** Secondary text. */
    muted: string
  }
  fonts: {
    display: string
    body: string
  }
  /** Minimum touch target size in px (PTR standard: 56). */
  touchTargetPx: number
}

export interface ThemeAdapter {
  getTheme(): RfidTheme
}

/** Brand-neutral fallback — NOT a copy of any host's tokens. */
export const DEFAULT_RFID_THEME: RfidTheme = {
  colors: {
    primary: '#1d4ed8',
    ink: '#111827',
    background: '#f9fafb',
    surface: '#ffffff',
    surfaceMuted: '#f3f4f6',
    accent: '#d97706',
    accentSoft: '#fef3c7',
    danger: '#dc2626',
    success: '#16a34a',
    muted: '#6b7280',
  },
  fonts: {
    display: "system-ui, -apple-system, sans-serif",
    body: "system-ui, -apple-system, sans-serif",
  },
  touchTargetPx: 56,
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

/** Everything the host injects. `theme` is optional (falls back to DEFAULT_RFID_THEME). */
export interface RfidModuleAdapters {
  stopContext: StopContextAdapter
  identity: IdentityAdapter
  auth: AuthAdapter
  location: LocationAdapter
  navigation: NavigationAdapter
  theme?: ThemeAdapter
}
