# Open Tasks — partytime-driver-app

## Cross-repo: Dashboard data hygiene to simplify driver-app filter (discovered 2026-05-08)

The driver app's `/api/routes` endpoint currently filters stops by `calculated_eta IS NOT NULL` to drop ghost assignments (stops dragged onto a route weeks ago and never optimized or unassigned). This is a workaround. The principled fix lives in the **dashboard repo**:

- [ ] When a dispatcher assigns a stop to a route in the dashboard (drag-drop, or any other path that sets `dispatch_stops.route_id`), also set `dispatch_stops.scheduled_date = routes.route_date` for that stop. Today, only `route_id` and `route_position` are updated, so pickup stubs retain their auto-anchored Monday `scheduled_date` even after assignment.
- [ ] Backfill pass: for every existing `dispatch_stops` row where `route_id IS NOT NULL`, update `scheduled_date` to match the route's `route_date`. One-shot SQL or admin endpoint.
- [ ] After the dashboard ships the above + backfill runs cleanly, revert this repo's `/api/routes/route.ts` filter from `.not('calculated_eta', 'is', null)` back to `.eq('scheduled_date', date)`. Cleaner, doesn't depend on a derived signal.

## Tools Hub — Content Build (Phase 2 — content authoring + UI)

Empty shells exist on `/tools` for the tile grid. Content + per-tool UI is the work:
- [ ] Tenting calculator — tent squaring
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
