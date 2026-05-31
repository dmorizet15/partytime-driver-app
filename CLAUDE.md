# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

| Item | Status |
|---|---|
| Active feature | AVA Phase 2 — Session 2 delivered on `feature/ava-phase2-session2` (commits `4faef54`, `044b879`); not merged |
| Latest merge | AVA Phase 2 Session 1 → `main` (merge `0176699`, 2026-05-30); branch `feature/ava-phase2` deleted |
| Latest migrations | 020 `sop_entries_rls` + 019 `sop_entries` + 018 `dispatch_stops_geocache`; local = 20 files |
| Branch strategy | Feature work → named branch; unrelated fixes → direct to `main` |
| Next priority | See `tasks/todo.md` (top of file) — Session 2 production smoke test |

**Phase 2 Session 1 delivered (merged, smoke-test pending):** `geocodeAddress` (Nominatim, cache-first, server-side write-back), `getWindAtTime` (Tomorrow.io+NWS, gust-inclusive, UTC-bucket matched), `POST /api/ava/route-weather` (per-stop enrichment), `useRouteWeather` → `hasWeatherFlag` + red `WIND {mph}` pills (≥20 mph). SOP: `POST /api/sop/sync` mirrors Notion SOP Library → `sop_entries` (token-gated, inert until `NOTION_API_KEY` set, returns 501). "Ask Ava about today" placeholder button (UI-only, coming-soon toast). Home stop-count fix: `customerStopCount` excludes depot from hero + section totals.

**Phase 2 Session 2 delivered (branch `feature/ava-phase2-session2`, not merged):** `SOP_SYNC` ran in prod — `sop_entries` populated with SOP-001…010 (`{synced:10, errors:[]}`). `POST /api/ava/ask` (auth-gated, `claude-haiku-4-5-20251001`, route-context system prompt, logs to `ava_conversations` surface `driver_home`, 503 when `ANTHROPIC_API_KEY` unset — key already set in Vercel). `AvaConversationSheet` (shared `open/onClose/seedContext` dark sheet, VOICE/TEXT toggle, `speak()` TTS, thinking waveform). Home "Ask Ava about today" button now opens the real sheet, pre-seeded with Home's computed context. SOP search in Training Hub (`SopSearchSection`, debounced, driver-visible filter, tap-to-expand, "Ask Ava instead" empty state). Migration 020 enabled RLS on `sop_entries`. **Pending: production smoke test (see `tasks/todo.md`).**

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
- Apply the superpowers workflow on all coding tasks: brainstorm → plan → approve → execute → verify. PTR-specific rules in this CLAUDE.md take precedence over superpowers where they conflict. Before approving any plan, flag whether shared files require simultaneous dashboard updates in the same session.

---

## Critical rules (inline — read every session)

- **Pre-push verification.** `npx next build` (not `npx next lint`) must succeed end-to-end before `git push`. Lint does not run TypeScript's type checker.
- **Build-then-push is one indivisible sequence.** Never build and stop. If a build is green and not pushing immediately, name out loud why.
- **Migrations apply via `supabase db push` or `supabase db query --linked --file <path>`** (bypasses two-repo history block). Never paste into Supabase SQL Editor. Mark applied with `supabase migration repair --status applied <version>`.
- **Cross-repo helpers are byte-for-byte mirrored.** `src/lib/equipmentSummary.ts`, `src/lib/inflatable.ts`, `src/lib/itemCategories.ts` have twins in `partytime-dashboard`. Any change MUST be applied to both in the same session.
- **TapGoods API gotchas** (do not re-discover): see `docs/claude/doctrine.md` → "Key TapGoods API Learnings".

---

## Time Window Constraints — Phase 4 (driver-app read-only)

Dashboard Migration 058 computes `constraint_confidence` + window bounds on every `dispatch_stops` row. Driver app surfaces these in three places — all read-only, no writes:

