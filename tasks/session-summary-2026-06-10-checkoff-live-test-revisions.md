# Session Summary — 2026-06-10 (PM2) — Check-off live-test revisions 1–3

**For chat-Claude to update Notion.** Spec page `37b0aa6451b881e39a1bcde70e6bd288` → the 🔴 "Live Test Revisions" section is now BUILT (all three), pending Darren's live re-test.

## Shipped (both repos pushed to `main`, both builds green, no migration — high-water stays 096, next 097)

- **Driver app `8869246`** — Rev 1 + Rev 2.
- **Dashboard `8c8fbcf`** — Rev 3 (+ `c30e9e7`, a pre-session docs commit preserving the dispatch-board null-guard bug note that was blocking the fast-forward).

## Rev 1 — Inline check-off, double tap killed

`ItemCheckoffSheet.tsx` → `ItemCheckoffPanel.tsx` (rename; container-only change — every interaction, the two-axis qty/damage logic, three accept paths, summary strip, offline behavior, WO handoff reused verbatim). The panel renders inline in StopDetailScreen's manifest slot; a SINGLE gated bottom CTA ("Confirm N items to complete" disabled → "Complete Stop → Next") commits the check-off and completes the stop in one tap. The action card's "Mark Stop Complete" is hidden while the gate is active. The sheet's success overlay was removed — its Continue button would have re-created the double tap. CTA is available to ALL crew with completion rights (never primary-only).

## Rev 2 — Co-driver permissions (both stacked mechanisms fixed, all 5 gate sites)

- **Inspection lock:** new `Route.truck_is_own` — the `/api/routes` soft-fail still inherits the primary's truck for DISPLAY, but both stop-lock gate sites (Home + Route list) now lock only on the user's OWN crew-row truck AND exclude `is_primary === false` outright. Ride-along co-drivers are never locked behind an inspection they can't perform. Accepted trade-off: a two-truck co-driver's stop list is no longer hard-locked pre-inspection (the Inspect CTA still walks them through the pre-trip).
- **Transfer lock:** `isTransferredAway` now catches the EX-PRIMARY only; `canComplete` gained `|| is_primary === false`. Co-drivers retain completion + navigation through a handoff. ETA SMS stays primary/active-only (untouched, per guardrail).
- **Lifecycle hygiene:** `/api/complete-stop` clears `routes.active_driver_id` + `transfer_pending_to` (service-role, non-fatal) when warehouse_return completes — handoff state finally has an exit path. The test route's stale `active_driver_id` (Lucas) clears on its next route end, or can be cleared manually once (SQL in `tasks/todo.md`).
- **Observability:** `/api/routes` warns loudly when a route has zero `route_crew` rows mid-operation.

## Rev 3 — Silent accessory/add-on sweep (dashboard)

- **Pre-step hard gate PASSED:** query-side shape confirmed by LIVE introspection from a deployed surface (ephemeral token-gated route on a `vercel deploy` preview; deployment deleted after — no commit, no key exposure). `Rental.pickListAccessories: [PickListAccessory!]!` / `pickListAddOns: [PickListAddOn!]!`, both `{ id: ID!, quantity: Int }` — exactly as assumed. Input wrapper re-confirmed (`id: Int!` → `Number()` conversion needed; shared across items/accessories/add-ons).
- `SYNC_RENTAL_BODY` gained the two fragments — they land in `reservations.tapgoods_data` verbatim and surface in NO UI (dashboard or driver), per Darren's invisibility mandate.
- The dispatch write-back sweeps every accessory + add-on to picked/checked-in at FULL quantity, unconditionally, via the existing `pickListLine()` (full qty ⇒ Option A/B identical). Main-item shorts/damage never affect the sweep.
- **Caveat for the re-test:** reservations synced before this deploy have no accessory data yet — one TapGoods sync cycle must run before the sweep fires on `#0A819C5A`.

## Guardrails held

ETA-SMS primary-only ✓ · required-pickup/pickup-crew flagging ✓ · COD cash gate (order only: items → cash) ✓ · warehouse_return geofence auto-complete ✓ · Phase 2B handoff-accept flow ✓ (only its stale-state cleanup + ex-primary discrimination changed, as specced).

## For Darren

1. **Live re-test** (the completion gate) — checklist at the top of `tasks/todo.md`. Run a TapGoods sync before testing the accessory sweep.
2. Two-device co-driver smoke (single-truck route): co-driver must see an unlocked route and be able to complete.
3. Optional one-time cleanup of the stale test handoff: `UPDATE routes SET active_driver_id = NULL, transfer_pending_to = NULL WHERE active_driver_id IS NOT NULL AND route_date < CURRENT_DATE;`
