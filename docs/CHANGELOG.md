# Changelog — partytime-driver-app

Per-session work log. Most recent entry on top. Architecture decisions, rules, and active flags live in `CLAUDE.md`. Roadmap and progress live in Notion (PTR Master Build Checklist + Build Progress Dashboard).

---

## 2026-05-27 — Auto-logout verification (no code shipped)

**Scope.** Darren re-issued the Auto-Logout two-layer brief. CLAUDE.md already documented this as shipped on 2026-05-24 (commit `76bb769`). Read the three implicated files end-to-end against the spec, confirmed every requirement is met, no code changes needed.

- **Layer 1 — `src/screens/StopDetailScreen.tsx:408-430`.** `welcomeBackAt` is set inside the warehouse_return geofence's `onArrive` after `/api/complete-stop` returns OK. A `useEffect` sets a 6000 ms timeout; only on the trailing edge it clears `localStorage.ptr_session_date`, awaits `signOut()`, and `router.replace('/login')`. Banner runs in full.
- **Layer 2 stamp — `src/screens/LoginScreen.tsx:132-136`.** After successful `signIn`, before `router.push('/')`, writes `localStorage.ptr_session_date = new Date().toISOString().split('T')[0]`.
- **Layer 2 gate — `src/context/AuthContext.tsx:37-48`.** Inside `onAuthStateChange`, on `INITIAL_SESSION` only (SIGNED_IN intentionally skipped to avoid racing the LoginScreen stamp): reads `ptr_session_date`, compares against today's `YYYY-MM-DD`, on mismatch removes the key → `supabase.auth.signOut()` → `window.location.replace('/login')` → returns before `setUser`. `loading` stays true until redirect, no consumer ever sees the stale session.

No commits. No file modifications other than this entry.

---

## 2026-05-26 — Work Orders & Field Issues (driver app, Session 2)

**Scope.** Driver-app UI for the dashboard's Session 1 work-orders backend (`4e04ac9` — `field_work_orders` Migration 073, `profiles.work_order_technician`, POST/GET/PATCH `/api/work-orders`, `notifyNewFieldWorkOrder` email). Three driver-facing surfaces: a stop-detail "Report an issue" link, an ungated "Report an Issue" Tools Hub card, and a technician-gated "Work Orders" Tools Hub card → list → detail. All four flows share one `ReportIssueForm` component.

### Architecture

- **Cross-app POST, not direct supabase insert.** Driver app POSTs `${NEXT_PUBLIC_DASHBOARD_URL}/api/work-orders` with the supabase access token in the Authorization header. Reason: the dashboard route owns `work_order_number` generation **and** the assignee + super_admin notification email. Skipping the dashboard would skip the email. PATCH for status transitions + notes uses the same route. Reads (`listMyWorkOrders`, `getWorkOrder`, `listTechnicians`) go straight to supabase under RLS — no side effects to worry about, and the dashboard would round-trip a SELECT either way.
- **Two stacked permissions on `profiles`.** `fleet_maintenance_access` (existing) and `work_order_technician` (new this session). Both are independent of `roles`. UI gates: `useFleetAccess` and `useWorkOrderTechnician`. **Filing an issue is ungated** — any signed-in user can file. The **technician queue** (list + detail) is gated on `work_order_technician`.
- **`UserProfile` type + `getUserRole` SELECT extended.** The shared profile fetch in `src/lib/auth.ts` was already loading `fleet_maintenance_access`; this session adds `work_order_technician` to the same SELECT. One round trip, two stacked permissions.
- **Post-submit confirmation via `sessionStorage`.** The stop-detail screen and the form live on different routes, so we can't pass result data via React state. `ReportIssueScreen.onSuccess` stamps `sessionStorage.setItem(reportIssueSuccessKey(stopId), JSON.stringify({workOrderNumber, assigneeName, ts}))` then navigates back. `StopDetailScreen` reads + clears the key on mount and swaps the red-bordered link for a green confirmation pill for 6 s. Key is single-use — re-mounting later doesn't re-show the pill.

### Files

**New.**

- `src/lib/workOrders/api.ts` — `createWorkOrder` POST + `updateWorkOrder` PATCH (cross-app); `listMyWorkOrders`, `getWorkOrder`, `listTechnicians` (RLS-gated supabase). Accepts either flat or nested response shape from the dashboard.
- `src/lib/workOrders/types.ts` — `FieldWorkOrder` row alias from generated supabase types; `CreateWorkOrderPayload` + `UpdateWorkOrderPayload` payloads; enum unions for status / priority / billing / asset_type.
- `src/lib/workOrders/theme.ts` — `WC` palette (editorial tokens), `PRIORITY_COLOR` + `STATUS_LABEL` maps, `FONT_DISPLAY` / `FONT_BODY` const.
- `src/hooks/workOrders/useWorkOrderTechnician.ts` — single-property hook over `useAuth().profile.work_order_technician`.
- `src/hooks/workOrders/useOpenWorkOrdersCount.ts` — head-count `field_work_orders WHERE status IN ('open','in_progress')` for the Tools Hub badge.
- `src/components/workOrders/WorkOrderGate.tsx` — route-level access gate (mirrors `FleetGate`).
- `src/components/workOrders/ReportIssueForm.tsx` — the shared form (stop + standalone modes). Item picker (stop mode), 4-way asset type toggle (standalone), debounce-search of `trucks` + `non_truck_assets` (250 ms), optional related-order debounce-search of `dispatch_stops` (300 ms), self/picker assignee toggle, color-coded priority toggle, billing toggle. Submit via `createWorkOrder`.
- `src/screens/workOrders/ReportIssueScreen.tsx` — wraps the form. Owns the routeId+stopId param plumbing, the back/post-submit nav, the `reportIssueSuccessKey` sessionStorage stash, and the standalone confirmation panel.
- `src/screens/workOrders/WorkOrdersListScreen.tsx` — Screen 3. Open / In Progress / Done tabs with count chips, color-coded left-border cards, gold FAB to open Screen 2B. Batches a `profiles` SELECT to resolve creator display names.
- `src/screens/workOrders/WorkOrderDetailScreen.tsx` — Screen 4. Read-only record, sticky action bar (Mark In Progress / Mark Complete / + Note), bottom-sheet note modal. Notes are PATCHed as the full reconstructed string (existing + timestamp prefix + new) so the client works against either replace-or-append dashboard semantic.
- `src/app/tools/report-issue/page.tsx`, `src/app/tools/work-orders/page.tsx`, `src/app/tools/work-orders/[id]/page.tsx`, `src/app/route/[routeId]/stop/[stopId]/report-issue/page.tsx` — the four new App Router routes.

**Modified.**

- `src/types/auth.ts` — `UserProfile` gains `work_order_technician: boolean`.
- `src/lib/auth.ts` — `getUserRole` SELECT list gains `,work_order_technician`.
- `src/types/supabase.ts` — regenerated from project `fumprcyavpefyupurvsv`; brings in `field_work_orders` table + `profiles.work_order_technician`.
- `.env.local.example` — documents `NEXT_PUBLIC_DASHBOARD_URL` with prod default `https://dashboard.partytimerentals.com`.
- `src/screens/StopDetailScreen.tsx` — adds `reportIssueSuccessKey` import + sessionStorage hydration effect + the link/pill swap inside the action card under the QuickAction grid.
- `src/screens/ToolsScreen.tsx` — adds `AlertIcon` + `ClipboardListIcon` + `ReportIssueCard` + `WorkOrdersCard` components, slotted between the existing Fleet Maintenance card and the Generators card.

### Decisions

- **WebFetch of the Notion spec failed** (auth-walled, normal Notion behavior). Worked from the inline spec in the session prompt + verified types against the regenerated `field_work_orders` schema.
- **Picked the `NEXT_PUBLIC_DASHBOARD_URL` + client-side POST approach** over a driver-app proxy route or a supabase-direct-insert + DB-trigger-email path. Simpler — one env var, one fetch. Trade-off: needs Vercel env config before the feature works (called out explicitly in `tasks/todo.md`).
- **Reused the existing inline-tokens design system** (`C = {...}` per-screen palette in StopDetailScreen / ToolsScreen) instead of introducing a `colors.ptw.*` import. The new `WC` palette in `src/lib/workOrders/theme.ts` matches the values exactly — no new design language.
- **Notes are sent as the full reconstructed value on PATCH.** Without sight of the dashboard's PATCH semantics (replace vs append), replace + client-side concat is the only safe bet — append-on-the-server would duplicate the existing notes when the client also concatenates. Flagged in `tasks/todo.md` for confirmation.

### Build

`npx next build` green end-to-end. All 32 pages generated; 4 new routes registered (`/route/[routeId]/stop/[stopId]/report-issue` 3.16 kB, `/tools/report-issue` 3.14 kB, `/tools/work-orders` 3.97 kB, `/tools/work-orders/[id]` 4.7 kB). No new dependencies. No new migrations (all schema came from dashboard Session 1).

### Open follow-ups (tracked in `tasks/todo.md`)

- **Set `NEXT_PUBLIC_DASHBOARD_URL` in driver-app Vercel project before testing.**
- Confirm dashboard response shape (flat vs nested) — adjust `createWorkOrder` if neither matches what Session 1 actually returns.
- Confirm dashboard PATCH semantics for notes (replace vs append) — switch the client to send only the new note text if the server appends.
- Verify `listTechnicians` actually populates under prod RLS; fall back to a dashboard `/api/work-orders/technicians` endpoint if blocked.

---

## 2026-05-24 — Auto-logout (driver app, two layers)

**Scope:** driver-app only. No migration, no API route, no dashboard / SMS / schema changes. Shared-device hygiene only.

**Problem.** Drivers share company devices. When a route ended, the next driver picked up the device and found the previous driver still signed in. Two complementary layers now close the gap.

**Layer 1 — warehouse_return signOut.** When the `warehouse_return` geofence fires and `/api/complete-stop` succeeds, `StopDetailScreen.tsx` already shows a 6-second "Welcome back — route complete" inline banner before clearing the `welcomeBackAt` timestamp. That same `setTimeout` now also clears `localStorage.ptr_session_date`, calls `supabase.auth.signOut()`, and `router.replace('/login')`. The banner finishes naturally — the signOut fires only on the trailing edge of the existing 6 s timeout, so the driver still sees the confirmation. Manual `Mark Complete` on the warehouse_return stop is intentionally untouched (it navigates away to the route view without the banner) — Layer 2 catches that case next morning.

**Layer 2 — day-change check.** A PWA on a phone gets suspended overnight; `setTimeout(midnight)` is unreliable. Instead, every authenticated app load checks a `localStorage.ptr_session_date` key against today's date (`YYYY-MM-DD`). `LoginScreen.tsx` stamps the key after a successful `signIn`. `AuthContext.tsx` reads it inside `onAuthStateChange` on the `INITIAL_SESSION` event — the first auth event per page load — and if it's missing or not equal to today, it removes the key, calls `supabase.auth.signOut()`, and `window.location.replace('/login')` *before* the provider exposes the session to any consumer (returns early before `setUser`). `SIGNED_IN` events are skipped because LoginScreen has just stamped the date; checking on `SIGNED_IN` would race the new login.

**Edge case (intentional).** A driver opening the app on a personal device the morning after their shift is signed out on first load. That is the correct and intended behavior per the spec — they re-authenticate and go about their day.

**Build:** `npx next build` green. Pushed to `main`.

**Files modified.** `src/screens/StopDetailScreen.tsx` (Layer 1 hook, `signOut` import), `src/screens/LoginScreen.tsx` (Layer 2 stamp), `src/context/AuthContext.tsx` (Layer 2 check).

---

## 2026-05-23 — Pre-trip mileage capture (driver app)

**Scope:** driver-app only. No migration — `trucks.current_mileage` (integer, nullable) already existed. Follow-on to the 2026-05-22 Fleet Maintenance ships.

**Surface.** Required Odometer card on the pre-trip inspection's `sign_submit` step (Screen 6), placed above the certify checkbox so the "information above is accurate" attestation covers the reading. Label: "Current odometer reading (miles)" + helper "Enter the number shown on the truck's dashboard." Input is `type="text"`, `inputMode="numeric"`, `pattern="[0-9]*"`, digit-sanitized in the `onChange` handler (`replace(/[^0-9]/g, '').slice(0, 7)`), with tabular-nums display and a gold-border error state. `Submit Inspection` stays disabled until both the certify checkbox is checked AND the odometer reads a non-empty digit string. New form field `odometer: string` + `SET_ODOMETER` reducer action.

**Server.** `POST /api/inspection/submit` now requires `current_mileage` in the body — integer, `0 ≤ n ≤ MAX_ODOMETER (2,000,000)`. Missing/invalid → 400 with the validator message. On a successful `vehicle_inspections` insert the route also writes `current_mileage` to `trucks` (via the admin client) — **unconditional** (pre-trip is the live ground-truth reading; no backdated value to guard against) and **non-fatal** (a write failure is logged as `trucks.current_mileage update failed (non-fatal)` and the request still 200s — the federally-required inspection row already exists by that point, and an odometer write failure must not block the driver from starting the route).

**Knock-on.** Mileage-based PM flagging is now live fleet-wide. `pmStatus.pmLevelForSchedule` already consumed `trucks.current_mileage` against each schedule's `next_due_miles` + `warning_threshold_miles`; that branch was dormant until this commit, since `current_mileage` was uniformly null. Fleet Overview's `pmDueCount`, Fleet Overview asset-row dots, and Asset Detail PM rows all re-tier automatically on the next read after a pre-trip lands.

**Build:** `npx next build` green. Pushed to `main`.

**Pre-existing investigation note (kept).** Four decisions resolved before the build: (1) the odometer field lives on Screen 6, not Screen 5 — drivers should not enter the reading before they have the truck in front of them and the certify attestation in view; (2) above the certify checkbox; (3) unconditional write; (4) non-fatal trucks UPDATE. The WIP that landed this commit had been sitting in the working tree from the previous investigation arc — verified against the spec, route header comment polished to list `current_mileage` in the POST body, then committed as-is.

