# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

| Item | Status |
|---|---|
| Active feature | None in flight — AVA Phase 2 **Session 3** (SOPs in `/api/ava/ask` + foundational role-based access scoping) pushed direct to `main` (`48d5487`, 2026-06-02), preceded by an SOP visibility-filter fix (`1a1d714`). Next AVA work → new `feature/ava-phase2-sN` branch |
| Latest merge | Direct to `main`: AVA SOP knowledge in the conversation endpoint + role scoping (`48d5487`); SOP driver-visibility regex fix — plural "Drivers" + tent SOP (`1a1d714`/`64356dd`), all 2026-06-02. Prior: `dependency_map` cleanup + AVA voice copy (`12c2a91`/`f4785cd`/`3ef660e`); AVA Phase 2 Session 2 (`02abfc6`, 2026-05-31) |
| Latest migrations | 021 `dependency_map_tent_tools` + 020 `sop_entries_rls` + 019 `sop_entries`; local = 21 files. **Non-migration DB data changes are now recorded under `supabase/data-patches/`** (re-runnable `.sql`, applied via `supabase db query --linked --file`), NOT as numbered migrations |
| Branch strategy | Feature work → named branch; unrelated fixes → direct to `main` |
| Next priority | See `tasks/todo.md` (top of file) — smoke-test AVA Session 3 (SOP answers + driver/super_admin scoping) and the SOP visibility fix; then the 2026-06-02 `dependency_map` patches + AVA voice copy; then Session 1/2 production smoke tests |

**Phase 2 Session 1 delivered (merged, smoke-test pending):** `geocodeAddress` (Nominatim, cache-first, server-side write-back), `getWindAtTime` (Tomorrow.io+NWS, gust-inclusive, UTC-bucket matched), `POST /api/ava/route-weather` (per-stop enrichment), `useRouteWeather` → `hasWeatherFlag` + red `WIND {mph}` pills (≥20 mph). SOP: `POST /api/sop/sync` mirrors Notion SOP Library → `sop_entries` (token-gated, inert until `NOTION_API_KEY` set, returns 501). "Ask Ava about today" placeholder button (UI-only, coming-soon toast). Home stop-count fix: `customerStopCount` excludes depot from hero + section totals.

**Phase 2 Session 2 (merged to `main`, merge `02abfc6`, smoke-test pending):** `SOP_SYNC` ran in prod — `sop_entries` populated with SOP-001…010 (`{synced:10, errors:[]}`). `POST /api/ava/ask` (auth-gated, `claude-haiku-4-5-20251001`, route-context system prompt, logs to `ava_conversations` surface `driver_home`, 503 when `ANTHROPIC_API_KEY` unset — key already set in Vercel). `AvaConversationSheet` (shared `open/onClose/seedContext` dark sheet, VOICE/TEXT toggle, `speak()` TTS, thinking waveform). Home "Ask Ava about today" button now opens the real sheet, pre-seeded with Home's computed context. SOP search in Training Hub (`SopSearchSection`, debounced, driver-visible filter, tap-to-expand, "Ask Ava instead" empty state). Migration 020 enabled RLS on `sop_entries`. **Plus two post-build fixes:** morning-brief copy is voice-first (numbers spelled out, no em-dash separators, "tents" not "canopies") and the heavy tent-day framing now fires at `tentCount >= 5`; and `dispatch_stops.warehouse_notes` (dashboard Migration 077) is now surfaced driver-side. **Pending: production smoke test (see `tasks/todo.md`).**

**Home post-inspection flow + checklist data fixes (2026-06-02, `e41c976`):** Three fixes pushed direct to `main`.
- **Fix 1 — Home stop list persists post-inspection (partial reversal of the AVA Phase 1/Session 2 quiet state).** The day list + "The day, in N" header are no longer hidden once `inspected` is true — they persist as the live route overview, with completed stops showing RouteListScreen's treatment (ink circle + gold checkmark) so completion reads identically on Home and the Route list. **Only the stop list was un-hidden** — the AVA morning brief, weather card, and Ask Ava button remain pre-inspection-only (still gated on `!inspected`). The duplicate "REQUIRED FIRST / Pre-trip inspection" card was removed; the gold bottom CTA is now the sole inspection trigger and is itself persistent: "Inspect & Start Route" pre-inspection, "Continue route" (→ `/route/[id]`) post-inspection. The inspection completion CTA now navigates to `/route/[routeId]` instead of Home (`InspectionScreen.tsx`).
- **Fix 2 + Fix 3 — Migration 021 (`dependency_map`, the checklist source-of-truth).** The morning checklist is DB-driven (table `dependency_map`, NOT a component), so both were data changes, not code. Fix 2 cleared a stray note ("Dylan interview May 24") off the `Zip ties` always-carry row. Fix 3 added `category='TENTS'` rules for `Hammer` + `Sledgehammer` (same trigger shape as the existing `Pry bar` tent rule); inflatables already add `Hammer` + `Hand truck` via the `keyword='inflatable'` rows, and `AvaChecklistSheet` dedupes by `required_item`, so a tent+inflatable day surfaces `Hammer` once. Migration is idempotent (UPDATE + guarded INSERT).