- **Stop card badge** — `<StopWindowBadge />` renders amber pill below address on StopDetailScreen, RouteListScreen rows, and DayRouteSelectorScreen day list. Solid amber for verified/inferred/manual; dashed outline for suggested. Renders nothing when `constraint_confidence` is null.
- **Pickup standby** — When `arrived_at` stamps a pickup stop and `pickup_window_start > now`, StopDetailScreen replaces action card with standby: "You're early — pickup opens at X" + live `HH:MM:SS` countdown + **Navigate anyway** button.
- **Pre-navigate gate** — Navigate quick action on a hard-tier pickup with unopened window pops `ConfirmationModal`. Suggested tier never gates.

Both standby-dismiss and gate-override write `sessionStorage` key `early-pickup-override:${stopId}` — one tap stops both gates for the rest of the session. Override logged via `NAVIGATION_STARTED` workflow event with `early_pickup_override: true`, `override_source: 'standby' | 'navigate_gate'`, `minutes_early`.

**Window resolver:** `src/lib/stopConstraints.ts` — pure-functional port of dashboard's source-priority tree (`dispatcher_time_override` → structured `delivery_/pickup_window_*` → `notes_classification.extracted`). NOT byte-identical — driver app is read-only subset. If dashboard logic shifts, mirror here same session.

**Data plumbing:** `/api/routes` SELECT pulls all Phase 1/2 columns; `supabaseTransform.toRealStop` maps them onto driver `Stop` type. Regen `src/types/supabase.ts` (`supabase gen types typescript --project-id fumprcyavpefyupurvsv`) before changing the SELECT.

---

## Fleet Maintenance Module — Driver App

Initial ship 2026-05-22; pill-tab rebuild Session 3 2026-05-30. All reads/writes against dashboard's fleet tables — no driver-app migrations, no API routes.

- **Access.** `profiles.fleet_maintenance_access` — stacked additive permission, independent of `roles`. UI gate: `useFleetAccess()`. DB gate: RLS `has_fleet_maintenance_access()` on all fleet tables + `service-invoices` Storage bucket.
- **Data layer — `src/lib/fleet/`.** `queries.ts`, `pmStatus.ts`, `format.ts`, `types.ts`, `theme.ts` (dark hub palette `FC`). Hooks in `src/hooks/fleet/`. Shared components in `src/components/fleet/`.
- **Screen 1 (Tools Hub).** `FleetMaintenanceCard` in `ToolsScreen.tsx` — role-gated, red pill for open WO count.
- **Home alert card.** `<FleetAlertCard />` in `DayRouteSelectorScreen.tsx` — fleet-access users with ≥1 open WO.
- **Screen 2 (Overview `/tools/fleet`).** **Trucks / Equipment / My Log** pill tabs. Summary counts above tabs. Truck rows: current mileage + **Reg/Insp/Ins** compliance badges. Orphan/other WOs at bottom of Trucks tab. Equipment tab has "Manage equipment" lock chip (coming-soon toast).
- **Screen 3 (Asset Detail `/tools/fleet/assets/[type]/[id]`).** **History / PM Schedule / Parts** pill tabs. Open WOs persist above tabs. Log service pinned as bottom footer CTA. Compliance badges in header (trucks only; equipment → null). `[type]` = `truck` | `equipment`.
- **Screen 4 (Log Service Entry).** Two entry points: from WO or standalone from asset. Mileage (trucks) / hours (equipment) prefill from `ctx.asset.currentMileage/currentHours`. Writes `service_records` + `service_line_items` + optional `service-invoices` bucket. WO stays open — resolving is separate.
- **Screen 5 (Work Order Detail `/tools/fleet/work-orders/[id]`).** Service log (newest 10), parts. **Mark resolved only closes the WO — does NOT create a service record.**
- **My Log tab (third Overview tab).** Lists signed-in user's `service_records` across all assets. **Effect dep = `[user?.id]` only — NOT tab-open.** Tab-gated/loading-gated effect cancels its own in-flight request and spins forever (see `tasks/lessons.md`).
- **Pre-trip mileage capture.** Required Odometer card on pre-trip inspection `sign_submit` step. `POST /api/inspection/submit` writes `trucks.current_mileage` via admin client — **unconditional** and **non-fatal** (odometer failure logs but 200s; inspection row already committed).
- **complianceStatus(expiry):** green ok / amber ≤30d / red expired / gray unknown. Trucks columns: `registration_expiry`, `inspection_expiry`, `insurance_expiry`.
- **`PartCard`** extracted from `WorkOrderDetailScreen` into `src/components/fleet/PartCard.tsx`.