---

## 2026-05-22 (evening) — Fleet Maintenance driver-app: three UI fixes

**Scope:** driver-app only. No migrations, no API routes, no type regen (every column the fixes consume was already in `src/types/supabase.ts`). Follow-on to the morning's Fleet Maintenance Module ship (`46ba851`).

**Fix 1 — Standalone "Log service" entry point.** Tapping any truck or equipment row on Fleet Overview now navigates to a new **Asset Detail screen** (`/tools/fleet/assets/[type]/[id]`) — name, year/make/model, plate/serial, status badge, PM schedule (next-due per service type with PM-tier dots/pills), service history (last 5), and the asset's work orders. Primary button "Log service" opens the Log Service Entry form with **no pre-existing work order required** — this closes the gap where a routine oil change couldn't be logged without first opening a work order. Secondary button "View all work orders" toggles resolved work orders into the list (shown only when the asset has resolved WOs). `LogServiceEntryScreen` was refactored to accept either a `workOrderId` (work-order path, unchanged) or an `assetType` + `assetId` pair (the new standalone path, route `/tools/fleet/assets/[type]/[id]/log-service`); back + post-save navigation follow the entry point.

**Fix 2 — Work order placement on Fleet Overview.** The overview is restructured into three sections. **Trucks:** header → open truck work orders (always visible, never collapsed, hidden if none) → full truck list. **Equipment:** header → open equipment work orders (always visible, never collapsed) → equipment list with a collapse/expand toggle *on the list only* (default collapsed at zero open equipment WOs, expanded with ≥1). **Other work orders:** a bottom catch-all for any `fleet_work_orders` row whose `asset_type` is null or whose asset resolves to neither the trucks nor `non_truck_assets` table — hidden entirely when empty. `fetchFleetOverview` now fetches trucks + equipment unfiltered (active rows drive the visible lists; the full id sets decide section vs. catch-all) and returns `truckWorkOrders` / `equipmentWorkOrders` / `otherWorkOrders` instead of one flat `workOrders` array.

**Fix 3 — Equipment management placeholder.** A visible-but-disabled "Manage equipment" chip (lock icon, grayed) sits on the Equipment section header. Tapping it shows a toast — "Equipment management coming soon — contact your administrator to add or update equipment." Sets the expectation without a full build.

**Refactors.** Extracted `WorkOrderCard` and `ServiceLogEntry` to `src/components/fleet/` (shared by Fleet Overview / Asset Detail / Work Order Detail). Added `PmDot` + `PmLevelPill` to `FleetPills`, `ChevronDownIcon` + `LockIcon` to `fleetIcons`. `FleetAssetInfo` gained `vehicleSpec` / `identifier` / `identifierLabel`; `fetchAssetDetail` is the new Asset Detail query.

**Build:** `npx next build` green end-to-end (one fix mid-build — the new `assetType` prop on `LogServiceEntryScreen` shadowed an existing local; renamed the local to `effectiveAssetType`). Pushed to `main` — Vercel auto-deploys.

**Deferred:** pre-trip mileage capture — WIP left uncommitted in the working tree (`InspectionScreen.tsx` + inspection submit route); logged in `tasks/todo.md` as the next driver-app task.

---

## 2026-05-22 — Fleet Maintenance Module (driver app)

**Scope:** driver-app only. No migrations, no API routes. Commit `46ba851` (24 files, +3,567). The dashboard's Fleet Maintenance Module (phases 1–4, migrations 062–068) is production-green; this session built the driver-app surface — four screens + a Tools Hub card + a home alert card — reading and writing those tables directly through the RLS-gated supabase client.

**Pre-flight.** Regenerated `src/types/supabase.ts` for the 062–068 tables. Verified via direct SQL (`supabase db query --linked`): CHECK-constraint enum values for every fleet table, RLS policies (`has_fleet_maintenance_access()` gates all fleet tables for `authenticated` — read + write), and the `service-invoices` Storage bucket policies (same predicate). Confirmed seed data: 13 trucks, 24 equipment, 91 PM schedules, 27 parts, 26 cross-refs; `fleet_work_orders`, `service_records`, and `vendors` all empty.

**Schema gaps flagged to Darren (answered before build):** no work-order→parts junction → show asset-fit parts labelled "Parts for this asset"; `vendors` empty → tap-to-call degrades to "no phone" gracefully; no CarQuest/NAPA cross-refs → render whatever priority exists; `fleet_work_orders` empty → empty states everywhere; invoice-upload conflict (Notion spec said ❌, kickoff design says ✅) → build per the kickoff, reconcile Notion separately.

**Auth.** `profiles.fleet_maintenance_access` added to the `getUserRole` SELECT + the `UserProfile` type. `useFleetAccess()` is the single UI gate. A standard driver sees no Fleet card and cannot reach any `/tools/fleet` route (`FleetGate` → "Access denied").

**Data layer — `src/lib/fleet/`.** `queries.ts` (all reads/writes), `pmStatus.ts` (pure PM-tier derivation), `format.ts`, `types.ts`, `theme.ts`. Hooks in `src/hooks/fleet/`. Shared components in `src/components/fleet/` (FleetGate, FleetPills, FleetAlertCard, InvoiceUpload, BottomSheet, fleetIcons).

**Screen 1 — Tools Hub card.** `FleetMaintenanceCard` in `ToolsScreen.tsx` — role-gated (renders null without access), red pill = open work-order count (hidden at zero).

**Home alert card.** `<FleetAlertCard />` in `DayRouteSelectorScreen.tsx`, between the COD card and the day list — red-border card, shown only to fleet-access users with ≥1 open work order.

**Screen 2 — Fleet Overview** (`/tools/fleet`). Open-WO + PM-due counts, trucks + equipment with red/amber/green status dots, open work-order queue.

**Screen 3 — Work Order Detail** (`/tools/fleet/work-orders/[id]`). Status/source/priority pills, asset, meta, service log (newest 10), "Parts for this asset" (cross-refs + tap-to-call vendor phone). Actions: Log service / Mark resolved / Upload invoice / Assign. Mark resolved closes the work order only — no auto service record.

**Screen 4 — Log Service Entry** (`/tools/fleet/work-orders/[id]/log-service`). Writes `service_records` (+ line items + optional invoice to the `service-invoices` bucket). Picking a service type from the asset's `maintenance_schedules` writes the schedule's `service_type` so the dashboard PM trigger recomputes `next_due_*`. Work order stays open.

**Build:** `npx next build` green end-to-end (one fix mid-build — ES5 target rejects Map/Set iterator spreads; switched to `Array.from`). Pushed to `main` — Vercel auto-deploys.

**Decisions for Notion (chat-Claude):** (1) driver app DOES upload invoices — the approved 2026-05-22 design session supersedes the Build Spec v1.0 access matrix; (2) "Parts for this asset" naming reflects the absence of a work-order→parts junction (v1 accepted, junction is a future enhancement); (3) pre-trip mileage capture is a separate driver-app session, not built here.

---

## 2026-05-19 (evening) — Bug-fix session: Routes-tab for unassigned drivers + /schedule scroll

**Scope:** driver-app only, no migration. Follow-on to the morning's super_admin visibility arc. Darren noticed two regressions on smoke test: (1) drivers without an assignment still had no path to Week Schedule (the morning fix only routed super_admin), and (2) once routed to `/schedule`, long week lists got clipped at ~3 rows and BottomNav fell off the bottom of the viewport.

**Bug 1 — Toggle hidden + Week Schedule unreachable when no route is on the URL**

