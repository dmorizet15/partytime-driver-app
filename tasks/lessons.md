# Lessons — partytime-driver-app

Patterns to avoid and reinforce. Read at session start. Append when Darren corrects something or when a non-obvious pattern proves itself out.

Format: one lesson per block. Lead with the rule, then **Why** and **How to apply**.

---

## A bug-report's *prescription* can contradict reality or a locked decision — verify the premise against live data / docs before "fixing," and be willing to report "no change needed" plus why.

**Why:** 2026-06-02 a four-issue checklist task arrived with two prescriptions that were wrong on inspection. (1) "Sledgehammer appears twice — find the duplicate row / `sledge hammer` spelling variant and consolidate." Querying `dependency_map` showed exactly ONE correctly-spelled `Sledgehammer` row; the dedup (`AvaChecklistSheet` `seen` Set + the morning-card `new Set(...)` count, both keyed on `required_item`) works. No row change was correct. (The only double-row item was `Hammer` — TENTS + inflatable — which dedupes to one by design.) (2) "Voice copy reverted — make it use em dashes for breath pauses." But Session 2 had *deliberately removed* em dashes: `withSentencePauses()` only inserts the ElevenLabs `<break>` after `.`/`!`/`?`, so an em dash adds no pause — adding them would have regressed the very fix the issue wanted. The file was intact and already compliant; the heard "two stops on the board, smooth start" was the period-pause transcribed as a comma from an older deploy. Acting on either prescription verbatim would have introduced a bug.

**How to apply:** Treat a reported symptom as a hypothesis, not a spec. Before editing: reproduce against the live source (`SELECT` the row, read the rendered string), and cross-check any prescribed mechanism against the locked decisions in `CLAUDE.md`/file headers. If the data or doctrine contradicts the fix, say so explicitly, show the evidence, and propose the change that's actually correct (or "no change") — don't implement a regression to satisfy the literal ask. For `dependency_map` `keyword` choices specifically: `ruleFires` lowercases both sides and matches a single substring, so pull real values first (`SELECT jsonb_array_elements(items)->>'name' FROM dispatch_stops`) — "CROSS CABLE" is the contiguous tent-name substring; bare "MQ" over-matches walls/doors.

---

## "Button doesn't work" usually means the action runs but the failure is invisible — check the disabled-gate AND where the error renders relative to the button before assuming the handler is broken.

**Why:** 2026-06-02 a driver reported the Log Service Save button "does not work." It wasn't broken: `disabled={saving}` only (never field-gated), so it's always tappable. Required-field checks were early-returns inside `save()` that set an `error` string rendered in a red box at the *end of the scroll body* — above the fixed footer button, so on a long form it's off-screen. Worse, on a validation early-return `setSaving(true)` is never reached, so the button label doesn't even flicker → genuinely zero feedback at the tap point. The everyday cause was simply an unselected required "Service type" (default `''`, not prefilled). A second, sneakier failure: a compliance-type save POSTs to the dashboard *after* the `service_records` insert already committed, so a thrown POST reads as "save failed" while the row exists — and retry duplicates it.

**How to apply:** When triaging "X button does nothing," answer three questions in order before touching the handler: (1) what is the button's `disabled` expression — is it field-gated or only an in-flight flag? (2) where does the failure message render relative to the button, and can it be off-screen? (3) does the unhappy path produce ANY visual change at the tap point (label, spinner, toast)? A validation path that returns before flipping the loading flag is silent by construction. Also flag any mutation that does a second network call AFTER a successful insert with no idempotency guard — that's a partial-write + duplicate-on-retry waiting to happen. Confirm schema/RLS hypotheses with read-only `information_schema`/`pg_policies` queries rather than assuming.

---

## When a request says "find where the checklist item / note is defined," check the DB before grepping `src/` — the morning checklist is `dependency_map`-driven, so item rows and their notes are DATA, not code.

**Why:** 2026-06-02, two fixes ("remove the 'Dillon interview May 24th' note from the zip-ties item" and "auto-add tent/inflatable tools") both read like component edits. `grep -r "Dillon\|zip tie" src/` returned NOTHING — the items live in the `dependency_map` table (Migration 016), rendered generically by `AvaChecklistSheet` from `required_item`/`notes`/trigger rules. (The stray note was even misremembered: actual value was "Dylan interview May 24", not "Dillon … May 24th" — so a literal code grep for the quoted text would have failed twice over.) The conditional tool logic is also data: `trigger_type='category'|'keyword'` rows, fired by `ruleFires` in `dependencyHits.ts`. Both fixes were a single idempotent migration (021), zero component changes — inflatable→Hammer+Hand truck already existed, so only tent→Hammer+Sledgehammer (`category='TENTS'`) was missing.

**How to apply:** For any "checklist / dropdown / catalog item" change, first ask "is this seeded data or hardcoded JSX?" Grep `src/`, and if it comes up empty, `SELECT` the obvious table. A generic list renderer (maps over DB rows) means the fix is a migration. Re-detection rules: reuse the existing trigger mechanism (`dependency_map` category/keyword rows + `ruleFires`), don't bolt on `resolveCategory`/`hasInflatableItem` — and check whether a sibling rule already covers half the ask (the inflatable rows did). Keep the data migration idempotent (guarded INSERT + plain UPDATE) since `dependency_map`'s seed only fires on an empty table.

---

## A documented "intentional" design decision can still be wrong for users — when a directive contradicts an architecture note, confirm scope, then reverse it deliberately and update the doc, rather than defending the note.

**Why:** 2026-06-02 the AVA Phase 1/Session 2 "quiet state" (hide the Home stop list once inspected; Routes tab is the entry point) was documented as intentional in CLAUDE.md. But drivers experienced the hidden list as "stops cleared after inspection" — a bug, not a feature. The fix reversed the quiet-state hiding for the stop list (so it persists with completion checkmarks) while keeping the rest (AVA brief / weather / Ask Ava) pre-inspection-only. Because the reversal was partial and contradicted a written invariant, scope had to be pinned down first (stop-list-only vs. full reversal; what the post-inspection CTA becomes) before any edit.

**How to apply:** When a user directive collides with a CLAUDE.md/docs "this is intentional" note, don't silently override OR silently obey — surface the conflict, ask the one or two scope questions that actually change the implementation (here: which elements persist, and the new CTA behavior), implement the agreed subset, and immediately rewrite the doc so the next session doesn't "fix" it back. Leave a breadcrumb in the new code comment ("reverses X for Y only — Fix N") so the partial reversal is legible.

---

## When you broaden a COUNT, also update the DETAIL surface fed by the same collection — a count and its drawer/list must widen together or they silently disagree.

**Why:** AVA Phase 2 Session 2 (2026-05-31) the "wire `warehouse_notes` like `dispatcher_notes`" fix broadened the morning-brief count from "stops with a dispatcher note" to "stops with a dispatcher OR warehouse note" (`stopsWithDispatchNotes` → `stopsWithNotes`). But that same filtered array also fed the review drawer `AvaDispatchNotesSheet`, which rendered only `s.dispatcher_notes`. Broadening the count alone would have made the drawer show a warehouse-only stop as a blank row — the count says "3 stops have notes" but one row is empty. The instruction only listed the count line as a surface, yet correctness forced updating the drawer too (render both note types labeled, retitle "Notes from dispatch" → "Notes for your stops"). The card-visibility gate (`… && notesStopCount === 0`) also had to broaden so warehouse-only-note days still show the card.

