# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

- **Latest shipment:** **Fleet Maintenance driver app — Session 3, 2026-05-30 — commit `3bda5d7`, direct to `main`.** UI-only build of the four locked Fleet Maintenance screens (no migrations, no API routes — all via the existing RLS-gated supabase client). Screen 1 (Overview) → Trucks / Equipment / My Log pill tabs; truck cards gained current mileage + Reg/Insp/Ins compliance badges. Screen 2 (Asset Detail) → History / PM Schedule / Parts pill tabs, persistent open-WO block + persistent Log-service CTA. Screen 3 (Log Service) → mileage/hours prefill from current reading. Screen 4 (My Log, new) → current user's service records across all assets. Shared `PillTabs` + `ComplianceBadges` added; `PartCard` extracted from `WorkOrderDetailScreen`. Build green; pushed. **Production smoke test pending Darren.** See "Fleet Maintenance Module — Driver App → Session 3" below and `docs/CHANGELOG.md`.
- **Active feature:** **AVA Phase 1 is LIVE on `main` as of 2026-05-28** — merged via `git merge --no-ff feature/ava-phase1` (merge commit `37f83a9`) and pushed to production. All 9 original components shipped (profile preference columns, ava_conversations table, ava_stop_notes table, header chip, morning brief card, dependency-map + checklist, AVA Remembers UI, ElevenLabs TTS, voice/text toggle) PLUS the dispatcher-notes + stop-notes surface added on the branch (the "10 components" in the merge message). The `feature/ava-phase1` branch has been **deleted** (local + remote) — all history is in `main`. **Next AVA work goes on a NEW branch** (`feature/ava-phase2` or similar), not directly on `main` and not on the deleted branch. Phase 1 spec: Notion `3550aa6451b881f19285e369387b75b6`.
- **Latest shipment:** AVA TTS sentence-pause tune `0.5s → 0.6s`, 2026-05-28 — commit `cc76a02`, direct to `main`/production (first post-merge change on `main`). One value, `SENTENCE_PAUSE` in `src/lib/ava/elevenLabs.ts:26`, injected as an SSML `<break time="0.6s" />` at sentence boundaries on the ElevenLabs request only (Web Speech fallback unaffected). Build green; pushed; Darren confirmed audible on the live app. Re-tunable via the same constant. Standing fallback if turbo_v2 ever reads the tag aloud: split the brief into separate clips with a real silent gap.
- **Prior shipment:** AVA Phase 1 — dispatcher notes + stop notes surface, 2026-05-28 — branch commits `104e652` → `48ab75c` (5 commits). New scope added to the branch (beyond the original 9 components): surfaces route + stop dispatcher notes and TapGoods order notes across the morning brief (FROM DISPATCH block + stop-notes count line), a pre-launch notes sheet (fires on Send-ETA AND Open-in-Maps, once per stop), and Stop Detail (collapsible Order Notes section + route-list note glyph). All reads — no migrations, no new API routes (extended the existing `/api/routes` SELECT). Now **live on `main`/production** as part of the 2026-05-28 Phase 1 merge (`37f83a9`). See the "Dispatcher Notes + Stop Notes surface" subsection under "AVA Phase 1 (Driver App)" below. The prior shipment was the morning-card count fixes (`71ec8a1` + `dec52c8`).
- **Prior shipment (context):** AVA Phase 1 — morning-card count fixes, 2026-05-28 — branch commits `71ec8a1` + `dec52c8`. Two correctness fixes to `AvaMorningCard.tsx` after a live-route test: (1) card visibility decoupled from `checklist_enabled` — the card renders on any of stats-on / notes-exist / (checklist-on AND dependency hits); stats block shows a zero-state instead of vanishing on a slow day; (2) all counts (stops, COD, tents, checklist manifest, stop-note lookup) now run through `customerStops` = day stops minus depot (`warehouse`/`warehouse_return`), and `countTentItems` now requires category AND name match so sidewalls/walls filed under TapGoods "TENTS" stop inflating the tent count. The prior shipment was the Profile Settings UI (`35eb566`). Build green; pushed to `feature/ava-phase1` for Vercel **preview deploy** (not production). See "AVA Phase 1 (Driver App)" section below.
- **Latest migration:** **`20260527017_ava_stop_notes_storage`** (the `ava-stop-notes` Storage bucket + RLS, Session 4). Driver-app local `supabase/migrations/` is now **17 files** — AVA added 013/014/015 (Session 1), 016 `dependency_map` (Session 3), 017 storage bucket (Session 4). 016 and 017 were each applied via `supabase db query --linked --file` then `migration repair --status applied <version>`. The "migration count" still tracks the remote table; dashboard owns most of the count, but the driver-app rows are in there too courtesy of the `migration repair` step.
- **Branch strategy:** AVA Phase 1 is merged and its branch deleted (see "Active feature" above). Going forward: unrelated work commits directly to `main`; the next AVA phase gets its own `feature/ava-phaseN` branch and is not merged to `main` until Darren gives the go-ahead.
- **Next priority:** see `tasks/todo.md` (top of file).

---

## Division of labor

- chat-Claude owns Notion. Claude Code never writes Notion.
- Claude Code owns: code, `CLAUDE.md`, `docs/claude/`, `tasks/`, `docs/`, `CHANGELOG.md`.
- All builds push to `main`. No branches until Darren says otherwise.

Full doctrine: `docs/claude/doctrine.md`.

---

## Session start ritual

- Read `CLAUDE.md` + `tasks/todo.md` + `tasks/lessons.md`.
- Read the relevant sub-doc under `docs/claude/` for the active feature.
- Fetch Notion pages: Master Project Hub + latest v1.1 Build Plan + most recent Session Summary.
- State the current migration count (from `supabase/migrations/`) and the active feature before starting work.
- Apply the superpowers workflow on all coding tasks: brainstorm → plan → approve → execute → verify. PTR-specific rules in this CLAUDE.md take precedence over superpowers where they conflict. Before approving any plan, flag whether shared files require simultaneous dashboard updates in the same session.

---

## Critical rules (inline — read every session)

- **Pre-push verification.** `npx next build` (not `npx next lint`) must succeed end-to-end before `git push`. Lint is a subset of build — it does not run TypeScript's type checker. Precedent: 2026-05-06 cash-collection deploy red on `WorkflowEventType` mismatch after green lint locally.
- **Build-then-push is one indivisible sequence.** Never build and stop. If a build is green and you're not pushing immediately, name out loud why so the deferred push doesn't get lost. Precedent: 2026-05-09 evening, 9 inspection commits sat local for 2+ hours while smoke testing the pre-inspection app on Vercel.
- **Migrations apply via `supabase db push` or `supabase db query --linked --file <path>`** (Management API path bypasses two-repo history block). Never paste into Supabase SQL Editor. Mark applied with `supabase migration repair --status applied <version>` to keep tracking honest.
- **Cross-repo helpers are byte-for-byte mirrored.** `src/lib/equipmentSummary.ts`, `src/lib/inflatable.ts`, `src/lib/itemCategories.ts` have twins in `partytime-dashboard`. Any change MUST be applied to both in the same session.
- **TapGoods API gotchas** (do not re-discover): see `docs/claude/doctrine.md` → "Key TapGoods API Learnings".

---

## Time Window Constraints — Phase 4 (driver-app read-only)

The dashboard's Phase 1/2 work (Migration 058 trigger) computes `constraint_confidence` + window bounds on every `dispatch_stops` row. The driver app surfaces those values in three places — all read-only, no writes:

- **Stop card badge** — `<StopWindowBadge />` (`src/components/StopWindowBadge.tsx`) renders a compact amber pill below the address on StopDetailScreen (on-dark variant), RouteListScreen stop rows, and DayRouteSelectorScreen day list (both COD card + inline row). Solid amber for verified/inferred/manual tiers; dashed outline for suggested. Renders nothing when `constraint_confidence` is null.
- **Pickup standby** — When `arrived_at` is stamped on a pickup stop and `pickup_window_start > now`, StopDetailScreen replaces its action card with a standby card: "You're early — pickup opens at X" + live `HH:MM:SS` countdown + **Navigate anyway** button. Countdown interval auto-tears-down once the window opens.
- **Pre-navigate gate** — Tap of the Navigate quick action on a hard-tier pickup with an unopened window pops a `ConfirmationModal`: "This stop can't be picked up until X. You're N min early." `I'll wait` dismisses, `Navigate anyway` logs override + proceeds. Suggested tier never gates.

Both standby-dismiss and gate-override paths write the same `sessionStorage` key (`early-pickup-override:${stopId}`) so the override is unified — one tap from either surface stops both gates for the rest of the session. Override is logged via `NAVIGATION_STARTED` workflow event with `early_pickup_override: true`, `override_source: 'standby' | 'navigate_gate'`, and `minutes_early`.

The window resolver lives in `src/lib/stopConstraints.ts` — pure-functional port of the dashboard's source-priority tree (`dispatcher_time_override` → structured `delivery_/pickup_window_*` → `notes_classification.extracted`). Same priority order as dashboard `src/lib/stopConstraints.ts`; if dashboard logic shifts, mirror here in the same session (these files are NOT byte-identical — driver app is a read-only subset, no confirm/dismiss mutations).

**Data plumbing:** `/api/routes` SELECT pulls all Phase 1/2 columns; `supabaseTransform.toRealStop` maps them onto the driver `Stop` type. Regen `src/types/supabase.ts` (`supabase gen types typescript --project-id fumprcyavpefyupurvsv`) before changing the SELECT — phase 1/2 columns aren't autogenerated until a regen happens.

**NEXT smoke test (production, Vercel deploy auto-fires per commit):**

1. Open a delivery stop where dashboard has set `constraint_confidence`. Confirm the badge renders below the address on StopDetail (on-dark amber) and on RouteListScreen + DayRouteSelectorScreen rows (light amber pill).
2. Open a pickup stop where `pickup_window_start` is in the future. Tap the Open in Maps quick action → gate modal pops with "Navigate anyway" + "I'll wait". Tap "I'll wait" → modal dismisses, no navigation.
3. Same pickup stop → tap Open in Maps → modal pops → tap "Navigate anyway" → maps opens. Re-tap Open in Maps → no modal this session (override sticky).
4. Same pickup stop, fresh session, drive to within 150m → arrived_at stamps → StopDetail replaces action card with standby. Confirm countdown ticks every second. Tap "Navigate anyway" → standby dismisses, action card returns, Mark Stop Complete becomes available.
5. Suggested-tier stop (dashed outline badge) → no gate, no standby — just the badge.

---

## Fleet Maintenance Module — Driver App

Shipped 2026-05-22 (commit `46ba851`). Driver-app surface for the dashboard's Fleet Maintenance Module. All four phases of the dashboard build (migrations 062–068) are production-green; the driver app **reads and writes those same tables** — no migrations, no API routes.

- **Access.** `profiles.fleet_maintenance_access` is a stacked, additive permission, independent of `roles`. UI gate: `useFleetAccess()` (`src/hooks/fleet/`). DB gate: every fleet table + the `service-invoices` Storage bucket is RLS-gated on the `has_fleet_maintenance_access()` predicate. `getUserRole` now SELECTs `fleet_maintenance_access`; `UserProfile` carries it. A standard driver sees the Tools Hub with no Fleet card and no trace of the module.
- **Data layer — `src/lib/fleet/`.** `queries.ts` (all Supabase reads/writes via the browser client), `pmStatus.ts` (pure PM-tier derivation — compares dashboard-computed `next_due_*` to today / current mileage+hours), `format.ts`, `types.ts`, `theme.ts` (dark hub palette `FC`). Hooks in `src/hooks/fleet/`. Shared components in `src/components/fleet/`.
- **Screen 1 — Tools Hub card.** `FleetMaintenanceCard` inline in `ToolsScreen.tsx` — role-gated (renders null without access), red pill shows open work-order count (hidden at zero).
- **Home alert card.** `<FleetAlertCard />` in `DayRouteSelectorScreen.tsx`, between the COD card and the day list. Red-border card; renders only for fleet-access users with ≥1 open work order. Lives in the populated-home body, so it appears on days the driver has a route.
- **Screen 2 — Fleet Overview** (`/tools/fleet`). Open-WO + PM-due summary counts. Restructured 2026-05-22 evening into three sections: **Trucks** (open truck work orders, never collapsed, above the full truck list), **Equipment** (open equipment work orders, never collapsed, above an equipment list that collapses — default collapsed at zero open equipment WOs, expanded with ≥1), and **Other work orders** (bottom catch-all for `fleet_work_orders` rows whose `asset_type` is null or whose asset is in neither table; hidden when empty). Asset rows show red/amber/green status dots and tap through to Asset Detail. The Equipment header carries a disabled "Manage equipment" lock chip (tap → "coming soon" toast — equipment management is a future dashboard+driver session).
- **Screen 5 — Asset Detail** (`/tools/fleet/assets/[type]/[id]`). Added 2026-05-22 evening. Reached by tapping any truck/equipment row on the Overview. Shows name, year/make/model, plate (trucks) / serial (equipment), status badge, PM schedule (next-due per service type with PM-tier dots/pills), service history (last 5), and the asset's work orders (open by default; "View all work orders" reveals resolved ones when any exist). Primary action "Log service" opens Log Service Entry **with no work order required** — closes the gap where a routine oil change needed a pre-existing work order. `[type]` is `truck` | `equipment`; an invalid value renders not-found.
- **Screen 3 — Work Order Detail** (`/tools/fleet/work-orders/[id]`). Header (status/source/priority pills), asset, opened/assigned meta, service log (newest 10), "Parts for this asset" (asset_part_fitments → parts + cross-refs + inventory; vendor phone matched by brand → tap-to-call). Actions: Log service entry / Mark resolved / Upload invoice / Assign. **Mark resolved only closes the work order — it does NOT create a service record.**
- **Screen 4 — Log Service Entry.** Two entry points, one screen (`LogServiceEntryScreen`): from a work order (`/tools/fleet/work-orders/[id]/log-service`, `workOrderId` prop) or standalone from an asset (`/tools/fleet/assets/[type]/[id]/log-service`, `assetType` + `assetId` props). Back + post-save navigation follow the entry point. Writes `service_records` (+ `service_line_items` + optional `service_invoices` to the `service-invoices` bucket). When a service type is picked from the asset's `maintenance_schedules`, the schedule's `service_type` enum value is written so the dashboard PM trigger recomputes `next_due_*`. The work order (if any) stays open — resolving is a separate, deliberate action.

### Session 3 — pill-tab UI rebuild (2026-05-30, commit `3bda5d7`)

Built the four locked screens from the Notion design spec (`36c0aa6451b8817b832ac61f3aaf9c2a`, "Work Orders & Fleet Maintenance Driver App — Design Spec"). **UI-only** — no migrations, no API routes; everything goes through `src/lib/fleet/queries.ts` on the RLS-gated supabase client. Darren chose (in-session) a **full pill-tab restructure** of the existing (May 22) Overview + Asset Detail, **keeping the work-order surfacing inside the new tabs**.

