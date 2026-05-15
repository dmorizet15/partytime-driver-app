# Lessons — partytime-driver-app

Patterns to avoid and reinforce. Read at session start. Append when Darren corrects something or when a non-obvious pattern proves itself out.

Format: one lesson per block. Lead with the rule, then **Why** and **How to apply**.

---

## Locked architectural invariants get re-enabled with a guard, not a removal.

**Why:** Auto-load route (May 10, 2026) needed `/` → `/route/<id>` redirect behavior that was explicitly REVERTED on May 8 because it made BottomNav's Home tab unreachable (commit `938f4b0` → revert). The naive read of the new spec would have re-introduced the same bug. The fix wasn't to drop the May 8 invariant — it was to scope the redirect to the one moment when it actually helps (cold sign-in), and add a `sessionStorage` guard so subsequent Home visits via BottomNav stay on Home. The invariant survives; the new feature works.

**How to apply:** When CLAUDE.md locks a behavior with a "reverted because…" note, treat the reason as a constraint, not history. A new feature that needs the reverted behavior must find a path that doesn't reintroduce the original failure mode. Common shapes: scope by session, scope by trigger (cold start vs. navigation), feature flag with a kill switch, or refuse the feature if the invariant can't be preserved. Never delete the lock — annotate it with the new constraint and the guard that satisfies it.

---

## Two-repo migration coordination has no clean self-service path through the Supabase CLI today.

**Why:** `partytime-driver-app` and `partytime-dashboard` both write migrations to the same Supabase project (`partytime-east`, ref `fumprcyavpefyupurvsv`) but each repo only carries its OWN migration files locally. `supabase db push --linked` from either repo refuses to proceed with "Remote migration versions not found in local migrations directory" when the OTHER repo has pushed migrations since the last sync. The CLI's suggested escape (`supabase migration repair --status reverted <list>`) removes the rows from the remote `_supabase_migrations` table — which then makes the OTHER repo think those migrations need to be re-applied (which would fail non-idempotently). On 2026-05-10 the post-trip defect feature build couldn't push migration 009 from the driver-app because dashboard had pushed 27 migrations between then and the last driver-app push (May 2). No DB password is stored locally for `--db-url` direct push.

**How to apply:** Two viable paths until a real workflow exists. (a) Apply the SQL via Supabase Studio SQL Editor, then `supabase migration repair --status applied <new_version>` from the originating repo to keep the tracking table honest. (b) Check in a periodic catch-up: have one designated repo (probably the dashboard, which owns most schema mutations) accept PR-style migration submissions from the driver-app and own all `db push` calls. Either way, when starting a session that needs a migration, the FIRST step after writing the SQL file is checking `supabase migration list --linked` to see if the gap exists; if it does, plan for the manual-apply path up front, don't discover the blocker partway through.

---

## Phase 2A weather infrastructure was designed as a facade — reuse it through `WeatherService`, never re-fetch directly.

**Why:** `src/lib/weather/weather-service.ts` exposes `getWeatherSnapshot(lat, lng)` as the single entry point. Threshold evaluators (`evaluateWindWindow`, `evaluateRainWindow`, `evaluateSnowWindow`, `evaluateLightning`) are LOCKED pure functions in `thresholds.ts` — locked because they're sourced verbatim from the Notion Weather Intelligence spec. Phase 2B (stop-level badges, May 8) reused all of this — no new threshold logic, no new vendor adapter calls, no duplication. Visual language matched Phase 2A's standalone screen so drivers recognize the same signals across surfaces.

**How to apply:** When adding any new weather surface (new screen, new badge, new module), import the existing evaluators and `STATUS_COLORS` directly. Don't create parallel threshold logic. Don't call Tomorrow.io or NWS directly — go through `getWeatherSnapshot` (server-side) or `/api/weather` (client-side). If you find yourself wanting to modify thresholds, update Notion first, then `thresholds.ts`, in lockstep.

---

## When tracking integration progress with feature flags, name them by the integration, not the date — and audit them when shipping.

**Why:** `src/lib/weather/thresholds.ts` defines three "designed-stub" flags from Phase 2A: `HAS_TENT_SIZE_DATA`, `HAS_ANCHORING_GUIDANCE`, `HAS_STOP_LEVEL_BADGES`. Each has a clear shipping condition. Phase 2B's activation was a single-line flag flip (`HAS_STOP_LEVEL_BADGES = false → true`) plus the new component plumbing. The flag names told the next operator exactly what was gated and why.