**How to apply:** Before broadening a count/derived total, trace every consumer of the backing collection — the tap target, the drawer, the list, the empty/visibility gate. A count is a promise about what the detail surface will show; if the detail surface renders only the old subset, the promise breaks (blank rows, count/detail mismatch). Widen the predicate in ONE shared memo and make every consumer handle the new members (here: render `warehouse_notes` alongside `dispatcher_notes`, with labels so the source stays legible). Also re-read any visibility gate that references the old count — it usually needs the same widening. Treat "the spec only named the count" as the floor, not the ceiling: coupled surfaces come along for correctness.

---

## A free-text Notion field synced into a DB column will NOT match the clean enum tokens a spec assumes — query the actual distinct values before writing any role/category filter.

**Why:** AVA Phase 2 Session 2 (2026-05-31) the SOP-search spec said "role-filter: department IN ('driver','field','all')". The real `sop_entries.department` values (mirrored from the Notion SOP Library) are human-authored composites: "Drivers / Warehouse", "Field Operations", "All Departments", "Warehouse", "Operations", and null. A literal `IN ('driver','field','all')` matches **zero rows** — the feature would have shipped showing no SOPs. The fix was a substring predicate (`/\b(driver|field|all)\b/i`) over the real values, treating Warehouse-only / Operations / null as not-driver-facing. The only reason this didn't ship broken was running `SELECT DISTINCT department FROM sop_entries` before writing the filter.

**How to apply:** Any filter over a column fed by a human-typed or third-party-synced source (Notion, TapGoods, dispatcher free-text) — `SELECT DISTINCT <col>` first and write the predicate against what's actually there, not what the spec's enum implies. Composite/multi-value strings ("Drivers / Warehouse") need substring/regex matching, not equality or `IN`. Decide the ambiguous buckets explicitly (here: is "Operations" driver-facing? — no) and document the call, because the next person will assume the spec's clean tokens.

---

## Inside a PostgREST `.or(...)`, `like`/`ilike` wildcards are `*`, not `%` — `%foo%` matches literally and returns nothing. For a tiny table, fetch-all + filter-in-JS sidesteps it entirely.

**Why:** AVA Phase 2 Session 2 (2026-05-31) first wrote the SOP driver-visibility filter as `.or('department.ilike.%driver%,...')`. In supabase-js, `.ilike('col','%foo%')` (standalone) uses SQL `%`, but the raw filter string inside `.or()` is PostgREST syntax where the wildcard is `*` — `%driver%` is treated as a literal and matches no rows. The bug is silent (empty result, no error), so it reads like "no data" rather than "wrong query". Because `sop_entries` is ≤10 rows, the chosen fix was to drop the `.or()` entirely: `select('*').order('sop_number')` once, then filter driver-visibility AND the search query in JS. Fewer round-trips, no wildcard-syntax trap, and the visibility rule becomes one readable JS predicate.

**How to apply:** If you must filter inside `.or()`/`.and()`, use `*` for `like`/`ilike` wildcards (`department.ilike.*driver*`). But first ask whether you need the DB filter at all — for a small bounded set, one `select().order()` + in-memory `.filter()` is simpler, dodges the wildcard gotcha, and lets you express compound predicates (visibility + text) without contorting PostgREST grammar. Debounce gates the in-memory filter; it doesn't need a network call per keystroke.

---

## A spec saying "read context from Supabase in the API route" can conflict with "the screen already computed it" — pass expensive-to-recompute context (live weather) from the client; re-derive only cheap/trust-sensitive fields server-side.

**Why:** AVA Phase 2 Session 2 (2026-05-31) the spec said `/api/ava/ask` should "read today's route context from Supabase: stop count, manifest, COD, dispatcher notes, weather flags." But `hasWeatherFlag` + the wind-alerted stop names come from `/api/ava/route-weather`, a live Tomorrow.io+NWS fan-out the Home screen had **already run**. Re-deriving it inside `/api/ava/ask` would re-hit the external weather API on every question. The repo's own `tasks/todo.md` step plan also said "pre-seed context string" — so the two artifacts disagreed. Resolution: Home passes the already-computed `seedContext`; the server still derives the trust-sensitive bits itself (`driver_id = auth.uid()`, the audit-log row) and never trusts the client for those.

**How to apply:** When a spec says "fetch X in the handler" but a caller already holds X — especially if X is an expensive external call or a derived aggregate — prefer passing it as seeded context and document the deviation. Keep server-side ONLY what must be authoritative (identity, authz, audit writes) or what's cheap to re-read. The dividing line is "would re-deriving this cost a network call or duplicate non-trivial logic?" → client-seed it; "could a malicious client lie about this to their own benefit?" → server-derive it. Here weather/manifest are harmless if fabricated (driver only fools themselves), while `driver_id` must be server-derived.

---

## Wind alerting must key off the GUST value, not sustained — gusts are what fail tents. Surface `max(sustained, gust)` from any "wind at time" helper.

**Why:** AVA Phase 2 (2026-05-30) shipped `getWindAtTime` returning `sustainedMph` only, threshold 20. A live test had `WeatherFlagCard` showing gusts 21 mph while the AVA brief stayed silent — sustained was 10. A driver acting on "no wind alert" would under-stake a tent on a gusty day. The two values come back together on every `windHourly` entry (`sustainedMph` + `gustMph`, both already imperial); returning only sustained threw away the one that matters for stake risk.

**How to apply:** When collapsing a multi-field weather reading into a single number for an alert/threshold, return the worst-case field for that hazard, not the "headline" one. For wind that's `max(sustainedMph, gustMph)`. Match what the existing surface already shows (here `WeatherFlagCard` surfaces gusts) so two surfaces on the same screen can't disagree. One-line fix, no signature change — but only because the caller treated the return as opaque "the wind"; keep alert helpers returning a single worst-case scalar so the threshold check and the display value stay in sync.

---

## Two UI elements describing the same set of things must derive from the SAME filtered collection — never count one population and break-down another.

**Why:** AVA Phase 2 (2026-05-30) Home hero read "3 stops scheduled" while the type breakdown right beside it read "1 delivery · 1 pickup" (2). The count used `dayStops.length` (depot included); `typeBreakdown` excluded `warehouse`/`warehouse_return`. Same screen, same row, contradicting numbers — drivers notice. Root cause: two code paths over the same logical set ("today's customer stops") applied different filters. (Same depot-counting class of bug as the Phase 1 morning-card count fixes — it recurs because `dayStops` is the convenient variable and the depot filter is easy to forget.)

**How to apply:** Derive a single named collection/count for the concept ("customer stops" = `dayStops` minus depot) and feed BOTH the headline count and any breakdown/secondary display from it. Here: `customerStopCount` drives the hero sub-copy AND the "The day, in N" header. Keep the unfiltered `totalStopCount` ONLY for logic that genuinely needs every leg (route-complete gate, empty-state, section guards) — and say so in a comment, because the next reader will assume one count rules them all.

---

## A Notion "Library" page is usually a PAGE (intro + summary table + one child page per item), not a database — fetch it first and parse table-for-metadata + child-pages-for-content. Confirm shape before writing the parser.

