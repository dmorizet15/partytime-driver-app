# Lessons — partytime-driver-app

Patterns to avoid and reinforce. Read at session start. Append when Darren corrects something or when a non-obvious pattern proves itself out.

Format: one lesson per block. Lead with the rule, then **Why** and **How to apply**.

---

## Phase 2A weather infrastructure was designed as a facade — reuse it through `WeatherService`, never re-fetch directly.

**Why:** `src/lib/weather/weather-service.ts` exposes `getWeatherSnapshot(lat, lng)` as the single entry point. Threshold evaluators (`evaluateWindWindow`, `evaluateRainWindow`, `evaluateSnowWindow`, `evaluateLightning`) are LOCKED pure functions in `thresholds.ts` — locked because they're sourced verbatim from the Notion Weather Intelligence spec. Phase 2B (stop-level badges, May 8) reused all of this — no new threshold logic, no new vendor adapter calls, no duplication. Visual language matched Phase 2A's standalone screen so drivers recognize the same signals across surfaces.

**How to apply:** When adding any new weather surface (new screen, new badge, new module), import the existing evaluators and `STATUS_COLORS` directly. Don't create parallel threshold logic. Don't call Tomorrow.io or NWS directly — go through `getWeatherSnapshot` (server-side) or `/api/weather` (client-side). If you find yourself wanting to modify thresholds, update Notion first, then `thresholds.ts`, in lockstep.

---

## When tracking integration progress with feature flags, name them by the integration, not the date — and audit them when shipping.

**Why:** `src/lib/weather/thresholds.ts` defines three "designed-stub" flags from Phase 2A: `HAS_TENT_SIZE_DATA`, `HAS_ANCHORING_GUIDANCE`, `HAS_STOP_LEVEL_BADGES`. Each has a clear shipping condition. Phase 2B's activation was a single-line flag flip (`HAS_STOP_LEVEL_BADGES = false → true`) plus the new component plumbing. The flag names told the next operator exactly what was gated and why.

**How to apply:** When you build a feature with deferred dependencies, encode the dependencies as named boolean flags at the feature-config layer. The flag's name is the spec. When the dependency lands, flipping the flag is a single, reversible commit. Avoid `ENABLE_FEATURE_X` that hides multiple deferred conditions — split per-condition.

---

## On the driver app, the dashboard's `route.status` is invisible. Drivers act on `stop_status` per-stop.

**Why:** The dispatch board's status pill (Draft / Dispatched / Complete) and its associated buttons are dispatcher-side workflow markers. The driver app does NOT query `route.status` — confirmed via grep across the entire driver-app `src/` tree on 2026-05-08. Drivers are routed automatically based on `route_assignments` and act on each stop independently via the `stop_status` column. So the dispatcher clicking "Dispatch" or "Complete" is purely a dashboard-side checkbox; nothing changes for the driver.

**How to apply:** When adding driver-app behavior that depends on "is this route active," do NOT branch on `route.status`. Use `route_assignments` (was the driver assigned today?) and `stop_status` per-stop. If you ever DO need a route-level signal driver-side, build it from per-stop aggregation, not from route.status — because the dispatcher's discipline around clicking those buttons is loose by design.

---

## Stop-level data model: `latitude` / `longitude` come from `dispatch_stops.address_lat` / `address_lng`, populated by the dashboard's geocoding pipeline.

**Why:** As of dashboard Migration 034 (2026-05-08), every `dispatch_stops` row with a non-null `address` gets `address_lat` / `address_lng` populated automatically: backfilled once for existing rows, geocoded per-cycle in `tapgoodsSync.ts` for new/changed addresses, and reset by a `BEFORE UPDATE` trigger when the address text changes. The driver app's Stop type maps these to `latitude` / `longitude` via the supabaseTransform layer. Phase 2B's weather module uses these exact fields directly via `<StopWeatherModule lat={stop.latitude} lng={stop.longitude} />` — no separate geocoding in this repo.

**How to apply:** When you need a stop's coordinates for any feature (mapping, weather, distance, geofencing), trust `stop.latitude` / `stop.longitude` directly. They reflect the customer's delivery/pickup address as geocoded by Google Maps. If lat/lng are null, render the feature gracefully disabled (defensive null guards) — but in production, all rows now have coords.