**How to apply:** When you build a feature with deferred dependencies, encode the dependencies as named boolean flags at the feature-config layer. The flag's name is the spec. When the dependency lands, flipping the flag is a single, reversible commit. Avoid `ENABLE_FEATURE_X` that hides multiple deferred conditions — split per-condition.

---

## On the driver app, the dashboard's `route.status` is invisible. Drivers act on `stop_status` per-stop.

**Why:** The dispatch board's status pill (Draft / Dispatched / Complete) and its associated buttons are dispatcher-side workflow markers. The driver app does NOT query `route.status` — confirmed via grep across the entire driver-app `src/` tree on 2026-05-08. Drivers are routed automatically based on `route_assignments` and act on each stop independently via the `stop_status` column. So the dispatcher clicking "Dispatch" or "Complete" is purely a dashboard-side checkbox; nothing changes for the driver.

**How to apply:** When adding driver-app behavior that depends on "is this route active," do NOT branch on `route.status`. Use `route_assignments` (was the driver assigned today?) and `stop_status` per-stop. If you ever DO need a route-level signal driver-side, build it from per-stop aggregation, not from route.status — because the dispatcher's discipline around clicking those buttons is loose by design.

---

## Stop-level data model: `latitude` / `longitude` come from `dispatch_stops.address_lat` / `address_lng`, populated by the dashboard's geocoding pipeline.

**Why:** As of dashboard Migration 034 (2026-05-08), every `dispatch_stops` row with a non-null `address` gets `address_lat` / `address_lng` populated automatically: backfilled once for existing rows, geocoded per-cycle in `tapgoodsSync.ts` for new/changed addresses, and reset by a `BEFORE UPDATE` trigger when the address text changes. The driver app's Stop type maps these to `latitude` / `longitude` via the supabaseTransform layer. Phase 2B's weather module uses these exact fields directly via `<StopWeatherModule lat={stop.latitude} lng={stop.longitude} />` — no separate geocoding in this repo.

**How to apply:** When you need a stop's coordinates for any feature (mapping, weather, distance, geofencing), trust `stop.latitude` / `stop.longitude` directly. They reflect the customer's delivery/pickup address as geocoded by Google Maps. If lat/lng are null, render the feature gracefully disabled (defensive null guards) — but in production, all rows now have coords.

---

## Home is Home. Never auto-redirect away from it.

**Why:** Commit 938f4b0 (May 6) added a `useEffect` on `src/app/page.tsx` → `DayRouteSelectorScreen` that silently `router.replace`'d to `/route/<assignedRouteId>` whenever the driver had an assignment for today. The intent was "skip manual selection on login," but the effect ran on every mount of `/`, so tapping **Home** in BottomNav also bounced to the route view. Drivers couldn't reach the day overview at all. Then a follow-up patch (cfc8d5c) added a once-per-session flag to make Home reachable on subsequent visits — band-aid on a wrong-shaped problem. The real fix (e72aa78, evening 2026-05-08) was to delete both: Home stays Home; the **Inspect & Start Route** CTA on Home is the explicit, driver-controlled entry into `/route/<id>` (RouteListScreen).

**How to apply:** Keep landing screens and execution screens separate. `/` is the day overview (greeting, truck, day stop list, CTA); `/route/<id>` is the route execution view. Navigation between them is always driver-initiated — a CTA tap, never an effect-driven `router.replace`. If you find yourself writing "auto-load on mount" logic on a top-level page that has a BottomNav entry pointing back to it, stop — the redirect will eat the nav. Acceptable redirects are guard-shaped: unauthenticated → /login, no-role-access → /unauthorized. "Convenient default" is not a guard.

---

## A schema column rename in the dashboard repo is NOT shipped — it is broken — until every consumer repo's selects, types, and call-sites are swept too.

**Why:** 2026-05-09 morning the dashboard shipped Migrations 036/037/038 (`add_maintenance_manager_role`, `profiles_roles_array`, `drop_profiles_role_column`) and updated the dashboard's TypeScript layer to `roles[]`. Dashboard CLAUDE.md was updated to say "No further refactor work outstanding." The driver app — a separate repo, separate PostgREST consumer — was missed. Result: `getUserRole()` here was still calling `…/rest/v1/profiles?select=…,role,…`. PostgREST returned HTTP 400 (column does not exist), `getUserRole` returned `null`, every page guard's `role !== 'driver' && role !== 'super_admin'` evaluated `true`, and every authenticated user saw "Access denied" until 2026-05-09 evening (commit `b937892`). The dashboard build was green, the dashboard runtime was green, the dashboard's own tests were green — but production was broken for every driver app user from morning to evening because the migration's blast radius wasn't audited across repos.

