# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

- **Active feature:** None — 2026-05-19 was a bug-fix day. Two arcs landed: morning (super_admin route visibility + tenting sub-hub, commits `406ed82` `b49e6e1` `c0bffa5`), evening (Routes-tab toggle for unassigned drivers + `/schedule` scroll/BottomNav fix, commits `ebaebc2` `ced6aa1` `d1b1910`). Next active feature: TBD (Arcade Party Kong v3 Sessions B/C/D still pending if no new priority lands).
- **Latest migration:** **053** (`game_scores`, 2026-05-15). Local directory in lockstep with remote `schema_migrations` (repaired via `supabase migration repair --status applied`). Phase 4 added no migrations — all data came from dashboard-side Migrations 057/058.
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