---

## Auto-Logout (Shared-Device Hygiene)

Shipped 2026-05-24. No migrations. Driver-app only.

- **Layer 1 — warehouse_return signOut.** `StopDetailScreen.tsx` sets `welcomeBackAt`, renders 6-second banner, then awaits `signOut()` + `router.replace('/login')` on trailing edge.
- **Layer 2 — day-change check.** `LoginScreen.tsx` writes `localStorage.ptr_session_date = today` after successful `signIn`. `AuthContext.tsx` checks on `INITIAL_SESSION` — if missing or not today, signs out before `setUser()` runs. **`SIGNED_IN` events skipped on purpose** — would race the new login.

**Rules to preserve:**
- **PWA-safe:** No `setTimeout(midnight)` — OS suspends background tabs. App-load checking is the only reliable trigger.
- **Gate runs before authed UI renders:** Inside `AuthProvider`'s `onAuthStateChange`. Return early before `setUser` keeps `loading=true` / `user=null` until redirect.
- **Personal-device morning-check signs the driver out** — intentional. Do not fix.

---

## Work Orders & Field Issues (Driver App)

Shipped 2026-05-26. Depends on dashboard Migration 073 (`field_work_orders`), `profiles.work_order_technician`, POST/GET/PATCH `/api/work-orders`.

- **Access.** `profiles.work_order_technician` — stacked additive. **Reporting an issue is ungated** — any signed-in driver can file. Technician queue (list + detail) is gated.
- **Cross-app POST is deliberate.** Driver app POSTs `${NEXT_PUBLIC_DASHBOARD_URL}/api/work-orders` with supabase access token in `Authorization` header. Dashboard owns WO number generation + notification email. **Never shortcut to supabase direct insert** — skips the email. PATCH (status, notes) uses same route. Reads are direct supabase under RLS.
- **Data layer — `src/lib/workOrders/`.** `api.ts`, `types.ts`, `theme.ts`. Hooks in `src/hooks/workOrders/`. Shared form + gate in `src/components/workOrders/`.
- **Stop Detail.** Faint-red "Report an issue" link below QuickAction grid → form. After submit: `sessionStorage` success stash → 6s green pill (`PT-#### · Assignee notified`) on return.
- **Report Issue form (2 modes).** Stop context: locked header, item picker from `stop.items`, "Item not in this order?" fallback. Standalone: 4-toggle asset type, 250 ms debounce search (8 results), optional related-order search (300 ms).
- **Screens.** List (`/tools/work-orders`): Open/In Progress/Done tabs + FAB. Detail (`/tools/work-orders/[id]`): sticky action bar (Mark In Progress / Mark Complete / + Note). Two Tools Hub cards: "Report an Issue" (ungated) + "Work Orders" (technician-gated, red pill for open count).
- **Required env var.** `NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.partytimerentals.com` in Vercel (production + preview). Local dev: `http://localhost:3000` in `.env.local`.

---

## AVA (Driver App)

### Phase 1 — merged to `main` 2026-05-28 (merge `37f83a9`), branch deleted

All 9 original components + dispatcher/stop-notes surface live on `main`. Spec: Notion `3550aa6451b881f19285e369387b75b6`.

**Architectural invariants — do not re-derive:**

