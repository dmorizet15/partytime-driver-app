# Open Tasks — partytime-driver-app

## May 17, 2026 — Time Window Constraints Phase 4 (driver-app integration)

- [ ] **Smoke-test the three new surfaces on production** after Vercel auto-deploys the three `main` commits (`05b1607`, `ab0bc1e`, `54766d3`). Plan in `CLAUDE.md` → "Time Window Constraints — Phase 4" → NEXT block. Five loops:
  1. Badge renders below the address on StopDetail (on-dark), RouteListScreen rows, and DayRouteSelectorScreen day list (both COD + inline). Constraint-less stops show no badge.
  2. Pickup stop with future `pickup_window_start` → tap Open in Maps → gate modal pops with "Navigate anyway" + "I'll wait". `I'll wait` dismisses cleanly.
  3. Same pickup → tap Open in Maps → tap "Navigate anyway" → maps opens. Re-tap Open in Maps → no modal (override sticky for the session).
  4. Same pickup, fresh session, drive into 150m geofence → `arrived_at` stamps → action card replaced by standby card with live HH:MM:SS countdown. Tap "Navigate anyway" → action card returns.
  5. Suggested-tier stop → badge renders as dashed outline; no gate, no standby.
- [ ] **Walk the visual diff against the Notion confidence-tier table** to confirm the amber palette + dashed-vs-solid treatment matches the dashboard's `StopWindowBlock` chips. Today the driver-app pill is more compact (no event-start anchor line, no ETA cushion math) — that's intentional, but the tier color contract should still match exactly.
- [ ] **Optional: surface the "Event starts X" anchor below the badge on StopDetailScreen** (currently only the badge — the dashboard block also renders the `event_start` / `event_end` anchor as a secondary muted line). Low priority; the badge alone covers the must-deliver-by signal the spec called out as critical.
- [ ] **Optional: persist `early_pickup_override` server-side** via a `stop_workflow_events` row (today it lives only in the `NAVIGATION_STARTED` event detail JSON). Would let the dashboard surface "driver overrode the window" on the stop card without scraping event details. Defer until a dashboard ask materializes.
- [ ] **Long-term: mirroring discipline for `src/lib/stopConstraints.ts`.** Driver-app copy is a strict read-only subset of `partytime-dashboard/src/lib/stopConstraints.ts` (resolver + tier check + clock formatter). If dashboard's resolver changes (new source, reordered priority), mirror here in the same session. Not byte-identical today — driver app has no mutations, no React-Query glue.

## May 16, 2026 — Arcade iPhone controls + canvas layout fix arc