- **Screen 1 — Fleet Overview** (`FleetOverviewScreen`): now **Trucks / Equipment / My Log** pill tabs (`<PillTabs/>`). The two summary cards (open WO + PM due) stay above the tab bar (cross-asset glance). Truck `AssetRow`s show **current mileage** appended to the subtitle + a **Reg / Insp / Ins** badge trio (`<ComplianceBadges/>`). Open truck/equipment WOs render at the top of their tab; **orphan/other WOs** moved to the bottom of the **Trucks** tab. The old equipment collapse-toggle is gone (each list owns its tab); the "Manage equipment" lock chip stays on the Equipment tab header.
- **Screen 2 — Asset Detail** (`AssetDetailScreen`): now **History / PM Schedule / Parts** pill tabs. The asset's **open work orders persist above the tabs** (with the View-all-resolved toggle); **Log service** moved to a **persistent bottom footer CTA**. The Parts tab reuses `<PartCard/>`.
- **Screen 3 — Log Service** (`LogServiceEntryScreen`): mileage (trucks) / hours (equipment) now **prefill** from `ctx.asset.currentMileage`/`currentHours` on load, editable. No other change — already matched spec.
- **Screen 4 — My Log** (new): the third Overview pill tab, **not a separate route**. Lists the signed-in user's `service_records` across all assets, newest first, via `fetchMyServiceLog(userId)` (filters `performed_by_user_id`), lazy-loaded on first open. Uses `<ServiceLogEntry assetName=…/>` (new optional asset line).

**Data/shared changes.** `complianceStatus(expiry)` added to `pmStatus.ts` (green ok / amber ≤30d / red expired / gray unknown; trucks columns `registration_expiry`, `inspection_expiry`, `insurance_expiry`). `enrichServiceRecords()` factored out of `fetchServiceRecordsForAsset` (shared by per-asset history + My Log). `fetchAssetDetail` now also returns `parts` (and history limit 5→20). `OverviewAsset` gained `mileage?` + `compliance?`; `AssetDetail` gained `parts`; new types `MyServiceRecordView`, `ComplianceBadges`, `ComplianceStatus`. `PartCard` extracted from `WorkOrderDetailScreen` into `src/components/fleet/PartCard.tsx` (both detail screens import it now). New components: `PillTabs.tsx`, `ComplianceBadges.tsx`.

**Files (new):** `src/components/fleet/{PillTabs,ComplianceBadges,PartCard}.tsx`.
**Files (modified):** `src/lib/fleet/{types,pmStatus,queries}.ts`, `src/components/fleet/ServiceLogEntry.tsx`, `src/screens/fleet/{FleetOverviewScreen,AssetDetailScreen,LogServiceEntryScreen,WorkOrderDetailScreen}.tsx`.

**NEXT smoke test (production, Vercel auto-deploys `3bda5d7`):**
1. Fleet-access user → `/tools/fleet` → three pill tabs (Trucks / Equipment / My Log); summary counts above them. Standard driver still has no Fleet card / Access denied.
2. Trucks tab → each truck card shows mileage + Reg/Insp/Ins badges colored by expiry (set/clear a `registration_expiry` dashboard-side to flip a badge red/amber/green); open truck WOs at top; orphan WOs at the bottom.
3. Equipment tab → equipment list + open equipment WOs + "Manage equipment" lock chip (tap → coming-soon toast).
4. My Log tab → your own service entries across assets, newest first, each naming its asset; empty state for a user who's logged none.
5. Tap a truck → Asset Detail → History / PM Schedule / Parts tabs switch correctly; open WOs persist above the tabs; "View all work orders" reveals resolved; **Log service** is pinned at the bottom on every tab.
6. Asset Detail → Log service → mileage prefilled with the truck's current reading; edit + Save → returns; new entry shows in the History tab AND in My Log.
7. Parts tab on an asset with `asset_part_fitments` rows → part cards with cross-refs + vendor call; none → "No parts mapped to this asset."

**Pre-trip mileage capture (shipped 2026-05-23).** Required Odometer card on the pre-trip inspection's `sign_submit` step (Screen 6), above the certify checkbox. `POST /api/inspection/submit` validates an integer `0 ≤ n ≤ 2,000,000`; on a successful `vehicle_inspections` insert it then writes `trucks.current_mileage` via the admin client — **unconditional** (pre-trip is the live ground-truth reading; no backdated value to guard against) and **non-fatal** (a write failure is logged and the request still 200s — the federally-required inspection row already exists by that point, and an odometer write failure must not block the driver from starting the route). Mileage-based PM flagging is now live fleet-wide; `pmStatus.pmLevelForSchedule` already consumed `current_mileage` — that branch was dormant until this commit.

**Schema gaps flagged 2026-05-22 (Darren-side follow-ups, see `tasks/todo.md`):** no work-order→parts junction (parts shown are asset-fit, labelled "Parts for this asset"); `vendors` table empty (no tap-to-call data yet); no CarQuest/NAPA (priority-1/2) cross-refs seeded; invoice-upload was ❌ in the Notion Build Spec v1.0 access matrix but the approved 2026-05-22 design session supersedes that — driver app uploads invoices.

**NEXT smoke test (production, Vercel auto-deploys commit `46ba851`):**

1. Fleet-access user → Tools Hub shows the Fleet Maintenance card; standard driver → no card at all.
2. `/tools/fleet` → overview renders counts, trucks (13) + equipment (24) with status dots, "No open work orders" empty state (table is currently empty).
3. Create a work order dashboard-side (or DVIR defect) → Tools card red pill + home alert card appear; tap → Work Order Detail.
4. Work Order Detail → Log service entry → fill the form → Save → returns to detail with the new entry in the service log; work order still open.
5. Mark resolved → work order closes, resolved banner shows; confirm no service record was auto-created.
6. Assign → pick a user / Assign to me / Unassign. Upload invoice → pick a service record → camera/file → invoice attached.

---

## Auto-Logout (Shared-Device Hygiene)

Shipped 2026-05-24 (commit `76bb769`). Drivers share company devices; the next driver was picking up the device and finding the previous driver still signed in. Two complementary layers — driver-app only, no migrations, no dashboard, no SMS.

- **Layer 1 — warehouse_return signOut (primary trigger).** When the `warehouse_return` geofence auto-completes the last stop and `/api/complete-stop` returns OK, `StopDetailScreen.tsx` sets `welcomeBackAt` and renders the 6-second "Welcome back — route complete" banner. That same setTimeout (now `async`) clears `localStorage.ptr_session_date`, awaits `signOut()`, and `router.replace('/login')`. The banner finishes naturally — signOut fires only on the trailing edge, so the driver sees the confirmation. Manual `Mark Complete` on warehouse_return is intentionally untouched (no banner there); Layer 2 catches that case next morning.
- **Layer 2 — day-change check (fallback).** `LoginScreen.tsx` writes `localStorage.ptr_session_date = new Date().toISOString().split('T')[0]` immediately after a successful `signIn`, before `router.push('/')`. `AuthContext.tsx`'s `onAuthStateChange` callback checks the key on the `INITIAL_SESSION` event (the first auth event per page load) — if it's missing or not equal to today's date, it removes the key, awaits `supabase.auth.signOut()`, and calls `window.location.replace('/login')` then `return`s before `setUser(...)` runs, so the provider never exposes the stale session to any consumer. **`SIGNED_IN` events are skipped on purpose** — LoginScreen has just stamped the date, and checking inside the SIGNED_IN handler would race the new login and immediately sign the driver out.