**`dependency_map` curation + AVA voice copy (2026-06-02, `12c2a91`/`f4785cd`/`3ef660e`):** Three commits, all direct to `main`, all data/copy (no schema, no new migration). DB changes recorded as re-runnable `.sql` under `supabase/data-patches/`.
- **`dependency_map.notes` is driver-facing** — it renders as the sub-line under each item in `AvaChecklistSheet`. Dev artifacts must NOT live there. Cleaned: `Hammer`/`Sledgehammer` ("… — added Migration 021 (Fix 3)" → "Tent setup" / "Drive tent stakes"), `Wood blocks` ("… — keyword match only" → "Not needed for frame tents"), `Ladders` ("… — Lucas confirmed" → "5+ walls threshold").
- **`Pry bar` retargeted** from `category='TENTS'` (fired on EVERY tent item) → `keyword='cross cable'`, note cleared. Real production tent names use the contiguous substring "CROSS CABLE" (space, never hyphenated); bare "MQ" also tags walls/doors (`MQSW`/`MQDW`/`MQCW`) so it's too broad. `ruleFires` lowercases both sides, so `keyword` rows must be chosen from actual item names (`SELECT jsonb_array_elements(items)` off `dispatch_stops` first).
- **Tent route → Sledgehammer only.** Dropped the `Hammer`/`category='TENTS'` row (sledgehammer covers tent setup + driving stakes). The `Hammer`/`keyword='inflatable'` row stays. Net: tent-only → Sledgehammer; inflatable-only → Hammer + Hand truck; both → Hammer + Sledgehammer + Hand truck. (This supersedes Migration 021's tent-Hammer; a fresh DB rebuild re-creates it, so the data-patch must be re-applied — see `supabase/data-patches/2026-06-02_dependency_map_drop_tent_hammer.sql`.)
- **`getMorningMessage.ts` voice copy** — the morning-brief personality fallbacks (single-stop + generic 2–3 stop) are now **second person** ("You've got two stops today. Quick one. Let's roll."), consistent with AVA addressing the driver. **The em-dash prescription that surfaced in the request was REJECTED** — Session 2 locked "no em-dash separators" because `withSentencePauses()` (`elevenLabs.ts:35`) only inserts the `<break>` pause after `.`/`!`/`?`; an em dash adds no pause and would regress the fix. The COD / tent / 4+-stop / weather / dispatch-note blocks were left untouched (out of scope).

**`warehouse_notes` surface (Session 2):** `dispatch_stops.warehouse_notes` is wired identically to `dispatcher_notes` — added to the `/api/routes` SELECT + `SupabaseStopRow` + `toRealStop` → `Stop.warehouse_notes`. Stop Detail shows a "FROM WAREHOUSE" labeled block (solid-blue card chrome like "Note from dispatch", shown inline). `StopNotesPreSheet` has a "FROM WAREHOUSE" section ordered right after the dispatcher note. The AVA morning-brief count (`stopsWithNotes`) and its review sheet (`AvaDispatchNotesSheet`, retitled "Notes for your stops") now cover stops with `dispatcher_notes` OR `warehouse_notes` (a stop with both counts once); the card-visibility gate fires on warehouse-only-note days too.

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
- **SOP `department` is free-text/composite** ("Drivers / Warehouse", "Field Operations", "All Departments", "Warehouse", "Operations", null) — NOT the spec's `'driver'|'field'|'all'` tokens. A literal `IN(...)` matches zero rows. Driver-visible = department matches `/\b(drivers?|field|all)\b/i` **OR** the title matches `/\b(tent|canopy|marquee)\b/i`. Warehouse-only / Operations are excluded. **Fixed 2026-06-02 (`1a1d714`):** the original regex used singular `driver` with a closing `\b`, which never matched the PLURAL "Drivers" the departments actually use — so only "All Departments"/"Field Operations" SOPs (005/008/009) showed and the three "Drivers" SOPs (001/003/006) were silently hidden. This read as "the sync only loaded 3 SOPs" but all 10 were in `sop_entries` the whole time — it was a filter bug, not a sync bug. SOP-010 (Tent Setup, null department because it's absent from the Notion summary table) is surfaced by the title carve-out; durable fix is chat-Claude adding it to the summary table with a driver/field department. See `tasks/lessons.md`.
- **SOP search fetches all ≤10 rows once + filters in-memory** (driver-visibility AND query). Per-keystroke Supabase round-trips would be wasteful at this scale; the 300 ms debounce just gates the in-memory filter. Avoids the PostgREST `.or(ilike)` `*`-vs-`%` wildcard gotcha entirely.
- **Migration 020 enabled RLS on `sop_entries`** (Session 1 left it OFF → readable with the public anon key). Policy: `authenticated` SELECT `USING(true)`. Sync writes still go through the service-role admin client (bypasses RLS).
- **Heavy tent-day framing fires at `tentCount >= 5`** (was `>= 2`). 1–4 tents fall through to the generic stop/COD lines — no "big tent day" hype for a routine couple of tents. Both `directMessage` + `personalityVariants`.
- **Voice-first morning-brief copy:** numbers under ten spelled out (`spellNumber`/`spellNumberCap` helpers, numerals kept for 10+); every ` — ` separator replaced with a natural sentence break (so ElevenLabs pauses via the existing `SENTENCE_PAUSE` `<break>`); "tents" not "canopies".
- **`warehouse_notes` wired like `dispatcher_notes`** (see Current build state). Broadening the morning-brief count to dispatcher-OR-warehouse meant updating the SHARED review drawer too — `AvaDispatchNotesSheet` now renders both note types labeled per stop, else a warehouse-only stop would show blank. (Lesson: a count and its detail drawer fed by the same collection must broaden together.) `warehouse_notes` was NOT added to the `/api/ava/ask` seedContext (out of the fix's explicit scope).

### Phase 2 — Session 3 (SOPs in AVA conversation + access scoping)

**FOUNDATIONAL — AVA access scoping. Every AVA knowledge layer is scoped to the caller's ROLE, derived server-side.** Driver → only their own data (their assigned route's stops + driver-visible SOPs). Elevated (super_admin) → everything (all routes, all SOPs). This is the pattern every future layer (drawings, equipment refs, …) follows. Primitive: `isElevatedRole(roles)` in `src/lib/ava/access.ts` — "elevated" = `super_admin` (the only elevated role provisioned; **there is no plain `admin` role** in `profiles.roles` — `admin` is accepted defensively). **Always read the role server-side from `auth.uid()` → `profiles.roles`; never trust a client-supplied flag.** Default to the driver (most-restrictive) scope if the role lookup fails — least privilege.