**Why:** AVA Phase 2 (2026-05-30) `/api/sop/sync` assumed (from the field list: sop_number/title/content/department/version/effective_date) it might be a Notion database with those as properties. A `notion-fetch` on the SOP Library showed a **page**: a 5-column summary table (SOP # / Title / Version / Effective Date / Department) holding metadata for SOP-001…009, plus 10 child pages holding the actual procedure text (and SOP-010 wasn't even in the table). A database parser (query properties) would have returned nothing; a "read the page body as content" parser would have missed the per-SOP pages. The right parser merges two sources: table rows (metadata, keyed by SOP #) + child pages (sop_number/title/content/page-id), with content falling back to title for the NOT-NULL column.

**How to apply:** Before building any Notion→DB sync, `notion-fetch` the source page and read its actual block structure. Page-with-table-and-child-pages and true-database need completely different parsers. Server-side the route can't use the MCP tools — it needs its own integration token (`NOTION_API_KEY`) + raw REST (`GET /v1/blocks/{id}/children`, `Notion-Version` header); no `@notionhq/client` dep required. Build it token-gated (501 when the key is absent) so it's inert-but-deployable until Darren wires the env + shares the integration into the page.

---

## Tomorrow.io `windHourly[].time` and `dispatch_stops.calculated_eta` are BOTH UTC — but normalize via `new Date(x).toISOString()` before hour-bucket slicing, because the string formats differ.

**Why:** AVA Phase 2 (2026-05-30) matches forecast-to-arrival by truncating both ISO strings to the hour (`slice(0,13)` → "YYYY-MM-DDTHH"). Both values are UTC (verified: Tomorrow.io returns `...T20:00:00Z`; `calculated_eta` is `timestamptz`, `+00`). But the formats aren't byte-identical — `...Z` vs `+00:00` vs (raw psql) a space separator. `slice(0,13)` only aligns if the separator is `T`. A space-separated or offset-shifted value would mis-bucket (and a naive assumption that ETA was *local* would have introduced a 4-hour EDT error). The thing that made it safe was confirming both were UTC *before* writing the matcher, then normalizing anyway.

**How to apply:** When matching two timestamps by string slicing, run both through `new Date(x).toISOString()` first — it canonicalizes any valid input (space/`T`, any offset, `Z`) to one UTC form, so the slice is reliable. And verify the timezone of each source with a live sample before trusting a slice-match; don't assume a dispatcher-written field is local just because it "feels" local.

---

## A data-loading `useEffect` must NOT list the loading/result state it sets in its own dependency array — it cancels its own in-flight request and spins forever.

**Why:** Fleet Session 3 My Log (2026-05-30) loaded with `useEffect(() => { …; setMyLogLoading(true); fetch().then(rows => !cancelled && setMyLog(rows)) ; return () => { cancelled = true } }, [tab, user?.id, myLog, myLogLoading])`. The guard `myLog`/`myLogLoading` was in the deps to "only fetch once." But calling `setMyLogLoading(true)` **changed a dependency**, so React tore down the effect instance (running its cleanup → `cancelled = true` on the in-flight request's closure) and re-ran it. The first run's promise then resolved into a closure where `cancelled` was already true, so `setMyLog`/`setMyLogLoading(false)` never fired — the tab showed "Loading…" forever. It looked like an RLS / write bug (the obvious suspects when a list never populates), but the History tab read the same table under the same RLS and worked, and `fetchMyServiceLog` returns `[]` on a query error → empty state, not a hang. Symptom = infinite spinner with data present → client effect race, not data layer.

**How to apply:** A fetch-on-mount/condition effect should depend ONLY on the stable inputs that should *re-trigger* the fetch (an id, a query key) — never on the `loading`/`data`/`error` state the effect itself writes. Setting state you also depend on = self-cancelling re-run loop. To "fetch once," key on the stable id and let the id's stability do the deduping (`[user?.id]`), or use a `startedRef`. Keep the `cancelled` cleanup flag (it's correct for unmount/id-change), but make sure a *normal* state update inside the effect can't trigger the cleanup. Diagnostic shortcut for "list never loads": if a *sibling* surface reads the same table fine, suspect the component's effect/race before RLS or the write path.

---

## When a newer spec re-designs a screen that already shipped (and was itself design-approved), confirm the restructure-vs-additive call before rebuilding — the answer changes the whole session.

**Why:** Fleet Maintenance Session 3 (2026-05-30) built against a May 26 Notion design spec that described Screen 1 as pill tabs (Trucks / Equipment / My Log) and Screen 2 as pill tabs (History / PM Schedule / Parts). But the **live** Overview + Asset Detail screens were built May 22 from an *earlier* approved mobile design session — work-order-centric, no pill tabs. So two valid readings existed: (a) full pill-tab restructure per the newer spec, or (b) additive — keep the working screens, only add the unambiguously-missing My Log. The screens also surfaced open work orders prominently, which the newer spec's Screen 1 doesn't mention — and the repo's own lesson says "ask before demoting a working feature." Guessing wrong would have meant either tearing out working WO surfacing or shipping against the approved design. One `AskUserQuestion` (restructure vs additive + what happens to WO surfacing) resolved it cleanly: full restructure, WOs kept inside the new tabs.

**How to apply:** Before rebuilding a screen that (1) already ships and works AND (2) was previously design-approved, but (3) a newer spec describes differently — stop and ask which approach. The decision is cheap to ask and expensive to redo, and it's exactly the "two valid approaches" fork the autonomy rules flag. Pair the structural question with an explicit "what happens to feature X that the new spec omits?" so a working feature isn't silently demoted. This is the inverse of the "newer in-session design supersedes older Notion spec" lesson — there the newer artifact clearly won; here both artifacts were design-approved and the *user's* current intent was the tiebreaker.

---

## To surface a new `routes`/`dispatch_stops` column in the driver app, extend the existing `/api/routes` SELECT + `supabaseTransform` — never add a parallel endpoint. And confirm what the SELECT already returns before assuming you need to add anything.

**Why:** The dispatcher/stop-notes build (2026-05-28) needed `routes.dispatcher_notes` (not in the routes SELECT) and five TapGoods `notes_*` fields (not in the dispatch_stops SELECT) — but `dispatch_stops.dispatcher_notes` and `notes` were *already* returned. Reading `src/app/api/routes/route.ts` first showed exactly which fields were missing, so Component 2 (stop-notes count) needed zero query change while Components 1/3/4 needed only SELECT additions. `/api/routes` is the single read path: SELECT → `SupabaseRouteRow`/`SupabaseStopRow` (hand-rolled row shapes) → `transformSupabase` → `Route`/`Stop`. A second endpoint would duplicate the driver-scope/RLS-bypass/assignment logic and split the source of truth. Note the easy-to-miss distinction: `dispatch_stops.dispatcher_notes` (per-stop, already on Stop Detail) is a *different field* from `routes.dispatcher_notes` (route-level, had no driver-app surface before this).

**How to apply:** Before writing any fetch logic for a dashboard-owned column, `grep` the `routes`/`dispatch_stops` SELECT blocks in `src/app/api/routes/route.ts`. Add missing columns there, mirror them in the `SupabaseRouteRow`/`SupabaseStopRow` interfaces + the `routes.map`/`toRealStop` builders in `supabaseTransform.ts`, then to the `Route`/`Stop` types. Trim to `undefined` in the transform (`x?.trim() ? x : undefined`) so empty strings don't read as present. Reads only — these tables are dashboard/TG-owned; the driver app must not write `dispatcher_notes` or any `notes_*` field.

---

## Cross-app POST is the right shape when the receiving route owns a side effect the source can't replicate (notification email, server-generated identifier, etc). Don't shortcut to a shared supabase write.

**Why:** The Work Orders Session 2 build needed to create `field_work_orders` rows from the driver app. The driver app already speaks supabase directly for fleet reads + writes under RLS — the obvious shortcut was to mirror that, inserting `field_work_orders` rows the same way. But the dashboard's Session 1 POST route owns two things RLS can't: (1) `work_order_number` generation (sequential `PT-####` identifier the user sees on every card and pill), and (2) the assignee + super_admin notification email via `notifyNewFieldWorkOrder`. A direct supabase insert skips both — the row would land with a null work_order_number and no one would learn about it. The alternatives are worse: triggering email from a DB trigger means a new dashboard migration and `pg_net`-style infrastructure for an HTTP-out from postgres; a driver-app proxy route doubles the network hops for no win. POST → dashboard with the user's bearer token in `Authorization` is the simplest correct shape.

**How to apply:** Whenever the driver app needs to *write* something that another service must react to (email, SMS, slack, billing, search reindex, audit log to a different DB), POST to the owning service's HTTP route — don't shortcut via supabase even if the table is reachable under RLS. Pass the supabase access token through and let the receiving route validate. Keep *reads* on supabase though — they have no side effects, and round-tripping a SELECT through the dashboard would add latency for no benefit. Tell the difference by asking: "if I write this row directly, what doesn't happen that should?" If the answer is "nothing" → supabase direct. If the answer names a side effect → owning service's route.

---

## A driver-app feature that reads dashboard-trigger-computed columns needs a type regen FIRST, even though the columns existed when the regen happened months ago.

**Why:** Phase 4 (May 17, 2026) shipped a stop-card badge driven by `constraint_confidence`, `delivery_window_start/end`, `pickup_window_start/end`, `notes_classification`, `dispatcher_time_override`, `dispatcher_constraint_dismissed`. All six columns exist on `partytime-east` since dashboard Migration 058 (mid-May). But the driver-app's local `src/types/supabase.ts` was regen'd before that migration applied — none of the new columns existed in the type yet. Trying to SELECT them in `/api/routes` and map them in `supabaseTransform` would have compiled fine (the SELECT string is untyped, the row shape was hand-rolled as `SupabaseStopRow`), but downstream code referencing `stop.constraint_confidence` would have failed type-checking. Caught by running `grep -n "constraint_confidence" src/types/supabase.ts` before writing UI code — zero matches → regen first.

**How to apply:** When adding a driver-app feature that consumes columns the DASHBOARD owns (`partytime-east` is shared; either repo can write migrations), the FIRST step after writing the SELECT is `grep <new_column> src/types/supabase.ts`. Zero matches → regen via `supabase gen types typescript --project-id fumprcyavpefyupurvsv 2>/dev/null | grep -v "^A new version\|^We recommend\|^Initialising" > src/types/supabase.ts`, then re-grep to confirm the column landed. The two-repo migration coordination problem (separate lesson) means driver-app types drift silently behind dashboard reality — the regen is cheap; the silent drift is expensive.

---

## When the dashboard already owns a feature's logic, port the pure-functional layer; don't reimplement.

**Why:** Phase 4's window-resolver tree (`dispatcher_time_override` → structured → notes) is non-trivial — six fields, two stop-type branches, an ordering that has changed once already on the dashboard side. The dashboard's `src/lib/stopConstraints.ts` is well-tested through the dispatch board. Reimplementing the priority order from the Notion spec would either match it exactly (in which case the port is the simpler artifact) or diverge subtly (in which case the bug surfaces months later when a driver-app badge says "Pickup by 5 PM" but the dashboard says the dispatcher overrode to 7 PM). The May 17 driver-app port grabbed `effectiveWindow`, `formatLocalClock`, and `isHardConstraintTier` verbatim, dropped the dashboard-specific ETA-violation + mutation glue, and added one new helper (`buildBadgeContent`) for the compact label.

**How to apply:** When a feature has a working dashboard implementation and you're building the driver-app surface, scan `~/Projects/partytime-dashboard/src/lib/` and `~/Projects/partytime-dashboard/src/types/` for the helpers + types first. Port the pure-functional layer (no React, no Supabase, no React-Query) verbatim — those are the parts that need to STAY in lockstep. Drop the dashboard-specific wrappers (mutations, optimistic UI, store glue). Document the mirror in CLAUDE.md so the next session knows to update both copies when the resolver changes. This is the same discipline as the `equipmentSummary.ts` / `inflatable.ts` / `itemCategories.ts` mirror — except those helpers were originally driver-app-side and grew copies in the dashboard; `stopConstraints.ts` flows the other way.

---

## `next/font/google` does not register fonts under a global name — canvas `ctx.font` cannot find them by their plain name.

**Why:** Built the PartyTime Arcade games (May 15, 2026 overnight) with `Outfit` imported via `next/font/google` with a CSS variable `--font-outfit`. The React DOM rendered Outfit correctly via the wrapper layout's className. But canvas calls like `ctx.font = 'bold 9px Outfit'` or `ctx.font = 'bold 9px var(--font-outfit), system-ui'` both fell back to system-ui — because `next/font` generates a hashed font-family name (something like `'__Outfit_abc123'`), NOT the literal string `'Outfit'`, and canvas's font-shorthand parser does not resolve CSS custom properties. The hard rule in the spec was "no monospace or system fonts anywhere in the arcade." Caught the issue before push by reading the computed style off the canvas element.

**How to apply:** When you need a `next/font` family inside a canvas (or any context that parses font-shorthand without CSS), capture the actual resolved family name from the live DOM at runtime: `const family = window.getComputedStyle(canvas).fontFamily` on mount, store in a ref, then use template-literal interpolation in every `ctx.font` assignment (`` ctx.font = `900 22px ${family}` ``). Do not try to hardcode the family name — the hash changes per build. Do not import the same font twice (once via `next/font` and once via Google Fonts CSS) just to get the global name — wastes a request and conflicts with `next/font`'s optimization.

---

## Canvas-game loops belong in `useRef`, not React state — the loop must not trigger renders.

**Why:** Both Arcade games (May 15, 2026) use `useRef<GameState>` for the per-frame mutable state and only `useState` for HUD values that need to render in React (score, level, lines). The RAF loop reads from / writes to `stateRef.current` directly. Then a per-frame check compares the rounded score to a `scoreDisplayLastRef`; if different, it calls `setScoreDisplay`. This keeps React re-renders limited to genuinely-changed display values (typically <60 per second; usually 5–20). If the entire game state were in `useState`, every position update would trigger a re-render and the canvas would either drop frames or lock up.

**How to apply:** Default to refs for canvas/game mutable state. Use React state only for values that drive React-rendered DOM (HUD pills, modal score, etc.). Stage the mirror at the boundary: in the RAF callback, snapshot `Math.floor(state.score)` (or whatever the displayable value is) and call `setX` only when it has actually changed. Same pattern works for game phase (`start | playing | gameover`) — the ref drives loop branching, the state drives overlay rendering.

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

## CSS `aspect-ratio + width: 100% + max-height: 100%` silently breaks aspect when the parent is shorter than the aspect-derived height.

**Why:** Party Kong's canvas wrapper (2026-05-16 mobile fix arc) used `aspectRatio: W/H + maxWidth: W + maxHeight: 100% + width: 100% + height: auto` to size itself inside a `flex: 1` parent. Intent: "fit inside parent, preserve aspect ratio." Reality on iPhone 14 Pro (parent shorter than the aspect-derived height): browser computes `width: 100%` first (binding constraint, explicit), then `height: auto` via aspect = `width * (H/W) = 720`, then `maxHeight: 100%` clamps to 537. Per CSS spec, aspect-ratio is "preferred" but can be violated by explicit dims — width stays explicit at the clamped 100% value, height stays clamped, aspect-ratio is silently abandoned. Wrapper becomes 390x537 (not aspect-correct). Anything inside that's sized by its own aspect (canvas at 390/720 ratio) then overflows by hundreds of pixels and the wrapper's `overflow: hidden` clips through the visible game area — surfaced as "barely see the top of the guy's head" on commit `891adf4`. Fixed in `b7798bf`.

**How to apply:** When you need a box to fit-and-shrink inside a flex parent while preserving aspect-ratio, drive sizing from the **scarce** dimension. On phones the scarce dim is height, so use `height: 100%, width: auto, aspectRatio: A/B, maxWidth: <px>, maxHeight: <px>`. The browser then uses aspect-ratio to derive width from the height-100% explicit value, and maxWidth/maxHeight cap each end on different viewport sizes (phone → height-bound, desktop → width-bound at maxWidth, derived height capped at maxHeight). The combo of `width: 100% + maxHeight: 100%` is an anti-pattern when both constraints can bind — it works when width is scarce, silently fails when height is scarce.

**Test plan when you set aspect-ratio + max-height on a flex item:** simulate a parent that's both **wider than the aspect-derived width** AND **shorter than the aspect-derived height**. If the box doesn't preserve aspect under that pair, the CSS will fail on some phones. The canonical example: a 390/720-aspect box inside an iPhone-14-Pro-shaped parent (393×537 after toolbars and chrome).

---

## iOS 18 Writing Tools fires on long-press of any button — held controls drop unless suppressed.

**Why:** iOS 18 introduced a system "Writing Tools" callout triggered by long-pressing any focusable interactive element including `<button>`. On Party Kong (2026-05-16 mobile fix), holding a D-pad direction for more than ~1s popped the callout, intercepted the touch, and fired `touchcancel` — which the button's `onTouchEnd` doesn't observe, so the held direction stayed pressed in `keys[]` state and the player walked into walls forever. Same shape on Route Rush + Tent Tetris controls. Caught during on-device testing; fixed in `78c46c1` across all three games + the arcade layout.

**How to apply:** Every game control button needs these defenses (and the parent controls container needs 1+2+3 too, since long-pressing in the negative space between buttons also triggers the callout):
1. `WebkitTouchCallout: 'none'` — suppresses the iOS callout menu (copy/paste/Writing Tools).
2. `WebkitUserSelect: 'none'` + `userSelect: 'none'` — prevents text selection on long-press.
3. `onContextMenu={(e) => e.preventDefault()}` — kills the right-click + long-press context menu surface.
4. `tabIndex={-1}` — keeps iOS from treating the button as a text-input target for the callout.
5. `onTouchCancel` paired with the same handler as `onTouchEnd` (release the held key) — an OS-cancelled touch doesn't strand state. For tap-only buttons (RouteRush ControlBtn, TentTetris ControlBtn) it's just `preventDefault`; for held buttons (Party Kong DpadBtn) it MUST call `onRelease`.

The canvas itself needs `touch-action: none` (already standard for games) plus `onContextMenu preventDefault` to suppress callout on the play surface. The page-level wrapper benefits from `apple-mobile-web-app-capable + status-bar-style: black-translucent` metadata so the OS treats the page as a game context, not a document.

---

## Canvas internal bitmap (`.width / .height` attributes) and CSS display size are independent — never set inline `canvas.style.width/height` to the bitmap's native dims.

**Why:** Every arcade game's init useEffect did:
```ts
canvas.width  = Math.floor(W * dpr)      // bitmap resolution — correct
canvas.height = Math.floor(H * dpr)      // bitmap resolution — correct
canvas.style.width  = `${W}px`           // ← forces CSS display to native W
canvas.style.height = `${H}px`           // ← forces CSS display to native H
ctx.setTransform(dpr, 0, 0, dpr, 0, 0)   // logical coord space at W×H
```
The last two lines ran post-mount and overrode the JSX's `width: 100%; height: 100%` (since useEffect runs after React's initial render and React doesn't re-set a style prop that hasn't changed). On 2026-05-16 the canvas wrapper layout was changed to fit short iPhone viewports — but the canvas kept pinning at 390×720 CSS, overflowed the now-shorter wrapper, and `overflow: hidden` clipped the truck (RouteRush y=580) and the ground floor (PartyKong y=560) from the bottom-of-canvas inward. Fixed in `bb4f340` by dropping the two `style.width/height` assignments — React's `width/height: 100%` now drives display size, parent caps via aspect-ratio + max-height.

