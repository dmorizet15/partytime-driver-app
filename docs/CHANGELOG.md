# Changelog — partytime-driver-app

Per-session work log. Most recent entry on top. Architecture decisions, rules, and active flags live in `CLAUDE.md`. Roadmap and progress live in Notion (PTR Master Build Checklist + Build Progress Dashboard).

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
