# Changelog — partytime-driver-app

Per-session work log. Most recent entry on top. Architecture decisions, rules, and active flags live in `CLAUDE.md`. Roadmap and progress live in Notion (PTR Master Build Checklist + Build Progress Dashboard).

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
