# Mid-route warehouse stop completion — design

**Date:** 2026-08-04
**Status:** Approved design, NOT implemented. Picked up next session.
**Repos:** partytime-driver-app + partytime-dashboard (cross-repo, must ship same session)
**Migrations:** dashboard-owned (next dashboard migration number to be confirmed at implementation time)

---

## Problem

A driver who returns to the warehouse mid-route — to reload or swap trucks before
continuing to more deliveries/pickups — has **no way to mark that stop complete**.

Reported by Darren 2026-08-04, with the belief that (a) an arrival trigger already
auto-completes warehouse stops, and (b) the gap was a missing manual fallback.
Investigation showed the premise does not hold: there is no working auto path
anywhere, and mid-route there is no manual path either.

## Investigation findings (2026-08-04, verified against live DB + code)

1. **Mid-route warehouse stops are not database rows.** They are synthesized
   client-side from `routes.break_blocks` (`type: 'warehouse'`) by
   `buildWarehouseStop` in `src/lib/supabaseTransform.ts:258`, interleaved at
   `afterStopIndex` by the loop at `:442`.
   Live: **34 warehouse blocks across 32 routes** in the last 120 days, running
   through 2026-10-09 — and **all 34 are mid-route**, none at the tail. This is
   the normal case, not an edge case.

2. **Three consequences of being synthetic:**
   - *No button.* `StopDetailScreen.tsx:2775` renders only "Open in Maps" for
     `stop_type === 'warehouse'` — comment: *"No Mark Stop Complete (Decision 1A)"*.
   - *No geofence.* `geofenceEnabled` requires the type to be
     `delivery|pickup|service|warehouse_return` **and** non-null coords.
     `buildWarehouseStop` sets `latitude/longitude: undefined`. Fails both tests.
   - *Nothing to write to.* `stop_id` is the break-block UUID, not a
     `dispatch_stops` id. `/api/complete-stop` would 404.

3. **Drivers are not stranded, but dispatch is blind.** `isProgressionLocked`
   exempts depot stops in both selector screens (`RouteListScreen.tsx:222`,
   `DayRouteSelectorScreen.tsx:435`), so the next customer stop stays tappable.
   The cost is the warehouse leg sits `pending` forever with no record that the
   truck came back and reloaded.

4. **The depot geofence has NEVER fired in production.** Across 323
   `warehouse_return` rows (277 with valid coords), `arrived_at` is populated on
   **zero**. Comparison over the same window: delivery 152/506 arrivals, pickup
   120/490. All 74 warehouse completions were manual taps.
   Root cause is in `useArrivalGeofence`: foreground-only `watchPosition`, armed
   only while that specific stop's detail screen is mounted. Drivers are never
   sitting on the warehouse screen while driving to the warehouse.

5. **`warehouse_return` cannot be reused for mid-route rows.** Live definition of
   `ensure_warehouse_return_for_route` shows:
   - `ON CONFLICT (route_id) WHERE stop_type = 'warehouse_return'` — a **partial
     unique index**, so a route can hold at most one such row.
   - An `ELSIF` branch that **drags the row back to `max_position + 1`** on every
     sync.
   This explains the data: 13 mid-route `warehouse_return` rows exist, all dated
   2026-05-26 → 2026-06-09, then none. That approach was tried and killed.

## Decisions taken

| # | Decision | Rationale |
|---|---|---|
| D1 | Mid-route warehouse legs become **real `dispatch_stops` rows** | Dispatch must see the reload leg; the ETA cascade anchors on these timestamps |
| D2 | New `stop_type_enum` value **`'warehouse'`**, not `'warehouse_return'` | Avoids the partial unique index and the tail-forcing function (finding 5) |
| D3 | **Arrival auto-detected; completion stays a manual tap** | A tap as the driver rolls yields a truer `actual_departure_at` than a geofence guess. Full auto-complete is unreliable in a PWA regardless (finding 4) |
| D4 | **Warehouse completion follows `profiles.auto_send_eta`, exactly like any other stop** | Darren, 2026-08-04: the driver-profile toggle is the single source of truth; this work must not override it in either direction |

## D4 — how it was settled (2026-08-04)

Darren initially stated the rule as "nothing should ever auto-text a customer,"
then tested live and reported that nothing auto-sent — an apparent contradiction
with the flag data. Investigation resolved it: **both were true.**

- `auto_send_eta` is `true` on exactly **one profile — Cameron Keesler** (active
  driver, 38 routes in 60 days). All other 10 profiles, **including Darren's**, are
  `false`. Darren tested on his own account, so correctly saw no auto-send.
- The auto-send **is real and fires.** Verified by timing signature rather than by
  the flag: auto-ETA fires ~1s after the previous stop's completion; a human tap
  cannot. Of Cameron's 9 OTW sends, **8 landed within 2.3 seconds** of a completion
  (min 0.71s). Every flag-off driver's fastest send was ≥8.4s, and three never sent
  within 5s of a completion at all.
- **Clincher:** the send at `2026-07-31 08:39:43 ET`, 1.25s after completion, ETA
  text *"1 to 1.5 hours"* — the Route 1 incident in CLAUDE.md, recorded from the
  database side.
- `logEvent` is a **console stub** (`EventLogger.ts:28`) and writes nothing to the
  DB, so `stops.otw_*` joined to `dispatch_stops` is the only audit trail for SMS
  sends. Worth knowing before anyone plans to "check the event log."

