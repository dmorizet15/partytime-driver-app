# Changelog — partytime-driver-app

Per-session work log. Most recent entry on top. Architecture decisions, rules, and active flags live in `CLAUDE.md`. Roadmap and progress live in Notion (PTR Master Build Checklist + Build Progress Dashboard).

---

## 2026-07-02 — Equipment Return Tracking — reservation-scoped ledger revision (**Migration 029** `equipment_return_alerts`; v2.3.0)

Darren design correction, same day as the initial ship: the pairwise pickup↔linked-delivery resolution was wrong for jobs where delivery and pickup are split across stops for different equipment (tent delivered separately from inflatable; inflatable picked up before the tent). The tent crew must see whatever is LEFT after the inflatable crew's pickup — modeled as a running ledger per `(reservation_id, equipment_key)`, not a stop pair. Migration 028, the shared rules config, the delivery capture section, and the `runStopComplete` chokepoint were reused untouched.

- **Ledger core — `src/lib/equipmentReturns/ledger.ts`** (pure): `running_balance = SUM(quantity over the reservation's DELIVERY rows) − SUM(quantity over its COMPLETED PICKUP rows, excluding the current stop)`. Final-pickup recompute includes ALL pickup rows (the final stop's `completed_at` may not be stamped when its write lands). A stop with no rows contributes 0 — no special handling. `traceLines()` yields the per-stop breakdown for the alert email.
- **GET /api/stops/equipment-returns rewritten** to the ledger (the linked_stop_id/fallback resolution is gone). Response: `returns` (balance > 0 — the reminder cards on StopDetail/RouteList/RoutePreview, shape unchanged) + `balances` (delivered/retrieved/balance — the capture prefill). Same query, two consumers. `dispatch_stops.reservation_id` was already indexed live (`dispatch_stops_reservation_id_idx`) — no new index needed.
- **NEW POST on the same route — the pickup-completion path.** Cookie-authed + crew-of-route gated; upserts the entries (service-role), then checks LIVE whether any other pickup on the reservation is incomplete — `required_pickup_count` is deliberately NOT the source of truth (live: **31** multi-pickup reservations vs 23 pickups carrying the flag — differs from the 23 reported last session, noted per spec). Final pickup + nonzero balance → dispatch alert; **intermediate pickups never alert** (a partial retrieval mid-job is normal).
- **Alert — Migration 029 `equipment_return_alerts`** (PK `reservation_id`) = once-per-reservation insert-gate so offline-queue replays can never double-email; the stamp is released on a failed send and the POST answers `retryAlert: true` so the client queue keeps retrying until the email lands. **Email — `src/lib/equipmentReturns/alertEmail.ts`**: Resend HTTP API, per-key delivered/retrieved/net + which stops/dates contributed (traceable, not just a number). The checkoff discrepancy sender lives in the DASHBOARD repo, so this app needs its own **`RESEND_API_KEY` in Vercel — inert with a loud log until Darren sets it** (the NOTION_API_KEY precedent). Optional `EQUIPMENT_ALERT_EMAIL_TO`/`_FROM` overrides (defaults dispatch@partytimerentals.com).
- **Pickup capture — `EquipmentPickupSection`** (StopDetail pickup, below the retrieve card): mirrors the delivery section (same StepBtn/groups/rule matching) but **pre-filled with the running balance**; per-row confirm circle — one tap accepts the shown number, stepping corrects and auto-accepts; below-prefill entries get a non-blocking inline "fewer than expected — is that right?" note. Rendered rules = rules matching the stop's items ∪ keys with balance > 0 (a final tent pickup still surfaces leftover china racks). Unconfirmed rows write NOTHING — never a silent auto-confirm; an ignored section on the final pickup fires the alert, which is honest. Soft prompt — completion never gated.
- **Service:** `commitEquipmentReturns` gains a `stopType` arg — pickup POSTs (even with zero confirmations, so the final check always runs) and queue entries are tagged `kind: 'delivery' | 'pickup'` (pickup 400/401/403 = permanent drop; network/5xx/`retryAlert` = retried from `loadDay`).
- **Verified:** ledger smoke **12/12 PASS** — scenario (a) exact tent+inflatable sequence, full retrieval → tent crew sees 0, no alert; (b) partial (1 of 2) → tent crew sees 1; 0-found final → exactly a 1-unit shortfall with full stop/date trace; (c) single-delivery/single-pickup behavior identical to pre-ledger; (d) intermediate below-prefill never alerts (finality is the live query), own-stop + incomplete-pickup exclusions, over-report flags. **Live-DB round trip** on a real 2-delivery/2-completed-pickup reservation (`90f17402…`): mid-job view = 1 expected → final recompute = 1 shortfall → alert stamp insert-once (replay loses) → cleaned up. Build green (38 pages). **Pending: on-device smoke + `RESEND_API_KEY` in Vercel.**
- **v2.3.0** — What's New: pre-filled pickup counts + cross-crew carry-over bullets.

---

## 2026-07-02 — Equipment Return Tracking — delivery-side capture + pickup-side surfacing (**Migration 028** `stop_equipment_returns`; v2.2.0)

Capture equipment PTR leaves behind at a delivery that the pickup crew must retrieve — extension cords (any delivery), china racks, glassware racks, flatware crates, and chair carts (one unified count across chair styles) — and surface the counts on the linked pickup stop. Spec arrived as two locked sessions; both shipped together.

- **Migration 028 — `stop_equipment_returns`** (`id`, `stop_id` FK→dispatch_stops CASCADE, `equipment_key`, `quantity >= 0`, `created_by`, timestamps, `UNIQUE(stop_id, equipment_key)`, `updated_at` trigger). **Deliberately NO CHECK enumerating `equipment_key`** — integrity comes from the shared rules config, so new equipment types are a code change, not a migration. RLS mirrors the live `stop_item_checkoffs` crew pattern (inspected via pg_policies before writing): crew-of-the-stop's-route INSERT (`created_by = auth.uid()`) / UPDATE / SELECT + super_admin ALL (`'super_admin' = ANY(p.roles)`). Applied to the live DB + tracker reconciled to version `20260702028`.
- **Shared rules config — `src/lib/equipmentReturns/rules.ts`** (imported by BOTH sides; the single source of `equipment_key` values). Triggers: `extension_cords` always; `china_racks`/`glassware_racks`/`flatware_crates` on case-insensitive category match (category confirmed reliable live for those three); `chair_carts` on **name-contains "chair" minus "cushion"**, category deliberately ignored — the same chair names appear live under SEATING, Chairs, AND Misc, and "CHAIR CUSHIONS -*" (LINENS) are an accessory. Bar stools/farm benches intentionally don't match (Darren-confirmed out of scope).
- **Data layer — `src/lib/equipmentReturns/service.ts`.** Upsert ON CONFLICT `(stop_id, equipment_key)` under RLS, best-effort + `ptd_equipreturn_queue` (dedupe-by-stop, flushed from `loadDay` alongside the checkoff/completion queues); sessionStorage draft (`ptd_equipreturn_draft:<stopId>`) so counts survive a back-out. Completion is NEVER blocked by this paperwork.
- **Delivery capture — `EquipmentReturnSection`** on StopDetailScreen (delivery + not completed), below the manifest: grouped Power / Dinnerware / Seating steppers (ItemCheckoffPanel StepBtn pattern), progressive disclosure (tent-only order = cords stepper only; chair_carts is always exactly ONE stepper). Soft prompt — untouched steppers show "—" and write no row; a touched stepper (even back to 0) writes its row. `runStopComplete` (the single completion chokepoint) reads touched counts via ref and fires `commitEquipmentReturns` fire-and-forget.
- **Pickup surfacing — `GET /api/stops/equipment-returns?stop_id=`** (service-role + session cookie, never-500s, the same-job route pattern — the linked delivery lives on a DIFFERENT route so client RLS can't read it). Resolves `linked_stop_id` first (425/426 live pickups; date-independent FK, so a 164-day Will Call gap resolves), reservation_id + `scheduled_date <=` fallback otherwise. **`EquipmentRetrieveCard`** (self-contained, null when nothing captured, SameJobIndicator blue-tint treatment, labels from the shared config: "Retrieve 3 extension cords") dropped into StopDetailScreen, RouteListScreen, RoutePreviewScreen pickup contexts.
- **Investigation findings:** SameJobIndicator does NOT resolve delivery↔pickup pairs (it finds same-day sibling routes by reservation) — its server pattern was reused, not its query. The one null-`linked_stop_id` pickup live is a **pickup-only reservation** (no delivery exists → correctly nothing to show). 23 pickups have `required_pickup_count=2`; when two pickups link to the SAME delivery both show the same reminder (first-crew-wins staleness, acceptable Phase 1 — flagged to Darren). Service-labor lines ("SETUP -TABLES/CHAIRS") contain "chair" and can render a harmless extra chair-cart stepper — flagged, rule kept as specced.
- **Verified:** rule-matrix smoke (9 cases incl. cushions-only no-trigger, two chair types → one stepper, china+glassware → two racks) ALL PASS; live-DB round trip (capture at delivery → resolve from the 164-day-gap pickup → upsert-correct 3→2 → trigger bumps updated_at → cleaned up); `npx next build` green (38 pages, new route in manifest). **Pending: on-device smoke before calling it shipped** (see tasks/todo.md).
- **v2.2.0** — What's New: "Log extension cords, racks, crates, and chair carts you leave at a delivery — the pickup crew will see exactly what to grab."

---

## 2026-07-02 — Bug queue cleanup: Arcade scroll, Training badges, snow-season gate (VERSION 2.3.1; no migration)

Three May-17 bug-queue items fixed directly; driver-app only, no migration, no schema, no shared files. VERSION bumped → 2.3.1 (bug-fixes-only → PATCH, on top of the 2.3.0 pickup-count feature that landed on `main` concurrently). A fourth item (INVESTIGATION-001, dispatcher notes on the home screen) was investigated read-only — findings reported to Darren, no code written pending his review.

- **BUG-001 — Android: Party Kong Play button unreachable.** Root cause was NOT in the game — it was the **Arcade hub** (`src/components/arcade/ArcadeHub.tsx`). The hub root is `className="screen"` (globals.css `.screen` = `height:100svh; overflow:hidden`) and set an inline `minHeight:100vh` that could NOT create a scroll region — so on short/Android viewports the three tiles overflowed `100svh` and the last tile (Party Kong) with its "Play" button was clipped below the fold with no way to scroll to it. Fix (repo's RouteListScreen/RoutePreviewScreen pattern): removed the conflicting inline `minHeight:100vh`, and made the tiles container the scroll region — `flex:1` + `minHeight:0` + `overflowY:auto` + `WebkitOverflowScrolling:'touch'`, with `env(safe-area-inset-bottom)` folded into its bottom padding. Hero stays pinned (`flexShrink:0`); tiles scroll. The in-game "Tap to Play" StartOverlay was NOT the culprit (it's `position:absolute; inset:0` and fully clickable regardless of position).
- **BUG-002 — Training badge wrongly read "Live".** All non-Arcade training items in `src/screens/TrainingScreen.tsx` (Safety & DOT, Tent setup, Equipment ops, Customer service, and New driver orientation) had `badge: { text:'Live', kind:'live' }` while their tap already opens the "Coming soon" toast (no `href`). Switched all five to `{ text:'Coming Soon', kind:'soon' }` (the "soon" pill styling already existed but no item used it). The Arcade tile (a separate component, genuinely playable) is untouched.
- **BUG-003 — Snow forecast shown year-round.** `src/screens/WeatherScreen.tsx` rendered `<SnowForecastCard>` unconditionally. Added a pure `isSnowSeason(d = new Date())` helper (local device date) — shows Oct 1 → Apr 15 (`month >= 9 || month <= 2 || (month === 3 && day <= 15)`), hidden Apr 16 → Sep 30 — and gated the render site (`{isSnowSeason() && <SnowForecastCard …/>}`). Rain/Wind/Current/Lightning cards unchanged.
- **Verified:** `npx next build` green (38 pages, types valid).

---

## 2026-06-28 — Fix: AVA stop-type-aware route context (delivery vs pickup) (ON `main`: `08ebf01`; no migration)

Darren reported two production bugs: AVA couldn't answer basic questions about today's route/equipment, and "how many chairs am I picking up today?" answered "none" because the chairs were on **pickup** stops while AVA had no concept of stop direction. Root cause (investigated before any code): for **today's** questions AVA only ever saw the **client seed** (`DayRouteSelectorScreen.tsx:338–351`), which aggregates items across all stops with **no `stop_type` split** and then `.slice(0, 8)` (top-8 by qty) — so direction was unknowable and most items were dropped. The server-side `loadRouteDateContext()` ran *only* for future preview dates and *also* lumped every direction together (`flatMap` over all stops). Delivery vs pickup was never separated anywhere. Driver-app-only; no migration, no schema, no shared/cross-repo files.

- **Fix 1 — `loadRouteDateContext()` is now stop-type aware** (`src/app/api/ava/ask/route.ts`). Fetches `stop_type, items, payment_state, customer_name, address, reservation_id, dispatcher_notes` (route_position-ordered), splits customer stops into **DELIVERY / PICKUP-RETURN / OTHER**, and emits per-stop lines (customer, address, order ref, items) plus **separate DELIVERING vs PICKING UP** item totals and per-direction category totals (tents/chairs/tables). New pure helpers: `isTentItem`, `aggregateItems`, `categoryTotals`, `itemsList`, `stopLines`. Every Supabase call destructures + logs `error`.
- **Fix 2 — runs server-side for TODAY too, not just preview dates.** POST resolves `targetDate = routeDate ?? localToday` and always calls the loader. Degradation ladder: server load → coarse client seed (today only, no regression) → `NO_ROUTE_FALLBACK`. Weather (client-seeded, live Tomorrow.io) is still appended for today only; the cached Block 0 and gap detection are untouched.
- **Fix 3 — `NO_ROUTE_FALLBACK`** instructs AVA to reply exactly "I don't have your route loaded yet. Make sure you're clocked in and your route is active for today." and to **not** emit the `UNKNOWN:` gap signal (an unloaded route is a known state, not a knowledge gap).
- **Timezone correctness — new `localDate` field.** `AvaConversationSheet` now sends the device's local YYYY-MM-DD (`localTodayStr()`); the server loads today's route in the driver's timezone instead of the Vercel UTC date (which rolls a day ahead in the evening). Mirrors the next-shift `?today=` pattern. `routeDate` is now compared against `localToday`, not `serverToday`.
- **Tent count keeps the strict `countTentItems` rule** (category 'tent' AND name tent/canopy/marquee), so "CAFE LIGHTS" filed under TENTS doesn't inflate the count.
- **Verified:** `npx next build` green (38 pages, types valid). Manual context-log harness with the reported scenario (chairs on pickup stops) confirms the assembled Block 1 reads `DELIVERING: 0 chairs` / `PICKING UP: 1025 chairs` — directions never conflated. **Pending: on-device smoke** — ask "how many chairs am I picking up today?" on a route with chairs on pickup stops → answers from the PICKING UP total; ask "delivering?" → answers from DELIVERING.

---

## 2026-06-22 — Fix: AVA upcoming-route context (preview / next-shift) (ON `main`; no migration)

The preview-screen + Home-card "Ask Ava" CTAs couldn't answer about the upcoming route — "how many tents on my route Wednesday?" returned a logged knowledge gap instead of an answer. Root cause: the today path is client-seeded and the sheet pre-built the future-route context client-side, but RoutePreviewScreen seeded `{}` (load race) and the client `manifestSummary` was top-8-by-qty, which dropped low-qty tents from the prompt entirely.

- **Fix = server-side load from `routeDate`.** `AskBody` gained `routeDate`; `AvaConversationSheet` now sends it in the body (removed the client-side `buildContextFromPayload` + redundant `/api/routes` fetch). `/api/ava/ask` `loadRouteDateContext()` crew-scopes the caller's `route_crew` for that date → routes + `dispatch_stops` (service-role) and injects a Block-1 string with **explicit Tents/Chairs/Tables counts + the full manifest** (item × qty) + COD + dispatch notes. Null on no-route/error → falls through to the today-seeded block.
- **Guarded to `routeDate !== serverToday`** so today's weather-enriched client context is never overridden.
- **Tent count uses the strict `countTentItems` rule** (category 'tent' AND name tent/canopy/marquee) — the loose category-only match reported 202 tents (it counted "CAFE LIGHTS" qty 200 filed under TENTS); strict gives the real 2. Verified against the live DB.
- Build green (38 pages). Confirm on device: ask "how many tents on my route Wednesday?" from the preview Ava CTA → answers from route data, no gap.

---

## 2026-06-22 — Next Day Route Preview (3 sessions) (ON `main`: `083821c` / `fedc216` / `6589a87`; no migration)

Three locked sessions, executed investigate-then-proceed. Surfaces a driver's soonest upcoming shift, a read-only preview of that route, and multi-truck-job awareness. No migration; `reservation_id` plumbing is additive/read-only.

- **Session 1 (`083821c`) — `GET /api/routes/next-shift` + `NextShiftCard`.** Service-role read (RLS-bypass like `/api/routes`): soonest future `route_crew` row (`primary_driver`/`secondary_driver`) whose `routes.route_date > today`, sorted in JS. Optional `?today=` so "future" is the driver's timezone, not Vercel UTC. Returns route_date/number, customer `stop_count`, `tent_count` (category contains 'tent'), chair/table counts (`resolveCategory` buckets), `cod_flag`, `crew[]` (display_name/role/is_primary/truck_name nullable), `dispatcher_notes`; `{shift:null}` on none/unauth/error. `NextShiftCard.tsx` (dark/blue/gold) returns null with no data; wired into Home below the empty state and below the completed-route post-trip card.
- **Session 2 (`fedc216`) — RoutePreviewScreen + AVA date context.** `/api/routes` already accepts `?date=` (crew-scoped) — reused, no new endpoint. `AvaConversationSheet` gained `routeDate`: loads that date's payload and builds AVA context from it (no live weather for a future date), falling back to `seedContext`. `RoutePreviewScreen` (`/route-preview/[routeId]?date=`, Suspense-wrapped for `useSearchParams`): dark header + PREVIEW badge, FROM DISPATCH block, crew & trucks, 2×2 glance, full per-stop manifest, `StopWindowBadge`, **disabled "Navigate · Preview only"**, outlined stop circles, bottom Ask-Ava CTA. No ETA/check-off/completion.
- **Session 3 (`6589a87`) — SameJobIndicator.** `reservation_id` plumbed through the single `/api/routes` SELECT + `SupabaseStopRow` + `toRealStop` + `Stop` type (supabase.ts already had the column → no regen). `GET /api/stops/same-job` (service-role — sibling crew/truck reads are RLS-gated to the caller's own routes) filters `dispatch_stops.scheduled_date`, excludes `warehouse_return` + current route, returns siblings with route_number + primary/co-driver names + truck. `SameJobIndicator.tsx` self-contained (null on null-reservation/no-siblings); blue "N trucks on this job" chip → dark bottom sheet. Dropped into RoutePreview + RouteList (below item pills) + StopDetail (below manifest). Investigation: `reservation_id` 0/848 null on delivery/pickup; future `route_crew`→`trucks` join confirmed.
- **Build green (38 pages) each session.** **Pending:** on-device phone smoke (S3's explicit gate) — chip + sheet on a live multi-truck job; NextShiftCard + Preview + Ask-Ava-about-upcoming.

---

## 2026-06-22 — Offline freeze fix — AbortController + visibilitychange (ON `main`: `6cfe9ff`; no migration)

Investigate-then-fix session. Several drivers reported the app freezing when cell reception dropped — stop-complete spinner never cleared, cash modal locked with all inputs disabled, and on foreground restoration the Home screen showed stale data until a manual refresh. Root cause: **iOS does NOT throw/reject when a network connection drops mid-flight — it stalls the fetch indefinitely.** Any `setLoading(false)` / `closeModal()` / `setCashSubmitting(false)` that only runs after `await fetch(...)` is permanently stuck until iOS's multi-minute TCP timeout (not the few seconds a driver will wait). Three targeted, driver-app-only fixes — no migrations, no schema, no shared/cross-repo files.

- **Fix 1 — `StopDetailScreen` action-critical fetch timeouts.** Four fetch calls had no AbortController:
  - **Cash-status hydration** (`GET /api/cash-collections?stop_id=…` on mount, ~line 519): 8 s controller; timeout catch sets `cashConfirmed(false)` (already the default — just stops the hang).
  - **Completion POST** (`/api/complete-stop` in `runStopComplete`, ~line 977): 12 s controller (given extra headroom — this is the most critical path). On timeout/network error the catch sets `synced = false` → `enqueueCompletion()` → navigation proceeds forward. Safe because the **optimistic `markComplete()`** already ran before the fetch, so the driver's local state is already advanced.
  - **Cash confirmed POST** (`/api/cash-collections` in `handleCashCollected`, ~line 1160): 12 s controller; timeout catch → `setCashError('Network error')` + `setCashSubmitting(false)` → driver sees an error message and the modal unlocks (retry or close).
  - **Cash not-collected POST** (`handleCashNotCollected`, ~line 1204): same pattern, same timeout. Identical structure to the confirmed path.
- **Fix 2 — `useInspectionStatus` fetch timeout** (`src/hooks/useInspectionStatus.ts`). The hook had an `navigator.onLine === false` guard (returns a sentinel immediately when offline) but no AbortController if the fetch *started* online and the connection dropped mid-flight. Added an 8 s controller + `controller.abort()` in the cleanup function. On timeout → catch → `setInspection(null)` (the existing safe default — keeps the gate closed). The offline guard (`setInspection({ id: 'offline', … })`) was already there and is unchanged.
- **Fix 3 — `visibilitychange` listener in `AppStateContext`** (`src/context/AppStateContext.tsx`). The provider already had `window 'online'` / `window 'offline'` listeners that trigger `loadDay` / `SET_OFFLINE`. On iOS, **the `online` event does NOT fire when the app is brought from background to foreground without a network-state transition** (e.g. app was already online when backgrounded, still online when restored). So a driver who backgrounds the app and returns to it sees the previous page state until the next accidental refetch. Added a `document.addEventListener('visibilitychange', handleVisible)` (fires `loadDay` when `visibilityState === 'visible'`) inside the same `useEffect` and cleaned up alongside the existing listeners. `loadDay` is guarded by its own 10 s AbortController + offline fast-path (returns cached data immediately when offline) so it is safe to call on every foreground event in all network states.
- **What did NOT change:** the `markComplete()` optimistic flip, `enqueueCompletion()`, `flushCompleteQueue()`, the `ptd_complete_queue` offline queue, COD cash logic, check-off path, inspection gate (`stopsLocked`), or any other completion path. The three timeouts only activate when iOS stalls — a fast network is unaffected.
- **Verify:** `tsc --noEmit` clean; `node_modules/.bin/tsc --noEmit` (0 errors). Full `next build` is blocked in the remote env (missing Supabase env vars — pre-existing remote environment limitation, unrelated to this change). Committed `6cfe9ff`, pushed to feature branch + `main`. **On-device smoke pending:** (a) complete a stop offline → completion modal unlocks after ≤12 s, stop queues for sync, driver advances to next stop; (b) drop connection mid-cash modal → error message appears, inputs unlock, driver can retry or close; (c) background then foreground app → Home refreshes data automatically.

---

## 2026-06-21 — AVA tent specs batch — Stillwater 44-wide + 30-wide frame (data patches; no migration, no code)

Populated `ava_knowledge` (`category='tents'`) so AVA can answer tent set-up/load questions ("what goes on the 44 by 83 Stillwater?", "how many spreaders on the 30 by 45 frame?", "how much does the 44 by 123 weigh?"). Five one-shot data-patches, **35 `tents` rows** end state, two commits (`5491770`, `70053d9`), both pushed to `main`.

- **Stillwater 44-wide sailcloth (25 rows):** `ava_stillwater_44_specs.sql` (15 — what-goes-on / stakes / poles for 44x43–44x123) + `ava_stillwater_44_weights_total.sql` (5 total-weight) + `ava_stillwater_44_weights_v2.sql` (5 tent-top-only weights + UPDATEs adding the tent-top fabric breakdown to the total-weight answers). `status='published'` (matched the inflatable rows via a read-only check first).
- **30-wide traditional CPB frame (10 rows):** `ava_30wide_frame_tent.sql` (8 — 30x30 & 30x45 what-goes-on / stakes / legs / weight) + `ava_30wide_frame_spreaders.sql` (2 spreader counts: 30x30=8, 30x45=11, + UPDATE adding "11 spreaders" to the 30x45 comprehensive answer; Darren-confirmed — Notion had 6, flagged VERIFY).
- **Run order matters within each family** (the `_v2`/`spreaders` file UPDATEs a row the earlier file INSERTs): Stillwater = `specs → weights_total → weights_v2`; 30-wide = `frame_tent → spreaders`. Run the fixup first and the UPDATE silently no-ops (count short, fix lost). This surfaced live mid-session: `weights_v2` was run before `weights_total` existed (5 UPDATEs hit 0 rows, count 20 not 25) and `spreaders` couldn't run until `frame_tent` created the 30x45 row — both reported honestly and corrected by running the base file. **A referenced base file (`/mnt/user-data/outputs/ava_30wide_frame_tent.sql`) was missing from disk; flagged the dependency and held the dependent run rather than no-op into a hard-to-clean state — Darren then supplied the contents.**
- **⚠️ NOT idempotent — one-shot.** `ava_knowledge.question` has no UNIQUE constraint; re-running any of these silently duplicates its INSERT rows. Re-apply each exactly once (in family order) after a fresh DB rebuild.
- **Verified (read-only re-queries — `db query --file` only echoes the last statement):** `COUNT(*) WHERE category='tents'` stepped 25 → 33 → 35; 44x83 stakes = "52 double-head stakes and 26 ratchets."; both spreader rows present; 30x45 "What goes on" now includes "11 spreaders."

---

## 2026-06-21 — AVA inflatable specs batch (data patch; no migration, no code)

Populated the AVA operational knowledge base (`ava_knowledge`) with set-up specs for the inflatable fleet. AVA injects published `ava_knowledge` rows into the cached Block 0 of `/api/ava/ask`, so a driver can now ask "what does the Wild Rapids need to set up?" and get the bin, blower count/HP, stake counts, and accessories spoken back.

- **Scope:** 1 `UPDATE` (the pre-existing partial-dupe Pirate Battle row — re-pointed to `category='inflatables'`, `source='inflatable_specs'`, canonical answer) + **56 `INSERT`s** covering racks R1–R5, S rack, and the U bins. `status` omitted → defaults to `'published'` (driver-readable). Source: `INFLATABLE_WORKSHEET.xlsx` + `Book_1.xlsx`. Typos corrected at write time: ISALND→ISLAND, MIDEVAL→MEDIEVAL, SEARGEANT→SERGEANT.
- **Answer format (consistent):** `Name — Bin XX — takes N blower(s) at H HP[ each]. Stakes: A hook stakes[ and B large stakes]. Accessories: … / No accessories needed.` Voice-first phrasing (numbers in words where natural, em-dash separators that ElevenLabs pauses on). Two double-unit entries (Vertical Rush R3-1/R3-2, Leaps and Bounds S7-9/S7-10) call out both bins in one row.
- **Re-runnable patch:** `supabase/data-patches/ava_inflatable_specs.sql`. Applied via `supabase db query --linked --file …` (NOT a numbered migration — it's a data change, re-apply after a fresh DB rebuild).
- **⚠️ NOT idempotent — do not re-run.** `ava_knowledge.question` has **no UNIQUE constraint**, so a second run would silently insert 56 duplicate rows (the `UPDATE` half is fine; only the `INSERT` half duplicates). This differs from the `dependency_map` data-patches (UPDATE + guarded INSERT, safely re-runnable). On a fresh DB rebuild apply exactly once.
- **Verified:** Pirate Battle rows = **1** (UPDATE hit one row, no leftover dupe); `COUNT(*) WHERE category='inflatables'` = **57** (1 + 56); Wild Rapids spot-check returns `Wild Rapids — Bin R4-3 — takes 1 blower at 2 HP. Stakes: 4 hook stakes and 4 large stakes. No accessories needed.` Counts confirmed via a separate read-only query — the insert file ran **once**.

---

## 2026-06-18 — Manifest bundle grouping (ON `main`: `c862d24`; no migration)

Investigate-then-fix UI session. `dispatch_stops.items` now carries `bundle_name` on FLOORING & STAGING deck items (example reservation `0F5B5AE2`: `{qty:6, name:"STAGE 4'X4'", category:"FLOORING & STAGING", bundle_name:"STAGE 8'X12'", tapgoods_pick_list_item_id:4976205}`). All other items (skirts, stairs, grill, propane, chairs, linens) have no `bundle_name` and are untouched.

- **Render location (investigation):** `src/screens/StopDetailScreen.tsx` static manifest — the `!checkoffActive` branch (`items.map`), one bordered card, each line = name + `sentenceCase(category)` sub-line + `×qty` pill, `borderTop` separator when row index > 0. The interactive `ItemCheckoffPanel` branch (`checkoffActive`) was left untouched (check-off behavior explicitly out of scope).
- **Type plumbing:** added `bundle_name?: string | null` to `Stop['items']` (`src/types/index.ts`) and `RawItem` (`src/lib/supabaseTransform.ts`). Type-only — the value already flows through the `items` JSONB at runtime (`s.items as RawItem[]`), no fetch/SELECT change.
- **Fix (rendering only):** group items by `bundle_name` in first-appearance order. Each unique bundle → an uppercase section header (`FONT_DISPLAY`, `C.muted`, letter-spaced) rendered above its item(s); bundled items get a small left indent (`paddingLeft: 28`) but otherwise the **same row style** (name/qty/category). Items without `bundle_name` render flat exactly as before. Border logic: a top border separates rows but never sits between a header and its first item (the item belongs to the header above it) — tracked via an `anyRendered` closure flag. **Untouched:** qty display, status logic, check-off, COD, everything else.
- **Verify:** `npx next build` green (✓ Compiled successfully, types valid, 38 pages). Committed `c862d24`, pushed (`b6155c6..c862d24`). **Pending:** confirm the dashboard sync actually writes `bundle_name` into live `dispatch_stops.items` (driver-side render path + types verified; data presence is dashboard-side).

---

## 2026-06-16 — DOT inspection safety net — truckless primary-driver guard (ON `main`: `e8b26fe`; no migration)

Investigate-then-fix session. **Bug report:** the DOT pre-trip inspection didn't surface for a route with **1 driver + 2 trucks** — it only appeared once a second driver was added (trucks were 2 in both cases). The gate looked driver-count-dependent.

- **Root cause (investigation, no code changed first):** the inspection gate keys on the signed-in driver's **own `route_crew.truck_id`** (`truck_is_own`), NOT on the route-level trucks (`routes.truck_id` / `routes.truck_id_2`). In `supabaseTransform.ts`, when the driver HAS a crew row but its `truck_id` is null, `ownTruck` is null → `truck` is null (the soft-fail fallback to the route truck fires ONLY when there's no crew row at all, not when the crew row exists with a null truck) → `truck_id` undefined → `hasTruck = false`, `truck_is_own = undefined`. So `stopsLocked` (which requires `truck_is_own === true`) is **false**, the stop list never locks, and the CTA reads "Join Route" (because `!hasTruck`) → tapping it routes **straight past the DOT pre-trip**. With a 2nd driver, dispatch assigns one truck per crew row, populating `route_crew.truck_id`, so the gate fires. Hence the driver-count-dependent symptom. **The inspection gate logic is correct — the failure is a silent pass when the per-driver truck assignment is missing.**
- **Fix = a data-gap safety net (does NOT touch `stopsLocked` / `truck_is_own`).** New `truckUnassigned = !hasTruck && is_primary === true` in BOTH screens (fix-both mirror). **Scoped to `is_primary === true` ONLY** — a no-truck *co-driver* (`is_primary === false`) is the supported ride-along "Join Route" flow and is never caught; a soft-fail with no crew row inherits the route truck (`hasTruck === true`) so it never lands here either.
  - **`DayRouteSelectorScreen`:** CTA label → "Truck Not Assigned", button disabled + dimmed, `handleCtaTap` early-returns on `truckUnassigned` (defense-in-depth), amber sub-text "Contact dispatch to assign your truck" (`C.goldDeep`).
  - **`RouteListScreen`:** amber banner "Truck not assigned — contact dispatch before starting" at the top of the stop list **+ stops made non-tappable** via `stopsTappable = !stopsLocked && !truckUnassigned`. This was a deliberate decision (Darren, Option B): RouteListScreen is reachable via the Routes-tab deep-link, and `stopsLocked` does NOT cover this case (truckless primary → `truck_is_own === undefined` → `stopsLocked` false → stops would otherwise stay tappable), so the banner alone would have left the deep-link DOT-bypass open. Folding `truckUnassigned` into `stopsTappable` is an additive data-gap block layered on top of the inspection gate, not a change to it.
- **Verify:** `tsc --noEmit` clean; `npx next build` green (38 pages). Committed `e8b26fe`, pushed to `main`. **On-device gate:** put a driver in the 1-driver/2-truck state and confirm the banner shows + stops are dimmed/non-tappable + Home CTA is disabled; confirm a no-truck co-driver is unaffected.
- **Upstream (NOT this repo):** the real question is whether dispatch should pin a truck to a lone crew row on a multi-truck route. This commit is the driver-app guardrail; the dashboard-side data fix is separate. See `tasks/lessons.md`.

---

## 2026-06-15 — Ava Studio A4 — AVA Remembers Phase 2 (ON `main`: `3c92e9d`; migrations 026–027)

Driver-side of the locked AVA Remembers Phase 2 spec (June 8): a *freshness loop*, *single-visit notes*, and *clear-site-notes* on top of the Phase-1 address-keyed `ava_stop_notes`. Driver-app only — **A4b** (dashboard Site Notes panel + Visit Notes on the board stop cards) is a separate later dashboard-repo session. Three spec/reality mismatches surfaced to Darren up front and decided before coding.

- **Three Darren-approved spec corrections.** (1) **`created_by` skipped** — mig 026's spec added it, but `ava_stop_notes` already has `author_id uuid REFERENCES profiles(id)` doing exactly that (every read/write uses it); reuse it, no duplicate column, no backfill. (2) **`'super_admin' = ANY(p.roles)`**, not `profiles.role` (live DB has `roles text[]`). (3) **"Start Fresh voice command" → a button** — the app has NO speech-to-text (`AvaConversationSheet` is text-only, mic is a stub) and the sheet isn't address-scoped, so the spec's voice trigger ships as a "Clear site notes" button on Stop Detail; voice deferred.
- **Migration 026 — `ava_stop_notes` extension + freshness write path.** Added `created_by_role` (CHECK driver|dispatcher, default driver), `status` (NOT NULL default active, CHECK active|archived), `last_confirmed_at`, `visit_count_since_added` (NOT NULL default 0) + partial index `idx_ava_stop_notes_addr_active`. Cross-author freshness confirm needed any visiting driver to update ONLY the two freshness columns while authors keep full edits — RLS is row-level, not column-level, so this is a permissive `ava_stop_notes_confirm_freshness` UPDATE policy (active rows) **+ a `BEFORE UPDATE` trigger** `ava_stop_notes_guard_foreign_update` that raises if a non-author (`auth.uid() <> OLD.author_id`) touches anything beyond `last_confirmed_at`/`visit_count_since_added`. The trigger **skips when `auth.uid() IS NULL`** so the service-role archive (and the Phase-1 offline-queue insert) still work.
- **Migration 027 — `stop_visit_notes`.** Single-visit notes (`stop_id` FK→dispatch_stops ON DELETE SET NULL, `order_ref`, `address_key`, `note_text`, `note_category` CHECK customer_behavior|tip|access|equipment|general, `created_by`, `created_at`) + RLS: insert own; read super_admin-all / others-own. Both migs applied via `db query --linked --file` + `migration repair`; verified (columns/table/policies/trigger present; functional smoke clean; no leftover rows).
- **`POST /api/ava/stop-notes/archive-address`** (`{address_key}`) — session-cookie auth identifies the caller, service-role admin client sets `status='archived'` on all active rows for the `address_key`. Server-side because archiving other drivers' notes is elevated. 401/400 guards.
- **Freshness prompt (StopDetailScreen).** No completion animation exists — `runStopComplete` navigates immediately — so the prompt *defers* that single `router.replace`: when an active note exists for the address (non-depot), it opens a **non-dismissible** modal ("Notes here are from [relative date] — still accurate?" + the note). **✓ Yes, still good** → `confirmNoteFreshness` (bump `last_confirmed_at`+`visit_count`) → navigate; **Update note** → `AvaNoteSheet` pre-filled, deferred nav fires when that sheet closes (saved or cancelled — completion already happened). Both buttons navigate, so the driver is never stranded. Single chokepoint = every completion path covered.
- **Staleness qualifier.** `buildStopNoteSections` prepends `"(Note from N visits ago) "` to the note AVA surfaces when `visit_count_since_added >= 3 && !last_confirmed_at` (a confirmed note is no longer flagged stale).
- **Visit-note entry (AvaNoteSheet).** Segmented control (two buttons, not a checkbox): "Remember for future visits" (`ava_stop_notes`, unchanged, photos kept) vs "Just for this visit" (`stop_visit_notes`, category chip row, no photos). New props `orderRef`/`initialDraft`/`onAnySaved`.
- **Clear site notes.** Underlined button in the AVA-Remembers entry surface, shown only when active notes exist → `ConfirmationModal` → archive route → refresh + "Site notes cleared" toast.
- **`stopNotesClient`.** Reads now filter `status='active'`; new `getMostRecentActiveNote`, `confirmNoteFreshness`, `archiveAddressNotes`, `saveVisitNote`.
- **Verify:** `tsc --noEmit` clean; `npx next build` green (38 pages, new route compiled); DB functional smoke ok. **On-device live test is the gate** (esp. the cross-author freshness path — the management API bypasses RLS and can't test it). Committed `3c92e9d`, pushed. See `tasks/todo.md` + `tasks/lessons.md` (RLS-row-not-column + voice-stub lessons).


## 2026-06-15 — AVA header chip wired to AvaConversationSheet + copy fix (ON `main`: `15c6931`, `d84fa44`; no migration)

Two micro-sessions, both wiring/copy only — no new components, routes, migrations, or shared/cross-repo files.

- **Chip activation (`15c6931`).** The AVA Tier 1 header chip (`src/components/AvaChip.tsx`, rendered bare as `<AvaChip/>` on Home, Route list, Stop detail, Tools, Profile, Training) previously opened a self-contained "AVA is coming soon" placeholder drawer + a "HOLD TO TALK" mic stub firing a "Voice input coming…" toast. Replaced all of that with the real shared `AvaConversationSheet` (the same Haiku-backed sheet behind Home's "Ask Ava about today" + Training Hub SOP search). State + sheet render live **inside `AvaChip`** so one change covers all 6 screens — no per-screen edits, no `AvaConversationSheet` internal changes, button visual/animation/position byte-identical. Mirrors the existing `AskAvaButton` render pattern. Net −142/+23 lines (placeholder drawer + `MicGlyph` + toast removed).
- **Context passing.** `AvaChip` reads `routes` from the existing `useAppState()` (no prop drilling, no new props) and passes `routeId = routes.length === 1 ? routes[0].route_id : null` — a single-route day is unambiguous; multiple/none → null. No "current stop" exists at the chip's render level without prop drilling, so none is passed. `seedContext={{}}` always — the sheet/`/api/ava/ask` work fully context-free (graceful degradation; AVA still answers general/terminology/SOP questions; `routeId` only feeds logging/`context_id` + gap context). Per the locked spec's rules.
- **Copy fix (`d84fa44`).** Replaced the sheet's empty-state description (`AvaConversationSheet.tsx:218`, the only occurrence) — was today's-route-centric ("…your stops, what's loaded, cash collection, dispatch notes, or wind on your tents.") — with the knowledge-scope line: "Ask me anything — your route, stops, equipment, SOPs, or how we do things at PTR." One string, one file.
- **Verify each:** `tsc --noEmit` clean, `npx next build` green (38 pages), `git status` showed only the one file per commit. Both **Vercel READY** (`work.partytime-rentals.com`). **Pending: browser/on-device tap-through** — confirm the chip opens the sheet on Home, closes cleanly, and the morning-brief + Training Hub Ava entry points still work (unchanged). See `tasks/todo.md`.


## 2026-06-15 — Ava Studio Foundation A1 (ON `main`: `da3a352`; migrations 022–025)

First slice of the Ava Studio: a knowledge/terminology layer Ava reads at request time + a gap-capture loop. Built from a locked walk-away spec (4 migrations + 1 route change). A2 (editing UI / answer-queue) deliberately NOT started.

- **Migrations 022–025 (driver-app-owned).** `ava_knowledge` (verified Q&A, RLS authenticated-read-published + super_admin-all, 2 seed rows), `ava_knowledge_gaps` (unanswered-question queue, drivers insert/read own + super_admin-all), `ava_vocabulary` (PTR terminology + aliases, 25 seed terms), and a `sop_entries` extension adding `status`/`last_edited_by`/`last_edited_at` (`version` already existed as TEXT from mig 019 — the guarded DO-block correctly skips it). Applied to the shared DB via `supabase db query --linked --file` + `migration repair --status applied`, NOT `db push` (two-repo history block). Verified counts: 2 / 0 / 25 / 4 studio cols.
- **Spec correction — RLS role column.** The locked spec's policies used `profiles.role = 'super_admin'`. Verified against the LIVE DB first: there is no `role` column (this dashboard-owned DB migrated to `roles text[]` long ago; the driver-app's stale local `20260426001` still shows the legacy enum). All four migrations corrected to the codebase-proven `'super_admin' = ANY(p.roles)` (matches migs 014/016). Flagged in the session summary; lesson recorded.
- **`/api/ava/ask` — 4 additions, request/response shape unchanged.** (1) Fetch published `ava_vocabulary` + (2) `ava_knowledge` via the admin client (best-effort). (3) Inject `PTR TERMINOLOGY` + `OPERATIONAL KNOWLEDGE BASE` sections + the `UNKNOWN:` instruction into the **cached Block 0** (global rows, identical per driver → preserves the cache breakpoint; route context stays in volatile Block 1). (4) Gap detection: `answer.trimStart().startsWith('UNKNOWN:')` → deduped insert into `ava_knowledge_gaps` (fully best-effort, never reaches the client) + `ava_conversations` log with `confidence:'unanswered'`/`needs_review:true` + the friendly copy swapped in for the driver. `AskBody` gained optional `stopId` for gap context.
- **Build green** (`npx next build`, 38 pages), `tsc --noEmit` clean, committed `da3a352` (5 files exactly), pushed; **Vercel READY** (`work.partytime-rentals.com`). On-device smoke pending (jargon → terminology applied; unknowable → friendly reply + a gap row). See `tasks/todo.md`.


## 2026-06-15 — Co-driver realtime completion propagation (ON `main`: `13ef281`; no migration)

A primary driver (Lucas) was not seeing a co-driver's (Dylan) stop completions reflected in real time while both worked the same route. Investigation (read-only, corroborated by a parallel Explore agent) confirmed the write path and permissions were fine — the failure was purely a **realtime subscription gap**.

- **Root cause.** The driver app had **zero** realtime subscription on `dispatch_stops`. The only route-data channel (`DayRouteSelectorScreen.tsx:476`) watches the `routes` table for transfer state (`active_driver_id`/`transfer_pending_to`). A co-driver completion writes `dispatch_stops` (`stop_status`/`completed_at`/`actual_departure_at` via `POST /api/complete-stop`) and touches `routes` **only** on a `warehouse_return` route-end clear — so a mid-route completion fired no event the primary's client was listening for. His screen refetched only by accident: mount, `window 'online'`, the transfer channel, or the 5s timer after his OWN completion. The optimistic `markComplete` is local-only but is always followed by the POST, so the DB write was never the problem; and `isProgressionLocked`/`canComplete` permit co-drivers (Rev 2) — neither blocks the write.
- **Gate verified (no migration).** `dispatch_stops` IS in the `supabase_realtime` publication AND has the `dispatch_stops_authenticated_read` SELECT policy (`auth.role() = 'authenticated'`), RLS enabled. Both are required — per lessons, the publication alone is a false green.
- **Fix.** Added a `dispatch_stops` `UPDATE` subscription in **`AppStateProvider`** (`src/context/AppStateContext.tsx`), NOT in a screen. Placement matters: `AppStateProvider` lives in the root layout (`layout.tsx:57`) and stays mounted across all navigation, whereas `DayRouteSelectorScreen` is rendered by `src/app/page.tsx` and **unmounts the moment the driver opens `/route/.../stop/...`** — exactly the bug scenario. So a screen-scoped channel would silently drop right when it's needed; the provider-level one covers Home, Route list, and Stop detail with a single subscription. Keyed on the joined today's-route-IDs string (only changes when the day's route SET changes, never on a stop UPDATE, so a refetch can't re-trigger the effect); client-side route-id filter mirrors the proven `routes` channel; cleanup via `removeChannel`. On any matching stop UPDATE → `loadDay(today, true)`.
- **Build green** (`npx next build`, 38 pages). **Pending: two-driver on-device smoke** — realtime is false-green-prone, so confirm a live co-driver completion refreshes the primary's screen from each surface (Home / Route list / Stop detail), both directions. See `tasks/todo.md`.


## 2026-06-15 — Will Call `awaiting_return` overdue-treatment fix (ON `main`: `9e02159`; no migration)

One-file follow-on to the morning's return-queue undercount fix. `OrderCard` (`src/screens/willCall/WillCallListScreen.tsx`) was painting EVERY `awaiting_return` card with red/overdue styling — but `awaiting_return` only means the return-reminder SMS fired today, not that the order is actually late.

- **Fix (styling/label logic only):** split `awaiting_return` into two visual states off the actual due-back date — `isOverdue = dateKey(returnByIso(order)) < today` (date-grain compare, consistent with `matchesFilter`/`dueBackToday` and avoiding the bare-date day-shift `format.ts` warns about). Genuinely overdue (date passed) → unchanged red treatment. Reminded-but-not-yet-late (due today/future, or a null due-back date which fails safe to amber) → **amber border + inline amber "Due Back" pill + amber "↩ Due back:" label**, reading like a `picked_up`-due-today card.
- **All three overdue cues switch together.** The card reads "overdue" in three spots: border, the `StatePill`, and the line-3 label. The `StatePill` atom is keyed strictly on `status` (always red "Return Overdue" for `awaiting_return`), so leaving it would produce a half-red/half-amber card — the not-late branch renders a custom inline amber pill instead. The shared `STATE_PILL` map and the detail screen's `ProgressSteps` are untouched.
- **Untouched by design:** section split (`awaiting_return` still in ACTION NEEDED), the `/api/will-call` query, all other screens/routes, and `picked_up` card rendering.
- **Build green** (`npx next build`, 38 pages). **Pending: on-device smoke** — an `awaiting_return` order whose `checkin_window_end` is today/future shows amber "Due Back", and one whose date has passed shows red "Return Overdue". (Per the 2026-06-14 verification pass there were 0 `awaiting_return` rows in prod — the dashboard must flip an order to `awaiting_return` to exercise either path.)


## 2026-06-15 — Stop-progression gate + optimistic completion + per-driver auto-ETA (driver `7bdd39c`; dashboard `31d6f66`/`88f25b5`/`3437e44`; Migration 097)

Three features shipped together from a locked spec (investigation-first across driver app + partytime-sms), plus a pre-existing dashboard crash surfaced and fixed during the live test. Driver app + dashboard both built green; auto-ETA on-the-road + Part 1/2 on-device smoke tests pending.

- **Migration 097 — `profiles.auto_send_eta BOOLEAN NOT NULL DEFAULT FALSE`.** Applied to the shared DB (partytime-east) from the dashboard mirror via `supabase db query --linked --file` + `migration repair --status applied 20260615000000`. Additive, non-destructive. Dashboard high-water → 097 (driver app stays 21). Both repos' `supabase.ts` `profiles` block hand-patched (Row/Insert/Update) rather than full-regen — a full regen pulls in unrelated RFID tables added to the shared DB since the post-096 patch.
- **Part 1 — optimistic completion + `ptd_complete_queue`.** `runStopComplete` (`StopDetailScreen`) now calls `markComplete` (local flip + `ptd_stop_*` mirror) **before** the `/api/complete-stop` POST, so the per-stop gate opens and the driver advances even offline. New `src/lib/completeQueue.ts`: on offline/transient failure the POST is queued (dedupe-by-stop) and replayed in `loadDay` on reconnect (drop on 2xx/4xx, retry 5xx/network) — flushed alongside `flushCheckoffQueue`. Soft "Stop saved — will sync when back online" pill handed forward via `sessionStorage` (`ptd_complete_toast`) to the next stop's mount (the source screen unmounts on navigate). Fixes the pre-existing bug where an offline thrown fetch meant `markComplete` never ran.
- **Part 2 — per-stop progression gate** (`DayRouteSelectorScreen` + `RouteListScreen`, both — fix both). New route-scoped `isProgressionLocked(stop)`: only the first not-yet-completed customer stop on each route is tappable; future stops lock (opacity 0.4, `not-allowed`, `pointer-events:none`); completed stay tappable read-only (0.6); depot legs (`warehouse`/`warehouse_return`) never lock. Layers ON TOP of the inspection `stopsLocked` gate. Route-scoped (not the spec's single global index) because `dayStops` flat-maps every route of the day. No lock icon — dimming is the only cue (per spec).
- **Part 3 — per-driver auto-ETA.** `UserProfile.auto_send_eta` + `getUserRole` select; `loadDay` refreshes the `ptd_profile_<userId>` cache each online load so an admin's mid-day toggle takes effect on the next Home load without an app restart (reuses `getUserRole`+`writeCachedProfile` — no `/api/profile` route exists). `StopDetailScreen.fireAutoEta`: on completion, if the flag is set, fire the OTW/ETA SMS to the next customer (`getNextCustomerStop` walks past depot legs / completed / phoneless stops); reuses `sendEtaSms` + mirrors the manual `markOtw`. Fire-and-forget, self-gates on online + GPS + a phone, completely invisible. Manual Send ETA button unchanged. **Dashboard:** new `PATCH /api/admin/drivers/[driverId]/preferences` (super_admin, `requireAdminAccess`, service-role write), a "Driver app settings" toggle on `/admin/drivers/[driverId]` (optimistic, revert on failure), `buildDriverProfile` selects/returns `auto_send_eta`. **Verified end-to-end:** toggling Cameron Keesler → DB `auto_send_eta = true`.
- **Bug fix (pre-existing, surfaced by the live test) — `/admin/drivers/[driverId]` crashed with React #438 on EVERY load.** The page was authored with the Next 15 async-params pattern (`params: Promise<…>` + `use(params)`), but the dashboard is **Next 14.2.35**, where `params` is a plain object → `use()` got an unsupported type → "Application error: a client-side exception." Nothing to do with the toggle; the page had simply never been opened. Diagnosed by adding `src/app/admin/drivers/[driverId]/error.tsx` (a route error boundary that **renders `error.message` on screen** instead of the dead global screen) + a `SectionBoundary` around the new toggle — the error came through `error.tsx`, not the section boundary, proving the crash was outside the toggle. Fixed to the Next 14 pattern every other dynamic page in the repo uses (`params: { driverId }` read directly). `error.tsx` + `SectionBoundary` kept as safety nets.
- **Build green** both repos (driver 38 pages, dashboard 56 pages). **Pending:** auto-ETA live road test (Cameron picks up the flag next online Home load → completes a stop with location on → next customer auto-texted); Part 1/2 on-device smoke (offline complete → advance → reconnect replay; per-stop lock visuals).


## 2026-06-15 — Will Call return queue undercount fix (ON `main`: `30bc068`; no migration)

One surgical client-side fix in `src/screens/willCall/WillCallListScreen.tsx`. The driver-app return/due-back queue was **status-driven** (only `awaiting_return` counted as "due back"), so orders still `picked_up` but due back today were silently excluded — the dashboard board, which is **date-driven** (`checkin_window_end`), showed significantly more. Driver reported "only 2 orders due back today" vs. the dashboard's larger count.

- **Root cause (investigation-first, no dashboard repo on hand — driver side confirmed, dashboard inferred):** the queue keyed entirely on `status === 'awaiting_return'`. A `picked_up` order due back today was filtered by `expected_pickup_date` (in the past) in `matchesFilter` → excluded under the default Today filter, and grouped into "Out with Customers" by the section split, never the return queue. `returnByIso(order)` (= `checkin_window_end ?? return_reminder_date`) already existed in `format.ts` but was only wired to *display* (`fmtReturnBy`), never to filter/section logic.
- **Fix 1 — `matchesFilter`:** added a `picked_up` branch that keys filtering on `returnByIso(order)` (the due-back date), not `expected_pickup_date`. Today → `due === today`; Week → due-back within the next 6 days. A customer who picked up June 10 due back June 15 now appears on June 15.
- **Fix 2 — section split:** new `dueBackToday(o)` = `picked_up && dateKey(returnByIso(o)) === today`. Such orders land in **ACTION NEEDED** alongside `awaiting_return`; `picked_up` orders with a future return date stay in **OUT WITH CUSTOMERS**. The hero "needs action" count picks them up too.
- **Untouched by design:** `route.ts` query (the undercount is 100% client-side; the API already returns the full board), all other screens/routes, OrderCard styling (a `picked_up`-due-today card shows in ACTION NEEDED with its normal `picked_up` chrome — muted "Returns: Today", default border; a quick follow-up if Darren wants it visually flagged).
- **Build green** (`npx next build`, 38 pages, ✓ Compiled successfully). **Pending: Darren on-device smoke test** — confirm the return queue now matches the dashboard board's due-back-today count.


## 2026-06-14 — Will Call Phase 1 verification pass + SMS Phase 2 tech-debt logging (no code change)

Verification-only session. No driver-app code changed. Goal: smoke-test Will Call Phase 1 (`3f7d01a`/`cb9453f`, shipped 2026-06-12) on production.

- **Reality of the "live" smoke test:** the staging / pickup / return steps fire **real customer SMS** (staging notice, return-confirmation) and a **real dispatch@ discrepancy email**. Those are irreversible outward-facing side effects and require a logged-in `will_call` session on a device — not something to drive autonomously on production. So this session did the **fully verifiable portion** (code paths, deploy, DB prerequisites, dashboard auth gate) and hands Darren a targeted on-device checklist for the side-effecting tap-through. **The smoke test is NOT marked complete** — the live SMS/email verification is still the gate.
- **✅ Production live.** `https://work.partytime-rentals.com/will-call` → HTTP 200 (route resolves, not 404). On `main` (`25dcf03`, past the `3f7d01a` ship).
- **✅ `will_call` role.** 5 active holders (Darren, Dylan, Jon Bartolomeo, Joey Paradise, Melissa). Darren is active with the role — no provisioning needed.
- **✅ Test data present** in every state the flows need: 13 pending, 1 staged (Joseph Tresca), 8 picked_up, 16 returned. **Gap: 0 `awaiting_return` rows** — the "Return Overdue" red-border / overdue-banner path can't be exercised until the dashboard flips an order to `awaiting_return`.
- **✅ Code-path verification (Explore agent, all 6 screens, 20 items PASS, `next build` green, zero concerns).** List (3 tabs, default Today; 4 sections; red/blue borders; exact STATE_PILL labels; string-based date parse; due-back = `checkin_window_end` ?? `return_reminder_date`), Detail (4-step progress, status-keyed CTAs, returned green block), Staging checkoff (qty exception only, NO damage toggle), Pickup confirm (identity card + full-qty items + photo stub w/ Skip), Return checkoff (qty short + damage flag → `buildReturnNotes`), Return Done recap. Gates: `WillCallGate` = will_call|super_admin; nav tab + Tools `TrainingCard` strict will_call; Training relocates out of nav for will_call holders. `GET /api/will-call` four-role gate + 7-day returned filter + 30s/focus refetch (no realtime). Writes cross-app bearer POST only, never direct supabase. Damage = return-note line only (no `field_work_orders` in Phase 1).
- **✅ Dashboard auth retrofit (`requireWillCallAccess.ts`).** All four `/api/willcall/[id]/{stage,pickup,return,staged-location}` routes carry the gate + an `OPTIONS` (CORS preflight) handler + `willCallJson` (CORS headers on every response incl. 4xx/5xx). Role set `will_call|warehouse|scheduler|super_admin`; a plain-driver token → 403 "Forbidden — Will Call access only". CORS origin `work.partytime-rentals.com`, `Authorization` allowed.
- **Tech debt logged (dashboard repo `tasks/todo.md`):** SMS Reply Routing Phase 2 (migration 097) — `sms_outbound_messages` table to replace the phone-number heuristic in `inboundSms.ts`; prerequisite = Phase 1 (`fabdbce`/`68a1074`) verified stable on a live delivery day. Logged only, not built.


## 2026-06-14 — Offline cold-start fixes: v2.0.1 (no migration)

Two offline cold-start failures found in on-device iOS PWA smoke testing, fixed in one commit. Driver-app-only; no schema, no new endpoints.

- **Fix: offline cold-start now restores identity from cached user — expired tokens no longer block offline auth.** FAILURE B: force-close while offline → reopen showed the offline `/login` screen. Root cause: the offline restore required a *non-expired* access token, but by reopen the token had usually expired, and an expired token can't be refreshed offline → `user` resolved null → every gated page redirected to `/login`. Fix: new fixed-key `ptd_auth_user` cache (`src/lib/authCache.ts`) mirrors the user identity on every online auth success; `AuthContext` restores it synchronously on an offline cold-start (ignoring access-token expiry, honoring the day-change gate) **before** the 3s safety timer, so `loading` never flips false with `user` null. Cleared on all 4 signOut sites.
- **Fix: route and stop pages now served from a warmed shell cache when navigating offline.** FAILURE A: iOS home-button background → return reloaded a dynamic `/route/*` page offline → SW served the black `/offline` fallback ("no way back to Routes"). Fix (the nav work from the prior session, shipped together): `warmRouteShells` pre-caches the `/route/[routeId]` + stop page shells as HTML while online; the SW `text/html` runtime rule serves them on an offline navigation; `RouteListScreen` + `StopDetailScreen` cold-boot rehydrate from the Session B route cache.

**Follow-up fixes (same-day continued smoke testing — `68ff739`, `f168c96`, `3744848`):**

- **Fix: stop cards stay tappable offline (`68ff739`).** The pre-trip inspection gate (`stopsLocked`) grayed out + disabled stop cards offline because `useInspectionStatus` is a network fetch that fails closed to `inspected=false`, re-locking an already-inspected route once signal dropped. Scoped the lock with `!isOfflineMode` in BOTH `RouteListScreen` and `DayRouteSelectorScreen` (the gate's own comment says "fix both"). The regulatory ONLINE gate is unchanged — `stopsLocked` was NOT removed (it's the DOT pre-trip hard-stop).
- **Fix: Home screen no longer hangs on a loading spinner offline (`f168c96`).** Root cause was NOT the inspection hook (it has no loading state) — it was AppState `isLoading`: Home force-reloads on every mount (`loadDay(today, true)`) and gates its body on `isLoading`, while the offline `/api/routes` fetch hung with no timeout. Fix in `loadDay`: an offline fast-path (skip the fetch, serve the route cache immediately when `navigator.onLine === false`) plus a 10s `AbortController` timeout backstop for the iOS case where `navigator.onLine` lies `true`. Secondary: `useInspectionStatus` returns an inspected sentinel offline (fixes the offline CTA reading "Inspect & Start Route"; not the loading cause). Online path untouched.
- **Fix: staff note no longer shows raw HTML in the Before You Go sheet (`3744848`).** TapGoods `notes_employee_authored` arrives as rich text; the sheet rendered the literal tags. Added `stripHtml` to new `src/lib/utils.ts`, applied at RENDER time to the staff-note value only (`StopNotesPreSheet`) — raw value untouched in the DB / transform / other consumers. (The section-visibility filter was deliberately left keyed off the raw value — empty-header edge case is theoretical, not observed.)
- **Build green** at every commit (`npx next build`, 38/38 static pages). In-app `VERSION` left at `2.0.0` (these are fixes; no new What's New sheet).

## 2026-06-14 — PWA update prompts: v2.0.0 (no migration)

Three additive in-app prompts so drivers migrate off the old bookmark/icon and self-update going forward. Driver-app-only; no schema, no new endpoints, no shared/cross-repo files. Version lives in `src/lib/appVersion.ts` (`VERSION = '2.0.0'` + `CHANGELOG`). What's New copy (matches the sheet):

- Your route now loads even without signal
- App installs to your home screen with the PartyTime Work icon
- Offline indicator shows when you're working without connection
- App updates automatically when a new version is available

- **Feature 1 — Re-install banner** (`src/components/pwa/ReinstallBanner.tsx`): top of Home, only when NOT standalone + `ptr_install_prompted` unset. Platform-branched on `isIOS()` — iOS tap-to-expand 5-step Share-sheet flow; Android/other two static inline steps (⋮ menu → Add to Home Screen). Dismiss writes `ptr_install_prompted=true`. No `beforeinstallprompt` (deliberately out of scope).
- **Feature 2 — SW update-waiting banner** (`src/components/pwa/PwaUpdater.tsx`, global in `layout.tsx`): listens for a new SW reaching `waiting`, non-dismissible blue banner + **Update now** → `{type:'SKIP_WAITING'}` + reload on `controllerchange`. Required flipping `src/app/sw.ts` to **`skipWaiting: false`** (engages serwist's SKIP_WAITING message handler — verified `skipWaiting:!1,clientsClaim:!0` in generated `public/sw.js`). First deploy auto-activates once (live SW still `skipWaiting:true`); banner flow live from next deploy.
- **Feature 3 — What's New sheet** (`src/components/pwa/WhatsNewSheet.tsx`): dark slide-up sheet, `CHANGELOG` bullets + **Got it** → writes `ptr_last_seen_version=VERSION`. Shows when `VERSION !== ptr_last_seen_version`.
- **Coordination** (`src/components/pwa/PwaHomePrompts.tsx`, top of `DayRouteSelectorScreen`): single mount-time decision — re-install banner showing ⇒ What's New suppressed until next open (no stacking). Helpers + key constants in `src/lib/pwa.ts` (`isStandalone`, `isIOS`, `INSTALL_PROMPTED_KEY`, `LAST_SEEN_VERSION_KEY`).
- **Build green** (`npx next build`, 38/38 static pages).

## 2026-06-14 — PWA Session B: offline data layer (on `main`, `f23e314`+`27751f4`+`8af77e5`; no migration)

Made the day view + every stop's detail/manifest + Navigate work offline, with offline auth so a cold-start in airplane mode reaches them. Driver-app-only; no new endpoints, no Supabase calls, no schema. Investigation-first: confirmed `/api/routes` is the single full-day payload (list + all stop detail/coords), so one cache covers everything; the three StopDetail mount-time calls (SMS status, cash-collections, checkoff probe) are status overlays that fail closed offline and were deliberately NOT cached; Navigate makes zero network calls (deep link built from in-memory `stop` fields).

- **Route cache + banner + connectivity (`f23e314`):** `src/lib/routeCache.ts` (`writeRouteCache`/`readRouteCache`/`pruneOldRouteCache`, keys `ptd_route_<date>` + `ptd_route_cache_date`). `loadDay` success caches the **merged** stops (post-OTW/`ptd_stop_*` overlay) + prunes prior days; `loadDay` failure serves the cache for that date as `LOAD_OFFLINE` → `AppStateContext.isOfflineMode`. `<OfflineBanner/>` (amber `#FFB800`, "Offline — showing last saved route") on Home/Route/Stop only — absent from Tools/Will Call/Profile. Connectivity effect: `navigator.onLine` seed + `offline`→flag, `online`→`loadDay(today, true)` (existing success path already fires `syncOnReconnect` + `flushCheckoffQueue`).
- **Offline auth (`27751f4`):** `src/lib/authCache.ts` (key `ptd_profile_<userId>`) mirrors the last `getUserRole` so roles survive offline (session restore alone → `roles=null` → "Access denied"). `AuthContext` resolves profile from network online (+ caches) / cache offline; offline cold-start restores from a local non-expired `getSession()`. `LoginScreen` shows a "You're offline — open the app while connected first" notice instead of the form when offline (sign-in is a network call).
- **iOS loading-hang fix (`8af77e5`):** first cut deadlocked on iOS standalone airplane-mode (black "Loading…" forever) — `navigator.onLine` reads `true` in airplane mode for a beat so the offline net never ran, and supabase's init token-refresh hangs with no network timeout, swallowing `INITIAL_SESSION`. Added a single `finishLoading()` funnel + **unconditional 3s safety timeout**, a 1.2s race around `getSession()` so the local read can't hang, and a 1.2s fallback restore so `navigator.onLine` is no longer the sole gate. Plus a network-failure fallback in `resolveProfile` (failed `getUserRole` → cached profile, was "Access denied"). Timeline: non-expired restore ~1.2s, expired→offline notice ~2.4s, hard backstop 3s.
- **Status (Darren, 2026-06-14):** tests mostly passed; iOS standalone still "a little glitchy" — **deferred to a future cleanup session** (see `tasks/todo.md`). Known limitations by design: expired token offline → offline notice (no offline refresh); pre-deploy logins have no `ptd_profile_*` until one online session re-caches. Build green throughout (38/38). New lessons logged (loading-gate timeouts, `navigator.onLine` unreliability, cache-the-fat-payload-not-status-overlays).

## 2026-06-14 — PWA Session A (merged to `main`, PR #4 `4b1688e`; no migration)

Turned the driver app into an installable PWA with an offline app-shell. Prior state: NOT a PWA at all (no SW, no manifest). Driver-app-only; no shared/cross-repo files, no schema. Five commits squashed onto the feature branch, merged + branch deleted.

- **Foundations (`e9251d7`):** `public/manifest.json` (PartyTime Work / PTR Work, standalone, bg `#000000`, theme `#1F46FF`); 5 icons via re-runnable `scripts/gen_pwa_icons.py` (Pillow, from `ptr-mark.png` — mark on black + gold letter-spaced "WORK" in DIN Condensed Bold, the closest installed Barlow-Condensed-700 substitute; maskable padded to inner 60%); head tags via the Next 14 Metadata API (manifest, appleWebApp, icons, themeColor — not raw `<head>`); `@serwist/next@9.5.11` + `serwist@9.5.11` (verified compatible with Next 14.2.5), SW at `src/app/sw.ts` — precaches app shell (JS/CSS/HTML), NetworkFirst for same-origin navigations with `/offline` fallback, **`/api/*` and Supabase never cached**; `next.config.js`→`.mjs` (ESM `withSerwist`); tsconfig `webworker` lib + `public/sw.js` excluded (NOT a `types:[]` array — would clobber `@types/node`/react); `.gitignore` for generated SW.
- **Offline page + auto-reload (`14cbf46`):** `/offline` static fallback (black/gold "You're offline") + `ReloadOnReconnect.tsx` (`'use client'`, `window.addEventListener('online', () => location.reload())`) kept as a child so the page stays a server component. Copy finalized (no "last loaded route is still available" — the SW doesn't cache `/api/routes`, deferred to a Session B offline-data layer).
- **Status bar fix (`b36d0b8`):** `appleWebApp.statusBarStyle` `'black-translucent'` → `'black'` — the translucent value extended the web view under the status bar, causing Dynamic Island collision + an oversized bottom gap in standalone.
- **BottomNav — zero net change.** Two safe-area attempts (negative margin `14cbf46`, then a paint-over filler div `017b124`) were both reverted byte-for-byte (`b36d0b8`, `git checkout dcf98ee`); the nav is identical to its May-4 state and absent from the merge diff. The residual dark-screen color strip below the nav (from globals.css `.screen` self-padding) is logged as a pre-existing condition for a future safe-area audit (see `tasks/todo.md` + `tasks/lessons.md`).
- `npx next build` green at every step (38/38 static, Serwist bundled `/sw.js`). **Smoke test pending — on-device standalone install/offline (see `tasks/todo.md`).**

## 2026-06-12 — Will Call Phase 1 (driver `3f7d01a` + `e856b9a`, dashboard `cb9453f`; all pushed; no migration)

Warehouse-counter Will Call workflow, approved build off the completed investigation. Three corrected premises baked in: the role is **`will_call`** (`will_call_board` is just a dashboard realtime channel name), the dashboard action routes had NO role check at all (any cookie-authed user could stage/return), and check-off state is client-only in Phase 1 (zero migrations).

- **Step 0 (`e856b9a`):** locked mockups (`WillCallMockup.jsx` + `DriverCheckoffMockup.jsx`) committed to `docs/design-references/` before any feature code.
- **Dashboard (`cb9453f`):** new `src/lib/requireWillCallAccess.ts` (mirrors `requireWarehouseAccess`) — cookie-then-bearer dual auth + server-side role gate (`will_call | warehouse | scheduler | super_admin`) on all four `/api/willcall/[id]/*` routes (stage / pickup / return / staged-location). CORS headers + OPTIONS preflight added for `work.partytime-rentals.com` — the plan's "copy resolveAuth" excerpt didn't mention CORS, but a browser cross-origin caller is dead without it (lesson recorded). Audit columns (`staged_by`/`picked_up_by`/`returned_by`) now come from the gate's `userId`; service-client writes + SMS/email side effects untouched. Build green, pushed.
- **Driver reads:** `GET /api/will-call` — session cookie + the same four-role gate, admin-client SELECT of the plan's field list; non-returned + last-7-days-returned; no RLS change; no realtime (RLS would silently drop events for `will_call`-only subscribers) — `useWillCallOrders` refetches on focus/visibility + 30s interval.
- **Driver writes:** `src/lib/willCall/api.ts` cross-app POSTs (bearer, work-orders pattern) — SMS/email stay dashboard-side; return exceptions ride `returnNotes` (freeform summary via `buildReturnNotes`; server derives `has_discrepancy` + fires the discrepancy email).
- **Screens (`src/screens/willCall/`):** List (Today / This Week / All; ACTION NEEDED / STAGED / OUT / COMPLETE sections; red/blue state borders), Detail (4-step ProgressSteps + status-keyed CTA + overdue banner + returned completion block), Staging check-off (qty-exception only — damage toggle removed), Pickup confirm (identity verify card, items, plate-photo STUB with Skip, return date), Return check-off (short qty + damage flag), Return Done (recap + SMS note). Check-off screens pattern the production `ItemCheckoffPanel` interaction model (confirm-all, tap-accept circle, issue drawer + stepper, pinned gated CTA), exact mockup StatePill labels.
- **Nav swap:** `will_call` holders get Will Call in Training's BottomNav slot; Training relocates to a Tools Hub card (`TrainingCard`, gated by new `useWillCallAccess`). Non-holders completely unchanged. `WillCallGate` allows will_call OR super_admin (URL access for admins); nav tab + card are strict will_call.
- `npx next build` green both repos; both pushed to `main`. **Smoke test pending — see `tasks/todo.md` (incl. granting the `will_call` role to the counter profiles).**

## 2026-06-12 (AM) — Will Call Phase 1 investigation (read-only; docs-only) + Phase 2B stale-line fix

Five-point pre-build investigation that produced the corrected premises the Phase 1 build (above) was approved against. No implementation code written.

- **Auth gate:** the four dashboard `/api/willcall/[id]/*` action routes were cookie-only (no bearer fallback) AND had no role check (any cookie-authed user could stage/return); writes go through the service client so RLS never gates them — the retrofit needed dual auth + a server-side role gate, dashboard-side, no migration. Reads: the live `will_call_orders` SELECT policy (post-mig-080: `super_admin/scheduler/warehouse/read_only/display`) excludes `will_call` and `driver` — direct RLS reads would silently return zero rows for a `driver`+`will_call`-only profile (Dylan), forcing the driver-app admin-client read route. Realtime ruled out for the same RLS reason.
- **Data shape:** Will Call rentals (`deliveryType="customer_pick_up"`) create NO `dispatch_stops` rows; `upsertWillCallOrder` writes only `will_call_orders` (TapGoods-owned fields; status + audit columns untouched). Item list = `will_call_orders.items` JSONB (`{name, quantity, tapgoods_pick_list_item_id}`) — live-verified with non-null pick-list ids. No per-item checkoff table → Phase 1 check-off state is client-side; exceptions persist via `return_notes` + `has_discrepancy` only.
- **Roles:** `will_call_board` doesn't exist — real role is `will_call` (enum mig 042, already in the driver `Role` union, 5 active holders, none X-only). Lesson recorded in `tasks/lessons.md`.
- **Photo capture (Phase 2 reuse, untouched):** `StopDetailScreen.tsx` `compressImage` (canvas, JPEG 0.8) → `PhotoUploadService` → `/api/upload-photo` → Storage `pod-photos`/`{stopId}/{ts}.jpg` + `stops.pod_photo_url`. Found the `PhotoUploadService.ts` header comment is stale ("public/uploads") — logged in `docs/claude/tech-debt.md`.
- **Mockups:** `DriverCheckoffMockup.jsx` + `WillCallMockup.jsx` located in `~/Downloads` (not the repo; `WillCallMockup_1.jsx` is a byte-identical dupe) — recommended committing to `docs/design-references/`, done by the build as `e856b9a`.
- **CLAUDE.md fix:** Route Handoff Phase 2B section said "not yet pushed" — `git log` showed it on `origin/main` as `c4b2a07` since 2026-06-09; line corrected (the standing "trust the ref, not the prose" lesson).

## 2026-06-10 (PM3) — Check-off inline panel compaction (`beca737`, pushed; layout-only, no migration)

Live-test feedback: the Rev 1 inline panel's bottom zone ate too much screen — on iPhone only ~4 item rows were visible above the gated CTA + "Saved on your phone…" caption + tab bar. Spacing/container changes ONLY — zero logic changes (two-axis qty/damage, accept paths, gate behavior, commit/queue all verbatim).

- **`ItemCheckoffPanel.tsx`:** section header padding `24px 22px 10px` → `12px 18px 8px`; "Confirm all" 52→44 tall, margin 14→10; item row padding `12px 14px` → `8px 12px` (≈8px reclaimed per row — the 34px accept circle is kept as the touch target); exception summary strip tightened. Header comment now states the constraint: every px of chrome comes out of visible manifest rows.
- **`StopDetailScreen.tsx` gate block:** padding `12px 18px 14px` → `8px 14px 6px` (kills the dead band above BottomNav), CTA 58→48 (still pinned, never scrolls), caption condensed to 9.5px/3px margin.
- Net: pinned bottom zone shrinks ~35px + ~8px/row, all flowing to the `flex-1` scroll body — roughly 5–6 rows visible where there were ~4. `npx next build` green. **Darren's phone re-test is the gate — not marked complete.**

## 2026-06-10 (PM2) — Check-off live-test revisions 1–3 (driver `8869246` + dashboard `8c8fbcf`, both pushed; no migration)

Three locked revisions from the first live test on order `#0A819C5A`, built in one session across both repos. Spec section: Notion `37b0aa6451b881e39a1bcde70e6bd288` → "Live Test Revisions."

- **Rev 1 — inline check-off, sheet retired.** `ItemCheckoffSheet.tsx` → `ItemCheckoffPanel.tsx` (git rename; container-only change, all interactions verbatim). Panel renders in StopDetailScreen's manifest slot when `checkoffActive`; single gated bottom CTA pinned above BottomNav ("Confirm N items to complete" → "Complete Stop → Next") commits via `CheckoffPanelHandle.commit()` (ref) and resumes the items → cash → complete funnel in ONE tap. Action-card gold button hidden while active; `handleMarkCompleteTap` lost its check-off branch (still serves service/no-item/committed/warehouse_return-fallback paths). Success overlay removed with the sheet — keeping it would have re-created the double tap behind a Continue button.
- **Rev 2 — co-driver permissions (two stacked mechanisms).** (1) New `Route.truck_is_own` from `transformSupabase` — the soft-fail inherited truck keeps the display but is flagged so BOTH stop-lock gate sites (DayRouteSelectorScreen + RouteListScreen) lock only on the user's OWN crew truck, and `is_primary === false` is excluded outright. (2) `isTransferredAway` = ex-primary only; `canComplete` += `|| is_primary === false`; co-drivers retain completion/navigation through a handoff, ETA SMS stays primary/active-only. (3) `/api/complete-stop` clears `active_driver_id`/`transfer_pending_to` (admin client, non-fatal) on warehouse_return completion — handoff state finally has an exit path. (4) `/api/routes` warns loudly on empty `route_crew` mid-operation.
- **Rev 3 — silent accessory/add-on sweep (dashboard `8c8fbcf`).** Pre-step hard gate: query-side shape CONFIRMED by live introspection from a deployed surface (temp token-gated route on an ephemeral `vercel deploy` preview — no commit, no key exposure, deployment deleted after): `pickListAccessories`/`pickListAddOns` on `Rental` with `id: ID!` + `quantity: Int`, matching the assumption. `SYNC_RENTAL_BODY` gained both fragments (land in `reservations.tapgoods_data` verbatim, never any UI); write-back sweeps all accessories/add-ons to full qty unconditionally via `pickListLine()`. Pre-deploy reservations self-heal on the next sync cycle.

## 2026-06-10 (PM) — Check-off post-ship: type-regen verification + live-test triage (docs-only commit; no code changes)

**Type-regen drift check (todo item closed):** with `SUPABASE_ACCESS_TOKEN` available, regenerated `src/types/supabase.ts` against the live schema (`--project-id fumprcyavpefyupurvsv` — this repo is NOT `supabase link`ed, so `--linked` fails) and diffed against the morning's hand-patch: **byte-for-byte identical, zero drift**. The committed file was already canonical generator output; nothing to commit. `npx next build` green.

**Live-test failure triaged — NOT a code bug.** Report: driver saw no `ItemCheckoffSheet` on Mark Complete. Read-only investigation ruled everything in: production alias serves the `ec2fe6e` deploy (Ready 14:46 EDT; verified by finding the `ptd_checkoff_queue` marker string in a live served chunk), gate conditions correct and fail-closed, sheet imported + mounted, `/api/routes` SELECT carries `items`, and test stop `#0A819C5A` (Melissa Morizet delivery) has 3 item lines ALL with non-null `tapgoods_pick_list_item_id` — plus zero `stop_item_checkoffs` rows and no completion stamp, i.e. the new code path never executed on the device. **Root cause: the device's app session predated the 14:46 deploy** — no service worker exists, but an open PWA keeps the old bundle in memory until force-quit. Retest after relaunch is the pending gate (tasks/todo.md). Lesson recorded (deploy-race verification playbook + management-API SQL path).

**Housekeeping:** `.env.local` now also holds `SUPABASE_ACCESS_TOKEN` (Darren to remove/rotate after CLI work); sensitive server keys still empty locally (Vercel returns sensitive vars as `""`).

---

## 2026-06-10 — TapGoods Item Check-Off, driver UI (`ec2fe6e`, pushed to `main`; build green)

Driver-app side of the TapGoods item check-off (spec `37b0aa6451b881e39a1bcde70e6bd288`, design-locked June 10; dashboard side pre-shipped at `87c75f2` with mig 096 applied + live-verified). When a driver completes a delivery or pickup, every item line must be confirmed — one tap for "all good," per-line for exceptions — and the confirmation writes real quantities back to TapGoods, emails Melissa on shorts, and spins a repair work order on damage. **Confirmation is a HARD GATE on Mark Complete.**

**Types (step 1):** `tapgoods_pick_list_item_id` declared on `RawItem` (`supabaseTransform.ts`) + `Stop['items']` (`types/index.ts`) — types-only; the value has flowed through `/api/routes` at runtime since dashboard sync Part A. `src/types/supabase.ts` gained `stop_item_checkoffs` + `dispatch_stops.tapgoods_discrepancy_emailed_at`, **hand-patched from the dashboard's post-096 regen** (supabase CLI had no access token this session — a real regen is queued in todo).

**Check-off sheet (`src/components/checkoff/ItemCheckoffSheet.tsx`):** built to the approved June 10 clickable artifact. Confirm-all gold button (accepts pending lines at full qty); per-line tap-to-accept toggle (green check); inline Issue drawer with a 0..ordered quantity stepper (short → amber accept circle showing the corrected number) and an **independent** "Item damaged" toggle (never changes quantity; stop-type-aware copy; pre-filled WO chip previewing the Report-an-issue handoff); "WHAT HAPPENS ON COMPLETE" summary strip when exceptions exist; gate button disabled until every line resolves (live count in the disabled label); footer "Saved on your phone · TapGoods sync runs automatically"; success overlay summarizing TapGoods status / discrepancy note / work orders, whose Continue resumes the funnel.

**Gate insertion (`StopDetailScreen`):** `handleMarkCompleteTap` gates BEFORE the COD branch — delivery/pickup with items and no committed check-off → sheet opens instead of any modal; **fails closed** while hydrating. One funnel: items → cash → complete (post-commit, non-COD completes directly — the sheet's gate button carried the intent; COD goes through the extracted `openCashModal()`). Committed state = localStorage flag OR an existing `stop_item_checkoffs` row (crew_read probe). **Untouched:** warehouse_return geofence auto-complete, service stops, COD gate behavior, ETA-SMS primary-only axis, co-driver completion rights (gate inherits `canComplete`), all required-pickup/pickup-stub/missed-pickup/inflatable logic.

**Data layer (`src/lib/checkoff/`):** audit rows insert via the supabase client under RLS (crew insert own-route, `confirmed_by = auth.uid()`, append-only). Write-back POSTs `{stop_id, lines}` to the dashboard's `/api/tapgoods/dispatch/write-back` with the bearer token (work-orders pattern); 401/403 are treated as bugs — never retried. Offline queue (`ptd_checkoff_queue`) copies the OTW dedupe-by-stop last-write-wins pattern and **also enqueues on `200 {synced:false}`** (TapGoods down, network up); provably-permanent reasons are dropped; a failed audit insert rides the same queue. Flush wired into `loadDay` beside `stopStateService.syncOnReconnect`.

**Damage → WO:** `ReportIssueForm` gained optional `preSelectedItemIndex` (+ `workOrderId` on its result); the stop report-issue page reads `?item=N&checkoff=1` (Suspense-wrapped `useSearchParams`). In checkoff mode the screen stashes `{itemIndex, workOrderId, workOrderNumber}` and bounces back; the sheet auto-reopens and the WO id **rides the commit INSERT** — required because drivers have no UPDATE on the append-only table.

**Session note:** `.env.local` had been wiped to a lone `VERCEL_OIDC_TOKEN` (a dev-scope `vercel env pull`), breaking `npx next build` at page-data collection. Rebuilt from the production pull; sensitive vars come back empty by Vercel design — anon key recovered from the deployed bundle (public), server secrets left for Darren to restore. See `tasks/lessons.md`.

**NOT smoke-tested.** Darren's live test (real delivery/pickup → TapGoods reflects quantities + discrepancy email lands + WO fires) is the completion gate.

---

## 2026-06-09 — Warehouse IN TRANSIT writer: `routes.actual_departure_at` (driver app + schema mig 095)

The warehouse Overview's 5-stage tracker (Dispatched → Pulled → Loaded → In Transit → Returned) never reached **IN TRANSIT**: `deriveStage` only got there via `dispatched_at && hasActivity`, where `hasActivity` is a *stop-level* arrival/completion — neither exists between the truck leaving the yard and reaching stop 1. There was no writer for "truck departed warehouse." `dispatch_stops.actual_departure_at` exists but is the per-stop leg ("left this stop"), the wrong grain, and was itself never written.

**Schema (mig 095, applied from this repo):** added `routes.actual_departure_at timestamptz NULL` — verified absent first (live `information_schema` check: routes had `active_driver_id`/`dispatched_at`/`transfer_pending_to` but not this). Applied via `supabase db query --linked --file` after a `BEGIN…ROLLBACK` preview; recorded re-runnably at `supabase/data-patches/2026-06-09_routes_actual_departure_at.sql`. Dashboard mirror written at `supabase/migrations/20260609200000_095_routes_actual_departure_at.sql` and marked applied in the shared remote tracker (so a future dashboard `db push` won't re-run it). `src/types/supabase.ts` regenerated (also picked up the already-live `route_crew.start_time_overridden` from dashboard mig 094).

**Code:**
- `POST /api/routes/[routeId]/depart` (no body) — session-cookie auth + service-role admin client, **server-authoritative ownership gate** mirroring `transfer/initiate` (`active_driver_id` set → caller must BE it; else caller must be the `is_primary` `route_crew` row). **Idempotent:** already-stamped → 200 with the existing timestamp, no write; the `.is('actual_departure_at', null)` update guard makes a concurrent double-start a no-op.
- `src/lib/departApi.ts` — `departRoute(routeId)`, a **best-effort** wrapper that never throws and never blocks navigation (a failed stamp must not trap the driver on the start screen).
- Wired at both route-start paths: `InspectionScreen` `complete`-step CTA (stamps unless outcome is `oos` — an out-of-service truck is hard-blocked and isn't departing) and `DayRouteSelectorScreen.handleCtaTap`'s already-inspected "Start Route" branch (stamps only when truck + inspected; the no-truck "Join Route" path does NOT stamp — joining ≠ departing). Both fire-and-navigate.

**Dashboard (same session, see its CHANGELOG):** `warehouseOverviewServer.deriveStage` fires `in_transit` on `routes.actual_departure_at`; `WarehouseRouteColumn.deriveColState`'s `'out'` state reads it too; `board.ts` `Route` type + `supabase.ts` updated. One writer (this column), both warehouse surfaces.

**Smoke tests:** (1) rolled-back txn on a real route — stamping flipped the derived stage `pulled → in_transit`, then ROLLBACK left production `actual_departure_at` null; (2) live dev server — `POST …/depart` unauth → `401 Unauthenticated`, `GET` → `405` (routing + dynamic param + auth gate confirmed). `npx next build` green both repos.

---

## 2026-06-09 — Phase 2B: Route Handoff (driver app + schema mig 093; build green, NOT yet pushed)

Driver-to-driver mid-route handoff. A route's current owner offers it to another crew member; the recipient accepts (taking over ETAs/SMS/completion) or declines. Both devices update live via realtime.

**Schema blocker, reconciled (mig 093, applied from this repo):** the prompt said the columns shipped with mig 092, but a live-DB check found neither `active_driver_id` nor `transfer_pending_to` on `routes` (nor anywhere). The locked Notion spec agrees: 092 = the `warehouse_return` order_status sentinel fix; Phase 2B was re-allocated to **093**, unwritten. Authored + applied `routes.active_driver_id` + `transfer_pending_to` (both `uuid NULL` FK → `profiles`) via `supabase db query --linked --file` after a `BEGIN…ROLLBACK` preview. Recorded re-runnably at `supabase/data-patches/2026-06-09_route-handoff-093-columns.sql`. **chat-Claude must mirror this into the dashboard repo's numbered mig 093 + fix the Notion ledger.**

**Code:**
- `/api/routes` select gained `active_driver_id`, `transfer_pending_to`; crew-names select gained `user_id` + `profiles(id)` so the picker can resolve crew profile ids. Threaded through `SupabaseRouteRow`/`SupabaseCrewRow` → `transformSupabase` → `Route` (+ new `RouteCrewMember`, `crew[]`). `src/types/supabase.ts` regenerated.
- `src/lib/routeOwnership.ts` — `isActiveDriver(route, profileId)` (no transfer → existing `is_primary` gate; active transfer → `profileId === active_driver_id`), plus `isTransferredAway` / `isTransferPendingForMe` / `crewMemberName`. Replaced the raw `is_primary` ETA/SMS gate in `StopDetailScreen`.
- **Completion gate (decision: active-transfer only).** Completion was UNGATED in Phase 2A. To preserve that, completion is restricted to the active driver ONLY when `active_driver_id` is set; no transfer → anyone completes (co-drivers keep their Phase 2A ability). Guarded at `runStopComplete`, the warehouse_return geofence auto-fire, and both Mark Complete buttons; handed-off primary sees a "Transferred to [Name]" locked note.
- `POST /api/routes/transfer/initiate` ({routeId, toProfileId}) — owner-gated, validates target is route crew, writes `transfer_pending_to`. `POST /api/routes/transfer/respond` ({routeId, accept}) — recipient-gated; accept → `active_driver_id`=caller + clears pending, decline → clears pending. Both: session-cookie auth + service-role admin writes, server-authoritative gates.
- Home (`DayRouteSelectorScreen`): `PendingTransferCard` (recipient accept/decline, top of body), `TransferPickerSheet` (owner picks crew, excludes self), "Transfer Route" button / "Waiting for [Name]…" / "Transferred to [Name]" states below the stop list, and a `routes` realtime subscription (`postgres_changes` UPDATE → `loadDay(today, true)`). Realtime confirmed viable: `routes` is in `supabase_realtime` AND `routes_authenticated_read` RLS lets the driver client receive the events.

No dashboard changes; Melissa's view is unchanged. `npx next build` green. **Held from push** pending Darren's two-device smoke test + chat-Claude's dashboard/Notion mig-093 reconciliation.

---

## 2026-06-06 — wall→ladder `dependency_map` data patch (direct to `main`, `eac74f0`)

Data patch only — no schema, no migration, no code changes. Reported by Dylan Morizet (2026-06-06): a `40x80` pole-tent pickup didn't surface a ladder on the morning checklist because the walls were named `MQSW 8'X10' SOLID WHITE WALL` and the Ladders rule keyed only off `keyword='sidewall'` with a `quantity_threshold` of 5.

**Investigation:** confirmed the production `dependency_map` Ladders row (`id 11576f1f-9448-4ed1-ab3f-0623fd09178e`) was `keyword`/`sidewall`/threshold-5/qty-2. Read `src/lib/ava/dependencyHits.ts` to confirm the matcher: `ruleFires` lowercases both sides and does a single `.includes()` substring test (line 45), summing matching item qty against `quantity_threshold`. So `'sidewall'` literally cannot match an item named `…SOLID WHITE WALL` (no `sidewall` substring), and even a matching wall needed ≥5 units.

**Patch (authorized, applied to prod via `supabase db query --linked --file`):** `trigger_value` `sidewall`→`wall`, `quantity_threshold` 5→1, `required_quantity` 2→1, notes refreshed to "Any wall item on route requires a ladder…". Verified: exactly the one Ladders row updated (same `id`), no other rows touched. `'wall'` is now a substring of every wall variant (`sidewall`, `solid white wall`, `wind wall`, …) so any single wall on the manifest adds 1 ladder.

**Durability:** recorded re-runnably at `supabase/data-patches/wall-ladder-threshold-fix.sql` (third file in that dir). Its `WHERE` keys off `trigger_type='keyword' AND required_item ILIKE '%ladder%'` — **not** `trigger_value` — so it re-applies cleanly after a fresh DB rebuild, where the Migration 016 seed recreates the row with the old `sidewall`/threshold-5 values.

**Note on breadth:** the broadened keyword + threshold-1 means the ladder fires far more often now (intended). No false-positive item-name collision identified for the `'wall'` substring. **Smoke test pending** — see `tasks/todo.md` (top).

---

## 2026-06-03 — Warehouse notes surfacing, route + stop level (direct to `main`, `de05529`)

Fetch + display + AVA-wiring session. No schema changes — `dispatch_stops.warehouse_notes` (dashboard mig 077) and `routes.warehouse_notes` (mig 078) pre-exist. `npx next build` green; Vercel deploy `de05529` READY on production. Five steps:

1. **`routes.warehouse_notes` fetched** — added to the `/api/routes` routes-table SELECT, `SupabaseRouteRow`, the `routes.map` transform, and the `Route` type. (Stop-level `warehouse_notes` was already selected since Session 2.)
2. **Home "WH" pill** (`DayRouteSelectorScreen`) — shows on any stop card with a non-empty `warehouse_notes`, in both card layouts. No existing warehouse-pill token, so it uses the warehouse-context blue (`#0000FF`, matching the StopDetail "From warehouse" card) but **outlined/tinted** to stay distinct from the solid red WIND / gold COD / solid-blue delivery-type pills.
3. **Route-start FROM WAREHOUSE sheet** (`RouteStartWarehouseSheet.tsx`) — intercepts "Inspect & Start Route" when `routes.warehouse_notes` exists; dark sheet (mirrors `StopNotesPreSheet`, no backdrop/auto-dismiss) shown **before** `/inspection`. FROM WAREHOUSE (full text) first, FROM DISPATCH second. **Reads the warehouse note aloud verbatim on mount** (no tap). No note → straight to inspection (unchanged).
4. **Morning-brief awareness line** — `getMorningMessage` gained `MorningSummary.hasWarehouseNote`; appends "There's a warehouse note for your route. You'll hear it when you start." (awareness only; full text plays at route start). `AvaMorningCard` takes a `routeWarehouseNote` prop and treats a route warehouse note as a card-visibility trigger.
5. **Stop-note ordering reversed** — FROM WAREHOUSE now renders **before** the dispatcher note in `StopNotesPreSheet` (SECTION_ORDER swap) and `StopDetailScreen` (JSX reorder, styling untouched). Supersedes the Session-2 "right after the dispatcher note" ordering.

**Judgment calls:** (a) WH-pill color — the spec said "use an existing warehouse-context token if one exists"; that token is solid blue, which collides with the solid-blue delivery type pill, so the pill is outlined/tinted blue instead of solid. (b) Step-4 brief line used a **period, not the spec's em dash** — `withSentencePauses()` only inserts the ElevenLabs `<break>` after `.`/`!`/`?` (locked Session-2 rule), so an em dash would add no pause. (c) The Step-3 sheet also shows the route dispatcher note (FROM DISPATCH, second) to honor the spec's explicit "warehouse first, dispatch second" ordering, even though no FROM DISPATCH block previously existed in the route-start→inspection transition; only the warehouse note is read aloud.

## 2026-06-02 — AVA Session 3: SOP visibility fix + SOPs in conversation + role-based access scoping (direct to `main`, `1a1d714` → `64356dd` → `48d5487`)

Investigation-first session. No new migration; no UI changes. `npx next build` green before each push.

**`1a1d714` / `64356dd` — SOP driver-visibility fix (NOT a sync bug).** A smoke-test report said "only SOPs 5/8/9 are in `sop_entries`; the sync silently skipped the rest." Investigation overturned the premise: a single `SELECT` against the linked prod DB returned **all 10** SOPs (one shared insert timestamp) — the sync had discovered every Notion child page and paginated correctly. The real cause was the Training-Hub visibility filter `isDriverVisible`, which used `/\b(driver|field|all)\b/i`: the Notion departments are the **plural** "Drivers", and `\bdriver\b` can't match before the trailing "s", so only "All Departments"/"Field Operations" SOPs (005/008/009) showed and 001/003/006 were silently filtered out. Fixed to `drivers?` plus a tent-title carve-out for SOP-010 (Tent Setup, null department because it's the one child page missing from the Notion summary table). Driver-visible set is now 7 (001/003/005/006/008/009/010); Warehouse-only (002/007) and Operations (004) still excluded. Reproduced the bug and verified the fix with a `node -e` regex test against the real department strings. AVA's "I don't see SOP 1" was a separate, expected limitation — `/api/ava/ask` had zero SOP references (addressed next).

**`48d5487` — SOPs in `/api/ava/ask` + foundational role-based access scoping.** AVA now answers procedural questions ("how do I hook up the gooseneck?") by drawing on SOP content in her system prompt, instructed NOT to recite SOP numbers unless asked. SOPs load **server-side** at request time (`loadScopedSops`), scoped to the caller's role read from `auth.uid() → profiles.roles` (never a client flag): driver → `isDriverVisibleSop` filter, elevated (`super_admin`) → all SOPs; defaults to the driver scope on lookup failure (least privilege). There is no plain `admin` role in the system — `super_admin` is the only elevated role (`admin` accepted defensively). SOPs injected in full (~6k tokens driver / ~8.5k all — size was never a concern, so no chunking); best-effort (a load failure logs and AVA still answers route questions). System prompt split into two blocks for caching: block 0 (persona + per-role SOP base) is stable → `cache_control`, shared across all driver conversations and clears Haiku's 4096-token cache minimum; block 1 (client-seeded route context) is volatile → after the breakpoint. New shared libs: `src/lib/ava/sopVisibility.ts` (`isDriverVisibleSop`, now imported by both `SopSearchSection` and the API so they can't drift) + `src/lib/ava/access.ts` (`isElevatedRole`). **Route-context scoping verified already caller-bound** at the source (`/api/routes` is assignment-scoped by `user.id`) — no change. **Not yet smoke-tested against live Haiku** (needs an authed session on the deploy). Two items flagged not-changed: elevated "all routes" in AVA isn't wired (route context is client-seeded; `/api/routes` restricts admins by design), and `/api/routes` has a pre-existing soft-fail to an unscoped query on assignment-lookup error. Foundational scoping rule documented in CLAUDE.md → AVA Session 3.

---

## 2026-06-02 — dependency_map note/trigger cleanup + tent-Hammer drop + AVA voice copy (direct to `main`, `12c2a91` → `f4785cd` → `3ef660e`)

Investigation-first session. Data/copy only — no schema, no new migration. DB changes applied via `supabase db query --linked --file` and recorded as re-runnable `.sql` under a new `supabase/data-patches/` directory (the convention for non-migration data changes going forward). `npx next build` green before each push.

**Commit 1 (`12c2a91`) — dependency_map note cleanup + Pry bar retarget + two no-change findings.** `dependency_map.notes` renders to drivers in `AvaChecklistSheet`, so dev artifacts don't belong there. Cleaned (kept the real-world text): Hammer/Sledgehammer ("… — added Migration 021 (Fix 3)" → "Tent setup" / "Drive tent stakes"), Wood blocks ("… — keyword match only" → "Not needed for frame tents"), Ladders ("… — Lucas confirmed" → "5+ walls threshold"). **Pry bar** retargeted from `category='TENTS'` (fired on EVERY tent item, plus showed "Any MQ or tent item" to drivers) → `keyword='cross cable'`, note cleared — chosen by querying real `dispatch_stops.items` names ("CROSS CABLE" is the contiguous substring across MQ cross-cable frame tents; bare "MQ" over-matches `MQSW`/`MQDW`/`MQCW` walls/doors). **No-change findings:** (a) "Sledgehammer appears twice" — verified ONE correctly-spelled row; dedup (sheet `seen` Set + morning-card count Set, keyed on `required_item`) works; the only double-row item is Hammer (TENTS + inflatable) and it dedupes by design. (b) `getMorningMessage.ts` was intact and already Session-2-compliant; the requested em-dash fix was rejected because `withSentencePauses()` only breaks on `.`/`!`/`?` — em dashes add no pause and would regress the fix.

**Commit 2 (`f4785cd`) — drop tent Hammer + punch up easy-day copy.** Deleted the `Hammer`/`category='TENTS'` row (a sledgehammer covers tent setup + driving stakes); kept the `Hammer`/`keyword='inflatable'` row. Net: tent-only → Sledgehammer; inflatable-only → Hammer + Hand truck; both → Hammer + Sledgehammer + Hand truck (recorded in `supabase/data-patches/2026-06-02_dependency_map_drop_tent_hammer.sql`). Replaced the flat 2–3-stop personality fallback ("Smooth start." family) with punchier variants, within the Session 2 TTS rules; single-stop array left alone (already punchy).

**Commit 3 (`3ef660e`) — second-person AVA voice.** AVA addresses the driver directly, so the single-stop and 2–3-stop personality fallbacks (both neutral/imperative) are now second person ("You've got one stop today. Quick win." / "You've got two stops today. Quick one. Let's roll." / "{N} stops on your route. Easy run. Let's get after it."). Weather, COD, tent, 4+-stop, and dispatch-note blocks untouched (out of scope).

**Files:** `supabase/data-patches/2026-06-02_dependency_map_checklist_voice_fixes.sql` (new), `supabase/data-patches/2026-06-02_dependency_map_drop_tent_hammer.sql` (new), `src/lib/ava/getMorningMessage.ts`. **Smoke tests pending** — see `tasks/todo.md` (top).

---

## 2026-06-02 — Log Service UX fix: error visibility + compliance POST protection (direct to `main`, `52f4016`)

Acted on the prior read-only investigation (see entry below). Two targeted fixes, one commit, `npx next build` green, pushed direct to `main`.

**Fix 1 — Error visibility + Save-button feedback (`LogServiceEntryScreen.tsx`).** Validation errors used to render inside the scrollable body, often off-screen above the fixed footer — a failed Save looked like a dead button. Moved the error block into the fixed footer directly above the Save button (always visible). Added a 150ms red border flash on validation early-returns via a `failValidation()` helper (combines the existing `setError` + flash; conditions and messages unchanged). The button carries a constant `2px solid transparent` border with `box-sizing: border-box` so only the color flips — no layout shift.

**Fix 2 — Compliance POST partial-failure protection (`queries.ts`, screen, new `FleetServiceToast`).** `postComplianceExpiry` (cross-app dashboard POST) ran after the `service_records` insert had already committed; a throw (bad env/route/network) surfaced as a save error, so retries inserted duplicate records. Now wrapped in its own try/catch in `createServiceEntry`: logs, does **not** rethrow, and returns `{ success, recordId, complianceUpdateFailed, complianceError }` (was `Promise<string>`; sole caller ignored the value). `save()` always navigates and, on `complianceUpdateFailed`, stashes a one-shot toast surfaced at the destination via the new `FleetServiceToast` (sessionStorage stash, mirrors the ReportIssue→StopDetail pill) dropped into `WorkOrderDetailScreen` + `AssetDetailScreen`: "Service logged. Compliance date couldn't be updated — please notify your manager." Navigation is never blocked. **Smoke test pending** (`tasks/todo.md`, top): force the failure locally by unsetting `NEXT_PUBLIC_DASHBOARD_URL`.

---

## 2026-06-02 — Investigation: Log Service "Save doesn't work" (no code changes)

Driver reported the Save button on Log Service (`LogServiceEntryScreen.tsx`) does nothing. Traced the form, `createServiceEntry`/`postComplianceExpiry`, RLS, and schema — no fix applied (read-only session). Findings recorded in `docs/claude/tech-debt.md` → Active Blockers. Headline: the Save button is never field-gated (`disabled={saving}` only); failures surface in a low-visibility spot and validation early-returns give zero button feedback. Most likely everyday cause = **Service type not selected** (required, not prefilled). Secondary = **compliance-type save** POSTing to the dashboard after the record insert already committed → throws on env/route failure → looks failed but record saved, retry duplicates. Ruled out: NULL mileage (column nullable, field optional) and a `service_term_months` schema regression (column exists). Verified via read-only `information_schema` + `pg_policies` queries against the linked DB.

---

## 2026-06-02 — Three driver-app fixes (direct to `main`, `e41c976`)

Investigation-first session: read CLAUDE.md + todo + lessons, traced each fix, confirmed scope (one `AskUserQuestion` on Fix 1), then implemented. `npx next build` green; pushed direct to `main` per the unrelated-fixes branch policy.

**Fix 1 — Home post-inspection flow (`DayRouteSelectorScreen.tsx`, `InspectionScreen.tsx`).** Drivers read the post-inspection "quiet state" (stop list hidden once inspected, per AVA Phase 1/Session 2) as "stops cleared." Partial reversal: the day list + "The day, in N" header now persist post-inspection as the live route overview; completed stops show RouteListScreen's ink-circle + gold-checkmark treatment (new local `CheckIcon`) so completion reads identically on both views. AVA brief / weather / Ask Ava stay pre-inspection-only (still `!inspected`-gated) — stop-list-only persistence, confirmed with Darren. Removed the duplicate "REQUIRED FIRST / Pre-trip inspection" card (and now-orphaned `DocIcon`/`ChevronRightIcon`); the gold bottom CTA is the sole inspection trigger and is now persistent — "Inspect & Start Route" pre-inspection, "Continue route" (→ `/route/[id]`) post-inspection. The inspection completion CTA navigates to `/route/[routeId]` instead of `/`.

**Fix 2 + Fix 3 — Migration 021 (`dependency_map`).** The morning checklist is DB-driven, so both were data, not code. Fix 2: cleared the stray "Dylan interview May 24" note off the `Zip ties` always-carry row. Fix 3: added `category='TENTS'` → `Hammer` + `Sledgehammer` rules (same shape as the existing `Pry bar` tent rule); inflatable → `Hammer` + `Hand truck` already existed, and `AvaChecklistSheet` dedupes by `required_item`, so a tent+inflatable day shows `Hammer` once. Idempotent migration (plain UPDATE + `NOT EXISTS`-guarded INSERT); applied via `supabase db query --linked --file` + `migration repair --status applied 20260602021`.

---

## 2026-05-31 — AVA Phase 2 — Session 2: two fixes + merge to `main` — merge `02abfc6`

Two follow-up fixes on `feature/ava-phase2-session2`, then merged to `main` (`--no-ff`, `09135db..02abfc6`) on Darren's go and the branch deleted (local + remote). `npx next build` green before each commit and on the merged `main`. Commits: `3cfa14b` (copy) · `d9e5425` (tent threshold) · `cdad015` (warehouse_notes).

**Fix 1 — morning-brief copy + tent threshold (`getMorningMessage.ts`).** Voice-first cleanup: numbers under ten spelled out via `spellNumber`/`spellNumberCap` (numerals kept for 10+, capitalized at sentence starts); every ` — ` separator → a natural sentence break (ElevenLabs pauses via the existing `SENTENCE_PAUSE` `<break>`); "canopies" → "tents". Heavy tent-day framing ("Big tent day" / "Tent fortress day") moved from `tentCount >= 2` to `>= 5` in both direct + personality sets; 1–4 tents fall through to the generic stop/COD lines.

**Fix 2 — surface `dispatch_stops.warehouse_notes` (dashboard Migration 077).** Wired like `dispatcher_notes`, all reads, no migration, no new route: `/api/routes` SELECT + `SupabaseStopRow` + `toRealStop` → `Stop.warehouse_notes`. Stop Detail "FROM WAREHOUSE" labeled block (solid-blue card chrome, shown inline) below "Note from dispatch". `StopNotesPreSheet` "FROM WAREHOUSE" section ordered right after the dispatcher note (gates Send-ETA / Open-in-Maps the same way). Morning-brief count (`stopsWithNotes`) now counts stops with `dispatcher_notes` OR `warehouse_notes` (both-on-one-stop counts once); the shared review drawer `AvaDispatchNotesSheet` renders both note types labeled per stop and is retitled "Notes for your stops"; the card-visibility gate fires on warehouse-only-note days. `warehouse_notes` deliberately NOT added to the `/api/ava/ask` seedContext (out of scope). Did not regen `src/types/supabase.ts` — the `/api/routes` path uses a raw SELECT + hand-rolled `SupabaseStopRow`, build green.

## 2026-05-31 — AVA Phase 2 — Session 2: Haiku conversation sheet + SOP search — `feature/ava-phase2-session2` (not merged)

Built on `feature/ava-phase2-session2`. Pre-build gate passed (`ANTHROPIC_API_KEY` present on Vercel prod+preview). Step 0: triggered prod SOP sync via `x-sop-sync-secret` (pulled from Vercel) → `{synced:10, errors:[]}`; `sop_entries` now holds SOP-001…010, content non-empty (1.7–3k chars). Per-deliverable commits: `4faef54` (D1 — ask route + sheet + wiring) · `044b879` (D2 — SOP search + mig 020). `npx next build` green before each.

**Deliverable 1 — AVA conversation.**
- `POST /api/ava/ask` — auth-gated (session, no open LLM proxy). Builds AVA persona + today's-route context into a system prompt; calls `claude-haiku-4-5-20251001` (`max_tokens: 500`, no `effort`/`thinking` — unsupported on Haiku 4.5). Logs Q+A to `ava_conversations` (surface `driver_home`, `context_id` = route id, `driver_id` = `auth.uid()` server-derived). 503 `{error:'AVA unavailable'}` when `ANTHROPIC_API_KEY` unset or the call fails.
- **Context is client-seeded, not server-read** (deliberate deviation from spec wording, per `tasks/todo.md`'s step plan): Home passes `seedContext` (customer stop count, COD count, wind-alerted stop NAMES from the `routeWeather` hook, dispatcher notes, manifest summary, driver name) so `/api/ava/ask` never re-runs the Tomorrow.io weather fan-out.
- `AvaConversationSheet` (`src/components/ava/AvaConversationSheet.tsx`) — shared dark bottom-sheet (`open/onClose/seedContext`, optional `initialQuestion`), built for AvaChip reuse later. Session-local messages, text input + Send, VOICE/TEXT toggle (default VOICE → `speak()` TTS; TEXT cuts playback via `stopSpeaking()`), "AVA is thinking…" waveform (reuses `.ava-wave-bar`), friendly error state.
- Home "Ask Ava about today" button: replaced the coming-soon toast with the real sheet. `AskAvaButton` now takes `seedContext`+`routeId`; `DayRouteSelectorScreen` computes `seedContext` via `useMemo`.

**Deliverable 2 — SOP search.**
- `SopSearchSection` in the Training Hub (top of scroll body). Fetches the SOP set once (≤10 rows) via the browser Supabase client, filters driver-visibility AND the 300 ms-debounced query in-memory. SOP-number chip + title + department badge + 120-char excerpt; tap-to-expand full content inline. Zero query → all driver-visible SOPs (sop_number asc). Empty state → "Ask Ava instead" opens `AvaConversationSheet` seeded with the failed query.
- **`department` is free-text/composite** ("Drivers / Warehouse", "Field Operations", "All Departments", "Warehouse", "Operations", null) — not the spec's clean tokens. Driver-visible = matches `/\b(driver|field|all)\b/i`.
- **Migration 020 `sop_entries_rls`** — enabled RLS (Session 1 left it OFF, exposing SOPs to the public anon key) + `authenticated` SELECT `USING(true)`. Applied via `db query --linked --file` + `migration repair --status applied 20260531020`. Local migrations now 20 files.

**Note:** working-tree `CLAUDE.md` had a large pre-existing uncommitted trim (not from this session); Session 2 updates were layered on top of it.

## 2026-05-30 — AVA Phase 2 — Session 1: Weather Alerts + SOP Foundation — `main`/production — merge `0176699`

Built on `feature/ava-phase2`, merged to `main` via `--no-ff` on Darren's explicit go, branch deleted. Investigate-first cadence with checkpoints throughout. Per-deliverable commits: `40c9827` (mig 018) · `ee93388` (mig 019) · `e99f050` (geocode) · `f66f43a` (route-weather) · `fefe4fe` (hasWeatherFlag) · `c041979` (wind pill) · `d8256b7` (Ask-Ava button + SOP sync) · `efe4bc4` (gust fix) · `014666e` (stop-count fix) · `fb5222d` (copy rewrite).

**Migrations** (both applied via `db query --linked --file` then `migration repair --status applied`; two-repo block precludes `db push`). 018 `dispatch_stops_geocache` (`delivery_lat/lng FLOAT`); 019 `sop_entries` (table + department index). Local migrations now 19 files.

**Weather alerts.**
- `geocodeAddress(address, stopId?)` (`src/lib/geo/`) — Nominatim, cache-first off `dispatch_stops`, best-effort write-back, null on failure. Smoke-tested live (Poughkeepsie 41.70,-73.93).
- `getWindAtTime(lat,lng,isoTime)` added to the EXISTING Tomorrow.io+NWS `weather-service.ts` (reuse decision — no Open-Meteo, no new file). Returns **`max(sustainedMph, gustMph)`** for the hour (gust-inclusive; fixed mid-session after a live miss where gusts 21 / sustained 10 didn't alert). Already imperial → no conversion. `windHourly[].time` is UTC; callers pass UTC ISO.
- `POST /api/ava/route-weather` — server-side, authoritative-by-id, admin client; geocode write-back + wind at `calculated_eta` (UTC-normalized via `new Date(eta).toISOString()`); `weatherAlert = windMph >= 20`; returns per-stop `{stopId,weatherAlert,windMph}` + `hasWeatherFlag`. Gates verified (400 bad body / 401 no session).
- `useRouteWeather` hook → `hasWeatherFlag` into `AvaMorningCard` (wind brief copy) + red `WIND {mph}` pills on Home stop cards (#DC2626, payment-pill sizing).

**SOP foundation.** `POST /api/sop/sync` mirrors the Notion SOP Library — confirmed via `notion-fetch` to be a **page** (summary table + 10 child SOP pages), not a database. Raw Notion REST (`fetch`, no dep): parse table for metadata, child pages for number/title/content/page-id, merge, upsert by `sop_number` (admin). Auth: `x-sop-sync-secret` header OR session. **Inert until `NOTION_API_KEY` set** (501). Table + endpoint only — no search UI this session. Env documented in `.env.local.example` (`NOTION_API_KEY` server-only + optional `SOP_SYNC_SECRET`).

**Also.** "Ask Ava about today" gold (+) **placeholder** button on Home (coming-soon toast — real Haiku conversation sheet deferred; the AvaChip drawer is still a self-contained placeholder with no external open hook / context prop). Home stop-count fix — `customerStopCount` (depot-excluded) drives the hero "N stops scheduled" + "The day, in N" so they match the type breakdown; `totalStopCount` stays on completion/empty/section gates. Voice-first rewrite of all `getMorningMessage.ts` variants for ElevenLabs prosody (copy only, structure unchanged).

**Post-merge actions (Darren):** set `NOTION_API_KEY` on driver-app Vercel + share the integration into the SOP Library page; production smoke test (weather pill+copy, gust case, stop-count consistency, SOP sync). **Deferred:** real Haiku conversation sheet (Step 6); SOP search UI. Full smoke matrix in `CLAUDE.md` → "AVA Phase 2 (Driver App) → Session 1".

---

## 2026-05-30 — Fleet Maintenance Session 3 — smoke fixes — `main` — commit `0a1cb72`

Two issues from Darren's Session-3 smoke test.

- **Bug 1 — My Log tab spun "Loading…" forever.** Client-side React race, not RLS / not the write. The My Log load `useEffect` depended on `myLog` + `myLogLoading`; calling `setMyLogLoading(true)` re-ran the effect, whose first-run cleanup set `cancelled = true` on the in-flight request's closure, so the resolved result was discarded and loading never cleared. (Confirmed not RLS: History tab reads `service_records` under the same RLS and works; `fetchMyServiceLog` returns `[]` on a query error → empty state, not a hang.) **Fix:** load once keyed on the stable `user.id` only; the existing `.catch → myLogError` now surfaces real failures.
- **Bug 2 — compliance badges added to Asset Detail header.** Spec locked Reg/Insp/Ins badges on the Overview list cards only; added to the Asset Detail header (trucks) per Darren — it's where he acts on a compliance issue. `fetchAssetInfo` now computes `compliance` via `complianceStatus()`; `FleetAssetInfo` carries it (equipment → null); header renders the shared `<ComplianceBadges/>` next to the health pill.

Build green; pushed. **Re-test My Log + Asset Detail badges on production.**

---

## 2026-05-30 — Fleet Maintenance driver app — Session 3 — `main` — commit `3bda5d7`

UI-only build of the four locked Fleet Maintenance screens (Notion design spec `36c0aa6451b8817b832ac61f3aaf9c2a`). **No migrations, no API routes** — all reads/writes go through the existing RLS-gated supabase client + `src/lib/fleet/queries.ts`. Darren chose (in-session) a full **pill-tab restructure** of the May-22 Overview + Asset Detail, keeping the work-order surfacing inside the new tabs.

- **Screen 1 — Fleet Overview** → **Trucks / Equipment / My Log** pill tabs (`PillTabs`). Cross-asset summary counts stay above the tabs. Truck cards gained **current mileage** + **Reg / Insp / Ins** compliance badges (`ComplianceBadges`, tier from `complianceStatus()` — green ok / amber ≤30d / red expired / gray unknown). Open truck/equipment WOs at the top of their tab; orphan WOs at the bottom of the Trucks tab. Equipment collapse-toggle dropped (each list owns its tab); "Manage equipment" lock chip kept.
- **Screen 2 — Asset Detail** → **History / PM Schedule / Parts** pill tabs. Open WOs persist above the tabs (View-all reveals resolved); **Log service** is now a persistent bottom CTA. Parts tab reuses the extracted `PartCard`. `fetchAssetDetail` now also returns `parts` (history limit 5→20).
- **Screen 3 — Log Service** → mileage/hours now **prefill** from the asset's current reading (editable). Otherwise already matched spec.
- **Screen 4 — My Log** (new) → the signed-in user's `service_records` across all assets, newest first, via `fetchMyServiceLog()` (`performed_by_user_id`), lazy-loaded on first open; `ServiceLogEntry` gained an optional `assetName` line.
- **Shared / data:** new `PillTabs` + `ComplianceBadges`; `PartCard` extracted from `WorkOrderDetailScreen` (dedup); `enrichServiceRecords()` factored out of `fetchServiceRecordsForAsset`; `complianceStatus()` added to `pmStatus.ts`. `OverviewAsset` carries `mileage?`+`compliance?`; `AssetDetail` carries `parts`; new `MyServiceRecordView` / `ComplianceBadges` / `ComplianceStatus` types.
- Build green (`npx next build`), pushed to `main`. **Production smoke test pending Darren's confirmation** (matrix in `CLAUDE.md` → Fleet Maintenance Module → Session 3).

---

## 2026-05-28 — AVA TTS — sentence-pause tune `0.5s → 0.6s` — `main` (production) — commit `cc76a02`

First post-merge change on `main`. Lengthened the inter-sentence pause in the spoken morning brief from `0.5s` to `0.6s` — a single value, `SENTENCE_PAUSE`, in `src/lib/ava/elevenLabs.ts:26`, injected as an SSML `<break time="0.6s" />` at sentence boundaries (`/([.!?])\s+/` → `$1 <break …/> `). ElevenLabs request path **only**; the Web Speech fallback never sees the tag (it pauses at punctuation natively). The `\s+` requirement still guards decimals ("2.5") from being split. Build green (EXIT=0), pushed to `main`, Vercel production deploy fired. **Darren confirmed the longer pause is audible on the live app.** Worked directly on `main` per Darren's call — no branch for a one-line TTS tune. Supersedes the prior `9560fb7` pause work (which introduced the `<break>` mechanism at `0.5s`).

---

## 2026-05-28 — AVA Phase 1 MERGED to `main` (production release) — merge commit `37f83a9`

`feature/ava-phase1` merged into `main` via `git merge --no-ff` (27 commits, 10 components) and pushed to production. Vercel deployed the merge to `target: production` (state READY — verified via the Vercel API, deployment `dpl_5cUDqcSHeo6vLFhbzDNcdpzWiA71`). Branch deleted local + remote. Pre-merge gates all passed: build green (EXIT=0), `main` had not diverged (zero commits behind), migrations clean (17 files, highest `20260527017`). Follow-up docs commit `b84f4ca` updated the CLAUDE.md build-state header (Phase 1 live, branch deleted, next AVA work on a new branch). Also shipped earlier this session: the TTS sentence-pause fix (`9560fb7`) — pending Darren's listen on production.

---

## 2026-05-28 — AVA Phase 1 — Dispatcher notes + stop notes surface — branch `feature/ava-phase1` — commits `104e652`, `943aec0`, `2673f3c`, `af69ed2`, `48ab75c`

**Scope.** Surface dispatcher notes (route + stop level) and TapGoods order notes to drivers across three surfaces — the AVA morning brief, a pre-launch notes sheet, and the Stop Detail screen. All reads, **no migrations, no new API routes, no new tables**. Branch still **NOT merged to `main`**. Plan: `docs/superpowers/plans/2026-05-28-ava-dispatch-and-stop-notes.md`.

### `104e652` — data plumbing
The existing `GET /api/routes` query did **not** return `routes.dispatcher_notes`, and `dispatch_stops` returned `dispatcher_notes`/`notes` but **not** the five TapGoods note fields. Extended the existing SELECTs (no new endpoint), then threaded the columns through `SupabaseRouteRow`/`SupabaseStopRow` + the `transformSupabase` builders onto `Route.dispatcher_notes` and `Stop.{notes_additional_delivery,notes_employee_authored,notes_flip,notes_set_by_time,notes_strike_time}`.

### `943aec0` — Morning brief: FROM DISPATCH block (Component 1)
`AvaMorningCard` takes a new `routeDispatcherNote` prop (passed from `DayRouteSelectorScreen` as `primaryRoute?.dispatcher_notes`). When present it renders a gold "FROM DISPATCH" block as the **first** content block (after the AVA identity row, above the message) and is **prepended to the spoken brief** (`From dispatch: … . <message>`). A route note is now an independent **card-visibility trigger** — a day with only a dispatch note still shows the card.

### `2673f3c` — Morning brief: stop-notes count line + review sheet (Component 2)
Counts customer stops whose `dispatch_stops.dispatcher_notes` is non-null (already on the `Stop` object — no query change). When > 0, a tappable line ("N of your stops have notes from dispatch. I'll remind you on the way to each one.") opens **`AvaDispatchNotesSheet`** (new, read-only; mirrors `AvaChecklistSheet` dark sheet pattern) listing each stop + its note. Also a card-visibility trigger.

### `af69ed2` — Pre-launch notes sheet on Send-ETA + Navigate (Component 3)
New **`StopNotesPreSheet`** (labeled sections: DISPATCHER NOTE / DELIVERY INSTRUCTIONS / STAFF NOTE / FLIP-TEARDOWN NOTE / TIMING NOTE / AVA REMEMBERS; no backdrop-dismiss, no auto-dismiss). Per Darren's revised spec, wired to **both** `handleSendEta` and `handleNavigateRequest` with a **once-per-stop guard** (`seenNoteStopsRef` Set keyed by `stop_id`). Context-aware CTA: `"Got it"` (ETA path → ETA send proceeds) / `"Got it — Navigate Now"` (navigate path → maps launch). `handleNavigateRequest` was split — the notes sheet is the outer gate, then `proceedNavigateRequest` runs the existing early-pickup gate, so neither bypasses the other. `notes_flip` is **pickup-only** in this sheet. AVA Remembers text is fetched via `listNotesForAddress(avaAddressKey)` and gated on the existing `avaNoteCount`. Null notes → no sheet, both actions proceed with zero friction.

### `48ab75c` — Stop Detail Order Notes section + route-list indicator (Component 4)
Collapsible **"Order Notes (N)"** section on Stop Detail (above the AVA Remembers entry surface) listing all non-null TapGoods note fields; hidden on depot stops and when empty. Here `notes_flip` shows on **all** stop types (informational) — the pickup-only gate is specific to the pre-launch sheet. The existing blue **"Note from dispatch"** auto-modal + persistent card are untouched (label wording left as-is per Darren). Route list (`RouteListScreen`) shows a small blue note glyph next to the customer name when `dispatcher_notes` is present.

### Build + push
`npx next build` green after each task (EXIT=0); all five commits pushed to `feature/ava-phase1` (Vercel **preview**, not production).

---

## 2026-05-28 — AVA Phase 1 — Morning-card count fixes — branch `feature/ava-phase1` — commits `71ec8a1`, `dec52c8`

**Scope.** Two correctness fixes to `src/components/ava/AvaMorningCard.tsx` (one helper change in `src/lib/ava/dependencyHits.ts`) after Darren tested the morning card against a live route. No migrations, no new files. Branch still **NOT merged to `main`**.

### `71ec8a1` — checklist toggle gates the block, not the card; stats zero-state

- **Bug A — `checklist_enabled` no longer affects card visibility.** The card renders when ANY trigger is true: `stats_enabled`, `ava_stop_notes` hits > 0, or (`checklist_enabled` AND dependency hits > 0). Turning the checklist off hides only its offer block; the card stays as long as stats is on or notes exist.
- **Bug B — stats block renders whenever `stats_enabled`** (was gated on `weekStopsCompleted > 0`). On a slow day / Monday morning it shows a zero-state ("No stops completed yet this week.") instead of vanishing. This also makes `stats_enabled` a count-independent card trigger, which fixes Bug A's symptom for opted-in drivers with 0 stops and the checklist off.

### `dec52c8` — exclude depot stops from counts; tent count requires category AND name

- **Fix 1 — single `customerStops` source.** `AvaMorningCard` derives `customerStops` (= `dayStops` minus `warehouse_return` / `warehouse`) via `useMemo` and routes every count through it: `stopCount`, `codCount`, the `tentCount` item source, the checklist manifest, and the stop-note address lookup. The live test route went 3 → 2 stops (the return-to-warehouse leg no longer counts). Defensive even though depot stops carry no customer manifest today.
- **Fix 2 — `countTentItems` name gate.** `isTentItem` (`src/lib/ava/dependencyHits.ts`) now requires `category` contains `tent` **AND** name contains one of `tent` / `canopy` / `marquee`. The category-only match was pulling sidewalls, wind walls, and door walls (all filed under TapGoods category "TENTS") into the count — 3 false positives, qty-summed to 5 on the test route. Name gate drops accessories; the category gate still drops e.g. a "tent heater" filed in a non-TENTS category. Test route now reports 1 tent (the 20×20 cross-cable frame tent) instead of 5.

### Build + push

`npx next build` green; both commits pushed to `feature/ava-phase1` (Vercel preview, not production).

---

## 2026-05-28 — AVA Phase 1 — Profile Settings UI — branch `feature/ava-phase1` — commit `35eb566`

**Scope.** Driver-self-service controls for the three AVA preference columns (`checklist_enabled`, `personality_preference`, `stats_enabled`), which existed since Session 1 but were only changeable via SQL. No new migrations. New "AVA Preferences" section on the Profile screen.

### What landed

- **`src/components/ava/AvaPreferencesSection.tsx`** (new) — Section with three controls, matching the Profile screen's card pattern (`C.paper` + `1.5px solid C.ink` + radius 16): Morning checklist toggle (`checklist_enabled`), AVA voice style segmented control Direct|Personality (`personality_preference`), Weekly stats toggle (`stats_enabled`). Inline `ToggleSwitch` (gold-on / grey-off, 48×28 track) and `Segmented` (gold-active pill) — no shared component existed, so they're built to the app's visual language. Section sits between "My Activity" and "Account".
- **`src/app/api/profile/ava-preferences/route.ts`** (new) — `PATCH` handler. Session client identifies the caller (`getUser()`), admin client UPDATEs `profiles` WHERE `id = user.id`. Builds the patch from ONLY the three allowed columns with per-field validation (boolean / enum); rejects empty or invalid bodies with 400.
- **`src/context/AuthContext.tsx`** — Added `updateProfile(patch: Partial<UserProfile>)` to the context value; merges a partial into the in-memory profile state via `setProfile`.
- **`src/screens/ProfileScreen.tsx`** — Import + render `<AvaPreferencesSection />`.

### Why a server route instead of a direct client UPDATE (key decision)

Queried `pg_policies` before building (per the repo's "generated types don't encode RLS" lesson). `profiles` has RLS **enabled** with **SELECT-only policies** (`profiles_authenticated_read_all`, `users_read_own_profile`) — **no UPDATE policy**. A `supabase.from('profiles').update(...)` from the browser would silently affect 0 rows. Adding a broad `auth.uid() = id` UPDATE policy was rejected: it would let a driver mutate `roles` / `fleet_maintenance_access` / `work_order_technician` on their own row — a privilege-escalation hole. The session+admin route scopes the write to the three known columns server-side, matching the `/api/inspection/*` pattern. **Rule for future sessions:** extend the route's allow-list for any new driver-editable profile field; never add a table-level UPDATE policy.

### Optimistic + revert

Each control flips the profile optimistically via `updateProfile`, PATCHes the server, and on failure reverts (`updateProfile` with the prior value) + shows a "Couldn't save preference — try again" toast. Because `AvaMorningCard` / `getMorningMessage` read `profile.*` from the same context, changes apply on the next Home mount with no logout/login.

### Build + push

`npx next build` green (route registered as `ƒ /api/profile/ava-preferences`). Pushed to `feature/ava-phase1` (built on top of `ba3c6c9`, an out-of-session morning-message-template tweak — no overlap). Vercel auto-builds the branch as a preview.

### NEXT

Smoke-test the 5 loops in `tasks/todo.md` (section render + initial states, optimistic flip + persistence, stats opt-in reflected on Home, personality variant on Home, offline-revert toast).

---

## 2026-05-27 — AVA Phase 1 — Bug Fix Pass (pre-merge) — branch `feature/ava-phase1` — commit `4ddcadb`

**Scope.** Three bug fixes surfaced by the Session 5 preview deploy. No new features, no migrations.

### Bug 1 — Stop Detail AVA note entry missing

**Root cause.** The dashed "Leave a note for the next driver" link was nested inside the action-card branch (`!isCompleted` → `!isOnStandby` → `!isWarehouseReturn` → `!isWarehouse` → `!isDepotStop`). On completed stops the Delivered card replaced the action card; on standby stops the standby card replaced it; in both cases the note entry was unreachable. The Tier 3 hero pill (separate surface) was unaffected, but the user reported both missing because no notes could be authored to begin with.

**Fix.** Moved the dashed-link / amber-button block out of the action-card fragment to a stop-level sibling positioned AFTER the manifest. Gate is now just `!isDepotStop`. Renders on every non-depot stop regardless of completion / standby / report-issue state. Tier 3 hero pill stays in place — both surfaces share `setAvaNoteOpen` and `avaNoteCount`. Colors retuned for the light/paper background outside the action card (border `rgba(10,11,20,0.20)`, text `C.muted` instead of dark-card variants).

### Bug 2 — Home blank quiet-state after route delete+recreate

**Root cause (two compounding).** (a) `AppStateContext.loadDay` short-circuits when `state.loadedDate === date && !state.error`. DayRouteSelectorScreen's soft `loadDay(today)` mount call never refetched after a dashboard-side route delete+recreate — `state.routes` still held the deleted Route A. `primaryRouteId` was stale → `useInspectionStatus` queried Route A's old inspection (rows survive route delete) → `inspected = true` → quiet state hid everything. (b) Even after `routeId` eventually changes, `useInspectionStatus`'s `useState<inspection>` was never reset — the previous route's inspection lingered while the new fetch was in flight, causing the "flash then collapse" pattern.

**Fix (a).** Home now force-refreshes on mount via `loadDay(today, true)`, gated by `initialLoadRef` so the loadDay-identity churn from its own useCallback deps (state.loadedDate) doesn't double-fetch within a single mount. **Fix (b).** `useInspectionStatus` now calls `setInspection(null)` at the top of every effect run, so any routeId/truckId change clears the prior route's inspection before the new fetch resolves.

### Bug 3 — iOS Safari blocked ElevenLabs on first Home mount

**Root cause.** `AudioContext` starts in `'suspended'` state until a user gesture in the same task. The Session 5 auto-speak `useEffect` fired on card mount (not a gesture) → `ctx.resume()` failed silently → speak() rejected → fell through to the robotic WebSpeech synth. Result: drivers heard the brief on first load via WebSpeech, not ElevenLabs.

**Fix (Option A — recommended).** Removed the auto-speak useEffect (and the `hasSpokenRef` guard it needed). The card now renders a "▶ HEAR YOUR MORNING BRIEF" gold-pill tap button below the message — visible only when `voiceMode === true && !isSpeaking`. Driver's tap fires `speak(message)` under a real user gesture → ElevenLabs unlocks cleanly. While `isSpeaking`, the button hides and the existing "AVA is speaking…" mini-waveform indicator shows. A separate cleanup `useEffect(() => () => stopSpeaking(), [])` still cancels in-flight audio on unmount. A `playTokenRef` invalidates stale `finally()` callbacks when the user double-taps or toggles to text mid-playback.

### Files

```
src/screens/StopDetailScreen.tsx       — relocate AVA note entry block from action card to post-manifest
src/screens/DayRouteSelectorScreen.tsx — ref-gated force-refresh on Home mount
src/hooks/useInspectionStatus.ts       — reset inspection state on routeId change
src/components/ava/AvaMorningCard.tsx  — replace auto-speak with manual play button + token-guarded handler
```

### NEXT

Smoke-test the preview deploy (see `tasks/todo.md` for the 5 loops). With these three bugs resolved, the branch is ready to merge to `main` pending Darren's go-ahead.

---

## 2026-05-27 — AVA Phase 1 — Session 5 (ElevenLabs TTS + functional voice/text toggle) — branch `feature/ava-phase1`

**Scope.** Session 5 of the AVA Phase 1 build, shipped on `feature/ava-phase1` at commit `a844a4d`. The Voice·Text toggle on the morning brief card was a muted non-functional stub since Session 2 — this session wires ElevenLabs TTS to the morning message and makes the toggle real. Branch still NOT merged to `main` — pending Darren's go-ahead now that all 9 Phase 1 components are in.

### What landed

- **`src/lib/ava/elevenLabs.ts`** (new) — Single entry point `speak(text)` that tries ElevenLabs first (`POST /v1/text-to-speech/{voice_id}` with `xi-api-key` header, `eleven_turbo_v2` model, `voice_settings: { stability: 0.5, similarity_boost: 0.75 }`, audio/mpeg decoded via Web Audio API + AudioContext + AudioBufferSourceNode), falls through silently to `window.speechSynthesis` on any error (no error toast, no log). `stopSpeaking()` cancels both layers — held in module-level refs (`currentSource.stop()` + `currentAudioCtx.close()` + `speechSynthesis.cancel()`). Voice ID `uYXf8XasLblADfZ2MB4u` is hardcoded; API key read from `NEXT_PUBLIC_ELEVENLABS_API_KEY`. iOS Safari autoplay is handled defensively — `ctx.resume()` is attempted before play, and a blocked play call resolves silently.
- **`src/components/ava/AvaMorningCard.tsx`** — Added `voiceMode` (default `true`) + `isSpeaking` state, `hasSpokenRef` guard. New `useEffect([shouldRender, voiceMode, message])` fires `speak(message)` once per card mount when voice is on and the card is renderable. Cleanup calls `stopSpeaking()` on unmount and on toggle-away-from-voice. Below the message paragraph: a small flex row with five `ava-wave-bar` mini-bars + muted "AVA is speaking…" label that's visible while `isSpeaking === true`. The Voice·Text toggle is replaced with two functional buttons (gold/ink active, transparent/muted inactive); `handleToggle()` cancels speech on switch-away-from-voice. `preference` + `message` derivations moved above the early-return block so the TTS effect can depend on them while keeping hooks unconditional.
- **`src/components/AvaChip.tsx`** — Added a full-width blue "HOLD TO TALK TO AVA" button inside the drawer body (below the placeholder copy), with an 18×18 inline-SVG mic glyph. Tap shows a fixed-position transient toast pill ("Voice input coming in the next update.") near the top safe area, auto-dismissed after 2 s via `setTimeout`. UI only — real STT + SOP lookup is Session 6.
- **`.env.local.example`** — Documents `NEXT_PUBLIC_ELEVENLABS_API_KEY` with a note about the deliberate browser exposure (driver app is authenticated employees only).

### Locked invariants

- **`hasSpokenRef` guard** — AVA reads the morning message at most once per card mount, even if the user toggles voice→text→voice within the same view. Re-mount (e.g. by navigating away from Home and back) restarts the cycle.
- **Toggle state is session-only** — defaults to voice on every fresh card mount. No DB persistence this session.
- **Only the morning message is spoken.** Checklist offers, notes nudges, and stats blocks are deliberately silent. Per-item TTS may come later.
- **All surfaces other than driver app are text-only.** No TTS in dashboard, SMS, or other apps.

### Vercel env

`NEXT_PUBLIC_ELEVENLABS_API_KEY` was already set on **Preview + Production** as of session start (confirmed via `vercel env ls` — created 8 min before the build ran). Without it, `speak()` falls through to WebSpeech silently — no driver-facing error.

### Build + push

`npx next build` initially failed on `WindowWithWebkit` not declaring `AudioContext` (TS's default `lib.dom.d.ts` puts `AudioContext` as a global `var`, not a `Window` property). Fixed by extending the cast to include both `AudioContext?` and `webkitAudioContext?`. Second build green (32/32 routes). `git push origin feature/ava-phase1` succeeded; Vercel auto-builds the branch as a **preview**.

### Files

```
src/lib/ava/elevenLabs.ts                       (new)
src/components/AvaChip.tsx                       (+ useEffect, mic glyph SVG, toast)
src/components/ava/AvaMorningCard.tsx            (+ TTS hook, indicator, functional toggle)
.env.local.example                               (+ NEXT_PUBLIC_ELEVENLABS_API_KEY block)
```

### NEXT

Smoke test the preview deploy: morning card reads aloud via ElevenLabs (or WebSpeech if API key/network down), toggle silences mid-playback, mic button on the AvaChip drawer shows the "coming soon" toast. Flag the iOS Safari first-load autoplay block if encountered — the workaround is to gate auto-speak on a user-gesture proxy. With Session 5 done, all 9 AVA Phase 1 components are in on the branch; merge to `main` is pending Darren's go-ahead.

---

## 2026-05-27 — AVA Phase 1 — Session 1 (schema + header chip) — branch `feature/ava-phase1`

**Scope.** Session 1 of the AVA Phase 1 build. Shipped on the **feature branch** `feature/ava-phase1` (commit `c43192c`), not `main` — AVA Phase 1 must ship as a complete branch per the May 24 strategy decision (Notion `3550aa6451b881f19285e369387b75b6`). Vercel previews this branch; production stays on `main`. Subsequent sessions ship more components to the same branch; merge to `main` happens only when all 9 Phase 1 components are in.

This session lands two things: **schema** (3 migrations) and **Tier 1 presence chip** on every screen with a placeholder bottom-sheet drawer. Morning brief, checklist (post Darren+Melissa voice session), AVA Remembers UI, ElevenLabs TTS, and voice/text toggle come in later sessions.

### Schema

Three migrations applied via `supabase db query --linked --file`, then marked applied via `supabase migration repair --status applied …`.

- **`20260527013_ava_profile_columns.sql`** — adds 3 per-driver opt-ins to `profiles`:
  - `checklist_enabled boolean NOT NULL DEFAULT true` — Joey turns his off; everyone else leaves it on.
  - `personality_preference text NOT NULL DEFAULT 'direct'` — `CHECK IN ('direct','personality')`. Only Dylan opted in for personality.
  - `stats_enabled boolean NOT NULL DEFAULT false` — Joey opts in; others off.
- **`20260527014_ava_conversations.sql`** — append-only Q&A log. Columns: `id`, `driver_id`, `surface` (5-value CHECK), `context_id`, `question`, `answer`, `confidence` (3-value CHECK), `needs_review`, `helpful`, `created_at`. Indexes: `(driver_id, created_at DESC)` and partial `(needs_review, created_at DESC) WHERE needs_review = true`. RLS: driver SELECT/INSERT own; super_admin SELECT all (`EXISTS … 'super_admin' = ANY(p.roles)`).
- **`20260527015_ava_stop_notes.sql`** — address-keyed notes for AVA Remembers. Columns: `id`, `address_key` (normalized), `raw_address`, `note`, `author_id ON DELETE SET NULL`, `photo_urls text[] DEFAULT '{}'`, `created_at`, `updated_at`. Index on `address_key`. RLS: authenticated SELECT all, INSERT (with `author_id = auth.uid()`), and UPDATE/DELETE on rows the user authored.

Filename convention adjusted: used `YYYYMMDD<NNN>_*.sql` (no underscore between date and sequence) instead of the recent `YYYYMMDD_NNN_*.sql` so all three files have unique CLI-visible versions on the same day. The existing convention only works one-file-per-day; today needed three. Confirmed clean via `supabase migration list --linked` (driver-app rows now show `20260527013/014/015` in both Local and Remote columns).

Types regenerated via `supabase gen types typescript --project-id fumprcyavpefyupurvsv` with the standard CLI-noise strip; the two new tables + three new `profiles` columns surface in `src/types/supabase.ts`.

### Tier 1 chip (`AvaChip`)

`src/components/AvaChip.tsx` — 32 px blue square (`#0000FF`) with five 2 × 12 px white bars, CSS-staggered pulse (`ava-wave` keyframes in `globals.css`, 1 s ease-in-out infinite, 120 ms stagger between bars). Tap opens a fixed-position dark bottom-sheet (`#0F172A` background, max 448 px wide, safe-area-aware padding) with the same waveform at 40 px, "AVA" label, ×-close, and "AVA is coming soon — Phase 1 build in progress" body copy. Backdrop click and × button both close. No props except an optional `ariaLabel`.

Wired into 6 screens — to the right of each screen's existing rightmost header element, wrapped in a `display:flex; gap:10` group:

- `DayRouteSelectorScreen` (Home) — next to the 32 px PTR mark on the eyebrow row.
- `ToolsScreen` — same shape.
- `TrainingScreen` — same shape.
- `ProfileScreen` — next to `<BrandMark/>`.
- `RouteListScreen` — next to `<BrandMark/>`.
- `StopDetailScreen` — next to the distance pill (Phase-2 stub). Stop detail is the one screen without a brand mark in the header; chip goes to the right of the pill.

No centralized layout-shell change — each screen has its own hero/header, so wiring is per-screen. Single new import + single wrapping `<div>` per screen.

### Build + push

`npx next build` green (32/32 routes generated). `git push origin feature/ava-phase1` succeeded. Vercel auto-builds the branch as a preview; `main` is untouched.

### Files

```
src/components/AvaChip.tsx                       (new)
src/app/globals.css                              (+11 lines — ava-wave keyframes)
src/types/supabase.ts                            (regenerated)
src/screens/DayRouteSelectorScreen.tsx           (+ import + wrap)
src/screens/ToolsScreen.tsx                      (+ import + wrap)
src/screens/TrainingScreen.tsx                   (+ import + wrap)
src/screens/ProfileScreen.tsx                    (+ import + wrap)
src/screens/RouteListScreen.tsx                  (+ import + wrap)
src/screens/StopDetailScreen.tsx                 (+ import + wrap)
supabase/migrations/20260527013_ava_profile_columns.sql  (new)
supabase/migrations/20260527014_ava_conversations.sql    (new)
supabase/migrations/20260527015_ava_stop_notes.sql       (new)
```

### NEXT

Branch preview deploy on Vercel — open any of the 6 screens, confirm the chip pulses top-right, tap opens the bottom-sheet, close clears. Session 2 (TBD) picks up the morning brief card; Darren + Melissa voice session is the gate before checklist content can be authored.

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