- [x] ~~**iPhone controls + canvas layout — Party Kong.**~~ Confirmed working by Darren after `b7798bf`. Six commits: `78c46c1` (iOS 18 Writing Tools + held-input cancel), `d51e721` (canvas-area shell that pins controls above the fold), `bb4f340` (drop canvas.style.width/height inline lock so CSS drives display), `1b259da` (tighten canvas-to-controls gap), `891adf4` (CSS-crop the empty back-wall + floor-strip band below ground via `VISIBLE_H = 600`), `b7798bf` (switch wrapper to height-driven sizing so aspect-ratio doesn't break on short viewports). Game logic completely untouched. Lessons logged in `tasks/lessons.md` (four new entries).
- [ ] **Smoke-test Route Rush + Tent Tetris on iPhone** to confirm the layout-shell + iOS-guards fixes from `78c46c1`/`d51e721`/`bb4f340` work for them too — Darren confirmed Party Kong but didn't explicitly verify the other two games on iPhone in this arc. Same checklist as the Party Kong loop: controls visible without scrolling, held inputs survive long-press without Writing Tools, truck (RouteRush) and tetromino board (TentTetris) fully visible without clipping at the bottom.
- [ ] **Optional: apply VISIBLE_H-style crop to Route Rush or Tent Tetris** if either game ever shows visible empty space below gameplay. Today Route Rush's truck sits at y=580 of a 720-tall canvas (~140px below sits empty), and Tent Tetris's playfield ends around y=530. Spec for this session was Party Kong-only, but the pattern from `891adf4` + `b7798bf` (`VISIBLE_H` constant + wrapper aspectRatio: `W/VISIBLE_H` + canvas aspectRatio: `W/H` overflowing via `overflow: hidden`, plus the height-driven wrapper sizing) ports directly when needed.

## May 15, 2026 overnight — PartyTime Arcade follow-ups

- [ ] **Smoke-test the arcade on production** after Vercel deploy. Coverage list lives in `CLAUDE.md` → "PartyTime Arcade — Route Rush + Tent Tetris" → NEXT block. Loops: hub load + tile rendering, Route Rush gameplay + leaderboard submit, Tent Tetris gameplay + line clear animation + piece-name labels, cross-device realtime leaderboard fan-out, auth gate.
- [x] ~~**Build Party Kong.**~~ Shipped 2026-05-15 post-overnight session. Single component `PartyKongGame.tsx` + `/training/arcade/party-kong` route + ArcadeHub tile flipped from locked → playable. 4 levels (Warehouse / Loading Dock / Outdoor Tent Setup / Grand Ballroom), DK-style platformer mechanics, NO-OUTLINES shading throughout. Logo loader uses 3-tier fallback chain (spec path → `/ptr-mark.png` → procedural). See CLAUDE.md → "PartyTime Arcade — Party Kong" for architecture details.
- [x] ~~**Smoke-test Party Kong on production**~~ — confirmed working by Darren on iPhone after the 2026-05-16 mobile-fix arc landed (commit `b7798bf`).
- [ ] **Optional: drop the proper hi-res PTR logo at `public/images/PARTYTIME-RENTALS-LOGO.png`.** Today the warehouse sign falls back to `/ptr-mark.png` (which exists). Spec called for a logo at the `/images/` path; the 3-tier loader handles its absence. Drop the file at the spec path and the sign auto-picks it up — no code change needed.
- [ ] **Party Kong v3 — true per-level scenes.** Scoped in `tasks/party-kong-v3-scope.md`. Four-session phased plan: foundation refactor (A) → conveyor stage L2 (B) → elevator stage L3 (C) → rivet/chain-pull stage L4 (D). Each session ships a green-build checkpoint to prod. Total work ≈ 2× current Party Kong codebase. Confirm product direction + pre-flight checklist before starting Session A.
- [ ] **Optional: per-game personal-high-score history.** Today `useGameLeaderboard.personalBestAllTime` reads the user's max score from the all-time top 10. If the user's all-time best falls outside the top 10, the value is `null`. Cheap fix: a dedicated `.from('game_scores').eq('player_id', uid).eq('game_type', gt).order('score desc').limit(1)` call (mirrors the ArcadeHub `bests` loader). Now that all three games are live this is more meaningful to add.
- [ ] **Optional: arcade-side rate limit.** RLS lets any authenticated user spam INSERTs at `auth.uid()`. Acceptable today (trusted driver fleet). If/when public access opens up, throttle via a Postgres function + grant.

## May 14, 2026 night — Tools / Training hub restructure follow-ups (commits `f64d5bb` → `288d120`)

- [ ] **Smoke-test the v2 hubs on production** (latest is `288d120`). Coverage list in `CLAUDE.md` → "Tools Hub + Training Hub — category-card restructure" → NEXT block. `/tools`: dark surface, uppercase title, 6-tile grid, Weather + Equipment guides land on existing routes, Generators full-width, divider, Party layouts anchor card. `/training`: 4-tile grid + orientation + Arcade (no badge). Toast = small dark pill, 2s dismiss, no gold accent. Spot-check that Weather + Reference Library still load identically to pre-restructure.
- [x] ~~**`/games` route does not exist.**~~ Resolved 2026-05-15. The Arcade tile now points at `/training/arcade` (PartyTime Arcade hub) — Route Rush + Tent Tetris are live; Party Kong is the locked third tile.
- [ ] **Tenting subcategory screen.** Tile claims "3 live" (Squaring + Drawings + Certs) but currently lands directly on the single calculator. When second/third tenting tools land, convert `/tools/tent-squaring` into a tenting sub-hub OR re-point the Tenting tile to a new `/tools/tenting` route with a card grid inside. Tent Drawings (`/reference/tents`) is the obvious second tenant — it has a working route today but is NOT surfaced from the hub.
- [ ] **Duplicated layout components between ToolsScreen and TrainingScreen.** `C` token object, `BadgePill`, `IconWrap`, `CategoryCardGrid`, `CategoryCardWide`, and several Tabler-style icons (TentIcon, ShieldCheckIcon) are redeclared in both files. The toast block is also inline-duplicated. Acceptable today (two screens, fully styled differently from the rest of the app); extract to `src/components/hub/*` when a third hub-style surface appears or when an icon needs to change in lockstep across both.
- [x] ~~**Tools hub footer pointer line.**~~ Resolved in v2 (`288d120`) — Weather and Equipment Guides are now first-class tiles in the grid; footer text removed.

## May 14, 2026 — Phase 2.5C session follow-ups (GPS Auto-Arrival)

- [ ] **Smoke-test arrival on production** — driver `73b7509`, dashboard `03dd102` both deployed. Test plan in `CLAUDE.md` → "Phase 2.5C — GPS Auto-Arrival" → NEXT block. Loops: permission prompt on first watch, mid-route entry into the 150m bubble, dashboard teal pin within ~1s, badge coexistence with the green completion check, persistence across refetch.
- [ ] **Phase 2 — Real-time push to dispatch on arrival.** Today Melissa sees the teal pin update visually via realtime; no audible signal. Pair with the existing "real-time COD-uncollected push to dispatch" Phase 2 item — same channel.
- [ ] **Phase 2 — Background geofencing (native shell).** Current implementation is foreground-only (`navigator.geolocation.watchPosition` requires the document visible on mobile browsers). For autonomous arrival when the driver locks the phone or backgrounds the PWA, need Capacitor or a native shell with the Android Geofence API. Out of scope for v1 PWA.
- [ ] **Phase 2 — Driver-side "location off" warning.** `useArrivalGeofence` already surfaces `denied` / `unavailable` / `error` states; the UI currently ignores them. A small inline hint on StopDetailScreen ("Location off — arrival won't auto-detect") would help when permissions are denied. Low priority because Mark Stop Complete still works.
- [ ] **Phase 2 — Arrival → completion delta analytics surface.** The data now flows into `arrived_at` and `completed_at`. A simple report (avg on-site time, outliers) would be useful for ops. Dashboard-side; out of scope this session.

## May 14, 2026 — bug-fix session follow-ups

- [ ] **Smoke-test on production** after the May-14 Vercel deploys clear. Coverage list lives in `CLAUDE.md` → "Driver scope + completion persistence" → NEXT. Three loops: driver-scope (Home + Routes tab), completion persistence (mark-complete → return-nav), Cash Collection v2 (Collected / Could Not Collect paths now that migration 051 is live).
- [ ] **Regen dashboard repo Supabase types** so the `as any` casts in `partytime-dashboard/src/lib/boardClient.ts` (`fetchUncollectedCodRows`) come out. Driver-app types are already current (commit `c308c81`). One-line: `cd ~/Projects/partytime-dashboard && supabase gen types typescript --linked > src/types/supabase.ts` — but strip the stderr lines that the CLI bleeds into the redirected file ("Initialising login role…" header, "A new version…" footer); see lessons.md.
- [ ] **Delete unused `AppStateContext.clearCache`.** Orphaned since the cold-load auto-redirect was removed (no caller). Comment block references stale "assigned-route check" infra. One-line removal; bundle with the next AppStateContext touch.

## Cash Collection v2 — surviving follow-ups (from 2026-05-13)

- [x] ~~**BLOCKING: apply migration 051 to partytime-east.**~~ APPLIED 2026-05-14 via `supabase db query --linked --file`. Tracking repaired. Driver-app types regen'd.
- [ ] **Drop the orphan `dispatch_stops.cod_acknowledged_at` and `dispatch_stops.cod_acknowledged_by` columns.** Audit done 2026-05-13 — zero readers, zero writers. Cash Collection v2 uses payment_state-based auto-resolution instead. Wait until schema confidence is high; bundle with the next housekeeping migration.
- [ ] **Phase 2 — Real-time COD-uncollected push to dispatch.** Today Melissa learns about the flag via the board's visible realtime update (~1s after the driver submits). A push/SMS notification would help if she's heads-down on something else when it lands. Same channel as the planned pre-trip OOS auto-notify (currently Phase 2 stub copy on Screen 7).
- [ ] **Add an FK from `cash_collections.stop_id` to `dispatch_stops.id`** so PostgREST can embed cash_collections in a stops fetch (one query instead of two). Low priority — current pattern (separate query, deduped by tanstack-query) works fine for the dashboard's volume. Bundle with the schema cleanup migration above.

## Cross-repo: Mirrored helpers (added 2026-05-13)

Three helpers are now byte-for-byte mirrored between `partytime-driver-app/src/lib/` and `partytime-dashboard/src/lib/`:
- `equipmentSummary.ts` — two-tier `{ tier1, tier2 }` shape consumed by all condensed surfaces
- `inflatable.ts` — `isInflatableCategory()` + `hasInflatableItem()` keyword detection
- `itemCategories.ts` — `resolveCategory()` + `CATEGORY_MAP` (lowercased keys, canonical-cased values)

There is **no shared package and no build-time validation that the copies match.** Drift is silent until a user-visible bug surfaces.

- [ ] **Long-term:** extract these three files into a shared workspace package (e.g. `@partytime/items`) so a single change updates both consumers. Requires monorepo or git-submodule setup; currently both repos are independent.
- [ ] **Short-term discipline:** any change to one of these files MUST be applied to the other in the same session, with matching commit messages. Document in CLAUDE.md (already done in the equipment-summary architecture section).
- [ ] **`resolveCategory` name overrides are workarounds.** The CHAIR / STAGE / SKIRT / RAMP / DECK / TENT / WALL / DANCE FLOOR name detection rescues TapGoods miscategorizations. The principled long-term fix is to recategorize source items in TapGoods so the API category matches. Audit + clean up the override list when TapGoods data hygiene reaches a steady state.

## Cross-repo: Dashboard data hygiene to simplify driver-app filter (discovered 2026-05-08)

The driver app's `/api/routes` endpoint currently filters stops by `calculated_eta IS NOT NULL` to drop ghost assignments (stops dragged onto a route weeks ago and never optimized or unassigned). This is a workaround. The principled fix lives in the **dashboard repo**:

- [ ] When a dispatcher assigns a stop to a route in the dashboard (drag-drop, or any other path that sets `dispatch_stops.route_id`), also set `dispatch_stops.scheduled_date = routes.route_date` for that stop. Today, only `route_id` and `route_position` are updated, so pickup stubs retain their auto-anchored Monday `scheduled_date` even after assignment.
- [ ] Backfill pass: for every existing `dispatch_stops` row where `route_id IS NOT NULL`, update `scheduled_date` to match the route's `route_date`. One-shot SQL or admin endpoint.
- [ ] After the dashboard ships the above + backfill runs cleanly, revert this repo's `/api/routes/route.ts` filter from `.not('calculated_eta', 'is', null)` back to `.eq('scheduled_date', date)`. Cleaner, doesn't depend on a derived signal.

## Tools Hub — Content Build (Phase 2 — content authoring + UI)

Empty shells exist on `/tools` for the tile grid. Content + per-tool UI is the work:
- [x] Tenting calculator — tent squaring (shipped 2026-05-14 late evening — `/tools/tent-squaring`, replaces the Tenting tile's coming-soon stub. When additional tenting calcs land (anchoring, etc.), convert the route into a tenting sub-hub.)
- [ ] Occupant load calculator — IFC Chapter 31 load factors by layout type
- [ ] Exit count and spacing calculator — 100 ft max rule, 0.2 in/person egress width
- [ ] Generator placement rule flag — 20 ft minimum
- [ ] Fire Code Pre-Job Checklist — dynamic by job config; NFPA 701 fabric cert photo capture; permit trigger by tent size; timestamped completion record
- [ ] Site map generator (Phase 2 — canvas tech stack prototype required first)
- [ ] Multi-tent site map (Phase 2)
- [ ] Jurisdiction-aware fire code (Phase 3 — UpCodes API)
- [ ] Shareable crew report (Phase 3)
- [ ] Tenting reference library — manufacturer-specific diagrams
- [ ] Dance floor / stage / heat-and-air / power / propane calculators
- [ ] Equipment Knowledge Base
- [ ] Wind-aware anchoring guidance (Phase 2C — needs `HAS_ANCHORING_GUIDANCE` flag flip)

## Training Module — Content Build (Phase 2)
- [ ] SOP library — schema and tagging convention in Supabase defined
- [ ] SOP content authored and loaded
- [ ] Quick-hit video integration
- [ ] Short role-based checklists
- [ ] Safety reminders module
- [ ] Equipment basics training content

## Driver Profile / Compliance — Feature Build (Phase 2, Ready)
- [ ] Document upload — DOT medical card, West Point ID, site-specific credentials
- [ ] Expiration date tracking per document type
- [ ] 30-day reminder trigger before expiration
- [ ] Persistent alerts until document is updated
- [ ] Future: supervisor visibility to compliance status per driver

## Phase 2C — Wind-aware anchoring guidance (deferred)
- [ ] Author content layer
- [ ] Flip `HAS_ANCHORING_GUIDANCE = true` in `src/lib/weather/thresholds.ts`
- [ ] Wire stake/ballast guidance into wind cards on Tools weather screen + Stop Detail weather module

## Phase 2B — Tent-size threshold differentiation (deferred)
- [ ] Dashboard pipeline: TapGoods tent size flows through `dispatch_stops` (separate dashboard session)
- [ ] Flip `HAS_TENT_SIZE_DATA = true` in `src/lib/weather/thresholds.ts`
- [ ] Rain thresholds will then differentiate by tent size; the existing 30x40+ conservative defaults stay until that lands

## Phase 2.5 — Driver App Source of Truth Migration (Notion-tracked)
- [x] Phase A: Stop data from Supabase (replace TapGoods direct calls). 2.5a cleanup 2026-05-10 commit `15d3476` deleted the orphaned `/api/tapgoods/routes` handler + `tapgoodsClient.ts` + `tapgoodsQueries.ts` + `tapgoodsTransform.ts`. Driver app now exclusively reads routes/stops from Supabase via `/api/routes`. Surviving `tapgoods_*` column references in `src/types/supabase.ts`, `src/app/api/routes/route.ts`, `src/lib/supabaseTransform.ts`, and `src/config/externalApps.ts` are legitimate (column names + View Order URL template) and stay.
- [ ] Phase B: Live ETA + status sync (mostly done — Migration 033 + cascade live)
- [x] Phase C: Driver assignment from dashboard — auto-load shipped 2026-05-10 evening. New endpoint `/api/routes/assigned` + hook `useAssignedRoute` + DayRouteSelectorScreen wiring. Once-per-session redirect from `/` → `/route/<id>` on cold sign-in when the driver has a `route_assignments` row for today; manual day overview preserved as fallback for unassigned drivers, fetch failures, and post-redirect BottomNav returns to Home.

## Pre-trip inspection — edge cases to revisit (discovered 2026-05-09)

- [ ] **Trailer rows on `dvir_requirement = 'never'` trucks.** Screen 5 currently
      treats `towingTrailer !== false` as "show trailer rows" — for `'always'`
      and `'never'` trucks (no Screen 4 fired), `towingTrailer` stays `null`,
      so the full 12-row checklist renders. Conservative default: include
      trailer rows when we don't know. By definition `'never'` trucks don't tow,
      so hiding the trailer rows for that branch is safe. Low priority — the
      conservative default (show all 12) is compliant and harmless. Likely
      target: when `dvir_requirement === 'never'`, omit `TRAILER_CATEGORIES`
      from the visible list in `case 'checklist'`.
      Location: `src/screens/InspectionScreen.tsx`, `case 'checklist'`.

- [ ] **OOS auto-notify is user-facing copy only.** Screen 7's quiet green
      "Dispatcher has been notified · HH:MM" line on the OOS state promises a
      notification that doesn't actually fire. Today the dispatcher sees the
      OOS via the fleet board's red banner. Wire to real SMS/email in Phase 2
      per the Notion DVIR spec ("Phase 2 — SMS/email alert to designated
      maintenance contact when OOS defect raised").
      Location: `src/screens/InspectionScreen.tsx`, `case 'complete'` (OOS branch).

- [ ] **Non-transactional inspection submit.** `POST /api/inspection/submit`
      inserts `vehicle_inspections` first, then `vehicle_defects` rows. If the
      defects insert fails after the inspection succeeded, the driver has an
      inspection row with no defect rows — Home gate opens (status fetch sees
      a current inspection), but maintenance loses visibility into the flagged
      defects. Fail-open in the wrong direction. Fix with a Postgres RPC that
      wraps both inserts in a transaction. Until then, the existing TODO
      comment in the route handler documents the gap.
      Location: `src/app/api/inspection/submit/route.ts`, around the `defectRows.insert` call.

## Post-trip defect report — feature spec (discovered 2026-05-09, shipped 2026-05-10 partial)

- [x] **Build the post-trip defect report flow.** Built 2026-05-10. Surface lives on Home, appears after route complete, optional (no gate). Single screen with category picker, severity toggle, description, submit. Implementation diverged from the May 9 sketch: a single new column `vehicle_defects.reported_context` (instead of `inspection_type` + parallel `vehicle_inspections` row) was added in migration 009. Post-trip rows have `inspection_id = NULL` (the NOT NULL constraint was dropped in the same migration). Files: `src/components/PostTripDefectCard.tsx`, `src/app/api/defects/post-trip/route.ts`, `supabase/migrations/20260510_009_post_trip_reported_context.sql`. Wired into `src/screens/DayRouteSelectorScreen.tsx`. Category list duplicated locally in the new component pending pre-trip stabilization (TODO comment present in both surfaces).
- [ ] **Apply migration 009 to partytime-east.** Could not be pushed by the driver-app CLI due to the two-repo migration coordination problem (see lessons.md). SQL must be run by Darren via Supabase Studio SQL Editor. Verification SQL + step-by-step instructions in `tasks/open-questions.md`.
- [ ] **Extract 12-category list to `src/lib/defect-categories.ts`** when pre-trip stabilizes. Currently duplicated in `InspectionScreen.tsx`, `PostTripDefectCard.tsx`, `/api/inspection/submit/route.ts`, and `/api/defects/post-trip/route.ts` with `// TODO` markers in the new copies.
- [ ] **Optional: add `route_id` to `vehicle_defects`** so a post-trip defect carries an explicit route link rather than relying on `reported_at::date` for the per-route audit trail. Low priority. Open question logged for Darren.
- [ ] **Optional: real-time post-trip notification.** Today the post-trip submission writes to `vehicle_defects`; surfacing it to maintenance/dispatch is whatever the dashboard's existing defect view does. If push/SMS is desired (parallel to the planned pre-trip OOS auto-notify), that's a separate Phase 2 item.

## Active blockers
- Easy RFID Pro launch on Android (out of v1.1 scope)
- CoPilot destination import — final validation on real device