Root cause: `RouteListScreen.tsx` short-circuited with a "Route not found" full-screen return BEFORE the Today/Week toggle render and BEFORE the `view === 'week'` branch. Anyone who hit `/route/[bad-id]` (typo'd link, stale notification, race with a fresh assignment) lost both the toggle and the path to Week Schedule.

Fix (commit `ebaebc2`):
- Moved the `view === 'week'` branch above the `!route` check so Week Schedule renders regardless of route resolution.
- Rewrote the `!route` branch to render `<ViewToggle>` + the existing "Route not found" banner inside the My Route tab body. Toggle stays visible.
- Route-dependent derivations (`dayRoutes`, `routeIndex`, `trucksLabel`, etc.) and `handleStopTap` are now reached only when `route` is non-null, so no null-access risk.

**Bug 2 — Unassigned drivers stuck on Home with no Routes-tab path to /schedule**

Root cause: The morning's `b49e6e1` deliberately scoped the BottomNav Routes-tab redirect to super_admin only ("Drivers without an assignment still fall back to /"). Darren's original spec — "identical behavior to how super_admin sees it" — was a literal comparison: drivers should also reach `/schedule` when unassigned.

Fix (commit `ced6aa1`):
- `BottomNav.tsx` — removed the `isSuperAdmin` branch from `routesHref`. Both driver and super_admin now route to `/schedule` when `primaryRouteId` is undefined. Safe because `rolesAllowed: ['driver', 'super_admin']` already gates the tab — no `tools_only` leak.

**Bug 3 — /schedule clips week list at ~3 rows, BottomNav drops off the bottom of the viewport**

Root cause: `src/app/schedule/page.tsx` overrode the `.screen` utility's `height: 100svh` lock with an inline `minHeight: '100vh'` and rendered `<main style={{ flex: 1 }}>` without an inner scroll container. On iOS Safari with the toolbar visible, 100vh > 100svh, so the column stretched past the locked viewport and the page only scrolled at the document level. `WeekScheduleView` doesn't manage its own scroll — it expects the parent to (RouteListScreen wraps it in `<div style={{ flex: 1, overflowY: 'auto' }}>` for exactly this reason).

Fix (commit `d1b1910`):
- Dropped the inline `display: 'flex', flexDirection: 'column', minHeight: '100vh'` overrides — the `.screen` class already provides those.
- Added `overflowY: 'auto'` to `<main>` so the week list scrolls inside the main area while BottomNav stays pinned.

**Commits**
- `ebaebc2` — fix(routes): keep Today/Week toggle visible when no route is assigned
- `ced6aa1` — fix(nav): unassigned drivers land on /schedule, matching super_admin
- `d1b1910` — fix(schedule): inner scroll on /schedule so BottomNav stays pinned

**Files touched**
- `src/screens/RouteListScreen.tsx` — toggle hoisted above `!route` short-circuit; banner moved inside My Route tab body
- `src/components/BottomNav.tsx` — `routesHref` simplified to `primaryRouteId ? /route/<id> : '/schedule'` for both gated roles
- `src/app/schedule/page.tsx` — drop redundant inline layout overrides; add `overflowY: 'auto'` on `<main>`

**Lessons logged**
- `.screen` utility class is load-bearing — inline layout overrides (`minHeight`, `display: flex`, `flex-direction`) defeat the iOS Safari toolbar lock and the BottomNav pin contract.
- "Identical to super_admin" is a literal spec phrase. When the spec compares one role to another, trust the comparison; don't add asymmetric role guards.

---

## 2026-05-19 — Bug-fix session: super_admin route visibility + tenting sub-hub

**Scope:** driver-app only, no migration. Two unrelated bugs surfaced by Darren on post-Phase-4 smoke testing. Both smoke-tested and confirmed fixed before session close.

**Bug 1 — super_admin could not see the weekly route schedule (and saw dimmed stops on Home)**

Root cause: Two separate problems introduced by two separate prior commits.

- `288d120` (2026-05-14, Tools hub v2) removed the path from the Tools/nav to the weekly schedule for unassigned super_admin — the Routes tab fell back to `/` (Home) when no assignment existed, and no nav item pointed at `/schedule`.
- `6e1484e` (2026-05-16, assignment-scope tightening) was correct for the day-view (unassigned super_admin now sees an empty Home instead of every driver's dimmed stops) but left the week board unreachable from the nav.

Investigation initially overcorrected: commit `406ed82` gave super_admin an unscoped `/api/routes` response, which brought all the dimmed stops back to Home. Two-commit correction in `b49e6e1`:

1. Reverted the unscoped `/api/routes` change — day-view stays assignment-scoped for everyone including super_admin.
2. Updated `BottomNav.tsx`: when super_admin has no route assignment for today, Routes tab now resolves to `/schedule` (WeekScheduleView, full board) instead of falling back to `/`. Drivers without an assignment still fall back to `/` (empty Home). `isActive` updated to highlight the Routes tab on `/schedule`.

Net result: super_admin with no assignment sees an empty day on Home (correct) but has a one-tap path to the full week board via the Routes tab (correct). Drivers are unaffected.

**Bug 2 — Tenting tile in Tools hub only reached the calculator**

Root cause: `288d120` (2026-05-14) set the Tenting card's `href` to `/tools/tent-squaring` directly, bypassing any sub-hub. The card's own subtitle ("Calcs · Drawings · Certs") and badge ("3 live") correctly described three live features, but only one was reachable. `/reference/tents` (drawings + flame certs) was fully live but invisible from the Tools tab for all users.

Fix (commit `406ed82`):
- New `src/screens/TentingHubScreen.tsx` — dark Editorial sub-hub matching the ToolsScreen palette, 2-column grid with two Live-badged tiles: Tent calculator (→ `/tools/tent-squaring`) and Drawings & certs (→ `/reference/tents`).
- New `src/app/tools/tenting/page.tsx` — thin auth-gated shell (same pattern as other tool pages, allows driver / super_admin / tools_only).
- `src/screens/ToolsScreen.tsx` — Tenting card `href` changed from `/tools/tent-squaring` to `/tools/tenting`.

**Commits**
- `406ed82` — fix: restore super_admin route visibility + tenting sub-hub *(overcorrected on the route-scope; tenting sub-hub is correct)*
- `b49e6e1` — fix: revert super_admin day-scope + Routes tab → /schedule when unassigned *(correct final state)*

**Files touched**
- `src/app/api/routes/route.ts` — comment update only (scoping rules unchanged from 6e1484e)
- `src/components/BottomNav.tsx` — Routes tab fallback for unassigned super_admin → `/schedule`; `isActive` includes `/schedule`
- `src/screens/ToolsScreen.tsx` — Tenting card href → `/tools/tenting`
- `src/screens/TentingHubScreen.tsx` (new)
- `src/app/tools/tenting/page.tsx` (new)

**Lessons logged**
- Scope fix blast-radius: enumerate every persona + every surface before tightening a scope rule.
- Day-view vs. week-view: they have independent scoping contracts; "can't see the schedule" requires identifying which schedule before touching any endpoint.

---

## 2026-05-17 — Time Window Constraints Phase 4 (driver-app integration)

**Scope:** driver-app only, no migration. Dashboard Phases 1+2+3 already surfaced `constraint_confidence` + window bounds on every `dispatch_stops` row via Migration 058 trigger. This session brings that data into the driver app — read-only, three commits split by surface.

**Commits**

- `05b1607` — **feat(driver): stop card window badge.** New `src/lib/stopConstraints.ts` (pure read-only port of the dashboard's source-priority resolver — `dispatcher_time_override` → structured → notes — plus a driver-app-shaped `buildBadgeContent` helper producing compact labels: "Deliver by X", "Pickup after X", "Deliver 9:00 AM–11:00 AM"). New `src/components/StopWindowBadge.tsx` — amber pill with solid fill for verified/inferred/manual, dashed outline for suggested. Wired into three surfaces: StopDetailScreen (below hero address, on-dark variant), RouteListScreen stop rows (below address line), DayRouteSelectorScreen day list (both COD elevated card + inline row). Data plumbing: regen'd `src/types/supabase.ts` from `partytime-east`, extended `Stop` type + `SupabaseStopRow` + `toRealStop`, added all Phase 1/2 columns to the `/api/routes` SELECT (`constraint_confidence`, `has_any_constraint`, `delivery_window_start/end`, `pickup_window_start/end`, `event_start/end`, `notes_classification`, `dispatcher_time_override`, `dispatcher_constraint_dismissed`).

- `ab0bc1e` — **feat(driver): pickup standby with live countdown.** When a driver arrives early at a pickup stop (geofence-stamped `arrived_at`, `pickup_window_start > now`), StopDetailScreen swaps the regular action card for a standby card: "On Standby" eyebrow + "You're early — pickup opens at X" headline + 44pt `HH:MM:SS` live countdown + "Navigate anyway" button. 1Hz tick via `setInterval` with auto-teardown the moment the window opens. Dismiss writes `sessionStorage` key + logs `NAVIGATION_STARTED` with `early_pickup_override: true`.

- `54766d3` — **feat(driver): navigate gate for early pickup.** Pre-navigate check on the Navigate quick action: pickup + hard tier (verified/inferred/manual) + `pickup_window_start > now` + not-yet-overridden → pop `ConfirmationModal` with "This stop can't be picked up until X. You're N min early." + "I'll wait" / "Navigate anyway". Override path logs the same workflow event and unifies with the standby's sessionStorage key (`early-pickup-override:${stopId}`) so dismissing either surface suppresses both for the session. Reads `Date.now()` at click moment so displayed `minutesEarly` is fresh.

**Files touched**
- `src/lib/stopConstraints.ts` (new) — read-only resolver + badge content + countdown formatters
- `src/components/StopWindowBadge.tsx` (new) — amber pill component, default + on-dark variants
- `src/lib/supabaseTransform.ts` — `SupabaseStopRow` extended with all Phase 1/2 columns; `toRealStop` maps them; `narrowTier` helper
- `src/app/api/routes/route.ts` — SELECT extended (10 new columns)
- `src/types/index.ts` — `Stop` extended with constraint fields
- `src/types/supabase.ts` — regen'd from `partytime-east`
- `src/screens/StopDetailScreen.tsx` — badge + standby + gate
- `src/screens/RouteListScreen.tsx` — badge on stop rows
- `src/screens/DayRouteSelectorScreen.tsx` — badge on day list (COD + inline)

**Verification.** Three `npx next build` passes (one per commit). Smoke-test plan in `CLAUDE.md` → "Time Window Constraints — Phase 4" section.

**Hard stops respected.** No constraint columns written. No ETA recalc logic touched. Driver app is strictly a reader on Phase 1/2 data — every override merely records a workflow event; nothing reaches Postgres beyond that.

---

## 2026-05-16 — Arcade iPhone controls + canvas layout (6-commit incremental fix arc)

**Scope:** driver-app only, no migration, no game logic. Six commits over a single iPhone-testing session addressing on-device usability of the three arcade games. Final state confirmed working by Darren after `b7798bf`.

**Commits (in order)**

- `78c46c1` — **iOS 18 Writing Tools popup + lost holds + off-screen controls.** All three games + `src/app/training/arcade/layout.tsx`. Suppress the iOS callout menu on every game button and the canvas (`WebkitTouchCallout: 'none'`, `WebkitUserSelect: 'none'`, `onContextMenu={(e) => e.preventDefault()}`, `tabIndex={-1}`). Add `onTouchCancel` to every button so an OS-cancelled touch releases held state (Party Kong DpadBtn calls onRelease on cancel — without this, a dropped touch strands the held direction in `keys[]` and the player walks into walls). Outer wrappers `minHeight: 100vh → 100dvh` so dynamic viewport excludes the Safari toolbar. Arcade layout adds `apple-mobile-web-app-capable + status-bar-style: black-translucent` metadata.

- `d51e721` — **Cap canvas height so controls are always above the fold.** All three games. New shell per game: outer `height: 100dvh + overflow: hidden`, top bar `flexShrink: 0`, new `flex: 1` canvas area with an aspect-ratio-capped inner wrapper, controls `flexShrink: 0` with `paddingBottom: calc(... + env(safe-area-inset-bottom))`. Pure CSS — no useEffect, no canvas attribute changes. The previous layout used `minHeight: 100vh` + natural sizing, which let the canvas pin at its native 720 height and push the D-pad / JUMP off the iPhone screen.

- `bb4f340` — **Stop locking canvas display size to native W×H.** PartyKong + RouteRush init useEffect was setting `canvas.style.width = ${W}px; canvas.style.height = ${H}px` post-mount, overriding the JSX's `width/height: 100%` and forcing the canvas to overflow the new shrunk wrapper from the top-left — which the wrapper's `overflow: hidden` clipped, hiding the truck (y=580) and ground floor (y=560). Dropped those two style assignments per game; the canvas now takes display size from CSS. Bitmap (`canvas.width = W*dpr`, `canvas.height = H*dpr`) and `ctx.setTransform(dpr, ...)` unchanged — game coordinate space intact. Tent Tetris was symmetrically broken but left untouched per user spec (its lowest content row sits high enough that the clip didn't reach gameplay-critical pixels).

- `1b259da` — **Tighten Party Kong canvas-to-controls gap.** Canvas area `padding: '0 16px' → padding: 0`. Controls drop `marginTop: 12`, switch to explicit padding longhand (top 8, sides 16, bottom `env(safe-area-inset-bottom)`). Net ~24px reclaimed for the canvas wrapper. PartyKong-only.

- `891adf4` — **CSS-crop Party Kong canvas to gameplay area.** New top-level `VISIBLE_H = 600` constant. Wrapper aspectRatio `${W}/${H}` → `${W}/${VISIBLE_H}`. Canvas style adds `aspectRatio: ${W}/${H}` + `height: auto` so the canvas keeps native 390/720 aspect and overflows wrapper bottom by ~17% — exactly the empty back-wall + floor-strip texture below the ground platform (y=560 → 720), which the wrapper's existing `overflow: hidden` clips. Zero game logic touched. `H` constant stays 720, drawing code unchanged (clearRect, H*0.92 floor-strip math, despawn checks `h.y < H + 80`, etc.).

- `b7798bf` — **Preserve canvas aspect on short viewports.** The 891adf4 wrapper config (`aspectRatio + width: 100% + maxHeight: 100%`) silently broke aspect when the parent canvas area was shorter than the aspect-derived height — `width: 100%` won over aspect-ratio's height derivation, height clamped, wrapper went squat (e.g. 390×537 instead of 390×600), canvas overflowed by 200+ CSS px and `overflow: hidden` clipped everything below the player's hat brim ("barely see the top of the guy's head"). Fix: switch wrapper to height-driven sizing — `height: 100%, width: auto, aspectRatio: W/VISIBLE_H, maxHeight: VISIBLE_H, maxWidth: W`. On phones, height: 100% binds, width auto-derives from aspect (~382×588 on iPhone 14 Pro). On desktop, maxHeight: 600 caps height, maxWidth: 390 caps the derived width (390×600 native). Aspect preserved on both ends.

**Files touched across the arc**
- `src/components/arcade/PartyKongGame.tsx` — all six commits
- `src/components/arcade/RouteRushGame.tsx` — first three commits (iOS guards + shell + bitmap-vs-CSS fix)
- `src/components/arcade/TentTetrisGame.tsx` — first two commits only (iOS guards + shell). Canvas-display-lock and crop intentionally skipped per spec.
- `src/app/training/arcade/layout.tsx` — first commit (iOS app metadata)
- `src/app/training/arcade/{party-kong,route-rush,tent-tetris}/page.tsx` — first commit (`minHeight: 100vh → 100dvh` on pageStyle)

**Verification.** Darren confirmed all working on iPhone after the final commit. Player visible on ground platform with small cushion below, D-pad and JUMP immediately under the canvas, controls fully visible without scrolling.

**Out of scope (intentional).**
- Route Rush + Tent Tetris canvas crops (their visual layouts don't have the empty-bottom problem the way Party Kong did; user explicitly scoped the crop work to Party Kong only).
- A real "active stop active controls" mode or pause menu.
- Sound effects (still silent arcade except Party Kong's existing sfx engine).
- Native shell / Capacitor wrapper to escape Safari toolbar behavior entirely (would also solve the background-geofencing item in Phase 2.5C).

---

## 2026-05-16 — Party Kong v3 Session D (L4 Grand Ballroom — chain-pull finale)

**Scope:** the v3 finale. L4 gets its true layout, mechanic, and win sequence. Party Kong v3 is now complete — all four stages have distinct geometry, hazards, and win conditions.

**What landed inside `PartyKongGame.tsx`:**

- **L4 geometry:** 4 wide flat platforms (P0 ground / P1 / P2 / P3 Kong perch), 3 zigzagging ladders (cx 110 / 280 / 110), no slopes, no conveyors, no elevators. Player spawn `(30, 560)`. Kong perched at center of P3 (`bx=195, by=140`). `throwDelayBase=150 / Floor=70` (faster cadence than L1–L3).

- **Chain-pull win condition.** New `ChainDef[]` on LevelConfig: 4 chains, one per platform, at fixed x positions (195/130/260/195). Player must stand on the correct platform within `CHAIN_PULL_RADIUS = 20px` of a chain's x AND hold ↑ for `CHAIN_PULL_FRAMES = 60` frames (~1s). Releasing early wipes progress to 0 — no partial credit. Pulled chains are terminal AND persistent across player deaths within a single L4 attempt; `playerHit` resets in-progress chains' progress but never clears `pulled`.

- **Glass shards.** New `glass_shard` Hazard variant fully implemented (was a stubbed-in-Session-A union member). Spawn from ceiling at random x while `s.chains.some(c => c.progress > 0 && !c.pulled) && !allPulled`. Fall at 4px/frame. Hit detection `|dx|<10 && |dy|<20`. Spawn cadence 30–60 frames. Stop when all pulled OR when player releases ↑.

- **Win sequence.** New `'winning'` phase value. When all 4 chains pulled, frame loop transitions `playing → winning` (skipping the 90ms win-detection useEffect, which is now gated to skip levels with `cfg.chains`). For `WIN_FREEZE_FRAMES = 120` frames: world freezes (no `step()`), Kong fades + drifts right (`globalAlpha = max(0, 1 − t/60)`, `translate(t * 2, 0)`), 4 chandeliers crash on his last position one every 30 frames with white expanding flash. Then `winning → won`, score submits to `game_scores`, leaderboard appears.

- **Drawing additions:** `drawChains` (chain-line + handle + pulled checkmark, with in-range pulse on the handle), `drawChainProgressBar` (240px tall × 8px wide gold-fill bar anchored at the chain handle, drawn in a second pass on top of the player so it remains readable from anywhere), `drawWinSequence` (per-chandelier fall + flash), `drawGlassShard` (cool-white triangle facets + halo). Chain handles draw before player so the player walks in front; progress bars draw after player so they're never occluded.

- **`winCondition` signature widened** from `(pl: PlayerState) => boolean` to `(s: GameState) => boolean`. L1–L3 implementations updated to read `s.player`. L4 reads `s.chains.every(c => c.pulled)`. The `PlayerState` alias is retained for API symmetry.

- **Sound additions:** `sfxChainPull` (square wave 300→150Hz creak, 200ms, vol 0.3) on each chain pull complete; `sfxChandelierCrash` (square wave 110→55Hz, 90ms, vol 0.4) on each chandelier landing.

**Build state.** `npx next build` clean. `/training/arcade/party-kong` route 17 kB → 19.1 kB (+2.1 kB for chain mechanics + win sequence + glass shard).

**Out of scope:** animated chain-link sway, particle debris from chandelier crashes, distinct cinematic "YOU WIN!" frame (the existing `'won'` GameOverOverlay's "You Won" eyebrow + 64px score does the job today), per-stage chiptune music, persisted level unlocks, stage-select on start screen.

---

## 2026-05-16 — Party Kong v3 Session A (LevelConfig + Hazard refactor)

**Scope:** foundation-only refactor inside `src/components/arcade/PartyKongGame.tsx`. Zero visible gameplay change — L1 plays byte-identical to the v2 build. Sets up the architecture for Sessions B/C/D.

**What changed**
- New types: `Platform`, `Ladder`, `HazardType`, `Hazard` (discriminated union with 6 variants — 2 implemented today, 4 stubbed for future sessions), `LevelConfig`, `BackgroundKind`.
- New data: `LEVEL_CONFIGS: LevelConfig[]` is the single source of truth for per-level geometry, win condition, throw delays, Kong position, player spawn, background kind, and initial hazards. L1 entry mirrors the pre-v3 constants exactly.
- Replaced state: `GameState.tables` + `GameState.dollies` → `GameState.hazards`. Per-frame update is a `switch (h.type)` over the array.
- Replaced helpers: `spawnTable` → `spawnRollingTable`, `updateTable` → `updateRollingTable`, `drawTables` + `drawDollies` → `drawHazards` (two-pass dispatch). Functions now take `platforms: Platform[]` as an explicit param rather than referencing a module global. Module-level `PLATFORMS` / `LADDERS` / `WIN_X` / `PLAYER_START_X/Y` constants are gone.
- Background dispatch keys changed: `'dock' | 'outdoor' | 'ballroom'` → `'loading_dock' | 'outdoor_tent' | 'grand_ballroom'`.
- `playerHit` filters the hazards array (drops in-flight rolling tables, keeps stationary dollies and future stage fixtures) instead of clearing a separate tables field.

**Scope doc:** `tasks/party-kong-v3-scope.md` (Status: Session A ✓, Sessions B/C/D pending).

**Build state.** `npx next build` clean. `/training/arcade/party-kong` route 15.6 kB → 15.8 kB (+0.2 kB for type expansion).

---

## 2026-05-16 — Party Kong v2 (sfx + level persistence + bonus lives)

**Scope:** three additive changes inside `src/components/arcade/PartyKongGame.tsx` only. No migration, no other files.

**Commits**
- `81b49e9` — sfx + level-persistence-on-death + bonus-lives. Web Audio API procedural sound engine (no library), 11 named sfx, mute toggle. `playerHit()` clears tables + throw timer and keeps the player on the same level (was: implicit full restart). Bonus lives at 5,000 and 10,000 points capped at 5 lives, preserved across level transitions and respawns, reset only on full restart.

**Build state.** `npx next build` clean. `/training/arcade/party-kong` route: 14.2 kB → 15.6 kB (+1.4 kB for the additions). No regressions.

**Out of scope:** background music, anti-cheat, persisting mute preference across browser sessions.

---

## 2026-05-16 — PartyTime Arcade · Party Kong (autonomous; driver-app slice)

**Scope:** third arcade game. DK-style platformer. Closes out the PartyTime Arcade trio (Route Rush · Tent Tetris · Party Kong) reserved by the May 15 overnight bundle.

**Commits**
- `5d919f9` — `src/components/arcade/PartyKongGame.tsx` (new, ~1450 lines). Single component holds physics + drawing + state machine. 4 levels via `s.level` state (Warehouse / Loading Dock / Outdoor Tent Setup / Grand Ballroom). Visual rule: NO OUTLINES — all depth via DKC-style layered shading. Logo loader 3-tier fallback: `/images/PARTYTIME-RENTALS-LOGO.png` → `/ptr-mark.png` → procedural wordmark. Score submits as `game_type: 'party_kong'` (reserved in `game_scores` CHECK constraint by Migration 053; no new migration needed). Plus `src/app/training/arcade/party-kong/page.tsx` (auth gate mirrors Route Rush / Tent Tetris) and `src/components/arcade/ArcadeHub.tsx` (tile flipped from `comingSoon: true` → live PLAY, bests loader extended).

**Design points worth preserving.** Tables fall STRAIGHT DOWN when going off platform edges (vx zeroed) — without this, P1–P3 inset platforms cause tables to fly past and never land; the zigzag breaks. Player respawns immediately after a hit with 110 frames of invincibility (no death pause phase). Win = reach `x > 265` on P4, not visual contact with the contract paper. Throw interval starts at 240 frames (L1) / 215 (L2) / 195 (L3) / 175 (L4), decreases by `floor(score / 8)`, floors at per-level minimum.

**Build state.** `npx next build` clean. `/training/arcade/party-kong` is 14.2 kB / 164 kB First Load JS (Route Rush is 7.75 kB, Tent Tetris is 8.66 kB — Party Kong is the largest of the three because of the DK-style background art and Tent Kong sprite). No regressions on other routes.

**Out of scope:** sound effects, anti-cheat, prize integrations, per-level music, deeper environmental art polish. All Phase 2.

---

## 2026-05-16 — Driver Profile / Compliance (overnight, autonomous; driver-app slice)

**Scope:** driver-app slice of the two-repo Driver Compliance build. Spec: Notion `3600aa64-51b8-812f-aeed-ced5f8cca98e`. Dashboard side shipped in parallel (`partytime-dashboard` commits `111852d`, `296086e`, `fe1b003`). Migration 055 (`driver_documents` + `driver-compliance-docs` storage bucket) lives in the dashboard repo and is already applied.

**Commits**
- `b45fbd1` — `src/lib/driverComplianceClient.ts` (mirror of the dashboard's shared lib) + types regen against linked DB (`driver_documents` table now typed).
- `0c691b0` — `@anthropic-ai/sdk` installed. New `POST /api/profile/extract-document-expiry` route does service-role download of the just-uploaded file, base64-encodes it, and asks Claude vision (`claude-sonnet-4-6`) for the expiry date with a strict JSON-output system prompt. Path-prefix ownership check (`storage_path` must start with `<user.id>/`) is the defense-in-depth gate since the route runs under service role. New `src/screens/UploadComplianceDocModal.tsx` — file picker (JPG/PNG/PDF, 10 MB), uploads to `driver-compliance-docs` at `<driver_id>/<document_type>/<uuid>.<ext>`, calls extract, prefills or falls back to manual.
- `f2b8703` — `ProfileScreen` rewrite. Removed `STUB_DOCS`; compliance section now reads `driver_documents` on mount and re-fetches after every save. Cards render four states (valid/expiring/expired/missing) with state-aware copy. "Driver's License" replaces the legacy "Commercial Driver License" stub label (PTR has no CDLs). West Point ID gets the spec-mandated "Renewal window open — renew now" copy in its expiring state. New "My Activity" section: total stops with start-date anchor + trucks driven list (top 6 by most recent).

**Graceful-fallback contract.** Every failure point in the extract path — `ANTHROPIC_API_KEY` not set, PDF input, model parse failure, low confidence, network error — returns either `{success: false}` JSON or a non-200, and the UI drops the driver into manual date entry without surfacing the error. The feature works on day 1 even before `ANTHROPIC_API_KEY` is added to Vercel.

**Env var requirement (post-deploy).** `ANTHROPIC_API_KEY` must be added to `partytime-driver-app` Vercel Preview + Production for vision pre-fill to fire. The dashboard repo already has it; copy the same value via `vercel env add` from `~/Projects/partytime-driver-app`.

**Build state.** `npx next build` clean. `/profile` is now 10.3 kB / 169 kB First Load JS (was 7.6 kB before this session — net +2.7 kB for the compliance + stats + upload modal infrastructure). No regressions on other routes.

**Open follow-ups** (mirror of dashboard's `tasks/todo.md` entry):

- [ ] Add `ANTHROPIC_API_KEY` to driver-app Vercel Preview + Production.
- [ ] Interactive smoke test on a real device — upload a real license photo, confirm vision prefill works, confirm manual fallback works when vision returns no date.
- [ ] PDF expiry extraction (Anthropic `document` content block — different shape from `image` block; deferred until someone actually wants to upload a PDF license).
- [ ] Driver-facing tenure copy refinement — today's "Since April 2026" is computed from `min(route_date)`. Some long-tenure drivers may have routes from before the system was deployed; consider a hardcoded floor or pulling from `profiles.created_at` instead. Defer until a driver complains.

---

## 2026-05-15 overnight — PartyTime Arcade: Route Rush + Tent Tetris + shared leaderboard

**Scope:** Two fully playable arcade games under a new `/training/arcade` hub, plus shared Supabase-backed leaderboard infrastructure designed to also serve a future Party Kong game.

### Shipped

- **Migration 053 — `supabase/migrations/20260515_012_game_scores.sql`.** New table `game_scores (id uuid pk, player_id uuid → profiles, game_type text CHECK in ('route_rush','tent_tetris','party_kong'), score int >= 0, achieved_at timestamptz)`. Three indexes: `(game_type, score DESC)`, `(game_type, achieved_at DESC)`, `(player_id)`. RLS: SELECT open to authenticated (leaderboard renders across crew); INSERT scoped to `player_id = auth.uid()`. **Applied 2026-05-15** via `supabase db query --linked --file <path>` (Management API path; bypasses the two-repo `db push` history block). Tracking repaired (`supabase migration repair --status applied 20260515`). Types regenerated.
- **Arcade hub** at `/training/arcade` (`src/app/training/arcade/page.tsx` + `src/components/arcade/ArcadeHub.tsx`). Three tiles: Route Rush, Tent Tetris, Party Kong (locked / "Soon"). Each playable tile reads the user's personal best from `game_scores` on mount. Distinct radial-glow dark background (blue + gold radial gradients on `#080814`) signals the off-app arcade context without breaking PTR brand colors.
- **Arcade layout** at `src/app/training/arcade/layout.tsx` wraps the subtree with the `next/font/google` Outfit font (variable `--font-outfit`).
- **Shared infrastructure:**
  - `src/hooks/arcade/useGameScore.ts` — `submitScore(gameType, score)` inserts a `game_scores` row scoped to the authenticated user; idempotent skip on score ≤ 0 or no session.
  - `src/hooks/arcade/useGameLeaderboard.ts` — fetches today + all-time top 10 with realtime subscription on `game_scores` INSERTs filtered by `game_type`. Joins `profiles.display_name` (first whitespace-delimited token displayed).
  - `src/components/arcade/GameLeaderboard.tsx` — two-tab card (TODAY / ALL TIME), rank + first name + score per row, current player highlighted gold with optional emphasis on a just-submitted score (`emphasizeScore` prop). Used by both games.
- **Route Rush** (`src/components/arcade/RouteRushGame.tsx` + `src/app/training/arcade/route-rush/page.tsx`). 390×720 canvas at devicePixelRatio. 3-lane PTR truck (gold cab, blue cargo box, PTR wordmark, four wheels, speed-line motion blur >5 speed). Obstacles: orange cones + red barrels with shadows. Collectibles: gold folded-chair silhouettes with radial glow (+25 each). Animated dashed lane markers, parallax shoulder scenery (tree silhouettes / guardrails / mile-marker posts). Speed ramps 3→9 every 8s. Score = speed·0.4·dt-normalized per frame + 25/coin. Collision = `|truckX − obsX| < 22 && |truckY − obsY| < 38`. Start screen + game-over modal with shared leaderboard. Keyboard ←/→; touch left-half/right-half + on-screen ←/→ buttons.
- **Tent Tetris** (`src/components/arcade/TentTetrisGame.tsx` + `src/app/training/arcade/tent-tetris/page.tsx`). 390×720 canvas. 10×20 board, 26px cells, side panel right. 7 tetrominoes with PTR flavor names visible in the NEXT preview (I=Pole Tent, O=Frame Tent, T=T-Top, S=Sidewall, Z=Canopy, J=J-Frame, L=L-Frame). 7-bag piece order. Gravity 800ms → 80ms (75ms decrease per level, 10 lines/level). Lock delay 280ms. SRS rotation with wall-kick offsets `[(0,0),(-1,0),(1,0),(-2,0),(2,0),(0,-1)]`. Ghost piece at 15% opacity. Line clear: 80ms white flash → 120ms ±3px board shake → row removal. Scores 100/300/500/800 × level. Hard drop +2/cell; soft drop gravity×0.06. Side panel: SCORE / LEVEL (large, current piece color) / LINES / NEXT with name label / 10-pip SPEED indicator / PartyTime Rentals wordmark. 3D-beveled cells (top/left highlight, bottom/right shadow, 1px border). Keyboard ←/→ move, ↑/Z rotate, ↓ soft drop, Space hard drop; touch swipe + on-screen ←/⟳/→/DROP buttons.
- **Training screen wiring** (`src/screens/TrainingScreen.tsx`): the Arcade tile now navigates to `/training/arcade` (was `/games`, which 404'd).
- **Types regenerated** — `src/types/supabase.ts` now includes the `game_scores` table.

### Decisions made

- **Outfit font in canvas: read computed style off the live canvas element.** `next/font/google` doesn't register a global family name (it generates a hashed one), and canvas `ctx.font` does not resolve CSS variables. Fix: `const family = window.getComputedStyle(canvas).fontFamily` once on mount, store in a ref, interpolate into every `ctx.font` template literal. Captured as a `lessons.md` entry.
- **Game state in `useRef`, HUD values in `useState`.** The RAF loop reads/writes `stateRef.current` directly. Score/level/lines mirror into React state only when they actually change (rounded-int compare against a previous-value ref). Avoids the obvious trap of re-rendering on every frame. Captured as a `lessons.md` entry.
- **Migration 053 via Management API path.** Same approach proven 2026-05-14 for migration 051 — `supabase db query --linked --file <path>` followed by `supabase migration repair --status applied <version>`. Bypasses the two-repo `db push` history coordination block.
- **Realtime over polling.** `game_scores` INSERTs trigger leaderboard re-fetch in every open game-over modal via Supabase realtime channel filtered by `game_type`. No 1s polling overhead.
- **`'party_kong'` reserved in the CHECK constraint.** The future third arcade game can begin submitting scores the day it ships — no migration churn.

### Tech debt flagged

- `useGameLeaderboard.personalBestAllTime` reads from the top-10 all-time slice; if the user's best falls outside the top 10, the returned value is `null`. The ArcadeHub uses a separate dedicated query for the hub tile's "Your Best" and is unaffected. Tracked as an optional cleanup.
- No anti-cheat / score validation server-side. RLS lets any authenticated user spam INSERTs at their own `auth.uid()`. Acceptable today (trusted driver fleet), tracked as a follow-up if access ever broadens.

### Files changed

- `supabase/migrations/20260515_012_game_scores.sql` (new)
- `src/types/supabase.ts` (regenerated post-apply)
- `src/app/training/arcade/layout.tsx` (new — Outfit font wrapper)
- `src/app/training/arcade/page.tsx` (new — auth gate)
- `src/app/training/arcade/route-rush/page.tsx` (new — auth gate)
- `src/app/training/arcade/tent-tetris/page.tsx` (new — auth gate)
- `src/components/arcade/ArcadeHub.tsx` (new)
- `src/components/arcade/GameLeaderboard.tsx` (new — shared component)
- `src/components/arcade/RouteRushGame.tsx` (new)
- `src/components/arcade/TentTetrisGame.tsx` (new)
- `src/hooks/arcade/useGameScore.ts` (new)
- `src/hooks/arcade/useGameLeaderboard.ts` (new)
- `src/screens/TrainingScreen.tsx` (Arcade tile `/games` → `/training/arcade`)
- `CLAUDE.md` (architecture + NEXT block)
- `tasks/todo.md` (close /games-404 follow-up, add arcade follow-ups)
- `tasks/lessons.md` (two new lessons: canvas+next/font, refs-vs-state for game loops)
- `docs/CHANGELOG.md` (this entry)

### Migration

- `20260515_012_game_scores.sql` applied to `partytime-east` via Management API path; tracking repaired. Verified `game_scores` table + indexes + RLS policies present in production.

### Smoke tests

- `npx next build` clean. Three new routes: `/training/arcade` (3.66 kB), `/training/arcade/route-rush` (7.75 kB), `/training/arcade/tent-tetris` (8.66 kB). No type errors, no lint errors.
- Production smoke (pending Vercel deploy): coverage plan in `CLAUDE.md` → PartyTime Arcade NEXT block.

### Commits

- TBD on push.

### Open follow-ups (tracked in `tasks/todo.md`)

- Production smoke test of the arcade.
- Build Party Kong (third arcade game; `'party_kong'` `game_type` already reserved).
- Optional: dedicated personal-best query in `useGameLeaderboard`.
- Optional: server-side score rate-limit.

---

## 2026-05-14 night (v2) — Tools Hub: restore Weather + Equipment guides as live tiles

**Commit:** `288d120` (driver-app, single commit).

**Scope:** Follow-up correction to the v1 hub restructure (`f64d5bb`, earlier this evening). v1 hid Weather and Equipment Guides behind a muted footer pointer line ("Weather · Reference library also in Tools") — both surfaces had working routes (`/tools/weather`, `/reference/library`) and shouldn't have been demoted. v2 brings them back as first-class Live-badged tiles in the grid. Same pure-frontend constraints — only `ToolsScreen.tsx` and `TrainingScreen.tsx` modified.

### What shipped

- **Tools hub `/tools`:**
  - Grid expanded from 4 → 6 tiles. New row 3: Weather (Live, `/tools/weather`, `ti-cloud-storm`-style icon, blue accent) + Equipment guides (Live, `/reference/library`, `ti-books`-style icon, purple accent).
  - **New full-width Generators card** below the grid (Coming soon, `ti-engine`-style icon, orange accent).
  - **Hairline divider** (`1px / rgba(255,255,255,0.07)`) between Generators and Party layouts.
  - Party layouts moved below the divider, anchors the bottom of the page.
  - Footer pointer text removed.
- **Both hubs — polish:**
  - "Coming soon" badge picked up a `0.5px` hairline border at `rgba(255,255,255,0.1)` for visual parity with the bordered Live pill.
  - Toast: dwell time `3000ms` → `2000ms`; lost the gold border-left accent and the long copy "Coming soon — this feature is in development." → just "Coming soon". Style is now a small dark pill (`#1A1A1A`, white text, hairline border, `13px / 600`) per the v2 spec.
  - Hub titles render `text-transform: uppercase` ("TOOLS HUB" / "TRAINING HUB"). Eyebrow + subtitle remain sentence case.
- **Training hub `/training`:**
  - Arcade tile **no longer carries a Live badge** — the gold-on-black treatment IS the affordance now. Title still gold, detail still muted gold, route still `/games`.

### Decisions made

- **Weather + Equipment Guides treatment must mirror their working-route status.** v1 architecturally classified them as "live but not surfaced in the hub" — that's wrong; they have routes that the driver can use today and the hub is the navigation surface to them. v2 makes the hub honest about what's working.
- **Generators is a placeholder, but it's a placeholder with structural intent.** The full-width card + divider + Party layouts anchor establishes the "operations / planning" group as a visual zone below the daily-use tile grid. When Generators get content, this zone is where it lands; Party layouts will eventually live there too.
- **Arcade badge removed because two Live badges (gold + green) compete visually.** Gold-on-black is unique to Arcade in the codebase — that uniqueness IS the live-state signal. Adding a green Live pill on top of the gold treatment muddied the hierarchy.
- **Toast copy shortened from a sentence to two words.** "Coming soon — this feature is in development." was honest but verbose; at a dismiss time of 2s it's not readable anyway. The label on the tile already says "Coming soon"; the toast confirms the tap registered.
- **Did NOT restore `/reference/tents` (Tent Drawings) to the hub.** That route is alive but the v2 spec doesn't list it; it's expected to land inside the future Tenting subcategory screen alongside Squaring + Certs. Logged.

### Verification

- `npx next build` — green end-to-end. `/tools` 3.18 kB / 157 kB First Load. `/training` 3.15 kB / 157 kB First Load. No type errors, no lint warnings.
- Pushed to `origin/main` as commit `288d120`; Vercel auto-deploy triggered.

### Out of scope this session

- Same as v1 (subcategory screens, content authoring, `/games` route).
- Restoring `/reference/tents` (Tent Drawings) — deliberate hold pending Tenting subcategory build.

---

## 2026-05-14 night — Tools Hub + Training Hub: category-card restructure

**Commits:** `f64d5bb` (driver-app, single commit).

**Scope:** Both home screens (`/tools` and `/training`) restructured from flat tile/module grids into a category-card layout with a dark surface (`#0D0D0D`) and the PTR-blue hero. Pure frontend — only `ToolsScreen.tsx` and `TrainingScreen.tsx` modified. No migration, no new routes, no Supabase, no new dependencies.

### What shipped

- **`src/screens/ToolsScreen.tsx`** — complete rewrite. Old 10-tile flat catalog (Tent Drawings, Reference Library, Tent Squaring, Dance Floor, Stage, Heat & Air, Power, Propane, Equipment Guides, Weather) plus the Ask Ava chip all removed. New layout: blue hero ("Driver tools" eyebrow → "Tools hub" → "Calculators, references & compliance"), 2-col grid of four category cards (Tenting / HVAC / Safety & compliance / Flooring), full-width Party layouts card below the grid, footer pointer text "Weather · Reference library also in Tools". Tenting → `/tools/tent-squaring`; the other four toast "Coming soon".
- **`src/screens/TrainingScreen.tsx`** — complete rewrite. Old 5-module vertical list (Safety / Tents / Equipment / Service / Orientation, all with "Coming Soon" pills) replaced with: blue hero ("Driver training" → "Training hub" → "SOPs, guides & orientation"), 2-col grid of four Live-badged categories (Safety & DOT / Tent setup / Equipment ops / Customer service), full-width New driver orientation card, gold-treatment PartyTime Arcade tile linking to `/games`. All Live cards currently toast since no subcategory routes exist; Arcade navigates to `/games` (route doesn't exist yet — 404 placeholder).

### Decisions made

- **Dark surface for both hubs, not the cream + ink palette used by Weather / Tent Squaring / the old Tools and Training screens.** Spec called for `bg #0D0D0D`, `card #1A1A1A`, white text, muted text at 40% alpha — that's a new visual direction for the hub home screens specifically. The PTR-blue hero + gold star burst + PTR mark are preserved as the visual anchor. Inner content screens (`/tools/tent-squaring`, `/tools/weather`) keep the cream-light treatment for now; hub-level rooms go dark, leaf-level surfaces stay light. Re-evaluate as more leaves ship.
- **Two screens redeclare the same `C` constant + `BadgePill` / `IconWrap` / `CategoryCardGrid` / `CategoryCardWide` components inline.** Acceptable cost today; logged as todo to extract when a third hub-style surface appears.
- **Old `TOOLS` / `MODULES` arrays both deleted.** Five of the old Tools tiles were inert stubs (Dance Floor, Stage, Heat & Air, Power, Propane, Equipment Guides) — their disappearance is a net simplification. Tent Drawings + Reference Library still have routes (`/reference/tents`, `/reference/library`); they're acknowledged in the new Tools hub footer line. Weather still has `/tools/weather`; same acknowledgment.
- **Arcade tile points at `/games` even though the route doesn't exist.** Per the spec verbatim. Placeholder UX; will resolve when the games hub is built.
- **`Ask Ava` chip removed from Tools.** It was stubbed (HAS_AVA flag was hard-`false`) and out of scope for this restructure. If Ava lands in the future it can return as a hub-level shortcut.

### Verification

- `npx next build` — green end-to-end. `/tools` 2.99 kB / 157 kB First Load JS. `/training` 3.18 kB / 157 kB First Load JS. No type errors, no lint warnings, 24/24 static pages generated.
- Pushed to `origin/main` as commit `f64d5bb`; Vercel auto-deploy triggered.

### Out of scope this session

- Content authoring for any "Coming soon" Tools categories (HVAC / Safety / Flooring / Party layouts).
- Content authoring for any Training Live-badged category (all toast today).
- Tenting subcategory screen (the "3 live" badge is aspirational until Drawings + Certs join Squaring).
- The `/games` route itself.
- Extracting shared hub components.

---

## 2026-05-14 late evening — Tools Hub: Tent Squaring Calculator

**Scope:** First calculator in the Tools Hub content build. Pure frontend, no Supabase / no migration / no new dependencies. Driver enters tent dimensions, app computes diagonal via `√(L² + W²)`, displays in `feet' inches"` formatted output. Replaces the "coming soon" stub on the existing Tenting tile.

### What shipped

- `src/screens/TentSquaringScreen.tsx` (NEW) — hero with "← Tools" back nav, Rectangular | Square shape toggle, two `<input type="number">` dimension fields side-by-side (Length / Width), live-updating output card showing the diagonal as e.g. `56' 7"` plus the helper line "Measure corner to corner — if it matches, your tent is square." No submit button; recomputes on every keystroke. Empty / non-numeric / non-positive inputs hide the output card entirely. Square mode mirrors Length into Width and locks the Width field (`disabled`, gray background, 55% opacity, `not-allowed` cursor). Styling matches WeatherScreen / ToolsScreen — inline `C` token object (blue / ink / cream / gold / paper / muted / hair), Archivo display + Inter body, BottomNav at the foot.
- `src/app/tools/tent-squaring/page.tsx` (NEW) — auth-gated route wrapper following the exact pattern from `/tools/weather/page.tsx`. Allowed roles: `driver`, `super_admin`, `tools_only`.
- `src/screens/ToolsScreen.tsx` — wired the existing `'tenting'` tile to `/tools/tent-squaring`; renamed it from "Tenting" / "Calculators, anchoring" to "Tent Squaring" / "Diagonal calculator". The tile previously fired the "coming soon" toast.

### Decisions made

- **Re-pointed the existing Tenting tile rather than adding a new tile.** Tent squaring is the only tenting calculator built today, and the Tenting tile was a stub. When more tenting calcs ship (anchoring guidance, etc.), the cleanest move is to convert `/tools/tent-squaring` into a tenting sub-hub and re-add this calculator as a card inside it — or rename the tile back to "Tenting" once 2+ calcs exist. Grid stays at 10 tiles, no clutter.
- **Inches rounding edge case:** when `Math.round(diagonal_inches % 12) === 12` (true at e.g. 56.96 ft → 56' 12" → render as 57' 0"), the formatter carries the inch into the feet column. Single conditional, no library.
- **No upper size limit, no stake buffer, no clearance** — per the spec. Raw geometric diagonal only.
- **"ptw.\*" tokens in the prompt** — the codebase doesn't have actual Tailwind `ptw.*` classes; every screen defines an inline `C` color constant. Followed the existing convention (matched WeatherScreen / ToolsScreen verbatim) rather than introducing a token system.

### Verification

- `npx next build` — green end-to-end. New route `/tools/tent-squaring` renders as static at 2.3 kB / 156 kB First Load JS. No type errors, no lint warnings, 24/24 static pages generated.
- **Not pushed** — interactive session per Darren's prompt; build verification only.

### Out of scope this session

- Anchoring guidance (Phase 2C, separate flag flip).
- Multi-tent / pole-tent variants.
- Saving recent calculations.
- Print / share view.

---

## 2026-05-14 evening — Phase 2.5C: GPS Auto-Arrival (end-to-end, both repos)

**Scope:** Driver opens a delivery / pickup / service stop → app arms a 150m geofence around its coordinates → driver crosses into the bubble → app POSTs once to a new `/api/stops/arrived` endpoint → server stamps `dispatch_stops.arrived_at` idempotently → dashboard's existing `dispatch_stops` realtime channel fans it out → Melissa sees a teal pin below the stop number on the board within ~1s. Migration applied via the Management API path discovered earlier today (`supabase db query --linked --file`); both repos' Supabase types regenerated. No standalone notification or polling layer — leverages infra that's been in place since Migration 034 (geocoding pipeline) and the original realtime subscriptions.

### What shipped

Driver-app (`73b7509`):
- Migration `20260514_011_arrival_geofence.sql` — `ADD COLUMN IF NOT EXISTS arrived_at timestamptz` on `dispatch_stops`. Applied to `partytime-east` via `supabase db query --linked --file`; tracking repaired via `supabase migration repair --status applied 20260514`. Verification probe: column exists as `timestamp with time zone`, nullable, no constraints.
- `POST /api/stops/arrived` (NEW) — session-cookie auth, RLS-gated UPDATE (`WHERE arrived_at IS NULL`), returns canonical server timestamp. Idempotent: re-POSTs against an already-arrived stop return success with the existing value.
- `useArrivalGeofence` hook (NEW) — `watchPosition` + haversine distance + one-shot POST. Clears watch on success/unmount. Surfaces `denied / unavailable / error` states (currently unused by UI).
- `AppStateContext.markArrived` — terminal-value guard in reducer (won't overwrite existing `arrived_at`).
- `Stop.arrived_at` plumbed through `supabaseTransform.toRealStop` and `/api/routes` select list.
- `StopDetailScreen` mounts the hook with `enabled = delivery|pickup|service AND coords present AND !arrived_at AND !completed`; renders green "Arrived · HH:MM" pill in the eyebrow row.
- `src/types/supabase.ts` regenerated post-migration apply.

Dashboard (`03dd102`):
- `DispatchStop.arrived_at` added to the hand-maintained `src/types/board.ts`.
- `StopCard.tsx` — teal pin badge (22x22 filled circle, location-pin glyph) below the stop number per spec; mirrors the green-check completion pattern. Footer time strip surfaces "Arrived HH:MM" alongside ETA / Completed. Removed the pre-existing Phase 2.5C TODO comment.
- `fetchStops` already uses `.select('*')` — no query edit needed.
- Realtime channel already listens with `event: '*'` — no subscription edit needed.

### Migrations applied
- **Migration 052** (driver-app file `20260514_011_arrival_geofence.sql`, cross-repo number 052) → applied via `supabase db query --linked --file` (Management API path). Tracking row added via `supabase migration repair --status applied 20260514`. Schema probe confirmed `dispatch_stops.arrived_at` exists as `timestamp with time zone NULL`.

### Verification
- `npx next build` clean in both repos before push.
- Migration tracking probe (`supabase migration list --linked`) shows `20260514` in both Local and Remote post-repair.
- Type regen produced clean files (1584 → 1587 lines driver-app — exactly the 3 `arrived_at` Row/Insert/Update lines, no stderr leakage).

### Commits
- driver-app `73b7509` feat(arrival): Phase 2.5C — GPS auto-arrival geofence (driver app)
- dashboard `03dd102` feat(board): Phase 2.5C — Arrived badge on StopCard (driver geofence)

### For chat-Claude / Notion
- **Phase 2.5C — GPS Auto-Arrival is SHIPPED end-to-end.** Master Build Checklist line should move to ✅. Build Progress Dashboard entry should reflect "GPS auto-arrival foreground geofence — driver app + dashboard badge, both deployed 2026-05-14 evening."
- **Doctrine update — `dispatch_stops.arrived_at` is the canonical arrival signal.** Driver app's `useArrivalGeofence` hook is the sole writer (via `/api/stops/arrived`); dashboard reads. Any future arrival-related work goes through this column.
- **Doctrine update — landing screens stay separate from execution screens (Phase 2.5C variant).** The geofence is mount-scoped to `StopDetailScreen` deliberately. No global active-stop tracker exists; if a future feature needs background arming, it requires a native shell, not new global state in the PWA.
- **Spec lock — 150m radius, foreground only, just-in-time permission, per-stop arming.** These are not configuration; they're encoded in the hook. Notion spec page should be marked LOCKED.
- **Tech debt added:**
  - Phase 2 push/SMS to dispatch on arrival (pairs with the existing COD-uncollected push backlog item — same channel).
  - Phase 2 background geofencing requires native shell — out of scope for the PWA.
  - Driver-side "location off" warning surface (hook already exposes the state; UI currently ignores).
  - Arrival → completion delta analytics is a future dashboard surface; data is now in the columns.
- **Two-repo helper-mirroring rule did NOT apply this session.** No mirrored helpers (equipmentSummary / inflatable / itemCategories) were touched. The boardClient `select('*')` pattern and the realtime `event: '*'` subscription mean the dashboard automatically picks up new dispatch_stops columns — only the TypeScript type and the visible JSX needed changes.

---

## 2026-05-14 — Driver scope + completion persistence + migration 051 apply

**Scope:** Four bug reports, all rooted in the data layer rather than UI logic. `/api/routes` returned every route on the day with no driver scope; the cold-load auto-redirect from May 10 picked the wrong route as a result; stop-completion state was written to the server but never re-read, so the post-complete force-reload silently clobbered it. One pass fixed Bugs 1+2+3 with a session-aware `/api/routes` and the removal of the auto-redirect; a second pass fixed Bug 4 by reading `stop_status, completed_at` end-to-end. Migration 051 (Cash Collection v2) applied to partytime-east during the session via the newly-discovered Management API path.

### What shipped
- **`/api/routes` is session-aware and driver-scoped** (`ff006c6`). Reads the auth cookie, joins `route_assignments` for the requested date, narrows the response to only the caller's assignments. Falls back to all routes when no assignment exists (preserves dispatcher tooling). Cache-Control flipped from `public, max-age=30, stale-while-revalidate=15` to `private, no-store`.
- **Cold sign-in auto-redirect removed** (`ff006c6`). `useAssignedRoute` hook deleted, `/api/routes/assigned` endpoint deleted as orphan, `showAssignmentLoader` branch torn out of `DayRouteSelectorScreen`. Cold sign-in lands on Home, every time, for every role.
- **Stop completion read end-to-end** (`4788034`). `/api/routes` now selects `stop_status, completed_at`; `supabaseTransform.toRealStop` maps `stop_status='completed'` to `current_status: 'completed'` and carries `completed_at`; `AppStateContext.loadDay` short-circuits the OTW/localStorage merge for server-completed stops so completion is terminal. No JSX changes — the StopDetailScreen ternary was always correct; the data feeding it was wrong.
- **Supabase types regenerated** post-migration-051 (`c308c81`). Two stray CLI stderr lines stripped from the redirected file output (header + footer).

### Migrations applied
- **Migration 051** (`20260513_010_cash_collections_status.sql`) → applied via `supabase db query --linked --file <path>` (Management API path). Tracking row added via `supabase migration repair --status applied 20260513`. Schema verified: `cash_collections.status`, `not_collected_reason`, both CHECK constraints, partial index — all live.

### Verification
- `npx next build` clean three times — once per push.
- Schema probes on `route_assignments` (Darren has exactly one row today, Route 2), `dispatch_stops.stop_status` (existing rows have real completion data), and `cash_collections.status` (pre-apply: column missing; post-apply: present with default `'collected'`).

### Commits
- `ff006c6` fix(routes): scope /api/routes to assigned driver; remove cold-load auto-redirect
- `c308c81` chore(types): regen Supabase types post-migration-051
- `4788034` fix(stops): persist completion across refetches — stop_status read end-to-end

### For chat-Claude / Notion
- **Driver Auto-Load Route (May 10) is REVERSED.** Move the Build Progress Dashboard line to superseded; the Master Build Checklist entry should reflect that this is no longer a shipped feature.
- **`/api/routes` is now per-user** with `private, no-store` caching. Any Notion API surface docs that mention shared-cache behavior or generic "all routes for the day" semantics are stale.
- **`/api/routes/assigned` endpoint is removed.** Drop from any API inventory.
- **`dispatch_stops.stop_status` is the canonical completion signal** for the driver app. Update any design doc that talks about completion as in-memory or localStorage-only.
- **Migration 051 is APPLIED** (Cash Collection v2). The "blocked on Darren to apply" status moves to "applied 2026-05-14"; both repos' COD code is now functional in production.
- **Tech debt added:** dashboard repo Supabase types need regenerating to remove the `as any` casts in `boardClient.ts:fetchUncollectedCodRows`. Driver-app types are already current. Unused `AppStateContext.clearCache` can be deleted next time AppStateContext is touched.
- **Lessons added** (`tasks/lessons.md`): (a) `supabase db query --linked --file` is the working migration apply path when `db push` is blocked by two-repo coordination; (b) `supabase gen types typescript --linked > file` leaks CLI stderr into the redirected file — strip header/footer; (c) a UI bug presenting as a JSX gating problem is often a data-layer problem — trace the value before editing the ternary.

---

## 2026-05-13 evening — Cash Collection v2 (walk-away)

**Scope:** Complete the COD cash-collection loop. The driver-app COD card and Mark Complete were independent — drivers could complete a stop without acknowledging cash, and there was no path to record "could not collect." This session wires Mark Complete to gate cash acknowledgment, adds a two-path modal (Collected with editable amount / Could Not Collect with required reason), reconstructs the missing `cash_collections` migration, and surfaces the uncollected state on the dashboard board with auto-resolution via TapGoods sync. Two repos shipped together.

### What shipped — driver app
- **Migration 051 (`20260513_010_cash_collections_status.sql`)** — reconstructs the production `cash_collections` table (no prior migration file existed) and adds `status text DEFAULT 'collected'` + `not_collected_reason text` with two CHECK constraints (status enum + reason-required-when-not-collected) and a partial index on stop_id WHERE status='not_collected'. Idempotent end-to-end. **NOT yet applied to partytime-east — same two-repo coordination block as migration 009.**
- **`/api/cash-collections` POST extended** — accepts `{stop_id, status, amount_collected?, not_collected_reason?}`. Reason required when status='not_collected'. Collected path omits `status` from the INSERT so the legacy schema still works; not_collected path requires migration 051.
- **`/api/cash-collections` GET unchanged contract** — still returns `{exists, collection|null}`, selects only legacy columns for pre-migration safety.
- **`StopDetailScreen.tsx`** — Mark Stop Complete on a COD delivery stop intercepts and fires the new cash modal first. Cash modal has two paths: Collected (editable amount, primary gold button) and Could Not Collect (first tap expands required reason textarea, second tap submits). Inline error if reason missing. Stop completion runs AFTER cash POST succeeds. The standalone "Confirm Cash Collected →" button is gone — Mark Complete is now the only trigger. Extracted shared `runStopComplete()` helper.

### What shipped — dashboard
- **`fetchUncollectedCodRows()` + `buildUncollectedCodMap()`** in `src/lib/boardClient.ts` — returns Map<stop_id, reason> of all status='not_collected' rows. Tolerant of pre-migration-051 schema (PG 42703 → empty map + one warn).
- **`useUncollectedCodMap()`** hook (new file `src/hooks/useUncollectedCod.ts`) — keyed `['cod-uncollected']`, deduped by tanstack-query so the whole board shares one fetch.
- **`useRealtime` adds `cash_collections_changes` channel** that invalidates `['cod-uncollected']` on any event. Driver-app INSERTs propagate to the dashboard inside ~1s.
- **`StopCard.tsx`** — renders red "COD UNRESOLVED" pill in the top-right badge cluster + a red reason block above the footer when the map has the stop AND `payment_state !== 'paid_in_full'`. Auto-clears via the existing realtime cascade when TapGoods sync flips payment_state.

### Migrations applied
- None this session. Migration 051 file committed but NOT yet applied to remote — Darren applies via Supabase Studio SQL Editor (instructions in `tasks/open-questions.md`).

### Verification
- `npx next build` clean — driver app.
- `npx next build` clean — dashboard.
- Pre-migration smoke check: collected path POST works against legacy schema (verified by code review of conditional INSERT shape).

### Commits — driver app
- `150c277` docs: session close — equipment summary + week view enhancements (prior session's deferred close artifacts)
- `13f50f0` feat(cod): cash modal replaces Mark Complete on COD delivery stops

### Commits — dashboard
- `ea9d84e` feat(board): unresolved-COD flag on stop card

### For chat-Claude / Notion
- New shipped feature: COD acknowledgment is now gated through Mark Stop Complete. Drivers can no longer skip the cash modal on COD delivery stops.
- Two paths: Collected (editable amount, partial payments supported) or Could Not Collect (required reason note). Both record to `cash_collections`.
- Dashboard surfaces unresolved-COD inline on each stop card — red pill + reason block, visible without hover. Auto-clears when Melissa records the payment in TapGoods and the next sync flips `payment_state` to `paid_in_full`. No manual ack button — fully automatic.
- Migration 051 awaits Darren's manual apply to partytime-east. Until applied, the "Could Not Collect" path returns 500 and the dashboard flag stays hidden. The Collected path is backward-compatible and unaffected.
- Tech debt added: regen supabase types in both repos post-migration to remove `as any` casts. Orphan `dispatch_stops.cod_acknowledged_at/by` columns confirmed unused; flag for cleanup migration.

---

## 2026-05-13 — Two-tier equipment summary + week view enhancements

**Scope:** Replace per-surface ad-hoc item formatters with a single shared helper returning a structured two-tier summary. Wire the previously-stubbed Town/Equip filter pills and prev/next week nav. Add a "View in TapGoods" link per stop. Multiple smoke-test fixes after each pass. Paired with eight commits in `partytime-dashboard` covering the same arc — the two repos ship together because the helpers are byte-for-byte mirrors and the `/api/schedule/week` response shape is locked across them.

### What shipped
- **`src/lib/equipmentSummary.ts`** — rewritten to return `EquipmentSummary { tier1: string[]; tier2: string[] }`. Tier 1 = headline text, fixed order (Tents consolidated by parsed size sorted by sqft × qty descending → N chairs → N tables → N linens → inflatables one-per-line by qty + name). Tier 2 = pills, deduped + alphabetized, no quantities. Inflatable detection via `inflatable.ts`. Tent dimension regex matches dashboard's `parseTentSqft` (handles foot/inch marks).
- **`src/lib/inflatable.ts`** — new file, ported byte-for-byte from dashboard. Exposes `isInflatableCategory()` keyword detector.
- **`src/lib/itemCategories.ts`** — new file, ported from dashboard. Case-insensitive `CATEGORY_MAP` lookup. Empty-category name fallbacks: TENT/WALL → Tents, STAGE/DANCE FLOOR → Flooring and Staging, otherwise → Miscellaneous. Misc-category rescue: STAGE/SKIRT/RAMP/DECK names route to Flooring and Staging.
- **`src/lib/supabaseTransform.ts`** — `formatItemsText()` deleted; calls `buildEquipmentSummary()` and populates new `Stop.equipment` field. Warehouse synthetic stops carry empty `{ tier1: [], tier2: [] }`.
- **`src/types/index.ts`** — `Stop.items_text` removed; `Stop.equipment: EquipmentSummary` added (required).
- **`src/app/api/schedule/week/route.ts`** — response shape now `{ equipment: { tier1, tier2 }, tapgoods_order_token, ... }`. SELECT extended to include `tapgoods_order_token`.
- **`src/components/WeekScheduleView.tsx`** — new render path for Tier 1 text + Tier 2 pills row. Town/Equip filter pills wired as visibility toggles (each pill hides its own field; default = both shown). Prev/next nav wired via internal state. "View in TapGoods ↗" link below each stop's equipment row, launches via `externalAppService.openTapGoodsOrder()`.
- **`src/screens/RouteListScreen.tsx`** — drops `items_text` rendering for the same Tier 1 + Tier 2 pill row.
- **`src/data/mockData.ts`** — added empty `equipment` field to each mock stop so the file compiles (mock data is exported but unused).

### Files changed
- Added: `src/lib/inflatable.ts`, `src/lib/itemCategories.ts`
- Modified: `src/lib/equipmentSummary.ts`, `src/lib/supabaseTransform.ts`, `src/types/index.ts`, `src/app/api/schedule/week/route.ts`, `src/components/WeekScheduleView.tsx`, `src/screens/RouteListScreen.tsx`, `src/data/mockData.ts`
- Updated: `CLAUDE.md` (new architecture section + bumped "as of" date), `tasks/todo.md` (cross-repo mirroring discipline + name-override audit), `tasks/lessons.md` (stub-control framing + two-repo helper sync)
- Added: `tasks/session-summary-2026-05-13-equipment-summary.md`

### Migrations applied
- None.

### Verification
- `npx next build` clean across all six commits (per-pass).
- Dashboard `npx next build` clean across all eight paired commits.

### Commits — driver app (in order)
- `24d5dc7` fix(schedule): two-tier equipment summary on condensed surfaces
- `99eefb3` fix(schedule): week view filters, week nav, TapGoods link, category normalization
- `94bf52a` fix(schedule): week view smoke-test fixes
- `8b70f76` fix(schedule): sort Tier 1 tents by sqft × qty descending
- `acf97b9` fix(items): preserve Flooring and Staging identity, don't fold into Misc
- `bf06342` fix(items): rescue Misc-categorized staging hardware by name

### Commits — dashboard (paired, in order)
- `d50a024` fix(schedule): two-tier equipment summary across condensed surfaces
- `75dfbe9` fix(schedule): route Tier 2 pill labels through resolveCategory
- `7c02182` fix(board): condensed view smoke-test fixes
- `0a12da7` fix(schedule): sort Tier 1 tents by sqft × qty descending
- `f630d23` fix(board): anchor condensed route controls with flex-shrink-0
- `1e591c4` fix(board): keep condensed route sub-header on one row down to 900px
- `f436863` fix(items): preserve Flooring and Staging identity, don't fold into Misc
- `5039280` fix(items): rescue Misc-categorized staging hardware by name

### For chat-Claude / Notion
- New shipped feature: condensed-surface equipment summary parity across dashboard and driver app. Drivers now see consistent item summaries on the week view and condensed route list; dispatch sees the same on the condensed board.
- Driver-app week view now has working filter pills (Town / Equip visibility toggles), working prev/next week nav, and a per-stop "View in TapGoods ↗" link.
- New cross-repo mirroring discipline: three helpers (`equipmentSummary.ts`, `inflatable.ts`, `itemCategories.ts`) are byte-for-byte copies between the two repos and must be edited in lockstep. No shared package — long-term todo.
- Tech debt added: `resolveCategory` name overrides (CHAIR / STAGE / SKIRT / RAMP / DECK / TENT / WALL / DANCE FLOOR) are workarounds for TapGoods miscategorization. The principled fix is to recategorize source items in TapGoods.

---

## 2026-05-10 — Driver auto-load route — feature build

**Scope:** When a driver opens the app, if they have a `route_assignments` row for today, redirect them straight to `/route/<id>` (RouteListScreen) instead of showing the Home day overview. Manual day-overview fallback preserved for unassigned drivers, fetch failures, and post-redirect Home-tab returns.

### What shipped
- New endpoint `GET /api/routes/assigned` — auth-gated via session cookie; queries `route_assignments` inner-joined to today's `routes`, ordered `assigned_at DESC`; returns `{ route_id: string | null }`. Multi-match edge case logs a warning and returns the freshest. Service-role read (matches `/api/inspection/status` and `/api/defects/post-trip` pattern).
- New hook `useAssignedRoute()` — fetches the endpoint once per session, guarded by `sessionStorage['ptd_autoload_attempted']`. On match → `router.replace('/route/<id>')`. On no match / fetch error → caller renders day overview. The session guard preserves CLAUDE.md's May 8 lock: BottomNav's Home tab must remain reachable.
- `DayRouteSelectorScreen` — adds "Finding your route…" spinner branch at the top of the scroll body while the assignment check is in flight (or the redirect is mid-flight). Existing isLoading / error / empty / populated branches gated with `!showAssignmentLoader` so they don't render under the loader. Hero stays visible throughout.

### Files changed
- Added: `src/app/api/routes/assigned/route.ts`
- Added: `src/hooks/useAssignedRoute.ts`
- Modified: `src/screens/DayRouteSelectorScreen.tsx`
- Added: `tasks/session-summary-2026-05-10-autoload.md`
- Updated: `CLAUDE.md` (Driver Auto-Load section + NEXT smoke test item), `tasks/todo.md` (Phase 2.5 Phase C → done), `tasks/lessons.md` (new lesson on guarded re-enablement of locked invariants)

### Migrations applied
- None. `route_assignments` schema already had `user_id`, `route_id`, `assigned_at`.

### Verification
- `npx next build` clean. `/api/routes/assigned` appears in the route table as a dynamic handler.
- Dev server killed before build per the explicit session rule.

### Commits
- TBD (this session) — pushed to `main` after this changelog write.

### For chat-Claude / Notion
- Phase 2.5 — Driver App Source of Truth Migration: Phase C ("Driver assignment from dashboard") can be marked **shipped**. Note that the prior `tasks/todo.md` line saying "auto-load shipped May 6" was a forward-leaning note — the real ship date is today.
- Master Build Checklist: tick the driver-app side of "Driver assignment from dashboard → auto-load on sign-in."

---

## 2026-05-10 — Phase 2.5a cleanup — TapGoods legacy code removed

**Scope:** Delete the orphaned TapGoods direct-call cluster from the driver app. The driver app has read routes/stops exclusively from Supabase (`/api/routes`) for weeks; the four-file TapGoods GraphQL path remained checked in but had zero consumers in `src/`.

### What shipped (commit `15d3476`)
- Deleted `src/app/api/tapgoods/routes/route.ts` (sole consumer of the GraphQL client).
- Deleted `src/lib/tapgoodsClient.ts`, `src/lib/tapgoodsQueries.ts`, `src/lib/tapgoodsTransform.ts`.
- Removed the now-empty `src/app/api/tapgoods/` directory tree.
- Total: 4 files, 270 lines.

### Verification
- Pre-deletion grep across `src/` confirmed each file's only references were the four files referencing each other.
- Repo-wide `tapgoods` grep (excluding `node_modules`/`.next`) found surviving references only in: `src/types/supabase.ts` (column types), `src/app/api/routes/route.ts` (`tapgoods_order_token` select), `src/lib/supabaseTransform.ts` (`order_id` mapping), `src/config/externalApps.ts` (View Order URL template). All legitimate, none consume the deleted code path.
- `npx next build` clean. Route table no longer lists `/api/tapgoods/routes`.

### Files changed
- Deleted: 4 files (above).

### Migrations applied
- None.

### Commits
- `15d3476` — chore: remove dead TapGoods legacy code (Phase 2.5a cleanup)

### For chat-Claude / Notion
- Phase 2.5 — Driver App Source of Truth Migration: Phase A can now be marked **fully complete**. Status moves from "replaced" to "removed."

---

## 2026-05-10 — Post-trip defect report — feature build

**Scope:** Optional post-trip defect reporting on Home, surfaced after route completion. Symmetric counterpart to the pre-trip flow: pre-trip is a hard-gated full DVIR at the start of the day; post-trip is a single optional defect at the end of the day. No certify checkbox, no progress dots, no summary screen. One screen, three inputs (category, severity, description), submit.

### What shipped
- **Migration 009** — `supabase/migrations/20260510_009_post_trip_reported_context.sql`. Adds `vehicle_defects.reported_context text CHECK (reported_context IN ('pre_trip','post_trip')) DEFAULT 'pre_trip'`, plus drops the NOT NULL constraint on `vehicle_defects.inspection_id` so post-trip rows can carry NULL there. Existing rows backfill to `'pre_trip'` via DEFAULT — no behavior change for the pre-trip path.
- **`/api/defects/post-trip`** — single route handler exposing both methods. `GET` returns `{ submitted_today: boolean }` for Home's render gate (scoped by `reported_by_user_id` + `reported_context = 'post_trip'` + same calendar day). `POST` validates + inserts a single `vehicle_defects` row with `reported_context = 'post_trip'`, `inspection_id = null`, severity ∈ `{'oos','non_oos'}`. Mirrors the pre-trip route's session-cookie + service-role pattern.
- **`PostTripDefectCard`** component (`src/components/PostTripDefectCard.tsx`) — three states: idle entry button → expanded form (category select, severity toggle, description textarea, submit) → success receipt (collapsed, green check). Inline error banner on failed submit; form preserved across failures.
- **Home wiring** (`src/screens/DayRouteSelectorScreen.tsx`) — computed `routeComplete = totalStopCount > 0 && every stop completed`. Fetches `submitted_today` from the new endpoint when route completes. Renders `PostTripDefectCard` between the pre-trip card and the COD cards when the route is complete and the driver hasn't submitted yet today. Fail-closed on fetch error: card stays hidden if we can't confirm status (avoids double-submit risk on flaky network).
- **Types catch-up** — manually patched `src/types/supabase.ts` for `vehicle_defects` so the build typechecks against the post-migration schema (couldn't regen via CLI; see "Tech debt" below).

### What was NOT applied this session
- **Migration 009 SQL was NOT pushed to remote.** The driver-app and dashboard repos share one Supabase project (`partytime-east`) but each has its own local migrations folder; the dashboard repo has 27 migrations in remote tracking that aren't files in this repo. `supabase db push --linked` refuses to proceed; the CLI's suggested `migration repair --status reverted <list>` would break the dashboard repo's CLI workflow. No DB password available locally for `--db-url` direct push. Migration file is committed; **Darren must apply via Supabase Studio SQL Editor before the post-trip card or API will function.** Full instructions + verification SQL in `tasks/open-questions.md`.

### Files changed
- New: `supabase/migrations/20260510_009_post_trip_reported_context.sql`, `src/app/api/defects/post-trip/route.ts`, `src/components/PostTripDefectCard.tsx`, `tasks/open-questions.md`.
- Modified: `src/screens/DayRouteSelectorScreen.tsx` (post-trip wiring), `src/types/supabase.ts` (vehicle_defects column types).

### Migrations applied
- None remotely (see "What was NOT applied"). Migration file committed for application by Darren.

### Smoke tests (after Darren applies migration)
1. Sign in as a driver assigned to a route today.
2. Mark every stop on the route as completed (existing flow — no change).
3. Return to Home (`/`). Verify the post-trip defect card appears between the pre-trip receipt and any COD cards. Card should NOT appear before completion.
4. Tap "Report a post-trip defect." Form expands. Pick a category, choose Non-OOS or OOS, type a description, tap Submit.
5. Card collapses to a green "Post-trip Reported · Thanks — dispatch has the defect" receipt.
6. Reload Home. Card stays hidden (because `submitted_today = true`).
7. In Supabase Studio, verify the row: `SELECT id, truck_id, category, severity, description, reported_by_user_id, reported_context, inspection_id, reported_at FROM vehicle_defects WHERE reported_context = 'post_trip' ORDER BY reported_at DESC LIMIT 5;` Expected: row with `reported_context='post_trip'`, `inspection_id IS NULL`.

### Commits
- (this session) — feat(defects): post-trip defect report on Home

### Tech debt added
- **12-category list duplicated** between `src/screens/InspectionScreen.tsx`, `src/app/api/inspection/submit/route.ts`, `src/app/api/defects/post-trip/route.ts`, and `src/components/PostTripDefectCard.tsx`. Per session prompt the post-trip surfaces ship with their own local copy and a `// TODO: extract to src/lib/defect-categories.ts when pre-trip stabilizes` comment in each. Don't refactor pre-trip's category list inside this build.
- **Manual type patch in `src/types/supabase.ts`.** The standard regen (`supabase gen types`) reads from remote — and remote doesn't yet have migration 009 applied. After Darren applies the migration, the next regen will replace the manual patch with the canonical output. Until then, the file describes a not-yet-existent schema (intentionally — this matches the code's expectations after the migration).

### New lesson in `tasks/lessons.md`
- Two-repo migration coordination is brittle. When `partytime-driver-app` and `partytime-dashboard` both write migrations to the same Supabase project but each tracks only its own files locally, `supabase db push --linked` from either repo fails with "remote versions not found locally." There's no clean self-service workaround in the CLI today. Workflow needs a documented protocol — either (a) one repo owns all migrations (likely dashboard) and consumer repos request via PR, or (b) both repos run `migration repair --status applied` against each other's versions on a regular cadence. Logged separately in `tasks/lessons.md`.

---

## 2026-05-09 — Multi-Role auth migration catch-up (evening)

**Scope:** Bug-fix sweep. Driver app was returning HTTP 400 on every load and showing "Access denied" because the dashboard's morning Multi-Role Refactor (Migrations 036/037/038) dropped `profiles.role` and the driver app was still selecting it. Schema was already correct in production — this was a code-only catch-up.

### What broke
- Browser console: `[getUserRole] HTTP error: 400 ... /rest/v1/profiles?id=eq.<id>&select=id,role,display_name&limit=1`. Postgres returned 400 because `profiles.role` no longer exists; the column is `roles text[]` now.
- `getUserRole()` returned `null` on the catch path; `AuthContext` set `profile = null`; the context's derived `role` was `null`; every page guard's `role !== 'driver' && role !== 'super_admin'` evaluated `true` → "Access denied" rendered for every authenticated user, including super_admins.

### Fix (10 files, commit `b937892`)
- `src/types/auth.ts` — `UserProfile.role: Role` → `roles: Role[]`.
- `src/lib/auth.ts` — PostgREST `select=id,role,display_name` → `select=id,roles,display_name`. Comment about the INITIAL_SESSION deadlock workaround preserved (the bypass is still needed; only the field name changed).
- `src/context/AuthContext.tsx` — context value exposes `roles: Role[] | null` instead of `role: Role | null`. Provider reads `profile?.roles ?? null`.
- 5 page guards — `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/training/page.tsx`, `src/app/tools/page.tsx`, `src/app/tools/weather/page.tsx`. Each: destructure `roles` instead of `role`, check `!roles?.includes('driver') && !roles?.includes('super_admin')`. Identical pattern across all five — same multi-role check the dashboard uses.
- `src/components/BottomNav.tsx` — destructure `roles`. Tab visibility flipped to array intersection: `!!roles && roles.some((r) => t.rolesAllowed!.includes(r))` (was `t.rolesAllowed.includes(role)`).
- `src/screens/ProfileScreen.tsx` — `formatRole(roles: Role[] | null | undefined)`: `if (!roles?.length) return '—'`; otherwise `primary = roles.includes('driver') ? 'driver' : roles[0]` (driver-app context — favor the driver label when present), then run the existing switch on `primary`. Call site updated to `formatRole(profile?.roles)`.

### Files changed
- `src/types/auth.ts`, `src/lib/auth.ts`, `src/context/AuthContext.tsx`,
  `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/training/page.tsx`,
  `src/app/tools/page.tsx`, `src/app/tools/weather/page.tsx`,
  `src/components/BottomNav.tsx`, `src/screens/ProfileScreen.tsx` — 10 files, 22 insertions / 19 deletions.

### Migrations applied
- None. Schema was already migrated by dashboard Migrations 036/037/038 earlier on 2026-05-09. This was a TypeScript / API-call catch-up only.

### Smoke tests
- `npx next build` clean — full type check across all 15 routes passed; no warnings on the new array call sites.
- Vercel deploy `b937892` (`dpl_Fq4dH74Y4GzZD1X4dSiepnBzQe21`) READY in production. Aliased to `partytime-driver-app-git-main-dmorizet15-6678s-projects.vercel.app`.

### Commits
- `b937892` — fix(auth): migrate driver app to roles[] after dashboard dropped profiles.role

### New lesson in `tasks/lessons.md`
- A schema column rename in the dashboard repo doesn't ship the rename to consumer repos. When the dashboard CLAUDE.md "Active Flags" claim was "no further refactor work outstanding," this repo was still selecting the dropped column. Consumer-repo sweep is part of the schema-migration definition of done — not an afterthought.

---

## 2026-05-08 — Home revert + truck pill wired (late evening)

**Scope:** Two pieces of work that shape what Home is. Auto-redirect from `/` → `/route/<id>` removed entirely; date picker removed from Home; truck pill wired to real data.

### Auto-redirect deleted
- The May 6 auto-load (`938f4b0`) installed a `useEffect` on `DayRouteSelectorScreen` that silently `router.replace`'d to today's assigned route on every mount. That made the **Home** tab in BottomNav unreachable — every tap bounced back to `/route/<id>`. A morning patch (`cfc8d5c`) added a once-per-session flag, but the architecture was wrong: Home should stay Home.
- Deleted: the auto-redirect `useEffect`, the `AssignmentState` type + state machine, the no-assignment banner, the `clearCache` import, the `hasAutoCheckedAssignmentThisSession()` / `markAutoAssignmentChecked()` helpers in `lib/auth.ts`. `signOut()` reverted to a one-liner.
- Deleted: `src/app/api/assigned-route/route.ts` — only consumer was the auto-redirect.
- Drivers reach `/route/<id>` via the explicit **Inspect & Start Route** gold CTA on Home, which already does `router.push('/route/' + routes[0].route_id)`. Unchanged.

### Date picker removed
- The prev/next-day strip + "TODAY · Friday May 8" header was day-picking UI for a single-day driver app — out of scope. Deleted `selectedDate`/`setSelectedDate` state, `shiftDate` + `formatNavDate` helpers, the `isToday` boolean, and the date strip JSX. `loadDay(today)` fires once on mount.
- Empty-state eyebrow simplified: was `isToday ? 'Today' : 'No work'`, now always "Today".

### Truck pill wired to real data
- `HAS_TRUCK = false` flag deleted. Was rendering a hardcoded "Your truck: — · —" stub for weeks even though `/api/routes` had been joining `trucks!routes_truck_id_fkey` and `RouteListScreen` was already consuming `truck_name`.
- Added `plate` to the `trucks` joins on both fkeys in `/api/routes/route.ts` (primary + secondary, mirrors RouteListScreen pattern). Added `plate: string | null` to `SupabaseTruckRow`. Added `truck_plate?: string` to `Route` type. `supabaseTransform` passes `truck_plate: truck?.plate ?? undefined`.
- Pill renders `<NAME>` in semibold (`fontWeight: 700`) + ` · ` + `<PLATE>` in regular weight (`fontWeight: 400`). Plate falls back to name-only when null. Pill hides entirely when no truck assigned. Truck_2 ignored — driver app is single-truck per route per login (the comment is doctrine for the Home pill, not a TODO).
- Smoke-tested on production: today's route 3a707492 → RECOIL · 17010NE renders correctly.

### Files changed
- `src/screens/DayRouteSelectorScreen.tsx` — major surgery (-244 LOC net).
- `src/lib/auth.ts` — flag plumbing reverted.
- `src/app/api/assigned-route/route.ts` — deleted.
- `src/app/api/routes/route.ts` — added `plate` to both trucks joins.
- `src/lib/supabaseTransform.ts` — `SupabaseTruckRow.plate` + `truck_plate` passthrough.
- `src/types/index.ts` — `truck_plate?: string` on `Route`.

### Migrations applied
- None.

### Smoke tests
- `npx next build` clean — page count 17 → 15 (removed `/api/assigned-route` + asset reductions on `/`). Type check passes.
- Vercel deploy `e72aa78` Ready (production alias `partytime-driver-app.vercel.app`).
- Manual end-to-end: sign in → land on `/` (no redirect), truck pill shows **RECOIL · 17010NE**, no date picker, **Inspect & Start Route** → `/route/3a707492-...`, Home tab in BottomNav stays on `/`. ✓

### Commits
- `cfc8d5c` — fix(home): make Home tab reachable after auto-redirect to assigned route — *superseded by full revert in next commit, kept for git history*
- `e72aa78` — revert(home): drop auto-redirect, hide date picker, wire truck pill (Vercel deploy of e72aa78 Ready, Current)

### Two new lessons in `tasks/lessons.md`
- Home is Home. Never auto-redirect away from it. Landing screens and execution screens stay separate; navigation between them is driver-initiated.
- Trust the data join. When a `HAS_*` stub flag's gating condition is already true in the API, delete the flag — don't keep the placeholder.

---

## 2026-05-08 — `/api/routes` filter revert (evening)

**Scope:** Revert the late-afternoon `calculated_eta IS NOT NULL` workaround back to the cleaner `scheduled_date = date` filter. Dashboard Migration 035 makes scheduled_date reliable on assigned stops.

### Why
- The afternoon's workaround coupled driver-app stop visibility to the dispatcher running Optimize (which populates `calculated_eta`). A stop assigned to today's route but never optimized would be invisible.
- Dashboard Migration 035 (2026-05-08, evening session) installs `trg_sync_scheduled_date_to_route` — a `BEFORE INSERT OR UPDATE OF route_id` trigger that holds `dispatch_stops.scheduled_date = routes.route_date` whenever `route_id IS NOT NULL`. Pickup stubs no longer drift after assignment.
- With the invariant in place, `.eq('scheduled_date', date)` is the cleanest per-day filter — no actionability proxy needed.

### Files changed
- `src/app/api/routes/route.ts` — filter reverted, comment updated to reference dashboard Migration 035.

### Migrations applied
- None in this repo. Dashboard Migration 035 is what unblocked the revert.

### Smoke tests
- `npx next build` clean (compile + type check + 16/16 static pages).
- Vercel deploy `oa1e7cvxr` Ready in 29s on commit `9b8d269`.
- End-to-end day-filter smoke deferred to next live route check.

### Commits
- `9b8d269` — fix(api/routes): revert filter to scheduled_date = date (Vercel deploy `oa1e7cvxr`, Ready 29s)

---

## 2026-05-08 — Phase 2B stop-level weather + day-filter bug fix

**Scope:** Two pieces of work, one driver-facing, one bug discovered during smoke test.

### Phase 2B — Stop-level weather badges on Stop Detail
- **`src/components/weather/StopWeatherModule.tsx`** (new) — adaptive dark card sized for Stop Detail. Wind status always visible (collapsed or expanded), snow client-discussion callout always visible if snow forecasted, lightning STOP override replaces wind row with prominent banner. Auto-expands on any caution+ condition; manual collapse only when fully clear.
- **`src/hooks/useStopWeather.ts`** (new) — thin client wrapper around `/api/weather?lat=&lng=`. Server already caches by 4-decimal coords for 15 min, so revisiting the same stop within that window costs nothing. Cancellation handles fast inter-stop swipes.
- **`src/screens/StopDetailScreen.tsx`** — module renders above Manifest section, gated on `HAS_STOP_LEVEL_BADGES === true` AND stop has lat/lng AND `stop_type !== 'warehouse'`. Layout placement decision: above-manifest (per spec discussion). Warehouse stops skipped (depot context, weather signal less relevant).
- **`src/lib/weather/thresholds.ts`** — flipped `HAS_STOP_LEVEL_BADGES` from `false` to `true`. The `HAS_TENT_SIZE_DATA` and `HAS_ANCHORING_GUIDANCE` stub flags stay `false` (separate work).
- **Reuse over rebuild:** No new threshold logic. The locked evaluators (`evaluateWindWindow`, `evaluateRainWindow`, `evaluateSnowWindow`, `evaluateLightning`) and `STATUS_COLORS` from Phase 2A are imported as-is. Visual language matches Phase 2A's standalone weather screen so drivers recognize the same signals across surfaces.

### Bug fix — `/api/routes` was leaking ghost stops onto driver day view
- Discovered during Phase 2B smoke test: driver app showed 6 stops on today's Route 1 while the dashboard correctly showed 3.
- **Root cause:** the endpoint filtered `dispatch_stops` only by `route_id IN today's_route_ids` — no actionability signal. Stale assignments (stops dragged onto a route weeks ago and never optimized or unassigned) leaked through.
- **First attempt:** `.eq('scheduled_date', date)` — too tight. Pickup stubs anchor `scheduled_date` to a past Monday by design (auto-stub anchor in tapgoodsSync), so legit stubs got hidden.
- **Final fix:** `.not('calculated_eta', 'is', null)`. The route time calculator (NOT the Optimize button) sets `calculated_eta` automatically when stops are added to a route with a start time and drive times. Populated ETA = "this stop has been routed for today and is actionable." Null ETA = orphan assignment. Verified against actual production data (4 legit stops with ETAs vs 3 ghosts without).
- **Note:** This is a workaround. The principled fix lives in the dashboard — when a stop is assigned to a route, also update `scheduled_date` to match the route's `route_date`. Tracked as a follow-up in `tasks/todo.md`.

### Drive-by: trimmed leaked CLI text from `src/types/supabase.ts`
- Two trailing lines of Supabase CLI version-notice text (committed by accident on 2026-05-07's regen) were causing the lint parse step of `npx next build` to fail. Trimmed; build clean again. Future regens should suppress stderr (`supabase gen types typescript --linked 2>/dev/null > path`).

### Files changed
- `src/components/weather/StopWeatherModule.tsx` (new)
- `src/hooks/useStopWeather.ts` (new)
- `src/screens/StopDetailScreen.tsx` (module integration)
- `src/lib/weather/thresholds.ts` (flag flip)
- `src/app/api/routes/route.ts` (calculated_eta filter)
- `src/types/supabase.ts` (CLI text cleanup)

### Migrations applied
- None in this repo. The dashboard's Migration 034 (geocoding state columns + trigger) is what unblocked Phase 2B.

### Smoke tests
- Phase 2B module renders above manifest on a real production stop with valid coords. Hudson Valley coordinates confirmed (e.g. Bronxville pickup at 41.0085, -73.8344).
- Day-filter fix: today's Route 1 now shows exactly 3 stops, matching dashboard. Route 2 shows the second-truck Sarah Lawrence pickup. No ghost stops from prior weeks.

### Commits
- `6804347` — feat(weather): Phase 2B stop-level weather badges on Stop Detail (Vercel deploy `eyvy5gtap`, Ready 37s)
- `519282c` — fix(api/routes): filter dispatch_stops by scheduled_date so stale stops drop out (Vercel deploy `1ibeg1z16`, Ready 38s)
- `470ec19` — fix(api/routes): use calculated_eta as actionability signal, not scheduled_date (Vercel deploy `jjyb2qtzy`, Ready 34s)

### Open follow-ups (tracked in `tasks/todo.md`)
- Dashboard data hygiene: assigning a stop to a route should sync `scheduled_date` to the route's `route_date`. Once that ships, this repo's `calculated_eta IS NOT NULL` filter can revert to the simpler `scheduled_date = date`.