**How to apply:** The canvas attributes (`.width`, `.height`) define the bitmap pixel resolution — set them ONCE at init to `W*dpr × H*dpr` for sharp retina rendering, pair with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` so game code draws to the logical 0..W × 0..H coordinate space. The canvas CSS size defines the display area the bitmap renders into — let it come from the parent layout (`width: 100%, height: 100%` on the canvas, parent constrains via aspect-ratio + max-height). The browser scales the bitmap to fit the CSS rect. If you find yourself writing `canvas.style.height = '720px'` to "make the canvas the right size," delete that line — your CSS layout is the source of truth for display size, not the JS. Game coordinates work in logical space regardless of display size, because `ctx.setTransform(dpr, ...)` already separates the two.

---

## "Lots of padding" can mean empty pixels inside the canvas — not a CSS margin.

**Why:** After fixing the iPhone controls and tightening every CSS gap (2026-05-16 commits `78c46c1` → `1b259da`), Darren reported "excessive padding between the canvas bottom and the controls." The instinct was to keep trimming margins/paddings. But there was nothing left to trim — the gap was the bottom 22% of the 720-tall Party Kong canvas (logical y=560 → y=720), which the game's renderers paint as warehouse back-wall + floor-strip texture below the ground platform line. From outside the canvas it reads as "wasted space." From inside the renderer it's drawn pixels. CSS knew nothing about it. The real fix (commit `891adf4`) was to crop the canvas via a wrapper with a shorter aspect-ratio + `overflow: hidden` — not to trim more CSS.

**How to apply:** When a user says "there's empty space between X and Y," verify the space is actually CSS (margin/padding/gap on an element you can inspect) before re-trimming. Open dev tools, inspect the element, confirm the box model shows the gap. If the element's box ends right at the visible boundary AND the next element starts right after, the gap is **inside the rendered content** — either an image with whitespace, a canvas with empty pixels, or a child positioned inside a larger parent. The fix is one of: (a) shrink the source content to crop the empty area; (b) wrap in a smaller container with `overflow: hidden` to clip; (c) if it's a game canvas, leave the bitmap alone and add a CSS crop wrapper as in approach (b).

**Forcing question:** "If I set the parent's background to red, would the user's reported gap turn red?" If yes, it's a CSS gap and trimming margins helps. If no, it's inside the rendered content and you need a crop, not a trim.

---

## A scope fix for one persona that over-fires on another is still a bug — verify the fix's blast radius against every role before shipping.

**Why:** Commit `6e1484e` (2026-05-16) correctly removed the unscoped fallback from `/api/routes` so an unassigned super_admin no longer saw every other driver's stops dimmed on their Home screen. But the commit message justified the tightening entirely on the premise "dispatchers don't use the driver app" — ignoring that super_admin is also Darren, who does. Result: the day-view was now correctly scoped (no dimmed stops), but the week schedule was no longer reachable from any nav item when super_admin had no route assignment. Surfaced the next session (2026-05-19) when Darren reported "I can no longer see the weekly route schedule." The investigation session then overcorrected in the opposite direction (commit `406ed82` gave super_admin an unscoped `/api/routes` response), which put all the dimmed stops back. Took three commits total to land on the correct solution: keep the day-view scoped for everyone (including super_admin), but point the Routes tab to `/schedule` for unassigned super_admin so the week board is always reachable.

**How to apply:** When tightening a scope rule, enumerate EVERY persona that hits the endpoint + EVERY screen that depends on it before shipping. For a persona like super_admin who is both "admin" and "sometimes a driver," there may be two separate surfaces with two different scoping needs: the day-view (always assignment-scoped — no dimmed-other-drivers problem) and the week-view (always full board — admin oversight). The fix for each surface is independent. Don't conflate them into a single API-level role check. And don't trust the prior commit's stated intent ("dispatchers don't use the driver app") as a complete persona analysis — super_admin may not be a dispatcher but they still need the data.

---

## Day-view and week-view are different surfaces with different scoping contracts — treat them independently.

**Why:** `/api/routes` is the day-view data source (Home + DayRouteSelectorScreen + RouteListScreen "Today"). It has always been assignment-scoped: you see your stops or an empty state. `/api/schedule/week` is the week-view data source (WeekScheduleView, `/schedule` page). It has always been full-board: every authenticated user sees all routes for the week window. These two endpoints serve different intents and should have different scoping rules. The 2026-05-19 bug investigation initially conflated them — trying to solve "super_admin can't see the weekly schedule" by unscoping the day-view endpoint, which brought back the dimmed-stops problem on Home. The correct fix was orthogonal: keep both endpoints' scoping rules unchanged, and fix the navigation so super_admin can actually reach the week-view endpoint from the nav bar when unassigned.

**How to apply:** When a user says "I can't see the schedule," the first question is WHICH schedule — the day list on Home (powered by `/api/routes`, should be assignment-scoped) or the week board (powered by `/api/schedule/week`, should be full-board). They look similar in description but are served by entirely different endpoints with different policies. Before touching either endpoint's scoping, trace which endpoint the reported surface actually calls. If the problem is "the week board is unreachable," the fix lives in navigation (BottomNav, a link, a CTA on the empty state), not in the endpoint. If the problem is "the day list shows wrong stops," THEN look at the endpoint scope. Scoping and discoverability are independent variables.

---

## When restructuring a UI surface, a working route demoted to a footer pointer is a regression — not a refactor.

**Why:** v1 of the Tools/Training hub restructure (2026-05-14, commit `f64d5bb`) moved `/tools/weather` and `/reference/library` from first-class tiles in the old `ToolsScreen.TOOLS` grid into a muted "Weather · Reference library also in Tools" footer pointer line. Both routes were live and working — drivers were already using them. The structural argument was honest (the new spec didn't list them as category tiles), but the user-facing effect was: a feature drivers reach by tapping a tile became a feature drivers reach by reading a sentence and somehow guessing how to navigate there. v2 (`288d120`, same evening) had to add them back as Live-badged tiles. The spec correction was unambiguous: "Weather and Equipment Guides are already live with working functionality — restore them in the new theme, wired to their existing routes. Do not break anything that is currently working."

**How to apply:** When the spec for a hub / navigation surface restructure does NOT mention a feature that has a live working route today, the default is to **keep it in the new layout**, not drop it. Ask before demoting. A footer pointer / breadcrumb / "see also" link is not a substitute for a tile — the tap target is what makes the feature reachable. The smaller rule: when the spec says "restructure X" and the new structure has fewer slots than the old structure had live tenants, ask which tenants are being demoted before writing the new screen. Anchor on the working-feature inventory, not the new spec's tile count.

---

## The `.screen` CSS utility class is load-bearing — inline layout overrides defeat the iOS Safari toolbar lock and BottomNav pin contract.

**Why:** `src/app/globals.css` defines `.screen` as `display: flex; flex-direction: column; height: 100svh; padding-bottom: env(safe-area-inset-bottom); overflow: hidden`. The `100svh` (small viewport height) is deliberate — it locks the layout to the minimum visible area so iOS Safari's collapsible toolbar doesn't leave a gap below BottomNav. The page `/schedule/page.tsx` (built 2026-05-12 before this lock existed) overrode all of this inline: `display: 'flex', flexDirection: 'column', minHeight: '100vh'`. On iOS with the toolbar visible, `100vh > 100svh`, so the column expanded past the locked viewport. Combined with `<main style={{ flex: 1 }}>` having no `overflowY: 'auto'`, long content (e.g. a full week of routes) pushed BottomNav off the bottom of the visible viewport and the page scrolled at the document level instead of inside `main`. The fix (commit `d1b1910`) was to delete the inline overrides and add `overflowY: 'auto'` to `<main>`. The working pattern lives in `RouteListScreen.tsx` line 354: `<div className="flex-1 overflow-y-auto">` wraps the scrollable body, BottomNav follows as a sibling, and the `.screen` parent owns the height lock.

**How to apply:** When using `<div className="screen">`, the children must be: zero or more `flex-shrink: 0` headers, exactly ONE `flex: 1, overflowY: 'auto'` scroll body, then `<BottomNav />` as the last child. Do not re-declare `display`, `flexDirection`, `height`, `minHeight`, or `overflow` inline on the screen container — the class already owns these. If a page does declare them, audit the original commit: it likely predates the `.screen` lock, and the inline values are either redundant (best case) or actively breaking the iOS toolbar contract (`/schedule` case). The contract is "the class locks the viewport; the children provide the scroll." Inline overrides break this in subtle ways that only surface on long content + iOS, which is exactly when drivers actually use the app.

---

## "Identical behavior to how X sees it" is a literal spec phrase — trust the comparison, don't add asymmetric role guards.

**Why:** 2026-05-19 morning, commit `b49e6e1` fixed unassigned super_admin's broken Routes tab by sending them to `/schedule`, but explicitly kept drivers on `/` ("Drivers without an assignment still fall back to /"). The original spec said "identical behavior to how super_admin sees it" — a literal cross-role comparison. The morning session interpreted "identical" as "for super_admin only," which is the opposite of what the phrase means. Darren caught it on smoke test the same day, and `ced6aa1` removed the role check entirely: both gated roles (driver, super_admin) now share the same routesHref logic. The route was already gated to `['driver', 'super_admin']` via `rolesAllowed`, so a literal interpretation has no security cost. The original asymmetric guard had no spec justification — it was defensive engineering against an unstated concern, and it shipped a bug.

**How to apply:** When the spec uses comparison phrasing — "identical to X," "same as Y," "matches Z's behavior" — implement the comparison as written. If the comparison feels too broad or risky, that's a question to raise BEFORE writing the asymmetric version, not after. Cross-role parity has the smallest implementation surface (one code path, one set of edge cases) and the smallest test matrix; per-role divergence introduces a hidden contract that the spec didn't ask for. The smaller rule: a role guard inside a tab/route's redirect logic is redundant when the tab itself is already role-gated. If `rolesAllowed` filters the tab visibility, the redirect target doesn't need to re-check the role.

---

## The driver-app `tsconfig` targets ES5 — spreading a `Map`/`Set` iterator fails the build. Use `Array.from()`.

**Why:** Fleet Maintenance build (2026-05-22). The first `npx next build` compiled fine but failed type-checking: `Type 'MapIterator<[string, string]>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher` on `[...seen.entries()]`. The repo's `tsconfig.json` targets ES5 and does not set `downlevelIteration`, so the spread operator and `for...of` over any non-array iterable (`Set`, `Map`, `Map.keys/values/entries()`) are compile errors. `for...of` over a plain **array** is fine (TS special-cases arrays). `new Map(arrayOfPairs)` and `new Set(array)` are fine (constructor calls, not spreads). Only the `...` spread and `for...of` over the iterator break.