**How to apply:** Before declaring a schema-changing migration "complete" in the dashboard, run a cross-repo audit. The minimum sweep:
1. `cd ~/Projects/partytime-driver-app && grep -rn "<old_column_name>" src/` — catches PostgREST `select=` strings, TypeScript types, and call sites.
2. `cd ~/Projects/partytime-sms && grep -rn "<old_column_name>" src/` — same for the SMS repo (any service that talks to the same Supabase project counts).
3. For renames specifically (column X → Y), also grep for the old column in any `src/types/supabase.ts` autogenerated file — those drift silently because no app code references them by string.
4. Update CLAUDE.md "Active Flags" only after every consumer repo's `npx next build` is green AND its production deploy is confirmed READY — not after the migration applies.

The cheap forcing function: when writing the migration's CHANGELOG entry, list the consumer repos explicitly, and don't write "no further refactor work outstanding" until each repo's commit hash is recorded next to its repo name.

**Related — driver-app-side prevention:** treat any `*.role` / `select('role')` / `profile?.role` reference as a regression seed once the schema has plural `roles[]`. If you ever find yourself reintroducing one (e.g., copy-pasting from old code), stop — the column doesn't exist and the inline pattern is `roles?.includes('driver')`.

---

## Trust the data join. When the data is wired, delete the stub flag — don't keep the placeholder.

**Why:** `HAS_TRUCK = false` in `DayRouteSelectorScreen.tsx` rendered a hardcoded "Your truck: — · —" stub on Home, with a "Coming soon" toast on tap. Meanwhile `/api/routes` had been joining `trucks!routes_truck_id_fkey(id, name)` and the `Route` type already exposed `truck_name` — `RouteListScreen.tsx:174` was consuming it. The data was live and shipping; only Home didn't read from it because the flag was never flipped. Result: drivers saw "— · —" on Home for weeks despite the data being one prop away. Surfaced 2026-05-08 — fixed by deleting `HAS_TRUCK`, adding `plate` to the existing trucks join + transform + Route type, and rendering `<truck_name> · <plate>` (or name-only when plate is null).

**How to apply:** When a "designed-stub" feature flag's gating condition is already true (the API returns the data, the type has the field, a sibling screen is consuming it), the flag is a stale toggle — not a feature flag. Delete it, render the data, hide the slot when the data is null. Don't leave a placeholder pretending to be a feature. The audit pattern: search for `HAS_*` flags whenever you wire up a new API field; if any flag's spec is "show X when X exists in the API" and X now exists in the API, that flag is technical debt.

---

## A "stub" UI control reported as "broken after my change" is usually pre-existing dead wiring, not a regression.

**Why:** During the 2026-05-13 week view session Darren reported the Town/Equip filter pills and prev/next nav buttons "stopped working after the equipment shape change" and asked for the regression to be fixed. The actual code state: the dashboard's WeekScheduleView has explicit comments (lines 148–150) saying "Filter pills — stubbed wiring per spec; logic deferred. TODO: implement actual filtering when a filter spec lands. For now the pill states are persisted but don't transform the rendered data." The driver-app variant inherited the same stub. The nav buttons were `disabled` with `title="Week navigation lands in a follow-up"`. Both surfaces had been visually present but functionally inert since the May 11 `c839588` initial week-view ship. The user's mental model ("they used to work") was off; they had never worked. If I'd taken the framing at face value and gone hunting for the regression caused by the equipment shape change, I'd have spent the session looking in the wrong place.

**How to apply:** When a user reports "X broke after Y change," before fixing the assumed regression, verify the current code state — and the prior code state if there's a recent diff. Specifically: search the file for `disabled`, `TODO`, `stubbed`, `// FIXME`, and any persistence-without-consumption pattern (state set in localStorage but never read by the render path). If the control was never wired, the answer isn't "restore," it's "wire it now." Be transparent with the user about that — say "this was actually never wired, here's what it would do if I wire it" — so the work matches reality. Don't silently restore something that never existed.

---

## When two repos share a helper file, treat the pair as a single artifact: change both in the same commit-pass, or don't change either.

