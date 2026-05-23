# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

- **Active feature:** Fleet Maintenance Module (driver app) — shipped 2026-05-22 (`46ba851`), three UI fixes the same evening (`ca93062`), pre-trip mileage capture 2026-05-23. Five screens (Fleet Overview, Asset Detail, Work Order Detail, Log Service Entry) + a role-gated Tools Hub card + a home-screen alert card + an Odometer card on the pre-trip Screen 6 that feeds `trucks.current_mileage`. Reads/writes the dashboard-owned fleet tables (migrations 062–068) directly via the RLS-gated supabase client; pre-trip mileage capture writes `trucks.current_mileage` via the admin client. No new migrations. See "Fleet Maintenance Module — Driver App" section below.
- **Latest migration:** **068** in the remote `schema_migrations` table (dashboard Fleet Maintenance phases 1–4). Driver-app local `supabase/migrations/` is unchanged at 12 files (latest `20260515_012_game_scores`) — the fleet module added zero migrations; every table was already live from the dashboard side. The "migration count" is the remote table count, not the local file count.
- **Branch strategy:** Commit directly to `main` — Vercel auto-deploys on every push.
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

**Pre-trip mileage capture (shipped 2026-05-23).** Required Odometer card on the pre-trip inspection's `sign_submit` step (Screen 6), above the certify checkbox. `POST /api/inspection/submit` validates an integer `0 ≤ n ≤ 2,000,000`; on a successful `vehicle_inspections` insert it then writes `trucks.current_mileage` via the admin client — **unconditional** (pre-trip is the live ground-truth reading; no backdated value to guard against) and **non-fatal** (a write failure is logged and the request still 200s — the federally-required inspection row already exists by that point, and an odometer write failure must not block the driver from starting the route). Mileage-based PM flagging is now live fleet-wide; `pmStatus.pmLevelForSchedule` already consumed `current_mileage` — that branch was dormant until this commit.

**Schema gaps flagged 2026-05-22 (Darren-side follow-ups, see `tasks/todo.md`):** no work-order→parts junction (parts shown are asset-fit, labelled "Parts for this asset"); `vendors` table empty (no tap-to-call data yet); no CarQuest/NAPA (priority-1/2) cross-refs seeded; invoice-upload was ❌ in the Notion Build Spec v1.0 access matrix but the approved 2026-05-22 design session supersedes that — driver app uploads invoices.

**NEXT smoke test (production, Vercel auto-deploys commit `46ba851`):**

1. Fleet-access user → Tools Hub shows the Fleet Maintenance card; standard driver → no card at all.
2. `/tools/fleet` → overview renders counts, trucks (13) + equipment (24) with status dots, "No open work orders" empty state (table is currently empty).
3. Create a work order dashboard-side (or DVIR defect) → Tools card red pill + home alert card appear; tap → Work Order Detail.
4. Work Order Detail → Log service entry → fill the form → Save → returns to detail with the new entry in the service log; work order still open.
5. Mark resolved → work order closes, resolved banner shows; confirm no service record was auto-created.
6. Assign → pick a user / Assign to me / Unassign. Upload invoice → pick a service record → camera/file → invoice attached.

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