- **Migration naming this repo:** `YYYYMMDD<NNN>_*.sql` (concat, no underscore between date and sequence). Three same-day files → `20260527013/014/015`. Existing files keep original naming.
- **`/api/routes` SELECT is the single endpoint for route + stop data.** Never spin up a new endpoint for a `routes`/`dispatch_stops` column. Add to existing SELECT + `supabaseTransform` and thread through `SupabaseRouteRow`/`SupabaseStopRow`.
- **Field ownership:** `dispatcher_notes` (route + stop) = dashboard/dispatcher-owned, never TapGoods-written. `notes_additional_delivery`, `notes_employee_authored`, `notes_flip`, `notes_set_by_time`, `notes_strike_time` = TapGoods-synced via `partytime-dashboard/src/services/tapgoodsSync.ts`. `ava_stop_notes.note` = driver-authored, address-keyed.
- **`notes_flip`** is pickup-only in the pre-launch notes sheet; shows on all stop types in Order Notes (informational). Do not conflate.
- **`PATCH /api/profile/ava-preferences`** — admin-client UPDATE scoped to three columns only (`checklist_enabled`, `personality_preference`, `stats_enabled`). **No table-level UPDATE policy on `profiles`** — would let a driver mutate `roles`/`fleet_maintenance_access`/`work_order_technician`. Extend this route's allow-list for future driver-editable fields.
- **`customerStops`** = `dayStops` minus `warehouse_return`/`warehouse` depot stops (derived once via `useMemo`). All counts (stops, COD, tents, checklist manifest, stop-note lookup) route through `customerStops`.
- **`countTentItems` requires category AND name match:** `category.includes('tent')` AND name contains `tent`/`canopy`/`marquee`. Category-only pulls sidewalls/walls into the tent count.
- **Card visibility triggers (independent):** `stats_enabled`, `ava_stop_notes` hits > 0, (`checklist_enabled` AND dependency hits > 0), `routeDispatcherNote` present, or `stopsWithDispatchNotes > 0`. Turning off checklist hides only its block, not the whole card.
- **ElevenLabs:** voice ID `uYXf8XasLblADfZ2MB4u`, model `eleven_turbo_v2`. `NEXT_PUBLIC_ELEVENLABS_API_KEY` set in Vercel (preview + production). Sentence pause constant `SENTENCE_PAUSE = 0.6s` in `src/lib/ava/elevenLabs.ts:26`. Falls through to `window.speechSynthesis` on any error (no toast, no log).
- **Auto-speak removed (Option A).** Brief plays only on user tap (gold "▶ HEAR YOUR MORNING BRIEF" pill). `hasSpokenRef` guard — at most once per card mount. iOS Safari autoplay block is the precedent.
- **Note entry block** sits post-manifest on StopDetail, gated only on `!isDepotStop`. Renders on completed stops too (was inside action card; relocate was intentional).
- **"Note from dispatch" label** stays as-is — do not rename to "Dispatcher Note".
- **Pre-launch notes sheet (`StopNotesPreSheet`):** no backdrop-dismiss, no auto-dismiss. `handleNavigateRequest` split into gate wrapper → `proceedNavigateRequest` so notes sheet and early-pickup gate chain.
- **AvaChip:** 32px blue square, five 2×12px bars, `ava-wave` keyframes in `globals.css`. Mic button UI-only (toast "Voice input coming in the next update.").
- **`AuthContext.updateProfile(patch)`** — exposes `Partial<UserProfile>` merge into in-memory profile state. Optimistic update → PATCH → revert on failure.

### Phase 2 — Session 1 merged (see Current build state)

Key decisions locked in Session 1:
- `getWindAtTime` returns `max(sustainedMph, gustMph)` — gust-inclusive for the arrival hour, UTC-bucket matched.
- Wind pill threshold: ≥20 mph → red `WIND {mph}` pill on Home stop cards.
- `POST /api/sop/sync` is inert until `NOTION_API_KEY` set (returns 501). **Darren must set `NOTION_API_KEY` in Vercel.**
- `customerStopCount` (depot excluded) = driver-visible hero + section totals. `totalStopCount` stays on completion/empty/section gates.

### Phase 2 — Session 2 (Haiku conversation + SOP search)