**Why:** Three helpers — `equipmentSummary.ts`, `inflatable.ts`, `itemCategories.ts` — now exist as byte-for-byte mirrors in `partytime-driver-app/src/lib/` and `partytime-dashboard/src/lib/`. There is no shared package, no symlink, no monorepo, no build-time validation. The driver-app's copies were ported from the dashboard during the 2026-05-13 session because the helpers were small (50–140 lines each), the inputs are identical (TapGoods JSONB items shape), and the outputs are consumed by independent UI in each repo. The cost of mirroring is one extra `Edit` call per change. The cost of drift is silent semantic differences — a category mapping fix on one side that doesn't propagate, an inflatable keyword added to the dashboard but not the driver app, a regex tightened in one repo and loosened in the other. Drift surfaces as "but the dashboard shows it correctly!" bug reports days or weeks later when the data shape varies enough to expose the difference.

**How to apply:** When editing any of the three mirrored helpers, the workflow is: (1) Edit dashboard file. (2) Edit driver-app file with identical content. (3) Build BOTH repos. (4) Commit both with matching commit messages (modulo "Mirror of dashboard fix" preamble on the driver-app side). (5) Push both. Do NOT split this across sessions or commit one without the other "to verify it works first" — the inconsistent intermediate state is a footgun. If the change feels too large to mirror, that's the signal to extract into a shared package (currently a `tasks/todo.md` long-term item). Until that lands, the mirroring discipline is the only thing keeping the two repos rendering items the same way.

---

## `npx next build` green ≠ deployed. The push is the deployment trigger.

**Why:** 2026-05-09 evening, ten commits piled up on local `main` over a multi-hour inspection-flow build session. Each pass ran `npx next build` after editing — green every time — and I conflated "build succeeded" with "this is in production." It wasn't. `git push` was never run between the morning's `c5aa4c5` and the end of the session. Smoke testing against the Vercel deploy showed the old pre-inspection app for 2+ hours because nothing new was deployed. Discovered when Darren said "nothing has appeared in Vercel for 2+ hours" and asked for git status. Recovery was clean (one push of all 10 commits, single Vercel build), but the wasted smoke-test cycles were avoidable.

**How to apply:** The pre-push rule from CLAUDE.md is **build-then-push as one indivisible sequence**, not "build, then maybe push later." After every `npx next build` that goes green on `main`, the very next command is `git push origin main`. No interleaved work, no "I'll push at the end of the pass." If a build is green and you're not pushing, name out loud why (e.g., "still mid-pass, will push after the bundle is done") so the deferred push doesn't get lost across the next hour of context. When in doubt, push. Vercel auto-deploys, the build is fast, there's no penalty for an extra push but a real cost for a stale deploy that misleads the smoke test.

**Forcing function:** at the start of any session, treat `git status` showing "Your branch is ahead of origin/main by N commits" as a red flag, not a routine note. Either push immediately or write down explicitly why you're holding (which should be rare).

---

## When `supabase db push` is blocked by two-repo coordination, use `supabase db query --linked --file`.

**Why:** Both repos write migrations to the same Supabase project, so the remote `_supabase_migrations` table accumulates rows that neither repo has local migration files for. `supabase db push --linked` refuses to proceed when remote rows aren't present locally — and the CLI's "fix" (`migration repair --status reverted <list>`) would force the OTHER repo to think those migrations need re-running, which fails non-idempotently. The prior doctrine (see lesson above) was "apply via Supabase Studio SQL Editor, then `migration repair --status applied <version>` to record it." That works, but it requires a browser and a paste. 2026-05-14 surfaced a cleaner option: **`supabase db query --linked --file <path>` runs SQL via the Management API and skips the local-vs-remote migration history check entirely.** Same auth (Management API token), same target (the linked project), no history validation. Migration 051 was applied this way in one CLI command, then tracked via the same `migration repair`.