**How to apply:** In this repo, never write `[...someSet]`, `[...someMap]`, or `[...map.entries()]`. Use `Array.from(someSet)` / `Array.from(map.entries())` — `Array.from` is a lib method that accepts any iterable at any target. Same for de-duping: `Array.from(new Set(arr))`, not `[...new Set(arr)]`. If you need `for...of` over a Map/Set, convert with `Array.from` first or use `.forEach`. This is cheap to get right up front and otherwise costs a full build cycle to discover — `next build` compiles before it type-checks, so the error surfaces late.

---

## Before adding a prop to an existing component, grep its body for that identifier — a new prop that shadows a local is a webpack error, not a type squiggle.

**Why:** The Fleet UI-fixes session (2026-05-22 evening) added an `assetType` prop to `LogServiceEntryScreen` so it could run in standalone-asset mode. The screen already had `const assetType: AssetType = ctx?.asset?.assetType ?? 'truck'` a few dozen lines down. Destructured prop + later `const` of the same name in the same function scope = a redeclaration. `npx next build` failed at the webpack/SWC compile stage (`` `assetType` redefined here ``) — it cost a full build cycle to surface, because the new prop and the old local were far apart in the file and nothing flagged it while editing.

**How to apply:** When extending a component's prop list, `grep -n "<newPropName>" <file>` first. If the identifier already appears as a local `const`/`let`/function param, pick a different prop name or rename the local in the same edit pass — before building. The collision is mechanical and cheap to avoid up front; discovered at build time it burns a full `next build`. Same discipline as any rename: the editor won't always catch a shadow when the two declarations are far apart, and `next build` compiles before it type-checks, so the error surfaces late.