**Why this shape (rules to preserve in future sessions):**

- **PWA-safe.** No `setTimeout(midnight)`. On a phone the OS suspends background tabs; the timer would silently miss. App-load checking is the only reliable trigger for a driver-facing PWA.
- **The gate must run before authed UI renders.** The check lives inside `AuthProvider`'s `onAuthStateChange`, not inside a page component. Returning early before `setUser` keeps `loading=true` / `user=null` until the redirect lands, so no consumer ever sees the stale session.
- **Personal-device morning-check signs the driver out.** Per spec, a driver opening the app at home the morning after their shift is signed out on first load — they re-authenticate and go about their day. This is intentional; do not "fix" it.

**Files.** `src/screens/StopDetailScreen.tsx` (Layer 1 hook + `signOut` import at the top), `src/screens/LoginScreen.tsx` (Layer 2 stamp in `handleSubmit`'s success branch), `src/context/AuthContext.tsx` (Layer 2 INITIAL_SESSION check).

**NEXT smoke test (production, Vercel auto-deploys `76bb769`):**

1. Trigger the warehouse_return geofence (or run the route to depot) → confirm the 6 s welcome-back banner runs in full, then app redirects to `/login` with no session.
2. DevTools → Application → Local Storage: set `ptr_session_date` to yesterday → reload any authed route → expect immediate redirect to `/login` before the home screen paints. Console clean.
3. Same-day refresh of an active session → `ptr_session_date` already today → no signOut, no redirect, normal render.
4. Sign in on `/login` → confirm `ptr_session_date` is set to today; reload → still signed in.

---

## Work Orders & Field Issues (Driver App)

Shipped 2026-05-26 — Session 2 of the Work Orders build, sitting on top of dashboard Session 1 (`4e04ac9`: `field_work_orders` table at Migration 073, `profiles.work_order_technician` permission, POST/GET/PATCH `/api/work-orders`, `notifyNewFieldWorkOrder` email).

**Access model.** `profiles.work_order_technician` is a stacked, additive permission, independent of `roles` — same shape as `fleet_maintenance_access`. UI gate: `useWorkOrderTechnician()` (`src/hooks/workOrders/useWorkOrderTechnician.ts`). Route gate: `WorkOrderGate` (`src/components/workOrders/WorkOrderGate.tsx`, mirrors `FleetGate`). `getUserRole`'s SELECT now pulls `work_order_technician`; `UserProfile` carries it. **Reporting an issue is ungated** — any signed-in driver can file a WO from a stop or from the "Report an Issue" Tools Hub card. The **technician queue** (list + detail) is gated on `work_order_technician`.

**Data layer — `src/lib/workOrders/`.** `api.ts` (createWorkOrder POST + updateWorkOrder PATCH cross-app to the dashboard; listMyWorkOrders + getWorkOrder + listTechnicians via RLS-gated supabase client), `types.ts` (FieldWorkOrder row alias, payload shapes, enum unions), `theme.ts` (`WC` palette + PRIORITY_COLOR + STATUS_LABEL). Hooks in `src/hooks/workOrders/` (useWorkOrderTechnician, useOpenWorkOrdersCount). Shared form + gate in `src/components/workOrders/`.

**Cross-app POST is deliberate.** The driver app does **not** insert `field_work_orders` directly via the supabase client. It POSTs `${NEXT_PUBLIC_DASHBOARD_URL}/api/work-orders` with the user's supabase access token in the `Authorization` header. The dashboard route owns (1) `work_order_number` generation, (2) the assignee + super_admins notification email. Shortcutting to supabase would skip the email. PATCH (status transitions, notes) uses the same route. Reads pull straight from supabase under RLS — no side effects to worry about, and the dashboard would just round-trip a SELECT anyway.

**Stop detail — Screen 1.** `src/screens/StopDetailScreen.tsx` — a faint-red-bordered "Report an issue with this order ›" link sits directly under the 3-button QuickAction grid inside the action card. Tap → `/route/[routeId]/stop/[stopId]/report-issue`. After submission, `ReportIssueScreen` stashes `{workOrderNumber, assigneeName, ts}` in `sessionStorage.setItem(reportIssueSuccessKey(stopId), …)`; on mount, the stop screen reads + clears the key and swaps the link for a 6 s green confirmation pill (`PT-#### · Assignee notified`). Re-mount after the pill expires shows the normal link again (key is consumed once).

**Report Issue form — `ReportIssueForm` (Screens 2A + 2B).** One component, two modes — `stop` prop populated → Screen 2A; undefined → Screen 2B.
- **Screen 2A — stop context.** Locked dark "Issue for order #X · CustomerName" header (not editable). Item picker iterates `stop.items` (from the existing TG-sync'd `dispatch_stops.items` JSON). Selected item → `asset_type='field_item'`, `asset_name=item.name`. "Item not in this order?" fallback row → inline name + serial fields.
- **Screen 2B — standalone.** Asset type 4-toggle: Truck / Equipment / Field item / Other. Truck & Equipment paths debounce-search `trucks` (name/plate/VIN) and `non_truck_assets` (name/serial_number) directly via supabase with a 250 ms delay, up to 8 results. No match → "Enter manually" card with name + serial. Field item / Other → free-text name + serial. Optional "Related order" search debounce-searches `dispatch_stops` by `tapgoods_order_token` / `customer_name` / `company_name` (300 ms, 8 results) — picking one sets `stop_id` + `tapgoods_order_number` + `customer_name` on the payload.
- **Common fields.** Issue description (required textarea), Priority toggle (Low/Medium/High, color-coded), Assign-to toggle (Myself shows the user's avatar/display_name chip; Someone else shows a picker of profiles where `work_order_technician=true OR roles cs '{super_admin}'`, with the current user filtered out), Billing toggle (Decide later / Bill customer / No charge — default Decide later).
- **Submit.** `POST ${NEXT_PUBLIC_DASHBOARD_URL}/api/work-orders` with bearer token. Response shape accepted either flat (`{id, work_order_number, …}`) or nested (`{work_order: {…}}`).

**Screen 3 — Work Orders list (`/tools/work-orders`).** Tabs: Open / In Progress / Done with count chips. Each card carries a 4 px left border in priority color (red high · amber medium · green low). Card body: WO number (Archivo), asset name, issue description clamped to 2 lines, creator display_name + short date. Pulls all rows via `listMyWorkOrders()` then batches a `profiles` SELECT for creator names. Floating gold "+" FAB at bottom-right opens Screen 2B. Gated by `WorkOrderGate`.

**Screen 4 — Work Order detail (`/tools/work-orders/[id]`).** Read-only record — Status / Priority / Billing pills, Asset card, Issue card, Related order card (only when a `tapgoods_order_number` / `customer_name` / `stop_id` is present), Notes log, Meta (created by, created date, assigned to, updated date). Sticky bottom action bar: "Mark In Progress" (only shown when status='open'), "Mark Complete" (status→done), "+ Note" (gold; opens a bottom-sheet modal with a textarea). Notes are appended client-side with a timestamp prefix and PATCHed as the full new value — works against either dashboard semantic (replace OR append). Gated by `WorkOrderGate`.

**Tools Hub cards (`ToolsScreen.tsx`).** Two new wide cards slot in between the existing Fleet Maintenance card and the Generators card.
- **"Report an Issue"** — ungated; alert-triangle icon in a coral wrap; subtitle "Truck, equipment, or field item". Opens `/tools/report-issue`.
- **"Work Orders"** — technician-gated via `useOpenWorkOrdersCount` (renders null without access); clipboard-list icon in a gold wrap; subtitle "Field issues filed by drivers"; red "N open" pill when `status IN ('open','in_progress')` > 0. Opens `/tools/work-orders`.

**Files (new).**
- `src/lib/workOrders/{api,types,theme}.ts`
- `src/hooks/workOrders/{useWorkOrderTechnician,useOpenWorkOrdersCount}.ts`
- `src/components/workOrders/{ReportIssueForm,WorkOrderGate}.tsx`
- `src/screens/workOrders/{ReportIssueScreen,WorkOrdersListScreen,WorkOrderDetailScreen}.tsx`
- `src/app/route/[routeId]/stop/[stopId]/report-issue/page.tsx`
- `src/app/tools/{report-issue,work-orders}/page.tsx`
- `src/app/tools/work-orders/[id]/page.tsx`

**Files (modified).** `src/types/auth.ts` (UserProfile + `work_order_technician`), `src/lib/auth.ts` (getUserRole SELECT extended), `src/types/supabase.ts` (regenerated from dashboard project), `.env.local.example` (`NEXT_PUBLIC_DASHBOARD_URL` added with prod default), `src/screens/StopDetailScreen.tsx` (link + post-submit pill, plus the import from ReportIssueScreen), `src/screens/ToolsScreen.tsx` (two new cards + icons + hook import).

**Required env config — Darren must set this before the feature works.** `NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.partytimerentals.com` must be added to the **driver-app** Vercel project (production + preview). The example file's default value is correct for production; local dev needs `http://localhost:3000` (or whatever port the dashboard runs on) in `.env.local`. Without it, `createWorkOrder()` throws "NEXT_PUBLIC_DASHBOARD_URL is not configured" and the form's Submit button reports the error inline.

**NEXT smoke test (production, after the env var is set and Vercel redeploys):**

1. Standard driver (no `work_order_technician`): Tools Hub shows the "Report an Issue" card; the "Work Orders" card is **absent**. Tools Hub looks otherwise unchanged.
2. Open any delivery stop → confirm the "Report an issue with this order ›" link sits below the 3-button quick-action grid. Tap → form opens with locked context bar showing `#orderNumber · CustomerName`, item picker lists all stop items.
3. Pick an item, enter description, leave defaults, Submit → green confirmation panel briefly, then returns to the stop. Confirmation pill `PT-#### · You notified` shows for 6 s. Email lands in inbox.
4. Same stop, tap link again → tap "Item not in this order?" → enter name + serial → Submit. Verify the WO row has the typed values.
5. Tools Hub → "Report an Issue" (standalone) → Truck path → type partial truck name → results appear → pick one → Submit. Confirm dashboard's `field_work_orders` shows `asset_id=<truck.id>`, `asset_type='truck'`.
6. Same flow, search returns no results → "Enter manually" → submit with manual name. Confirm `asset_id=null`, `asset_type='truck'`, `asset_name=<typed value>`.
7. Toggle a profile's `work_order_technician=true` dashboard-side. Refresh driver app → Tools Hub now shows the "Work Orders" card. Open it → tabs render with counts → tap a card → detail screen.
8. On detail: Mark In Progress → tab counts update. Mark Complete → moves to Done tab. + Note → modal → save → notes log shows timestamped entry.

## AVA Phase 1 (Driver App)

Spec: Notion `3550aa6451b881f19285e369387b75b6` ("Ava — AI Layer Master Spec"). Phase 1 ships as a **complete branch** — `feature/ava-phase1` — per the May 24, 2026 strategy decision. No partial rollouts. All nine components must be in before merging to `main`. Per-session work logs in `docs/CHANGELOG.md`.

### Session 1 — 2026-05-27 (commit `c43192c`)

**Schema (3 migrations).**

- `20260527013_ava_profile_columns.sql` — `profiles.checklist_enabled` (default true), `personality_preference` text default `'direct'` with CHECK in `('direct','personality')`, `stats_enabled` default false. Driver-survey-derived defaults: most drivers leave checklist on, most prefer direct tone, most skip stats (Joey opts in on stats; Dylan opts in on personality; Joey opts out of checklist).
- `20260527014_ava_conversations.sql` — append-only Q&A log. `surface` CHECK in `('driver_home','dispatch','will_call','fleet','warehouse')`. `confidence` CHECK in `('high','low','unanswered')`. Indexes: `(driver_id, created_at DESC)` + partial `(needs_review, created_at DESC) WHERE needs_review = true`. RLS: driver SELECT/INSERT own; super_admin SELECT all (`EXISTS … 'super_admin' = ANY(p.roles)`).
- `20260527015_ava_stop_notes.sql` — address-keyed notes (NOT order/stop-keyed) for AVA Remembers. Notes persist across seasons/years. `author_id` REFERENCES profiles ON DELETE SET NULL. `photo_urls text[] DEFAULT '{}'`. Index on `address_key`. RLS: authenticated SELECT all, INSERT own (`author_id = auth.uid()`), UPDATE/DELETE only on rows the user authored.

Filename convention this session: `YYYYMMDD<NNN>_*.sql` (no underscore between date and sequence). Required because three files on the same day all collide as version `YYYYMMDD` under the more recent `YYYYMMDD_NNN_*.sql` convention — the CLI parses everything before the first `_` as the version. The concat form gives unique versions (`20260527013/014/015`). Existing files stay on their original naming.

**Tier 1 chip — `src/components/AvaChip.tsx`.** 32 px blue square (`#0000FF`) with five 2 × 12 px white bars; CSS-staggered pulse (`ava-wave` keyframes in `globals.css`, 1 s ease-in-out infinite, 120 ms stagger per bar). Tap opens a fixed-position dark bottom-sheet drawer (`#0F172A`, max-width 448 px, safe-area-aware padding) with a 40 px waveform, "AVA" label, ×-close, and the placeholder message. Backdrop or × dismisses. No state outside the component; no props except optional `ariaLabel`.

Wired into 6 screens to the right of each screen's existing rightmost header element, inside a `display:flex; alignItems:center; gap:10` wrapper:
- `DayRouteSelectorScreen` (Home) — next to the eyebrow-row PTR mark.
- `ToolsScreen` / `TrainingScreen` — same pattern.
- `ProfileScreen` / `RouteListScreen` — next to `<BrandMark/>`.
- `StopDetailScreen` — next to the distance pill (the one screen without a brand mark in its header).

No centralized layout shell — each screen owns its own hero/header, so wiring is per-screen. Future Tier 2 (morning card) and Tier 3 (per-stop intel button) ship in later sessions on the same branch.

**Placeholder drawer is intentional** — full conversation UI lands in a later Phase 1 session. The drawer's shell (bottom-sheet, dark, safe-area-aware) is reusable for the real conversation view; the body copy just changes.

### Dispatcher Notes + Stop Notes surface — 2026-05-28 (commits `104e652`, `943aec0`, `2673f3c`, `af69ed2`, `48ab75c`)

New scope on the branch (not one of the original 9 components). Surfaces dispatcher notes (route + stop) and TapGoods order notes to drivers. **All reads — no migrations, no new tables, no new API routes.** Plan: `docs/superpowers/plans/2026-05-28-ava-dispatch-and-stop-notes.md`.

**Data plumbing (`104e652`) — the one schema-adjacent change.** The existing `GET /api/routes` query did NOT return `routes.dispatcher_notes`, and `dispatch_stops` returned `dispatcher_notes`/`notes` but NOT the five TapGoods note fields. We extended the **existing** SELECTs (never a separate endpoint) and threaded the columns through `SupabaseRouteRow`/`SupabaseStopRow` + the `transformSupabase` builders onto `Route.dispatcher_notes` and `Stop.{notes_additional_delivery, notes_employee_authored, notes_flip, notes_set_by_time, notes_strike_time}`. **Rule for future sessions:** if a screen needs a `routes`/`dispatch_stops` column, add it to this SELECT + `supabaseTransform` — do not spin up a new endpoint. (`dispatcher_notes` on stops was already returned; `dispatch_stops.dispatcher_notes` ≠ `routes.dispatcher_notes` — the former is the per-stop note already shown on Stop Detail, the latter is the route-level note that had no driver-app surface before this work.)

**Field ownership (do not re-derive):** `dispatcher_notes` (route + stop) is dashboard/dispatcher-owned and never written by TapGoods sync. The five `notes_*` fields are TapGoods-synced (written by `partytime-dashboard/src/services/tapgoodsSync.ts`, NOT this repo). `ava_stop_notes.note` is driver-authored AVA Remembers, address-keyed.

**Component 1 — Morning brief FROM DISPATCH (`943aec0`).** `AvaMorningCard` takes a new `routeDispatcherNote` prop (passed from `DayRouteSelectorScreen` as `primaryRoute?.dispatcher_notes`; driver app is single-route per login). Renders a gold "FROM DISPATCH" block as the **first** content block (after the AVA identity row, before the message) and **prepends it to `speak()`** in `handlePlayBrief`. A route note is an independent **card-visibility trigger** (a day with only a dispatch note still shows the card).

**Component 2 — stop-notes count line + review sheet (`2673f3c`).** `stopsWithDispatchNotes` = customer stops (depot excluded) whose `dispatcher_notes` is non-null. When > 0, a tappable count line opens **`AvaDispatchNotesSheet`** (new, read-only, mirrors the `AvaChecklistSheet` dark sheet). Also a card-visibility trigger. No query change — `dispatch_stops.dispatcher_notes` was already returned.

**Component 3 — pre-launch notes sheet (`af69ed2`).** **`StopNotesPreSheet`** (labeled sections: DISPATCHER NOTE / DELIVERY INSTRUCTIONS / STAFF NOTE / FLIP-TEARDOWN NOTE / TIMING NOTE / AVA REMEMBERS; **no backdrop-dismiss, no auto-dismiss** — driver controls close). Wired to **BOTH** `handleSendEta` (Send ETA Text) and `handleNavigateRequest` (Open in Maps) with a **once-per-stop guard** (`seenNoteStopsRef` Set keyed by `stop_id`, resets on unmount). Context-aware CTA: `"Got it"` (ETA path → ETA send proceeds) / `"Got it — Navigate Now"` (navigate path → maps launch). **`handleNavigateRequest` was split** into the notes-gate wrapper → `proceedNavigateRequest` (the original early-pickup-gate body) so the notes sheet and the early-pickup gate chain instead of bypassing each other. `notes_flip` is **pickup-only** in this sheet. AVA Remembers text fetched via `listNotesForAddress(avaAddressKey)`, gated on the existing `avaNoteCount`. Null notes → no sheet, action proceeds friction-free.

**Component 4 — Stop Detail Order Notes + route-list glyph (`48ab75c`).** Collapsible **"Order Notes (N)"** section on Stop Detail (above the AVA Remembers entry surface; hidden on depot stops + when empty) listing all non-null TapGoods note fields. Here `notes_flip` shows on **all** stop types (informational) — the pickup-only gate is specific to Component 3. The existing blue **"Note from dispatch"** auto-modal + persistent card are untouched — **label wording stays "Note from dispatch"** (Darren confirmed; matches dashboard precedent, despite the spec saying "Dispatcher Note"). `RouteListScreen` shows a small blue note glyph next to the customer name when `dispatcher_notes` is present.

**Files (new):** `src/components/ava/AvaDispatchNotesSheet.tsx`, `src/components/ava/StopNotesPreSheet.tsx`.
**Files (modified):** `src/app/api/routes/route.ts`, `src/lib/supabaseTransform.ts`, `src/types/index.ts`, `src/components/ava/AvaMorningCard.tsx`, `src/screens/DayRouteSelectorScreen.tsx`, `src/screens/StopDetailScreen.tsx`, `src/screens/RouteListScreen.tsx`.

**NEXT smoke test (Vercel preview, branch `feature/ava-phase1`):**
1. Route with `routes.dispatcher_notes` set → Home AVA card shows "FROM DISPATCH" first; "Hear your morning brief" speaks the dispatch note first, then the brief. Null → no block.
2. ≥1 stop with `dispatch_stops.dispatcher_notes` → count line renders; tap → read-only sheet lists each stop + note. Zero → no line.
3. Day with ONLY a route note (no checklist/stats/AVA-notes/stop-notes) → card still renders (new-trigger regression guard).
4. Stop with a note → "Open in Maps" → pre-launch sheet with correct sections; "Got it — Navigate Now" launches maps. Re-tap same stop → no sheet (seen-guard), early-pickup gate still applies on a hard-tier pickup.
5. Stop with a note (re-open to reset guard) → "Send ETA Text" → sheet; "Got it" → ETA sends. Then "Open in Maps" → no sheet (already seen this stop).
6. Stop with NO notes → neither button shows a sheet; both proceed.
7. Pickup stop with `notes_flip` → FLIP/TEARDOWN NOTE in the sheet; delivery stop with `notes_flip` → NOT in the sheet, but DOES appear in Order Notes.
8. Stop with ≥1 TapGoods note → collapsed "Order Notes (N)" on Stop Detail; expand → labeled notes. None / depot → hidden.
9. `dispatcher_notes` stop → blue "Note from dispatch" auto-modal + persistent card still work.
10. Route list → stops with `dispatcher_notes` show the blue note glyph; others don't.

### Morning-card count fixes — 2026-05-28 (commits `71ec8a1`, `dec52c8`)

Two correctness fixes to `src/components/ava/AvaMorningCard.tsx` after Darren tested the card against a live route. Both are about **what counts**, and both are invariants to preserve in future sessions.

- **Card visibility is decoupled from `checklist_enabled` (`71ec8a1`).** The card renders when ANY trigger is true: `stats_enabled`, `ava_stop_notes` hits > 0, OR (`checklist_enabled` AND dependency hits > 0). Turning the checklist off hides only its offer **block**, not the whole card. The stats block now renders whenever `stats_enabled` (was gated on `weekStopsCompleted > 0`), showing a zero-state ("No stops completed yet this week.") on a slow day instead of vanishing — which also makes `stats_enabled` a count-independent card trigger.
- **All counts run through `customerStops`, not raw `dayStops` (`dec52c8`).** `customerStops` = `dayStops` minus `warehouse_return` / `warehouse` depot stops, derived once via `useMemo`. Every count routes through it: `stopCount`, `codCount`, the `tentCount` item source, the checklist manifest, and the stop-note address lookup. A route ending at the depot no longer counts the return leg as a stop.
- **`countTentItems` requires category AND name match (`dec52c8`).** `src/lib/ava/dependencyHits.ts` → `isTentItem` gates on `category.includes('tent')` **AND** name contains one of `tent` / `canopy` / `marquee`. The old category-only match pulled sidewalls, wind walls, and door walls (all filed under TapGoods category "TENTS") into the tent count. Qty is still summed on matched items. See lessons.md → TapGoods "TENTS" category miscategorization.

### Profile Settings UI — 2026-05-28 (commit `35eb566`)

Driver-self-service controls for the three AVA preference columns, which until now were only changeable via SQL. New "AVA Preferences" section on the Profile screen (between "My Activity" and "Account").

- **Three controls** (`src/components/ava/AvaPreferencesSection.tsx`): Morning checklist toggle → `checklist_enabled`; AVA voice style segmented control (Direct | Personality) → `personality_preference`; Weekly stats toggle → `stats_enabled`. Toggles are gold-when-on / grey-when-off; the segmented control matches the gold-active pattern used on the morning card's voice/text toggle. Card styling mirrors the existing Profile sections (`C.paper` + `1.5px solid C.ink` + radius 16).
- **Write path is a server route, NOT a direct client UPDATE — important.** `profiles` has RLS enabled with **SELECT-only policies** (`profiles_authenticated_read_all`, `users_read_own_profile`); there is **no UPDATE policy**, so a `supabase.from('profiles').update(...)` from the browser client silently affects 0 rows. Adding a broad `auth.uid() = id` UPDATE policy was rejected because it would let a driver mutate `roles` / `fleet_maintenance_access` / `work_order_technician` on their own row — a privilege-escalation hole. Instead, **`PATCH /api/profile/ava-preferences`** (`src/app/api/profile/ava-preferences/route.ts`) identifies the caller via the cookie session client (`getUser()` — id can't be spoofed) and performs an **admin-client UPDATE scoped to the three known columns only**, with per-field validation. Same session+admin pattern as `/api/inspection/*`. If a future session needs more driver-editable profile fields, extend this route's allow-list — do **not** add a table-level UPDATE policy.
- **Optimistic updates via `AuthContext.updateProfile(patch)`** (new). The provider exposes a `updateProfile` that merges a `Partial<UserProfile>` into the in-memory profile state. Each control flips the value optimistically, PATCHes the server, and on failure reverts + shows a "Couldn't save preference — try again" toast. Because `AvaMorningCard` / `getMorningMessage` read `profile.*` from the same context, preference changes take effect on the next Home mount with **no logout/login**.

**Files.**
```
src/app/api/profile/ava-preferences/route.ts   (new — PATCH, admin-client, 3-column allow-list)
src/components/ava/AvaPreferencesSection.tsx    (new — section + toggle + segmented control)
src/context/AuthContext.tsx                      (+ updateProfile in the context value)
src/screens/ProfileScreen.tsx                    (+ import + <AvaPreferencesSection/>)
```

### Bug Fix Pass — 2026-05-27 (commit `4ddcadb`) — pre-merge

Three bug fixes surfaced by the Session 5 preview deploy. No new features, no migrations.

- **Bug 1 — Stop Detail note entry missing.** The dashed "Leave a note for the next driver" link was nested inside the action-card branch (`!isCompleted` → `!isOnStandby` → `!isWarehouseReturn` → `!isWarehouse` → `!isDepotStop`), so completed/standby stops dropped it entirely. Relocated the block to sit AFTER the manifest as a stop-level sibling, gated only on `!isDepotStop`. The Tier 3 hero pill (top of screen, `avaNoteCount > 0`) stays in place — both surfaces share the same `setAvaNoteOpen` handler and the same `avaNoteCount` source. Colors retuned for the light/paper surface (dashed link was originally styled for the dark action card).
- **Bug 2 — Home quiet-state after route delete+recreate.** Two compounding stale-state bugs. (a) `AppStateContext.loadDay` short-circuits when `state.loadedDate === date && !state.error`, so the soft `loadDay(today)` mount call in DayRouteSelectorScreen never refetched after a dashboard-side route swap. `routes` still held the deleted Route A → `primaryRouteId` was stale → `useInspectionStatus` queried the old route's inspection (rows survive route delete) → `inspected = true` → quiet state hid everything. **Fix:** Home now force-refreshes via `loadDay(today, true)` on mount, gated by `initialLoadRef` so the loadDay-identity churn from its own `useCallback` deps doesn't double-fetch. (b) `useInspectionStatus` never reset `inspection` to null when routeId changed — the previous route's inspection lingered in `useState` while the new fetch was in flight, causing the "flash then collapse" pattern. **Fix:** `setInspection(null)` at the top of every effect run.
- **Bug 3 — iOS Safari TTS autoplay block.** `AudioContext` starts in `'suspended'` state until a user gesture in the same task; the Session 5 auto-speak `useEffect` fell through to the robotic WebSpeech synth on first Home load. **Fix (Option A):** removed the auto-speak effect entirely. The morning card now shows a "▶ HEAR YOUR MORNING BRIEF" gold-pill tap button below the message (visible only in voice mode). The driver's tap is a real user gesture, so AudioContext unlocks cleanly and ElevenLabs plays in full. Cleanup `useEffect` still calls `stopSpeaking()` on unmount. A `playTokenRef` invalidates stale `finally()` callbacks when the user double-taps the button or toggles to text mid-playback.

**Files.**
```
src/screens/StopDetailScreen.tsx       — relocate AVA note entry block from action card to post-manifest
src/screens/DayRouteSelectorScreen.tsx — ref-gated force-refresh on Home mount
src/hooks/useInspectionStatus.ts       — reset inspection state on routeId change
src/components/ava/AvaMorningCard.tsx  — replace auto-speak with manual play button
```

### Session 5 — 2026-05-27 (commit `a844a4d`) — ElevenLabs TTS + functional voice/text toggle

**`src/lib/ava/elevenLabs.ts` (new).** Single call site is `speak(text)` — tries ElevenLabs (`POST /v1/text-to-speech/{voice_id}` with `xi-api-key` header, `eleven_turbo_v2` model, `voice_settings: { stability: 0.5, similarity_boost: 0.75 }`), falls through to `window.speechSynthesis` on any error (no toast, no log). `stopSpeaking()` cancels both layers — held in module-level refs (current AudioBufferSourceNode + current AudioContext + `speechSynthesis.cancel()`). Voice ID `uYXf8XasLblADfZ2MB4u` is hardcoded. API key read from `NEXT_PUBLIC_ELEVENLABS_API_KEY` — exposed in the browser bundle, acceptable for Phase 1 because the driver app is gated to authenticated PTR employees, not the public.

**AvaMorningCard wiring.** New `voiceMode` (default `true`) + `isSpeaking` `useState`, plus a `hasSpokenRef` guard so AVA reads the morning message **at most once per card mount**, even if the user toggles voice→text→voice within the same mount. A `useEffect([shouldRender, voiceMode, message])` fires the speak call when the card is first visible AND voice is on AND `hasSpokenRef.current` is false; cleanup calls `stopSpeaking()` on unmount or when the toggle flips away from voice. Only the morning **message** is spoken — checklist offers, notes nudges, and stats blocks are deliberately silent (Session 6 may wire per-item TTS).

**Speaking indicator.** Below the morning message paragraph, a small flex row with five pulsing mini-bars (1.5×8px, same `ava-wave-bar` class as the chip) + muted "AVA is speaking…" label. Visible only while `isSpeaking === true`.

**Voice/Text toggle (functional).** Two-button pill anchored bottom-right of the card. Active button is `C.gold` (#FFB800) with `C.ink` text; inactive is transparent with `C.muted` text. Tapping the inactive button calls `handleToggle(next)`, which: (a) returns early if same mode, (b) calls `stopSpeaking()` + `setIsSpeaking(false)` if switching away from voice mid-playback, (c) `setVoiceMode(next)`. State is session-only (`useState`); no DB write this session. Toggle resets to voice default on every fresh card mount.

**AvaChip drawer mic stub.** Inside the bottom-sheet drawer body (below the placeholder copy), a full-width blue "HOLD TO TALK TO AVA" button with a 18×18 mic SVG glyph. UI only — `onClick` shows a fixed-position toast pill near the top safe area ("Voice input coming in the next update."), auto-dismissed after 2s via `setTimeout`. Session 6 wires real STT + SOP lookup behind this button.

**iOS Safari autoplay caveat.** `AudioContext` on iOS Safari starts in `'suspended'` state until a user gesture in the same task. Auto-speak on first card mount (post-login navigation) may be blocked there — `elevenLabs.ts` attempts `ctx.resume()` defensively, and if the play call is still blocked, the call fails silently and the message stays visible as text. Subsequent voice plays after any user gesture (toggle press, navigation) are unaffected.

**Files.**
```
src/lib/ava/elevenLabs.ts                       (new)
src/components/AvaChip.tsx                       (+ useEffect, mic glyph SVG, toast)
src/components/ava/AvaMorningCard.tsx            (+ TTS hook, indicator, functional toggle)
.env.local.example                               (+ NEXT_PUBLIC_ELEVENLABS_API_KEY block)
```

Vercel env var `NEXT_PUBLIC_ELEVENLABS_API_KEY` is set on **Preview + Production** as of 2026-05-27 (confirmed via `vercel env ls`).

### Out of scope for this session (Phase 1, future sessions)

- Profile-settings UI for the three new opt-in toggles (columns are in the DB; the UI is later — pair with whichever screen lets a driver flip their own stats opt-in).
- Persisting voice/text preference to DB (today it's session-only).
- TTS on checklist items, stop notes, or per-stop arrival intel.
- Real STT/voice input + SOP lookup behind the AvaChip mic button (Session 6).

### Branch hygiene rules (current and active)

- ALL AVA Phase 1 work commits to `feature/ava-phase1` ONLY. Vercel previews this branch; production stays on `main`.
- Unrelated work continues to commit to `main` (e.g. an urgent bug fix, an arcade tweak — anything outside the AVA scope).
- Two-branch protocol from Notion: declare which branch each session is on at session start. No crossing branches mid-session.
- Do NOT merge `feature/ava-phase1` to `main` until Darren explicitly says all 9 components are in.

### NEXT smoke test (Vercel preview deploy, branch `feature/ava-phase1`)

**Session 1 — chip + schema** (already deployed; smoke-test list preserved for completeness):

1. Visit any of Home / Route list / Stop detail / Tools / Training / Profile. Chip renders top-right, five bars pulse.
2. Tap chip → bottom-sheet slides up, dark background, AVA label + placeholder copy. Backdrop tap closes; × button closes.
3. Dashboard side: `SELECT column_name, column_default FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('checklist_enabled','personality_preference','stats_enabled');` returns the three rows with correct defaults.
4. `SELECT count(*) FROM ava_conversations;` and `SELECT count(*) FROM ava_stop_notes;` both return 0 (no writers yet) — confirms tables exist and the user can read under RLS.
5. Try to INSERT into `ava_conversations` with a `driver_id` that's not `auth.uid()` — should be rejected by RLS.

**Session 5 + Bug Fix Pass — TTS + voice/text toggle + relocated note entry + route-change refresh:**

1. Load Home as a driver whose AVA morning card is eligible to render. With **voice mode on** (default), the message renders silently with a "▶ HEAR YOUR MORNING BRIEF" gold-pill tap button below the message. **No auto-speak** — Option A intentionally.
2. Tap the play button → ElevenLabs reads the message in full (natural, non-robotic). "AVA is speaking…" indicator with mini-waveform appears in place of the button. iOS Safari works because the tap is a real gesture.
3. Tap **TEXT** mid-playback → audio stops, indicator disappears, play button disappears (voice mode is off).
4. Tap **VOICE** again → play button reappears. Tap it → ElevenLabs replays.
5. Disconnect from internet (DevTools → Network → Offline) → reload → tap play → WebSpeech fallback fires (robotic system voice). Same fallback if `NEXT_PUBLIC_ELEVENLABS_API_KEY` is unset on the deploy.
6. Tap the **AVA chip** (any screen) → drawer opens → tap blue "HOLD TO TALK TO AVA" → "Voice input coming in the next update." toast pill near the top → auto-dismisses after 2s.
7. **Stop Detail — note entry placement.** On any non-depot stop (delivery / pickup / service), scroll past the manifest. A dashed "Leave a note for the next driver →" link (muted color) renders directly below the manifest when no notes exist; an amber "AVA has a note about this stop →" button when ≥1 note exists. This now renders on completed stops too (was previously gated inside the action card).
8. **Tier 3 hero pill.** Open a stop with a saved note → the amber "AVA KNOWS THIS STOP" pill renders below the address in the hero. Open a stop with no notes → no pill (correct).
9. **Home — route delete+recreate refresh.** Dashboard-side: delete the driver's route and recreate it for the same truck on the same date. Driver-side: navigate from Home → Routes → Home. Home should now show the full briefing (hero + day list + AVA card + Gold CTA) for the new, uninspected route. Before the fix, Home stayed quiet because `loadDay` short-circuited on the cache and the stale Route A's inspection lingered.

---

## Session close (autonomous — no permission needed)

1. Update `CLAUDE.md` (this file) and the relevant `docs/claude/*.md` sub-doc with new decisions / rules / tech debt.
2. Append to `tasks/todo.md` (open follow-ups) and `tasks/lessons.md` (patterns). Add session entry to `docs/CHANGELOG.md`.
3. Generate a session summary for Darren. Tell him: "Here's the summary for chat-Claude to update Notion." Do not write to Notion.

Full protocol: `docs/claude/doctrine.md` → "Session Close Protocol".

---

## Where things live

| What | Where |
|---|---|
| Stack, infrastructure, design system, per-feature architecture, NEXT smoke tests | `docs/claude/stack.md` |
| Operational doctrine, division of labor, pre-push verification, TapGoods learnings | `docs/claude/doctrine.md` |
| Open tech debt (with dates) | `docs/claude/tech-debt.md` |
| Open and pending tasks | `tasks/todo.md` |
| Patterns and corrections (review at session start) | `tasks/lessons.md` |
| Open questions for Darren | `tasks/open-questions.md` |
| Per-session work log | `docs/CHANGELOG.md` |
| Party Kong v3 scope (4-session phased plan) | `tasks/party-kong-v3-scope.md` |
| Per-session summaries | `tasks/session-summary-*.md` |
| Migration files | `supabase/migrations/` (14-digit timestamp naming) |

Order of authority: Darren AI Protocol parent page in Notion → child pages → this CLAUDE.md → sub-docs under `docs/claude/` → repo docs → current external info.

---

## Autonomy rules (no permission needed)

Run builds, installs, migrations (`supabase db push` / `supabase db query --linked --file`), linting, tests, dev servers, type regens. If a step fails, debug and retry. Stop and ask Darren only when: (1) the action would permanently delete data with no rollback, (2) a required secret is missing from `.env` and cannot be inferred, or (3) two valid approaches have fundamentally different architecture implications that cannot be reversed.