- **SOPs are now in the `/api/ava/ask` system prompt** (so AVA answers procedural questions naturally — "how do I hook up the gooseneck?" → answers from SOP-001 content **without** saying "per SOP-001"; instructed not to cite numbers unless explicitly asked). Loaded **server-side** at request time via the admin client (`loadScopedSops`): driver → `isDriverVisibleSop` filter, elevated → all rows. SOP load is **best-effort** — a failure logs and returns `[]` so AVA still answers route questions. SOPs were small enough (driver set ~6k tokens, all-10 ~8.5k) to inject **in full, no chunking/summarizing** — size was never a concern, so the spec's relevance-based partial-include path was not needed.
- **System prompt is now TWO blocks for caching** (`route.ts`). Block 0 = persona + voice rules + the role-scoped SOP knowledge base — **stable per role**, identical across every driver and turn, carries the `cache_control` breakpoint, and is shared across all driver conversations (the SOP base alone clears Haiku's **4096-token** cache minimum, which the old route-only prompt never did). Block 1 = today's route (the client-seeded `ctx`) — **volatile**, sits after the breakpoint, never cached. **`driverName` + route data must stay in block 1** — putting them in block 0 would make the prefix per-driver and kill the cross-driver cache share.
- **Driver-visibility filter is now shared** — `src/lib/ava/sopVisibility.ts` (`isDriverVisibleSop`), imported by BOTH `SopSearchSection` (client) and `/api/ava/ask` (server) so the Training-Hub list and AVA's knowledge can never drift. (Replaced the duplicated local copy in `SopSearchSection`.)
- **Route-context scoping was verified, not changed.** `/api/ava/ask` loads no stops server-side — route context is client-seeded, and the client can only obtain its own route because **`/api/routes` is strictly assignment-scoped by `user.id`** (`route_assignments`; even `super_admin` is assignment-scoped there by design — admins use `/api/schedule/week` for the full board). So AVA route context is already caller-bound at the source. **Known pre-existing nuance (not changed here):** `/api/routes` has a documented *soft-fail* — if the `route_assignments` lookup itself errors, it falls through to an UNSCOPED query for availability. Elevated "all routes" in AVA is therefore **not yet wired** (AVA route context is client-seeded, and `/api/routes` restricts admins by design); a future server-side route-load layer in AVA would apply the same `isElevatedRole` check.

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