Key decisions locked in Session 2:
- **`/api/ava/ask` is CLIENT-SEEDED, not server-read.** Spec said "read route context from Supabase here", but Home already computed it — re-deriving `hasWeatherFlag` means re-running the Tomorrow.io fan-out. So Home passes a `seedContext` (stop count, COD count, wind-alerted stop NAMES, dispatcher notes, manifest summary, driver name) per `tasks/todo.md`'s step plan. Server still derives `driver_id`/auth and logs authoritatively (never client-trusted). `context_id` = primary route id.
- **Model `claude-haiku-4-5-20251001`, `max_tokens: 500`, no `effort`/`thinking`** — Haiku 4.5 rejects `output_config.effort` and adaptive thinking. System prompt is persona + today's-route context; instructs spoken-word brevity + "don't invent stop names/totals/notes". `cache_control` on the system block (no-op below the cache minimum, future-proof).
- **`AvaConversationSheet` is the shared sheet** (`open/onClose/seedContext`, optional `initialQuestion`) — built so the AvaChip drawer can adopt it later. VOICE/TEXT toggle (default VOICE); switching to TEXT calls `stopSpeaking()`. Replies spoken via `speak()`.
- **SOP `department` is free-text/composite** ("Drivers / Warehouse", "Field Operations", "All Departments", "Warehouse", "Operations", null) — NOT the spec's `'driver'|'field'|'all'` tokens. A literal `IN(...)` matches zero rows. Driver-visible = department matches `/\b(driver|field|all)\b/i`. Warehouse-only / Operations / null are excluded. See `tasks/lessons.md`.
- **SOP search fetches all ≤10 rows once + filters in-memory** (driver-visibility AND query). Per-keystroke Supabase round-trips would be wasteful at this scale; the 300 ms debounce just gates the in-memory filter. Avoids the PostgREST `.or(ilike)` `*`-vs-`%` wildcard gotcha entirely.
- **Migration 020 enabled RLS on `sop_entries`** (Session 1 left it OFF → readable with the public anon key). Policy: `authenticated` SELECT `USING(true)`. Sync writes still go through the service-role admin client (bypasses RLS).

---

## Session close (autonomous — no permission needed)

1. Update `CLAUDE.md` and relevant `docs/claude/*.md` sub-doc with new decisions / rules / tech debt.
2. Append to `tasks/todo.md` and `tasks/lessons.md`. Add entry to `docs/CHANGELOG.md`.
3. Generate session summary for Darren: "Here's the summary for chat-Claude to update Notion." Do not write to Notion.

Full protocol: `docs/claude/doctrine.md` → "Session Close Protocol".

---

## Where things live

| What | Where |
|---|---|
| Stack, infrastructure, design system, per-feature architecture | `docs/claude/stack.md` |
| Operational doctrine, division of labor, pre-push verification, TapGoods learnings | `docs/claude/doctrine.md` |
| Open tech debt (with dates) | `docs/claude/tech-debt.md` |
| Open and pending tasks | `tasks/todo.md` |
| Patterns and corrections (review at session start) | `tasks/lessons.md` |
| Open questions for Darren | `tasks/open-questions.md` |
| Per-session work log | `docs/CHANGELOG.md` |
| Party Kong v3 scope | `tasks/party-kong-v3-scope.md` |
| Per-session summaries | `tasks/session-summary-*.md` |
| Migration files | `supabase/migrations/` (14-digit timestamp naming) |

Order of authority: Darren AI Protocol parent page in Notion → child pages → this CLAUDE.md → sub-docs under `docs/claude/` → repo docs → current external info.

---

## Autonomy rules (no permission needed)

Run builds, installs, migrations (`supabase db push` / `supabase db query --linked --file`), linting, tests, dev servers, type regens. If a step fails, debug and retry. Stop and ask Darren only when: (1) the action would permanently delete data with no rollback, (2) a required secret is missing from `.env` and cannot be inferred, or (3) two valid approaches have fundamentally different architecture implications that cannot be reversed.
