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

---

## Home is Home. Never auto-redirect away from it.

**Why:** Commit 938f4b0 (May 6) added a `useEffect` on `src/app/page.tsx` → `DayRouteSelectorScreen` that silently `router.replace`'d to `/route/<assignedRouteId>` whenever the driver had an assignment for today. The intent was "skip manual selection on login," but the effect ran on every mount of `/`, so tapping **Home** in BottomNav also bounced to the route view. Drivers couldn't reach the day overview at all. Then a follow-up patch (cfc8d5c) added a once-per-session flag to make Home reachable on subsequent visits — band-aid on a wrong-shaped problem. The real fix (e72aa78, evening 2026-05-08) was to delete both: Home stays Home; the **Inspect & Start Route** CTA on Home is the explicit, driver-controlled entry into `/route/<id>` (RouteListScreen).

**How to apply:** Keep landing screens and execution screens separate. `/` is the day overview (greeting, truck, day stop list, CTA); `/route/<id>` is the route execution view. Navigation between them is always driver-initiated — a CTA tap, never an effect-driven `router.replace`. If you find yourself writing "auto-load on mount" logic on a top-level page that has a BottomNav entry pointing back to it, stop — the redirect will eat the nav. Acceptable redirects are guard-shaped: unauthenticated → /login, no-role-access → /unauthorized. "Convenient default" is not a guard.

---

## A schema column rename in the dashboard repo is NOT shipped — it is broken — until every consumer repo's selects, types, and call-sites are swept too.

**Why:** 2026-05-09 morning the dashboard shipped Migrations 036/037/038 (`add_maintenance_manager_role`, `profiles_roles_array`, `drop_profiles_role_column`) and updated the dashboard's TypeScript layer to `roles[]`. Dashboard CLAUDE.md was updated to say "No further refactor work outstanding." The driver app — a separate repo, separate PostgREST consumer — was missed. Result: `getUserRole()` here was still calling `…/rest/v1/profiles?select=…,role,…`. PostgREST returned HTTP 400 (column does not exist), `getUserRole` returned `null`, every page guard's `role !== 'driver' && role !== 'super_admin'` evaluated `true`, and every authenticated user saw "Access denied" until 2026-05-09 evening (commit `b937892`). The dashboard build was green, the dashboard runtime was green, the dashboard's own tests were green — but production was broken for every driver app user from morning to evening because the migration's blast radius wasn't audited across repos.

**How to apply:** Before declaring a schema-changing migration "complete" in the dashboard, run a cross-repo audit. The minimum sweep:
1. `cd ~/Projects/partytime-driver-app && grep -rn "<old_column_name>" src/` — catches PostgREST `select=` strings, TypeScript types, and call sites.
2. `cd ~/Projects/partytime-sms && grep -rn "<old_column_name>" src/` — same for the SMS repo (any service that talks to the same Supabase project counts).
3. For renames specifically (column X → Y), also grep for the old column in any `src/types/supabase.ts` autogenerated file — those drift silently because no app code references them by string.
4. Update CLAUDE.md "Active Flags" only after every consumer repo's `npx next build` is green AND its production deploy is confirmed READY — not after the migration applies.

The cheap forcing function: when writing the migration's CHANGELOG entry, list the consumer repos explicitly, and don't write "no further refactor work outstanding" until each repo's commit hash is recorded next to its repo name.

**Related — driver-app-side prevention:** treat any `*.role` / `select('role')` / `profile?.role` reference as a regression seed once the schema has plural `roles[]`. If you ever find yourself reintroducing one (e.g., copy-pasting from old code), stop — the column doesn't exist and the inline pattern is `roles?.includes('driver')`.

---

## Trust the data join. When the data is wired, delete the stub flag — don't keep the placeholder.

**Why:** `HAS_TRUCK = false` in `DayRouteSelectorScreen.tsx` rendered a hardcoded "Your truck: — · —" stub on Home, with a "Coming soon" toast on tap. Meanwhile `/api/routes` had been joining `trucks!routes_truck_id_fkey(id, name)` and the `Route` type already exposed `truck_name` — `RouteListScreen.tsx:174` was consuming it. The data was live and shipping; only Home didn't read from it because the flag was never flipped. Result: drivers saw "— · —" on Home for weeks despite the data being one prop away. Surfaced 2026-05-08 — fixed by deleting `HAS_TRUCK`, adding `plate` to the existing trucks join + transform + Route type, and rendering `<truck_name> · <plate>` (or name-only when plate is null).

**How to apply:** When a "designed-stub" feature flag's gating condition is already true (the API returns the data, the type has the field, a sibling screen is consuming it), the flag is a stale toggle — not a feature flag. Delete it, render the data, hide the slot when the data is null. Don't leave a placeholder pretending to be a feature. The audit pattern: search for `HAS_*` flags whenever you wire up a new API field; if any flag's spec is "show X when X exists in the API" and X now exists in the API, that flag is technical debt.