---

## Generated Supabase types carry column names — not CHECK-constraint enum values, not RLS predicates. Query the DB directly before building.

**Why:** Fleet Maintenance (2026-05-22) built a driver-app surface on dashboard-owned tables (`fleet_work_orders`, `service_records`, etc.). `src/types/supabase.ts` typed every column as `status: string`, `priority: string`, `asset_type: string` — the generator does not encode `CHECK (status = ANY (ARRAY['open','in_progress','resolved']))` into a string-literal union. Writing `status: 'closed'` would have compiled clean and failed at runtime with a constraint violation. Likewise the types say nothing about whether RLS lets the driver-app JWT INSERT/UPDATE a table, or whether a Storage bucket's policies admit uploads. All of that was resolved up front with `supabase db query --linked` against `pg_constraint` (CHECK defs), `pg_policies` (RLS cmd + predicate), and `storage.buckets` — confirming `has_fleet_maintenance_access()` gates every fleet table + the `service-invoices` bucket for `authenticated`, so the driver app could write directly with no API route.

**How to apply:** When a driver-app feature reads/writes tables the dashboard owns, after the type regen run three SQL probes before writing UI code: (1) `select conname, pg_get_constraintdef(oid) from pg_constraint where contype='c' and conrelid='<table>'::regclass` — the real enum values for every constrained column; (2) `select tablename, cmd, pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid) from pg_policy …` — confirms the user JWT can do what you need; (3) for any upload, `select * from storage.buckets` + the `storage.objects` policies for that bucket. Encode the discovered enum values as TS string-literal unions in your own `types.ts` (the generated file won't). The kickoff for this session explicitly asked to "flag schema gaps before writing UI code" — these three probes are how you find them.

---

## An in-session approved design supersedes an older Notion spec on the points where they conflict — build the design, flag the conflict, don't block.

**Why:** Fleet Maintenance (2026-05-22). The Notion "Fleet Maintenance Build Spec v1.0" access matrix marked "Upload invoice PDF/photo" as ❌ read-only for the driver app. The session kickoff — a `LOCKED DESIGN` from the mobile design session the spec itself demanded ("dedicated mobile design session before any build") — explicitly included invoice upload on Screens 3 and 4. The kickoff is the newer, more specific artifact and the literal output of the gate the spec required. Blocking the whole build on an `AskUserQuestion` would have stalled a 3,500-line feature over one matrix cell; silently following the old spec would have shipped against the approved design. The call: build per the kickoff, and log the conflict as a `tasks/todo.md` item for chat-Claude to reconcile Notion.

**How to apply:** When the in-session kickoff/design conflicts with an older Notion spec, the kickoff wins **on the conflicting points only** — it is the most recent approved decision and usually the output of a process the spec itself called for. Don't block; build the design. Don't silently override either — record the discrepancy explicitly (which doc, which point, why the kickoff supersedes) in the session summary and `tasks/todo.md` so Notion gets reconciled. CLAUDE.md's order of authority puts Notion child pages above the repo, but a same-day approved design session IS the current state of the Notion-side intent — the stale matrix cell just hasn't caught up yet.

---

## On Supabase `onAuthStateChange`, an app-load auth gate must filter to the `INITIAL_SESSION` event — `SIGNED_IN` races a fresh login.

**Why:** Auto-logout Layer 2 (2026-05-24) needs to compare `localStorage.ptr_session_date` to today's date on every authed app load and sign the driver out if it's stale. The check has to live inside `AuthContext`'s `onAuthStateChange` callback so it runs before any consumer sees the session (page-component gates are too late — `HomePage` renders a Loading state but other authed pages would flash content). The trap: the same callback fires on `SIGNED_IN` immediately after `LoginScreen.signIn()` resolves — at which point `LoginScreen` has *just* written the new `ptr_session_date`, OR it's the next line and hasn't written yet. If the gate runs unconditionally, a brand-new login can be signed back out on the same callback that delivered the new session. The race is real because `onAuthStateChange` and the post-`signIn` localStorage write are not ordered by anything.

**How to apply:** Gate the check on `event === 'INITIAL_SESSION'` (the first auth event per page load — fires once after the provider mounts with whatever cookie state exists). Skip `SIGNED_IN` (fresh login — LoginScreen owns the stamp), `TOKEN_REFRESHED` (same user, irrelevant), `USER_UPDATED` (profile-only change), `SIGNED_OUT` (already gone). Return early inside the callback before `setUser(...)` so the provider's `user`/`loading` state never exposes the stale session — pair it with `window.location.replace('/login')` for a hard navigation that re-runs middleware against cleared cookies. The same shape applies to any app-load auth gate: feature-flag checks, terms-of-service acceptance, password-change-required redirects — all of them want `INITIAL_SESSION` only and want the redirect issued before `setUser`.

---

## TapGoods category "TENTS" includes the tent's accessories — count tents on category AND a name keyword, never category alone.

**Why:** AVA's morning-card tent count (`countTentItems` in `src/lib/ava/dependencyHits.ts`) first matched on `category.includes('tent')` alone. On a live test route that pulled in sidewalls, wind walls, and door walls — all filed by TapGoods under category "TENTS" — producing 3 false positives that qty-summed to a reported "5 tents" when the route actually had one 20×20 frame tent. The dependency map uses tent count to decide accessory prompts (pry bar, wood blocks for pole tents, 2 ladders for 5+ walls), so an inflated count cascades into wrong checklist offers. This is the same TapGoods data-hygiene root cause behind the `resolveCategory` name overrides (CHAIR / STAGE / SKIRT / etc. miscategorizations) — the API category is not a clean signal on its own.

**How to apply:** When counting a specific equipment type off the TapGoods-synced `dispatch_stops.items` manifest, gate on BOTH the category AND a name keyword. For tents: `category.includes('tent')` AND name contains one of `tent` / `canopy` / `marquee`. The category gate drops items of the same name in a wrong category (a "tent heater" in a heaters category); the name gate drops accessories filed under the right category. Keep summing `qty` on matched items. Know the limit: this is a keyword heuristic, so a tent product named without any keyword (a branded SKU) will be missed — the principled fix is TapGoods source recategorization, not a longer keyword list. Flag a follow-up if a real product slips the count.

---

## AVA morning-card visibility is OR-of-triggers; a single preference toggle must gate its own block, not the whole card.

**Why:** The card first rendered only when the checklist had hits, so a driver who turned `checklist_enabled` off — but had `stats_enabled` on or a saved stop note — saw the entire card disappear, losing their stats and notes too. Separately, the stats block was gated on `weekStopsCompleted > 0`, so an opted-in driver on a slow Monday saw nothing, which looked like the feature was broken. Both bugs share a shape: a per-feature condition was controlling a shared container.

**How to apply:** A conditional card with multiple independent content blocks renders when ANY block's trigger is true (`stats_enabled` OR notes-exist OR (`checklist_enabled` AND dependency-hits)). Each block then re-checks its own trigger internally and renders a zero-state rather than vanishing when its data is empty (stats with 0 stops → "No stops completed yet this week."). Never let one block's gate (a preference toggle, a count threshold) decide the container's visibility — that couples unrelated features and produces "the whole thing disappeared" bugs. This is the Tier-2 morning card's contract; preserve it as blocks are added.

---

## Counts derived from a manifest need a category gate AND a name gate; counts derived from the stop list must exclude depot legs.

**Why:** The AVA morning card reported "5 canopies, 3 stops" on a route with one real tent and two deliveries. Two independent root causes (both fixed in `dec52c8`). (1) `countTentItems` matched any item whose name OR category contained `tent`/`canopy`/`marquee`. TapGoods files sidewalls, wind walls, and door-walls under category `"TENTS"` — the string `"TENTS"` contains `"tent"`, so every accessory matched on category alone, and their quantities summed (1 wall + 2 wind walls + 1 door + 1 frame tent = 5). (2) `stopCount` was `dayStops.length`, which includes the synthesized `warehouse_return` depot leg — so a 2-delivery route read as 3 stops. The depot stop carries `items: null`, so it didn't corrupt the tent count, but it inflated every stop-level count.

**How to apply:** When classifying TapGoods manifest items by keyword, require BOTH a category-family gate AND a name gate (`category.includes('tent') && name matches tent|canopy|marquee`). Category-substring-only over-matches because accessories are filed under the parent family; name-only over-matches across families (a "tent heater" filed under heaters). When deriving any count from the day's stops (stop count, COD count, manifest flatMap, address-keyed note lookups), first filter to customer stops — `dayStops.filter(s => s.stop_type !== 'warehouse_return' && s.stop_type !== 'warehouse')` — and reuse that one `customerStops` array everywhere so depot legs can't inflate any count. **Caveat — this is still a heuristic, not authoritative.** The tent name gate (`tent`/`canopy`/`marquee`) misses a tent product named without those keywords (e.g. a branded "PartyPeak 20×20"); the principled fix is TapGoods data hygiene, the same root cause as the `resolveCategory` name-override workarounds in the mirrored item helpers. Revisit if a real tent slips the count.

---

## "Missing data" that's really a display filter: verify the table before blaming the sync, and beware `\b` after a singular noun the data writes as a plural.

**Why:** A smoke test reported "only SOPs 5, 8, 9 are in `sop_entries`; the sync silently skipped the rest" and AVA "couldn't find SOP 1". Both reads were wrong. A single `SELECT … FROM sop_entries` against the linked prod DB returned all 10 rows (SOP-001…010, one shared insert timestamp) — the sync had discovered every Notion child page and paginated correctly. The real cause was the Training Hub driver-visibility filter `isDriverVisible`, which used `/\b(driver|field|all)\b/i`. The Notion `department` values are the PLURAL "Drivers" / "Drivers / Warehouse"; `\bdriver\b` requires a word boundary right after "driver", but the trailing "s" is a word char, so it never matched — leaving only "All Departments"/"Field Operations" SOPs (005/008/009) visible. Separately, AVA's `/api/ava/ask` has zero SOP references (route-context only), so "find SOP 1" was always going to fail regardless of the filter — an expected limitation, not a regression. Fixed in `1a1d714`: `drivers?` plus a tent-title carve-out for the null-department SOP-010.

**How to apply:** (1) When a report says "data is missing / the sync dropped rows," query the destination table FIRST — one SELECT. Distinguish "not in the table" from "in the table but filtered/hidden on read" before touching the writer. Here the proposed fixes (UUID fallback, pagination patch, retrigger) all targeted a sync that was already correct and would have changed nothing. (2) A symptom set that's a clean subset (only 5/8/9 of 10) is a filter signature, not a random-failure signature — reproduce the predicate against the real values (`node -e` on the actual departments nailed it instantly). (3) `\bword\b` silently fails when the data stores a plural/suffixed form of `word` — if a token can appear as "Drivers"/"Driverside"/etc., drop the trailing `\b` or match the suffix (`drivers?`). Pick keyword/regex tokens from the ACTUAL stored strings, never from the spec's idealized tokens (same lesson as the `dependency_map` keyword rows). (4) A count/visibility filter is only as good as the data feeding it: SOP-010's null department came from a Notion summary-table gap, so no code regex could classify it — the durable fix is upstream data, with a narrow title carve-out as the bridge.

---

## A knowledge layer added to an LLM endpoint scopes to the caller's role server-side; a filter shared by two surfaces lives in one module; a system prompt splits stable-vs-volatile for caching.

**Why:** Adding SOP content to `/api/ava/ask` (so AVA answers procedural questions) raised three design choices that each have a wrong-by-default answer. (1) *Scoping* — a driver must not be able to pull warehouse-only or admin SOPs by editing a client payload, so the role MUST be read server-side from `auth.uid() → profiles.roles`, never from a client flag; and the safe default when the role lookup fails is the most-restrictive (driver) scope, not open. The system has only `super_admin` as an elevated role — there is no plain `admin` — so guessing `role === 'admin'` would have scoped everyone to driver. (2) *Drift* — the driver-visibility filter already existed in `SopSearchSection` (the Training Hub list); duplicating it in the API would let the list and AVA's knowledge diverge the next time the rule changes. (3) *Caching* — the SOP base (~6k tokens) is identical for every driver and every turn, but the route context (client-seeded) varies per conversation; putting them in one system block (as the route-only prompt did) means the big stable part never caches across drivers.

**How to apply:** (1) For any AVA knowledge layer (SOPs now; drawings/equipment refs later), derive the scope from the authenticated user server-side via `isElevatedRole(profile.roles)` (`src/lib/ava/access.ts`), filter the data accordingly (driver → `isDriverVisibleSop`, elevated → all), and default to the driver scope on any lookup failure — least privilege. This is the documented foundational rule in CLAUDE.md → AVA. (2) When a predicate gates two surfaces (a client list and a server prompt), extract it to a shared pure module (`src/lib/ava/sopVisibility.ts`) and import it in both — same discipline as the byte-for-byte cross-repo mirror helpers, but here one module beats two copies. (3) Structure the system prompt as `[{stable persona + knowledge base, cache_control}, {volatile per-request context}]` — stable first with the breakpoint, volatile after. Keep per-user fields (driverName) OUT of the cached block or the prefix becomes per-user and the cross-user cache share evaporates. Remember Haiku's cache minimum is **4096 tokens** (higher than Sonnet's 2048) — a sub-4k stable block silently won't cache; the SOP base clears it, the old route-only prompt didn't. **Also:** "include in full vs. summarize/chunk" is a token-budget question — measure first (`SELECT length(content)`); here the whole driver set was ~6k tokens, so the spec's relevance-based partial-include path was unnecessary complexity. Don't pre-optimize context size you haven't measured.
