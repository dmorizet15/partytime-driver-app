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
- [ ] Phase A: Stop data from Supabase (replace TapGoods direct calls)
- [ ] Phase B: Live ETA + status sync (mostly done — Migration 033 + cascade live)
- [ ] Phase C: Driver assignment from dashboard (mostly done — auto-load shipped May 6)

## Pre-trip inspection — edge cases to revisit (discovered 2026-05-09)

- [ ] **Trailer rows on `dvir_requirement = 'never'` trucks.** Screen 5 currently
      treats `towingTrailer !== false` as "show trailer rows" — for `'always'`
      and `'never'` trucks (no Screen 4 fired), `towingTrailer` stays `null`,
      so the full 12-row checklist renders. Conservative default: include
      trailer rows when we don't know. Revisit once we have field data on how
      often `'never'` trucks are inspected with a trailer attached. Likely
      target: surface a Screen 4 variant for `'never'` + `'always'` trucks too,
      or remove trailer rows for `'never'` trucks entirely.
      Location: `src/screens/InspectionScreen.tsx`, `case 'checklist'`.

## Active blockers
- Easy RFID Pro launch on Android (out of v1.1 scope)
- CoPilot destination import — final validation on real device
