# Changelog — partytime-driver-app

Per-session work log. Most recent entry on top. Architecture decisions, rules, and active flags live in `CLAUDE.md`. Roadmap and progress live in Notion (PTR Master Build Checklist + Build Progress Dashboard).

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