**How to apply:** When `supabase db push --linked` complains about missing migrations (or when you've planned for the two-repo block at the start of a session): run `supabase db query --linked --file supabase/migrations/<your_file>.sql`. Verify the schema landed (REST probe or a follow-up `supabase db query --linked "<verify SQL>"`). Then `supabase migration repair --status applied <version>` to insert the tracking row. Regen types with `supabase gen types typescript --linked > src/types/supabase.ts` (see the next lesson — the CLI bleeds stderr into the file when redirected). Don't try `db push` first as a probe; if you've already identified the block, jump straight to `db query`.

**Caveat:** `db query` doesn't validate idempotency or check for syntactic issues against the local migration files — it just runs your SQL. So the migration file should still be written idempotently (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, DO-block-wrapped constraint creates) so a re-run is a no-op.

---

## `supabase gen types typescript --linked > file.ts` writes stderr into the file. Strip the header and footer before committing.

**Why:** The Supabase CLI prints `Initialising login role...` to stderr at the start of `gen types` and a multi-line "A new version of Supabase CLI is available…" to stderr at the end. Shell redirection `>` only captures stdout, BUT the CLI appears to print at least the first line to stdout in some setups — on 2026-05-14 the regen step produced a TypeScript file whose first line was `Initialising login role...` and whose last three lines were the upgrade nag. `npx next build` failed with `Parsing error: Unexpected keyword or identifier` on `src/types/supabase.ts`. Took two extra edit passes (one to strip the header, one to strip the footer) before the build went green.

**How to apply:** After `supabase gen types typescript --linked > src/types/supabase.ts`, ALWAYS verify the first and last lines of the file:
- First line MUST be `export type Json =` (or similar valid TS).
- Last line MUST be `} as const` (or similar valid TS).

If either line is the CLI's narration, strip it before committing. Or pipe through a filter: `supabase gen types typescript --linked 2>/dev/null | grep -v "^A new version\|^We recommend\|^Initialising" > src/types/supabase.ts`. Or run the command, then run a quick `npx next build` to catch the regression immediately. The point is that **the redirect doesn't isolate stdout cleanly** — treat the output as semi-trusted, not as final.

---

## A UI bug presenting as a JSX gating problem is often a data-layer problem. Trace the value before editing the ternary.

**Why:** 2026-05-14 — Bug report: "Stop detail screen shows Mark Stop Complete button on an already-completed stop." Natural first instinct: check the JSX ternary that gates the button. Easy fix, right? Wrong. `StopDetailScreen.tsx:1163` already had `{isCompleted ? <Delivered card> : <ETA + Action card>}`. The gating logic was correct. The button only renders when `isCompleted === false`. So either `isCompleted` was being computed wrong, or `stop.current_status` wasn't `'completed'` when the screen re-rendered. **It was the second one.** The completion state was being written to the server (`/api/complete-stop` → `dispatch_stops.stop_status='completed'`) but never read back (`/api/routes` didn't `select('stop_status')`, `supabaseTransform.toRealStop` hardcoded `current_status: 'pending'`). The 5s post-complete `loadDay(date, true)` then replaced the in-memory completion mark with a freshly-transformed 'pending' value, and the OTW merge in `AppStateContext.loadDay` (when OTW had been sent earlier) clobbered any localStorage rescue. Three-line fix in three files — none of them in StopDetailScreen.

**How to apply:** When a UI bug looks like a gating/visibility/conditional problem, the first thing to verify is **the value being gated on**, not the gate. Concretely: `console.log` (or stop in the inspector) on the boolean expression's inputs at the moment of render. If the inputs look wrong, walk backwards: where does `stop.current_status` come from? Is it being written somewhere? Is it being read back? Is something else writing to the same slot and overwriting? Don't reach for the ternary edit until you've confirmed the data path. The ternary is usually correct — it's the value flowing into it that's broken. **Symptom in the JSX, root cause in the data layer** is a recurring shape.

**Related — when in doubt, check what columns the SELECT actually pulls.** `/api/routes` listing every column it selects (rather than `select('*')`) is a positive — it makes "what got read" auditable — but the cost is that adding a write without adding the matching read silently breaks the read-back. If a feature writes a column and the client cares about it, the SELECT statement is the second file to touch in the same commit.

---

## When restructuring a UI surface, a working route demoted to a footer pointer is a regression — not a refactor.

**Why:** v1 of the Tools/Training hub restructure (2026-05-14, commit `f64d5bb`) moved `/tools/weather` and `/reference/library` from first-class tiles in the old `ToolsScreen.TOOLS` grid into a muted "Weather · Reference library also in Tools" footer pointer line. Both routes were live and working — drivers were already using them. The structural argument was honest (the new spec didn't list them as category tiles), but the user-facing effect was: a feature drivers reach by tapping a tile became a feature drivers reach by reading a sentence and somehow guessing how to navigate there. v2 (`288d120`, same evening) had to add them back as Live-badged tiles. The spec correction was unambiguous: "Weather and Equipment Guides are already live with working functionality — restore them in the new theme, wired to their existing routes. Do not break anything that is currently working."

**How to apply:** When the spec for a hub / navigation surface restructure does NOT mention a feature that has a live working route today, the default is to **keep it in the new layout**, not drop it. Ask before demoting. A footer pointer / breadcrumb / "see also" link is not a substitute for a tile — the tap target is what makes the feature reachable. The smaller rule: when the spec says "restructure X" and the new structure has fewer slots than the old structure had live tenants, ask which tenants are being demoted before writing the new screen. Anchor on the working-feature inventory, not the new spec's tile count.