Given the toggle is admin-controlled per driver (dashboard
`admin/drivers/[driverId]` → "Auto-send ETA on stop complete", `requireAdminAccess`
gated, drivers cannot self-serve), Darren decided to **leave it as is**. The earlier
"retire auto-texting globally" task was **deleted, not parked** — the flag already
provides the control.

**Implication for this spec:** the warehouse stop is not a special case. It runs the
normal `runStopComplete` path, reaches `maybeFireAutoEta`, and texts the next
customer *only* for a driver whose profile flag is on. `AutoEtaOptInRow` renders in
the warehouse CTA block like any other completion surface.

⚠ This is **new behavior** for a flagged driver — the warehouse stop cannot be
completed at all today, so it has never texted anyone. Accepted knowingly: finishing
a reload is a truthful moment to tell the next customer you're rolling.

## Design

### Dashboard (owns the migrations)

- **Migration A:** `ALTER TYPE stop_type_enum ADD VALUE 'warehouse'`.
  Must be its own migration — Postgres will not allow a newly added enum value to
  be *used* in the transaction that adds it.
- **Migration B:** `break_block_id uuid` on `dispatch_stops`, plus a partial unique
  index on `(route_id, break_block_id) WHERE stop_type = 'warehouse'`. This is the
  idempotency key so re-syncs update instead of duplicating.
- **Injection function** `ensure_warehouse_stops_for_route(p_route_id)`, mirroring
  the existing tail function:
  - Read `routes.break_blocks` entries where `type = 'warehouse'`.
  - Upsert one row per block, keyed on `break_block_id`.
  - Update `route_position` when a block moves.
  - Delete the row when a block is removed — **unless `completed_at` is set**.
    Never destroy a completion record.

**Open sub-decision — ordering.** `route_position` is an integer synced from
TapGoods, leaving no room between positions 2 and 3. Renumbering or shifting
downstream rows fights the next sync, which rewrites those values.

*Recommendation:* give the warehouse row the **preceding stop's** `route_position`
plus a small tiebreak column; both apps sort `(route_position, tiebreak)` with
customer rows ahead of the depot row at the same number. Survives re-sync
untouched, since the row only ever encodes "after stop N."

**Confirm the sync ordering in the dashboard repo before committing to this** —
it could not be verified from the driver-app repo.

### Driver app

- **`src/lib/supabaseTransform.ts`**
  - Map the new `'warehouse'` enum through `mapStopType`.
  - **Delete `buildWarehouseStop` (~:241–294) and the interleave loop (~:442–462).**
  - Extend the `isDepotReturn` coordinate override at `:181` to cover `'warehouse'`,
    so rows inherit `DEPOT_LAT/DEPOT_LNG` and the 46 coordless depot rows stop
    mattering.

- **`src/screens/StopDetailScreen.tsx`**
  - Collapse the Navigate-only `isWarehouse` branch (`:2775`) into the
    `warehouse_return` treatment above it. `hasLaterStopOnRoute` is already
    computed, so the copy resolves to **"Done — continue route"** with no new logic.
  - Add `'warehouse'` to `geofenceEnabled`.
  - **Render `AutoEtaOptInRow` in the warehouse CTA block** and leave the
    `runStopComplete` → `maybeFireAutoEta` path untouched, so warehouse completion
    obeys `profiles.auto_send_eta` like every other stop (D4). Do **not** add a
    depot-specific suppression — that would override the driver profile, which is
    exactly what this work must not do.

- **New — route-level depot arrival watcher.** A focused hook consumed by
  `AppStateProvider` (always mounted — same reasoning as the co-driver realtime
  subscription, which lives there precisely because App Router unmounts screens on
  navigation). Watches depot coords whenever today's route holds an incomplete
  depot stop; fires `POST /api/stops/arrived` once. The server's
  `arrived_at IS NULL` predicate makes double-arming with `StopDetailScreen`
  harmless.

### Deliberately unchanged

End-of-day `warehouse_return` behavior and its auto-logout,
`ensure_warehouse_return_for_route`, and the mid-route auto-complete suppression
(`!hasLaterStopOnRoute`). `/api/complete-stop:144` keys its route-end / transfer-clear
behavior specifically on `'warehouse_return'`, so a mid-route `'warehouse'` row
cannot end a route or sign the driver out — that separation comes free.

## Rollout risk

The dashboard injection and the driver-app synthesis removal **must ship in the same
session**. Ship the dashboard alone and drivers see **duplicate** warehouse stops
(real row + synthesized block). Ship the driver app alone and they see **none**.

## Verification

No test runner in this repo — `npx next build` plus on-device smoke is the gate.

- [ ] `npx next build` green in both repos.
- [ ] On-device smoke, route with a mid-route warehouse block:
  1. Warehouse stop renders once (no duplicate), is tappable.
  2. Arrival at the depot stamps `arrived_at` **without** the depot screen open.
  3. "Done — continue route" completes it; next stop unlocks.
  4. **SMS follows the profile flag, not the stop type** — on a flag-OFF driver
     (10 of 11, including Darren's own account) completing the warehouse sends
     nothing; on a flag-ON driver the opt-out row is visible above the button and
     unchecking it suppresses the send.
  5. End-of-day `warehouse_return` still auto-logs-out.
