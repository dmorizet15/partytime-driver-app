# PartyTime Driver App — Claude Code Context

You are the CTO and lead developer for PartyTime Rentals.
Follow the Darren AI Protocol in Notion before doing anything.

---

> **Standing Rule — End of Every Session (Claude Code only):** Before this session ends, complete the Session Close Protocol below. Do not ask for permission. Do not skip it if the session ran long.
>
> **Session Close Protocol — 3 Steps, Every Time:**
>
> **Step 1 — Update CLAUDE.md in this repo.** Record any new architecture decisions, rules, constraints, tech debt flagged this session, or workflow lessons learned.
>
> **Step 2 — Update repo-side task tracking.** Append to `tasks/todo.md` (open follow-ups) and `tasks/lessons.md` (lessons learned). Add session entry to `/docs/CHANGELOG.md` with commits, migrations, and shipped features.
>
> **Step 3 — Generate a session summary for Darren.** Write a clean summary covering: (a) what shipped (commits, migrations, deploys), (b) any decisions made that need Notion documentation, (c) new tech debt or lessons. Tell Darren explicitly: "Here's the summary for chat-Claude to update Notion." Do NOT write to Notion yourself — Notion is chat-Claude's domain. Source-of-truth confusion has caused checklist drift.
>
> **Division of labor (locked May 9, 2026):**
> - Claude Code owns: code, repo files, CLAUDE.md, tasks/, docs/, CHANGELOG.md
> - chat-Claude owns: Notion (Master Build Checklist, Build Progress Dashboard, doctrine pages, build specs, design decisions)
> - Both Claudes must respect this division. If you find yourself writing to the other's domain, stop and route the work correctly.

---

## Who You Are
- CTO and lead full-stack developer for PartyTime Rentals
- Prior CTO roles across service-based companies
- 5-star rated developer: fast, thorough, innovative, clean modern responsive UI
- Realist and efficient — never sacrifice functionality for speed

---

## This Repo
- **Project:** `partytime-driver-app`
- **Path:** `~/Projects/partytime-driver-app`
- **Type:** Next.js 14 PWA (Progressive Web App) — mobile-first, Android drivers
- **GitHub:** `github.com/dmorizet15/partytime-driver-app` (private)
- **Production URL:** Vercel (auto-deploys from `main`)
- **Branch strategy:** Commit directly to `main` — Vercel auto-deploys on every push.

## Related Repo
- **Dashboard:** `~/Projects/partytime-dashboard`
- Shared data layer: TapGoods API + Supabase `partytime-east`
- The driver app is a downstream consumer of route data the dashboard writes to TapGoods

---

## Infrastructure
| Service | Detail |
|---|---|
| Supabase | `partytime-east` — ref: `fumprcyavpefyupurvsv` (East US, N. Virginia) |
| Vercel | Authenticated as `dmorizet15-6678` |
| GitHub | Authenticated as `dmorizet15` |
| RingCentral | FROM: +18457653412 — SMS/ETA workflow |
| Google Maps | Distance Matrix + Maps JS API enabled |
| Tomorrow.io | Free tier (500 calls/day) — env var `TOMORROW_IO_API_KEY`, **server-side only**, set in Vercel env |
| NWS Alerts | No API key — `User-Agent: PartyTimeDriverApp (admin@partytimerentals.com)` is **mandatory** on every request |

---

## Design System (PTR v1.0)
- **Mode:** Dark (driver app)
- **Primary:** `#0000FF` blue
- **Black:** `#000000`
- **Yellow:** `#F4C01E`
- **Grid:** 8px base spacing
- **Principle:** Zero friction for field workers — no slow animations

---

## Current Build State (as of May 14, 2026 evening)

### v1.1 COMPLETE ✅ — April 27, 2026
All phases shipped to production.

- Phase 0: Dashboard repo scaffolded and deployed
- Phase 0.5: PTR Design System v1.0 defined in Notion
- Phase 1 — Supabase Auth (both apps, production) ✅
  - Migrations 001–005 applied to partytime-east
  - Driver app + dashboard auth live in production
  - Session persistence, refresh, and sign out all working
  - Critical fix: INITIAL_SESSION deadlock in supabase-js v2 — `getUserRole()` uses direct fetch() with access_token to bypass internal getSession() call
- Phase 2 — Cross-Device OTW State Sync ✅
  - Migration 006: `stops` table gets `otw_status`, `otw_timestamp`, `otw_set_by`
  - `StopStateService.ts` — writes localStorage first (instant UI), then Supabase async; offline queue flushed on reconnect
  - `AppStateContext.loadDay` merges Supabase OTW > localStorage > TapGoods default
  - OTW state is now cross-device; localStorage remains fallback if Supabase unreachable
- Phase 3 — Send ETA/OTW wired to `/api/send-eta` ✅
  - `routeId` added to `SendEtaParams`
  - OTW failures show inline red banner (replaced `alert()`)
- Phase 4 — POD photo UI polish ✅
  - Take Photo/Retry uses PTR primary blue (#0000FF)
  - Uploaded/failed states use styled PTR cards
  - Image preview: border-2, shadow, overflow-hidden
- ETA/SMS Phase 1 live in production (April 21, 2026)
- TapGoods Phase 1 integration live in production (April 20, 2026)

### v2 Phase 2A COMPLETE ✅ — May 6, 2026 (commit `de35201`)
Standalone Tools weather screen shipped to production.

- Route: `/tools/weather` — accessed from the Tools Hub tile (no longer toasts)
- Two-vendor weather facade in `src/lib/weather/`:
  - Tomorrow.io — wind, rain, snow, temp, humidity (`adapters/tomorrowIoAdapter.ts`)
  - NWS Alerts API — lightning via active Severe Thunderstorm + Tornado Warnings (`adapters/nwsAlertsAdapter.ts`)
  - Single `WeatherService` facade hides which vendor backs which condition; parallel fetch via `Promise.allSettled`; degrades to last-known cached snapshot on adapter failure with `stale: true` flag
- 15-minute in-memory cache keyed by 4-decimal coordinates (`cache.ts`) — survives within a server instance, resets on cold start (intentional for v1)
- Server-side `/api/weather?lat=&lng=` endpoint — `TOMORROW_IO_API_KEY` never reaches the client
- LOCKED thresholds in `lib/weather/thresholds.ts` — sourced verbatim from the Notion Weather Intelligence spec. **Do not modify without updating Notion first.** Status colors (`STATUS_COLORS`) are also locked.
- Wind card surfaces a phase-aware action message tied to threshold state ("Clear to set up" / "Proceed with caution — monitor wind closely" / "Hold — do not begin setup until winds drop" / "Do not set up — contact dispatch")
- Snow card always renders the orange client-discussion callout when any snow is forecast in the rental window (per spec — does not collapse)
- Lightning STOP state visually overrides everything else when active
- Tomorrow.io rate-limit warning logs to console at 80% of daily budget
- Designed stubs (feature flags in `thresholds.ts`):
  - `HAS_TENT_SIZE_DATA = false` — flip when TapGoods tent size flows to stop record (unlocks rain threshold differentiation by tent size)
  - `HAS_ANCHORING_GUIDANCE = false` — flip when Phase 2C content layer ships
  - `HAS_STOP_LEVEL_BADGES = false` — flip when Phase 2B ships
- Out of v2A scope: stop-level badges (2B), anchoring guidance (2C), historical lookups, custom location search, tent-size threshold differentiation

### v2 Phase 2B SHIPPED ✅ — May 8, 2026 (commit `6804347`)
Stop-level weather badges live on Stop Detail. `StopWeatherModule` reuses Phase 2A's locked threshold evaluators + `STATUS_COLORS` via the `WeatherService` facade. Placed above the manifest. Skipped on warehouse stops. `HAS_STOP_LEVEL_BADGES = true` in `thresholds.ts`. Geocoding gap that was the prerequisite was closed by dashboard Migration 034 same day — every `dispatch_stops` row with an address now has populated lat/lng. `HAS_TENT_SIZE_DATA` and `HAS_ANCHORING_GUIDANCE` stay `false` (separate work).

### Home rewrite — May 8, 2026 (commit `e72aa78`)
Home (`/` → `DayRouteSelectorScreen`) is the day overview, not a router. Earlier auto-redirect from `/` → `/route/<id>` (commit `938f4b0`) was reverted — it made BottomNav's Home tab unreachable. Drivers reach `/route/<id>` via the explicit **Inspect & Start Route** CTA on Home. Date picker removed (driver app is single-day scope). Truck pill wired to real data via existing `/api/routes` join — renders `<truck_name> · <plate>` with name in semibold and plate in regular weight; falls back to name-only when plate is null; hidden when no truck assigned. Single-truck only — `truck_2` ignored on Home (one driver per route per login).

### Pre-Trip Inspection Flow SHIPPED ✅ — May 9, 2026 evening
End-to-end DOT pre-trip inspection lives at `/inspection`. Ten commits, `0d25f95` → `7526487`. Vercel deploy `qjggs2v7s` confirmed Ready.

**Architecture — read this before touching any inspection code:**

- **Flow lives at `/inspection`.** State machine in `src/screens/InspectionScreen.tsx` — 8 `FlowStep` states (`loading`, `never_prompt`, `review_clean`, `review_defects`, `towing`, `checklist`, `sign_submit`, `complete`), single `useReducer` with 11 action types. Routing helpers `nextAfterEntry` / `nextAfterReview` encode the spec's matrix; `progressTotal` / `progressIndex` drive the dynamic dot count (2–4 dots per truck/prior). Constants `ALL_CATEGORIES`, `TRAILER_CATEGORIES`, `OOS_DEFAULT_CATEGORIES`, `CFR_SECTIONS`, `CATEGORY_LABELS` are exported from this file — reuse, don't duplicate.

- **`useInspectionStatus(routeId, truckId)` is the single source of truth for inspection status.** Lives at `src/hooks/useInspectionStatus.ts`. Both `DayRouteSelectorScreen` (Home) and `RouteListScreen` consume it. **Do not duplicate the fetch** — if a third surface needs the gate, add the hook call there.

- **Inspection writes use server-side API routes with service-role key.** `GET /api/inspection/status` and `POST /api/inspection/submit` follow the existing `/api/routes` pattern: session-cookie client identifies the driver (`user.id` → `driver_id`, can't be spoofed), service-role client does the actual reads/writes. Sidesteps RLS verification on dashboard-side migrations 026–030. Do not rebuild this with anon-key + RLS unless you're prepared to verify the policies.

- **Gate resets per `route_id` + `driver_id`, NOT per date.** A driver reassigned mid-day to a new route gets a fresh gate. The `vehicle_inspections` lookup is `WHERE route_id = ? AND driver_id = ?`. Date-based logic would break the mid-day-reassignment case.

- **BottomNav Routes tab deep-links to `/route/<primary route_id>`** when the driver has an assignment; falls back to `/` (Home's no-assignment state) when not. Computed at render time from `AppStateContext.getRoutesForDate(today)[0]`. The `/route/<id>` destination (RouteListScreen) is gated identically to Home — same hook, same 40% opacity + pointer-events: none + tap guard.

- **Post-trip defect report is a future feature** — spec lives in Notion, not yet built in this repo. **Do not confuse with pre-trip flow.** Pre-trip is launched from Home, hard-gates the day; post-trip will appear after route completion, optional, no certify checkbox. Both write to the same `vehicle_defects` table but with different `inspection_type` (`'pre_trip'` vs `'post_trip'`).

**Shipped surfaces:** Home pre-trip card with receipt state, stop gating, CTA state machine, COD card gate, gold "Inspect & Start Route" → "Start Route" label/destination flip / Inspection flow Screens 1–7 / `/api/inspection/status` GET / `/api/inspection/submit` POST / Routes tab deep-link / RouteListScreen gate.

**Out of scope this session:** transactional submit RPC, real OOS auto-notify (the green confirmation on Screen 7 is user-facing copy only — Phase 2), `'never'`-truck trailer-row hiding, post-trip defect report.

### Multi-Role Auth Migration — May 9, 2026 evening (commit `b937892`)
Driver app caught up to the dashboard's Multi-Role Refactor (dashboard Migrations 036/037/038, applied earlier on May 9, dropped `profiles.role` in favor of `profiles.roles text[]`). Driver app was missed in the original sweep and was returning HTTP 400 from `/rest/v1/profiles?select=...,role,...` on every load, surfacing as "Access denied" because `role` resolved to `null`. Fix touched 10 files:
- `src/types/auth.ts` — `UserProfile.role: Role` → `roles: Role[]`
- `src/lib/auth.ts` — PostgREST select column `role` → `roles`
- `src/context/AuthContext.tsx` — context value exposes `roles: Role[] | null` (not singular `role`)
- 5 page guards (`/`, `/profile`, `/training`, `/tools`, `/tools/weather`) — `role !== 'driver' && role !== 'super_admin'` → `!roles?.includes('driver') && !roles?.includes('super_admin')`
- `src/components/BottomNav.tsx` — tab visibility flipped to `roles.some((r) => t.rolesAllowed.includes(r))` (array intersection)
- `src/screens/ProfileScreen.tsx` — `formatRole` takes `Role[]`, prefers `'driver'` for the display label since this is the driver app, else falls back to first role

No schema changes (production schema was already correct as of dashboard's May 9 morning push). No new helpers introduced — driver app's auth check surface is small enough that the inline `roles?.includes(...)` pattern is sufficient. If this app grows more role-gated surfaces, port the dashboard's `hasRole()` / `hasAnyRole()` helpers from `usePermissions`.

### Post-trip Defect Report SHIPPED ✅ (code) — May 10, 2026 (commit `184ca72`)
Optional end-of-day defect surface on Home. Symmetric to pre-trip (which is a hard-gated full DVIR); post-trip is a single optional report after route completion. Implementation diverged from the original May 9 sketch (`inspection_type` + parallel `vehicle_inspections` row) — lands instead as a single new column `vehicle_defects.reported_context text DEFAULT 'pre_trip'` plus dropping NOT NULL on `vehicle_defects.inspection_id` so post-trip rows can carry NULL. Migration 009 file committed but NOT applied to remote (two-repo migration coordination block — see lessons.md and `tasks/open-questions.md`). Pre-trip path is unaffected.

**Architecture — read this before touching post-trip code:**

- **`vehicle_defects` is the single defects table for both pre-trip and post-trip.** Differentiator is `reported_context` ∈ `{'pre_trip','post_trip'}`. There is NO parallel `vehicle_inspections` row for post-trip — `inspection_id` is `NULL` on post-trip rows. The pre-trip path continues to populate `inspection_id` with a real UUID.
- **`/api/defects/post-trip` is the single endpoint.** GET returns `{ submitted_today: boolean }` for Home's render gate (scoped by `reported_by_user_id` + `reported_context='post_trip'` + same calendar day). POST inserts one row. Same session-cookie + service-role pattern as `/api/inspection/submit`.
- **The post-trip card renders on Home only when `routeComplete && primaryTruckId && postTripSubmitted === false`.** "Route complete" = every stop on today's day list (warehouse stops included) reads `current_status === 'completed'`. Once true and the gate clears, the card appears between the pre-trip card and the COD cards.
- **Fail-closed on the GET.** If the `submitted_today` fetch fails, the card stays HIDDEN. Avoids double-submit risk on flaky network.
- **The 12-category list is duplicated locally in `src/components/PostTripDefectCard.tsx`** with a `// TODO: extract to src/lib/defect-categories.ts when pre-trip stabilizes` marker. Do NOT extract pre-trip's category list as part of any post-trip touch — that's a separate cleanup. Same TODO marker in `src/app/api/defects/post-trip/route.ts`.
- **Out of scope this session:** real-time push/SMS notification on post-trip submit (the row writes to `vehicle_defects`; dispatch surfacing is whatever the dashboard's existing defect view does). Phase 2 if a notification channel is wanted.

### Driver Auto-Load Route — May 10, 2026 evening → REVERSED May 14, 2026 (commit `ff006c6`)
**This feature was removed.** Cold sign-in no longer redirects to `/route/<id>`. The driver lands on Home (`DayRouteSelectorScreen`) and reaches their route via the explicit gold **Inspect & Start Route** / **Start Route** CTA. The auto-load shipped May 10 (`/api/routes/assigned` endpoint + `useAssignedRoute` hook + sessionStorage guard) was deleted entirely.

Reason for the reversal: the auto-redirect skipped Home — but Home is where the driver gets day context (greeting, truck pill, day-stop preview, pre-trip card, post-trip card, COD rollup, Ask Ava chip, the gold CTA). The "save one tap" win of auto-jumping was outweighed by losing that orientation surface. The new doctrine matches the May 8 invariant: **landing screens and execution screens are separate; navigation between them is always driver-initiated.**

The auto-load also masked Bug 1+2 from this session — when `/api/routes` returned all routes for the day (no driver scope) and the auto-redirect picked the wrong one, the bug surfaced as "Route page defaults to Route 1 instead of assigned Route 2." See the May 14 section below.

`AppStateContext.clearCache` is still unused. The comment that referenced "the assigned-route check resolves to 'no-assignment'" is now stale — clearCache was forward-leaning infra for that flow and never had a real consumer. Safe to delete in a future cleanup; left in for now because the cost is one unused export.

### Phase 2.5a cleanup SHIPPED ✅ — May 10, 2026 (commit `15d3476`)
Dead TapGoods direct-call cluster removed. The driver app has read routes/stops exclusively from Supabase via `/api/routes` for weeks; the four-file GraphQL path was orphaned but still checked in. Deleted: `src/app/api/tapgoods/routes/route.ts`, `src/lib/tapgoodsClient.ts`, `src/lib/tapgoodsQueries.ts`, `src/lib/tapgoodsTransform.ts`, plus the now-empty `src/app/api/tapgoods/` directory. 270 lines gone. Phase A of Phase 2.5 (Source of Truth Migration) is now fully complete — not just "replaced" but "removed."

### tools_only Home variant — May 11, 2026 (Session C of overnight run)
**Reverses the May-10 User Management Phase 1 redirect.** Previously: `tools_only` users hitting `/` were redirected to `/tools` so they wouldn't see "Access denied". Now: `tools_only` users stay on `/` and see `ToolsOnlyHomeScreen` — a minimal Home variant with a blue greeting hero, a "This Week" card linking to `/schedule`, and a "Notifications and work schedule coming soon" placeholder. The redirect logic in `src/app/page.tsx` is gone; `tools_only` is just a third branch alongside driver / super_admin.

Bottom nav update: Home tab's `rolesAllowed` now includes `tools_only` (was driver / super_admin only). Routes tab is still driver / super_admin only — `tools_only` users have no route assignments. Net visible tabs for `tools_only`: Home, Tools, Training, Profile.

New `/schedule` route renders `WeekScheduleView` for driver / tools_only / super_admin. Drivers also reach the same component via a Today | Week toggle on the Routes tab (added to `RouteListScreen`). The Week view shows YOU treatment (gold pill, gold left bar, cream tint) on routes where `driver_id === currentUserId` for drivers and super_admin; `tools_only` sees all routes uniformly.

Reason for the reversal: the original /tools-redirect was a placeholder while the Home variant was being designed. With Session C the variant exists, so `tools_only` users get their proper landing surface and the schedule view is exposed cleanly. The redirect-bounce is also gone — fewer hops to the user's actual workspace.

Surviving `tapgoods_*` references are all legitimate Supabase column names (`tapgoods_order_token`, `tapgoods_stop_id`, etc., written by the dashboard's sync layer) plus the View Order URL template in `src/config/externalApps.ts`. Do NOT delete these.

### Two-Tier Equipment Summary + Week View Enhancements — May 13, 2026
Driver-app commits `24d5dc7` → `bf06342` (six commits, paired with eight dashboard commits across the same arc). Condensed surfaces — driver-app week view, driver-app condensed route list, dashboard condensed board — all moved off ad-hoc per-surface item formatters and now consume a single shared helper that returns a structured two-tier summary. Plus three previously-stubbed week view UI controls got real wiring.

**Architecture — read this before touching equipment summary, week view, or category resolution:**

- **`src/lib/equipmentSummary.ts` is the single source of truth for condensed-surface item rendering.** Returns `EquipmentSummary { tier1: string[]; tier2: string[] }`. Tier 1 is the headline text line, in fixed order: Tents (consolidated by parsed size, sorted by `sqft × qty` descending — same priority weighting as the dashboard's full StopCard / WarehouseStopCard via `parseTentSqft`) → `N chairs` → `N tables` → `N linens` → one inflatable token per line item with qty prefix (no name-dedup, original order). Tier 2 is the "everything else" pill set — deduped, alphabetically sorted, no quantities. The helper is byte-for-byte mirrored in the dashboard at `partytime-dashboard/src/lib/equipmentSummary.ts`. Same shape, same behavior, same comment text. **Any change to one MUST be applied to the other in the same session.** No shared package; no build-time validation that they match.

- **`src/lib/inflatable.ts` and `src/lib/itemCategories.ts` follow the same mirroring rule.** Both ported from the dashboard during this session. `inflatable.ts` exposes `isInflatableCategory()` (keyword match for inflat/bounce/combo/slide/venture/extreme/tap) which `equipmentSummary` uses for Tier 1 inflatables bucket and the dashboard's `INFLATABLE` badge uses for the warning pill. `itemCategories.ts` exposes `resolveCategory(rawCategory, name)` which returns the canonical display name for any TapGoods item. **CATEGORY_MAP keys are intentionally lowercased** — TapGoods returns mixed casing across accounts (`'Tents'` and `'tents'` both seen). Map values stay canonical case so exact-match consumers (`StopCard` filters by `i.display === 'Tents'`, `equipmentSummary.bucketOf` checks `=== 'Tents'`) keep working.

- **`Stop.equipment: EquipmentSummary` is required, not optional.** `src/types/index.ts`. The old `Stop.items_text` field is gone — all consumers must read `stop.equipment.tier1` / `stop.equipment.tier2` directly. `supabaseTransform.ts` populates the field at the data-mapping layer; warehouse-block synthetic stops carry an empty `{ tier1: [], tier2: [] }`. Mock data (`src/data/mockData.ts`) was updated for the same shape — it's currently unused but must compile.

- **`/api/schedule/week` response shape** carries `equipment: { tier1, tier2 }` per stop AND `tapgoods_order_token: string | null` (the latter added during this session for the View in TapGoods feature). The dashboard's identically-named endpoint returns the same shape — they're independent code but the response contract is locked together. Don't drift.

- **WeekScheduleView previously-stubbed controls are now wired.** The Town/Equip filter pills are visibility toggles: each pill HIDES its own field when active (Town pill on → town field hidden; Equip pill on → equipment row hidden). Default state (neither pill active) shows both fields. Both pills active also shows both. Prev/next week nav: `startDate` is now internal state initialized from the prop, mutated by ±days on click; a `useEffect` re-initializes when the prop changes so external navigations still take effect. View in TapGoods link sits in its own row below each stop's equipment, launches via `externalAppService.openTapGoodsOrder()` (existing pattern from StopDetailScreen — `business.tapgoods.com/orders/rentals/{token}/pickList`).

- **`resolveCategory` name overrides fire in this priority order** (top of function wins): name contains CHAIR → Chairs · empty category + name has TENT/WALL → Tents · empty category + name has STAGE/DANCE FLOOR → Flooring and Staging · empty category default → Miscellaneous · raw category `'Misc'` + name has STAGE/SKIRT → Flooring and Staging · raw category `'Misc'` + name has RAMP/DECK → Flooring and Staging · CATEGORY_MAP lookup · passthrough. The Misc-category rescue for staging hardware is a workaround for TapGoods miscategorization; long-term fix is recategorize the source items in TapGoods.

- **Dashboard condensed route sub-header (`partytime-dashboard/src/components/board/CondensedBoard.tsx`) is `flex flex-wrap min-[900px]:flex-nowrap`.** Above 900px viewport, the metadata + controls strip stays on a single row at iMac / Mac Mini / Tab-9-landscape widths and tolerates ~half-window resize. Below 900px, default flex-wrap moves the controls strip to its own row instead of clipping. Driver-app surfaces don't have this constraint — different layout.

**Out of scope this session:** extracting the three mirrored helpers into a shared npm package, broader recategorization of TapGoods source data (Darren owns), name override tightening if false positives appear (e.g., "Stage Light" with category `'Misc'` would currently rescue to Flooring and Staging — bound to Misc but still possible).

### Cash Collection v2 SHIPPED ✅ — May 13, 2026 evening
End-to-end COD collection loop, both repos. Driver-app commits `150c277` → `13f50f0`; dashboard commit `ea9d84e`. The standalone "Confirm Cash Collected →" button is gone — Mark Stop Complete on a COD delivery stop intercepts and fires the cash modal, which is now the only confirmation path. Modal has two routes: Collected (editable amount, primary gold button) or Could Not Collect (expands a required reason textarea on first tap, submits on second). Whichever path: POST `/api/cash-collections`, then complete the stop. The dashboard surfaces a red "COD UNRESOLVED" pill + reason block on the stop card when a not_collected row exists and `payment_state != 'paid_in_full'`; the flag auto-clears via the next TapGoods sync (no ack button).

**Architecture — read this before touching COD code:**

- **Migration 051 (`20260513_010_cash_collections_status.sql`) reconstructs the cash_collections table** (the production table existed but no migration file ever shipped) and adds `status text DEFAULT 'collected'` + `not_collected_reason text` with two CHECK constraints: status enum (`collected`/`not_collected`) and reason-required-when-not-collected (non-empty trim). Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, DO-block-wrapped constraints. Plus a partial index on stop_id WHERE status='not_collected' for the dashboard flag query. **APPLIED 2026-05-14** via `supabase db query --linked --file <path>` (Management API path — bypasses the two-repo `db push` history block; see lessons.md).

- **The POST /api/cash-collections endpoint is backward-compatible with the pre-migration-051 schema.** The `collected` path omits `status` and `not_collected_reason` from the INSERT so it works against both legacy and new schemas; the new column defaults (DEFAULT 'collected', NULL reason) handle the new schema cleanly. The `not_collected` path REQUIRES migration 051 by definition — that flow doesn't exist pre-migration anyway. Pre-migration the GET also avoids selecting the new columns so it keeps working.

- **The driver app's COD card never shows a "Cash Collected ✓" or "Confirm Cash" button.** That UI was retired with this build. The only signal that cash was handled is the stop's completed-state Delivered card (the cash modal must succeed for the stop to complete, so the two are tied).

- **`runStopComplete()` in `StopDetailScreen.tsx` is the shared completion path.** Three callers: `handleConfirmComplete` (non-COD modal), `handleCashCollected` (cash modal collected path), `handleCashNotCollected` (cash modal uncollected path). On the cash paths, the cash-collections POST runs FIRST; only on success does the stop-complete POST fire. If the cash POST succeeds but the stop-complete POST fails, the user gets an inline error and a `cash_collections` row exists without a corresponding completed stop — they retry Mark Complete, the cash hydration sees the existing row, and the modal is skipped (idempotent retry).

- **`cashConfirmed` is now "any row exists" — collected OR not_collected.** Both terminal states block the modal. On a retry after a partial failure, the second Mark Complete tap goes straight to the standard yes/no confirmation modal (which then re-fires the stop-complete POST).

- **Dashboard flag is one query against cash_collections, deduped by tanstack-query.** `useUncollectedCodMap()` hits `fetchUncollectedCodRows()` once per board mount. StopCard reads `map.get(stop.id)`; renders the flag only when the map has a hit AND `stop.payment_state !== 'paid_in_full'`. Auto-cleanup is implicit — when sync flips payment_state, the dispatch_stops realtime fires, the card re-renders, the gate filters out the (still-present) cash_collections row.

- **`cod_acknowledged_at` and `cod_acknowledged_by` on `dispatch_stops` are CONFIRMED ORPHAN columns.** Audited 2026-05-13 — zero readers, zero writers across both repos (`src/types/supabase.ts` is the only place they appear, autogenerated). The Cash Collection v2 design uses payment_state-based auto-resolution instead. Don't add new code that writes them; safe to drop in a future cleanup migration once schema confidence is high.

**Migration 051 was applied 2026-05-14** via `supabase db query --linked --file supabase/migrations/20260513_010_cash_collections_status.sql`. Repaired tracking via `supabase migration repair --status applied 20260513`. Driver-app types regen'd in commit `c308c81`. **Dashboard repo still needs its types regenerated** (`cd ~/Projects/partytime-dashboard && supabase gen types typescript --linked > src/types/supabase.ts`) so the `as any` casts in `boardClient.ts:fetchUncollectedCodRows` can come out — that's a Phase-2 cleanup, not blocking.

**Out of scope this session:** real-time push/SMS to dispatch when a driver taps "Could Not Collect" (the cash_collections INSERT triggers the dashboard's realtime channel — Melissa sees the flag inside ~1s — but no push notification fires). Phase 2 if/when an audible signal is wanted. Also: the migration 051 file does NOT re-declare the existing RLS policies on `cash_collections` (already created out of band with the table; re-declaring would error). If RLS is ever rebuilt from scratch, those policies must be re-authored.

### Driver scope + completion persistence + auto-redirect removal — May 14, 2026 (commits `ff006c6`, `c308c81`, `4788034`)

Three bug reports addressed across one session, plus migration 051 unblocked. All four shipped to main.

**Bug 1+2 — `/api/routes` is now session-aware and driver-scoped.** Endpoint reads the auth cookie, joins `route_assignments` for the requested date, narrows the response to only the caller's assigned routes. With no assignment (or unauthenticated) it falls back to the full day's routes — preserves dispatcher tooling that hits the endpoint without cookies. Cache-Control flipped from `public, max-age=30, stale-while-revalidate=15` to `private, no-store` because responses now vary per user. Super_admin gets the same scoping as driver — the driver app is the driver's tool; the dashboard is the god view.

Before this fix: `getRoutesForDate(today)` returned every route on the calendar day, `dayStops = routes.flatMap(...)` flattened across all of them, and `BottomNav`'s `routes[0]?.route_id` picked the first route by Postgres's default ordering. So Darren (assigned to Route 2) saw a Route-1 stop bleed into Home's "THE DAY, IN 3" preview, and tapping the Routes tab landed on Route 1. The data layer never knew it was supposed to scope to him.

**Bug 3 — cold sign-in auto-redirect deleted.** `useAssignedRoute` hook + `/api/routes/assigned` endpoint + the `showAssignmentLoader` branch in DayRouteSelectorScreen are gone. See the May-10 section above for the reversal context. Net effect: cold sign-in lands on Home, every time, for every role.

**Bug 4 — completion state is now read end-to-end.** Three changes:
1. `/api/routes` selects `stop_status, completed_at` from `dispatch_stops` (previously omitted — server wrote completion but client never re-read it).
2. `supabaseTransform.toRealStop` maps `stop_status === 'completed'` → `current_status: 'completed'` and carries `completed_at`. Default `'pending'` otherwise.
3. `AppStateContext.loadDay` merge short-circuits on server-completed stops: `if (s.current_status === 'completed') return s` before the OTW / localStorage lookups. **Completion is terminal; OTW state from `StopStateService.readOtwStatus` can no longer clobber it.**

Repro before the fix: complete a stop with OTW already sent → auto-advance to next stop → the 5s `setTimeout(loadDay(date, true))` in `runStopComplete` fires → `LOAD_SUCCESS` replaces `state.stops` with a freshly-transformed array (all `current_status='pending'`) → OTW merge resets the just-completed stop to `'on_the_way_sent'` → return navigation re-renders Mark Stop Complete on a completed stop, re-pressable.

No `StopDetailScreen` JSX edits — the `{isCompleted ? <Delivered> : <ETA + Action card>}` ternary at line 1163 was already correct; `isCompleted` just couldn't ever evaluate true on return because the data was wrong. The 5s setTimeout is untouched (it still exists so the dashboard ETA cascade has time to write back fresh `calculated_eta` values).

**Architecture notes for future work:**

- **`/api/routes` is now per-user. Cache-Control: `private, no-store`.** Don't restore a shared-cache header — responses are no longer cacheable across users. If you need a shared-cache surface for admin tooling, build a separate endpoint (e.g. `/api/routes/all`).
- **The driver-scope fallback** (return all routes when the caller has no assignment) intentionally keeps the endpoint usable for dispatcher/admin tooling that hits without cookies. Removing the fallback would break those callers; if you want a hard-scope rule, add a 401 instead.
- **`/api/routes/assigned` endpoint is gone** — don't restore it for new features. The driver-scope filter on `/api/routes` already exposes the assignment-aware route list; an `assigned`-flavored endpoint would be redundant.
- **`dispatch_stops.stop_status` is the canonical completion signal** for the driver app. The transform maps it to `current_status`. Don't introduce a parallel "completed" check that reads from a different column or from local state — the merge in `loadDay` is the single point where server / OTW / localStorage are reconciled.
- **`StopStateService` still owns OTW.** Its `readOtwStatus` shape is unchanged. The merge guard in `loadDay` is what makes completion terminal; if OTW ever grows new state types, mirror the same "terminal wins" pattern at the merge layer rather than inside `readOtwStatus`.

**Migration 051 apply mechanics discovery (worth its own lesson):** `supabase db query --linked --file <path>` runs SQL via the Management API. Unlike `supabase db push --linked`, it does NOT check the local-vs-remote migration history — so it's not blocked by the two-repo coordination problem documented in `tasks/lessons.md`. After running it, mark the migration as applied with `supabase migration repair --status applied <version>` to keep the tracking honest. This is now the recommended path for any future cross-repo migration push from this repo. The lessons.md file has been updated.

### Phase 2.5C — GPS Auto-Arrival SHIPPED ✅ — May 14, 2026 (driver `73b7509` / dashboard `03dd102`)

End-to-end GPS auto-arrival loop, both repos, in one session. When a driver opens a delivery / pickup / service stop, a 150m geofence is armed around the stop's coordinates. Crossing the threshold POSTs once to `/api/stops/arrived`, which idempotently stamps `dispatch_stops.arrived_at`. The dashboard's existing `dispatch_stops` realtime channel fans the update to the board — Melissa sees a teal pin badge below the stop number within ~1s, no polling. Migration 052 (driver-app file `20260514_011_arrival_geofence.sql`) added the column; applied via Management API path, types regen'd both sides post-apply.

**Architecture — read this before touching any arrival / geofence code:**

- **`dispatch_stops.arrived_at` is server-authoritative and terminal.** The `/api/stops/arrived` endpoint stamps via `UPDATE … WHERE arrived_at IS NULL`. Subsequent POSTs against an already-arrived stop are no-ops at the column level and return the existing canonical timestamp. The reducer guard (`MARK_ARRIVED` action in `AppStateContext`) also refuses to overwrite an existing local value. Server time wins — driver phone clocks drift; one canonical column read by both repos.
- **The geofence is mount-scoped to `StopDetailScreen`.** No global active-stop tracker exists; "active stop" is implicit via the `/route/<id>/stop/<id>` URL. The `useArrivalGeofence` hook arms `watchPosition` when the screen mounts with a watchable stop and clears the watch on unmount OR on successful arrival POST. The hook is called unconditionally on every render (hook order stability); the `enabled` flag gates whether `watchPosition` runs.
- **Watchable stop = delivery / pickup / service with both coords AND not already arrived AND not completed.** Warehouse stops (synthetic, no coords) are skipped at the `enabled` flag. Once `arrived_at` is set, the hook re-evaluates `enabled = false` and tears down the watch — no re-firing.
- **Permission UX is just-in-time.** First `watchPosition` call (driver's first stop-detail open) fires the browser's native location-permission prompt. Grant persists at the site level (`work.partytime-rentals.com`) — subsequent stops mount without UI. No proactive permission card; per spec.
- **Foreground only.** `navigator.geolocation.watchPosition` requires the document visible on mobile browsers. Acceptable for v1 — PTR-owned Android devices stay on the active stop with the screen on during arrival. Background geofencing requires native (Capacitor / Geofence API) — out of scope.
- **Coordinates flow:** `dispatch_stops.address_lat / address_lng` (populated by dashboard Migration 034 geocoding pipeline) → `/api/routes` select → `supabaseTransform.toRealStop` → `Stop.latitude / longitude` → `useArrivalGeofence` consumes directly. Same pipeline that already feeds the StopWeatherModule — no separate fetch.
- **Arrival timestamp surfaces as:**
  - Driver app: green "Arrived · HH:MM" pill in `StopDetailScreen`'s eyebrow row (next to the stop-type pill).
  - Dashboard `StopCard`: teal pin badge (22x22 filled circle with location-pin glyph) positioned BELOW the stop number per spec — mirrors the green-check completion-circle visual pattern. Coexists with the completion check (driver may arrive 10 min before tapping Mark Complete; both badges render). Footer time strip shows "Arrived HH:MM" alongside ETA when arrived but not yet completed; "Completed HH:MM" takes precedence once that lands.
- **Lifecycle color stack on the dashboard StopCard top-right:** blue "En route" pill (above stop number) → teal Arrived pin (below stop number) → green completion check (top, above en route when both apply). The colors mirror the driver workflow: pending → en route → arrived → completed.
- **The hook also surfaces diagnostic states** (`denied`, `unavailable`, `error`) but the current UI ignores them — driver gets the OS permission UI directly; if denied, arrival just won't auto-detect and the driver still has Mark Stop Complete. Not wiring a "location-off" warning surface in v1 because it adds noise for an edge case.

**Files touched this session:**

Driver-app (commit `73b7509`):
- `supabase/migrations/20260514_011_arrival_geofence.sql` (NEW) — `ADD COLUMN IF NOT EXISTS arrived_at timestamptz`
- `src/types/index.ts` — `Stop.arrived_at?: string`
- `src/lib/supabaseTransform.ts` — read + map column
- `src/app/api/routes/route.ts` — added to select list
- `src/app/api/stops/arrived/route.ts` (NEW) — session-cookie auth, idempotent stamp, returns canonical server timestamp
- `src/hooks/useArrivalGeofence.ts` (NEW) — `watchPosition` + haversine + one-shot POST
- `src/context/AppStateContext.tsx` — `MARK_ARRIVED` action + reducer (terminal-value guard) + `markArrived` callable
- `src/screens/StopDetailScreen.tsx` — mounts hook + renders eyebrow pill
- `src/types/supabase.ts` — regenerated post-migration apply

Dashboard (commit `03dd102`):
- `src/types/board.ts` — `DispatchStop.arrived_at: string | null`
- `src/components/board/StopCard.tsx` — teal pin badge below stop number + footer timestamp + removed the pre-existing Phase-2.5C TODO comment

**Out of scope this session:**
- Real-time push / SMS to dispatch on arrival (the realtime channel already fans the timestamp; Melissa learns within ~1s visually). Phase 2 if/when an audible signal is wanted.
- Background geofencing (requires native shell — Capacitor / Android Geofence API).
- Multi-stop simultaneous arming (intentional — spec says "current active stop only").
- A "location off" warning surface for the driver if permission is denied (current UI silently degrades; Mark Stop Complete still works).
- Dashboard-side audit / analytics surface for arrival → completion deltas (the data is now in the column; building reports is a separate Phase 2 thread).

### Tools Hub — Tent Squaring Calculator SHIPPED ✅ (code) — May 14, 2026 late evening
First Tools Hub calculator. Pure frontend, no migration, no Supabase. Driver enters Length / Width (ft), picks Rectangular or Square shape, gets the diagonal as e.g. `56' 7"` updating live. Square mode mirrors Length into Width and locks the Width field. Helper line below the result: "Measure corner to corner — if it matches, your tent is square."

**Architecture:**

- **Route:** `/tools/tent-squaring`. Auth gate follows the `/tools/weather` pattern (driver / super_admin / tools_only).
- **Screen:** `src/screens/TentSquaringScreen.tsx`. Self-contained — no shared state, no Supabase, no API calls. Inline `C` token object (blue/ink/cream/gold/paper/muted/hair) matches WeatherScreen / ToolsScreen verbatim.
- **Tools Hub entry:** the existing `'tenting'` tile in `ToolsScreen.TOOLS` was re-pointed from a "coming soon" stub to `/tools/tent-squaring`; renamed to "Tent Squaring" / "Diagonal calculator". When future tenting calcs (anchoring guidance, etc.) land, the route can become a sub-hub with cards — or the tile can be renamed back to "Tenting" and re-route to that hub.
- **Inches rounding edge case:** `formatFeetInches` carries `inches === 12` (rounding boundary at 11.5") back into feet. e.g. 56.96 ft → 57' 0".
- **No deps added.** Native `<input type="number">`, `Math.sqrt`, `Math.floor`, `Math.round`. inputMode="decimal" for mobile keyboard.
- **Empty / non-numeric / non-positive inputs hide the output card** — no zero-state placeholder result; the card simply doesn't render until both fields parse to a positive finite number.

**Not pushed.** Interactive session — build verified (`npx next build` green, route 2.3 kB) but the commit + push step deferred to Darren.

### NEXT
- **Push the Tent Squaring Calculator.** Build is green; the work just needs `git add` + commit + push to deploy via Vercel. Smoke test after deploy: open `/tools` → tap **Tent Squaring** → enter 40 / 20 → confirm diagonal = `44' 9"` (40² + 20² = 2000; √2000 ≈ 44.72 ft = 44' 9"). Toggle to Square → confirm Width field locks and mirrors Length → enter 30 → confirm diagonal = `42' 5"` (30√2 ≈ 42.43 ft).
- **Smoke-test Phase 2.5C arrival on production** (deploys: driver `73b7509`, dashboard `03dd102`):
  - Sign in as driver; open a delivery stop on today's route while away from the customer site (anywhere outside the 150m bubble). Confirm browser prompts for location permission on first watch.
  - Grant permission; verify console / DevTools shows watchPosition ticks with descending `lastDistanceMeters`.
  - Drive into the geofence (or simulate via DevTools sensors → Location). Within a few ticks of crossing the 150m boundary: confirm the green "Arrived · HH:MM" pill appears in the driver's StopDetailScreen eyebrow.
  - On the dashboard board: confirm the teal pin badge appears below the stop number within ~1s of the arrival POST (realtime channel fan-out). Confirm the footer time strip shows "Arrived HH:MM" (or "ETA: 4:30 · Arrived 4:35" if ETA is also present).
  - Tap Mark Stop Complete on the driver app → confirm both badges coexist on the dashboard (green check + teal pin), and the footer flips from "Arrived" to "Completed HH:MM".
  - Refresh both apps; confirm arrived_at persists.
  - Edge: open a warehouse stop on the driver — confirm no geofence arms (no permission prompt, no POST).
  - Edge: open an already-arrived stop — confirm no re-fire (pill renders from existing value, hook stays at `enabled = false`).
- **Smoke-test on production** after Vercel deploy (covers all three bug fixes from May 14):
  - Sign in as darren@partytime-rentals.com → confirm lands on Home (not `/route/<id>`).
  - Home's "THE DAY, IN 3" → confirm shows only Route 2's stops, no Route 1 bleed.
  - BottomNav Routes tab → confirm lands on Darren's Route 2, not Route 1.
  - Complete a delivery stop (with OTW sent), wait ≥6s, return to Home, tap back into the stop → confirm Delivered card with `completed_at` timestamp, no Mark Stop Complete button, manifest/address/customer info still visible. Bonus: sign out and back in on another device → completion still shown.
- **Smoke-test Cash Collection v2 on production**: open a COD delivery stop → tap Mark Complete → confirm cash modal fires before the standard confirmation → test Collected path (amount editable, defaults to balance_due_amount, submits and completes) → test Could Not Collect path (first tap expands reason field, second tap with empty reason shows inline error, second tap with reason submits + completes) → verify the dashboard board shows red COD UNRESOLVED pill + reason within ~1s of submission → enter payment in TapGoods → wait for sync → confirm flag clears automatically.
- **Regen dashboard types** so the `as any` casts in `partytime-dashboard/src/lib/boardClient.ts` (`fetchUncollectedCodRows`) and the dashboard's `cash-collections` insert path can come out. Driver-app types are already current (`c308c81`).
- Pre-trip Phase 2 polish: transactional submit RPC, real OOS auto-notify (SMS/email), `'never'`-truck trailer-row hide
- Driver Profile / Compliance — doc upload, expiry tracking, 30-day reminders
- Tools Hub content authoring (calculators, fire code checklist, equipment KB)
- Training Module content authoring
- Phase 2C wind-aware anchoring guidance (content layer + flag flip)
- **Cleanup** (low priority): delete unused `AppStateContext.clearCache` (orphan since the auto-load reversal). Drop the orphan `dispatch_stops.cod_acknowledged_at` / `cod_acknowledged_by` columns. Both safe; both bundleable with the next housekeeping migration.

---

## Key TapGoods API Learnings (do not re-discover)
- Root GraphQL type is `ExternalQuery` (not `Query`)
- `beingPickedUp` does NOT exist on `getRentals`
- `isDraft` is a valid query arg but NOT a selectable field
- `truckNeeded: true` is a superset of `beingDelivered: true` — use both with pagination
- Results paginate at 200/page — service stops may be on page 2+
- View Order URL: `https://business.tapgoods.com/orders/rentals/{token}/pickList`
- PhoneNumber type uses field `cell` (not `number`)
- Stop ordering: `position: 0` is valid first stop (not "unset") — only `null` is unset

---

## Active Blockers
- Easy RFID Pro does not launch on real Android device (out of v1.1 scope)
- CoPilot destination import needs final validation on real device

## Out of v1.1 Scope
- RFID launch feature (dropped)
- Apple Sign In (deferred)
- Google OAuth for driver app (deferred — email/password only on PWA)
- Offline queue service worker (Phase 2+)

---

## Pre-Push Verification (mandatory)

`npx next lint` is **not sufficient**. ESLint does not run TypeScript's type checker — it can pass on code that fails `next build`. Vercel's build pipeline runs the full type check after compile, so a green lint locally and a red Vercel deployment is a real failure mode.

**Before every push to `main`:**
1. `npx next build` — must succeed end-to-end (compile + type check + page generation)
2. Only then `git push`

**`npx next build` green is NOT deployed.** Build is the verification step; the push is the deployment trigger. Build-then-push is one indivisible sequence — never build and stop. If a build is green and you're not pushing immediately, name out loud why (e.g., "still mid-pass, will push after the bundle is done") so the deferred push doesn't get lost across the next hour of context.

At the start of any session, treat `git status` showing "Your branch is ahead of origin/main by N commits" as a red flag, not a routine note.

**Incident — May 6, 2026:** Cash-collection feature (commit `449693e`) passed `npx next lint` with zero errors but failed Vercel's `next build` on a `WorkflowEventType` mismatch (`'CASH_COLLECTED'` not in the union). Fix-forward in `4dda705`. Lesson: lint is a subset of build; never substitute one for the other.

**Incident — May 9, 2026 evening:** During the inspection-flow build session, 9 commits sat local for hours because the build-then-push sequence was broken. After each pass `npx next build` ran green; `git push` was forgotten. Smoke testing against Vercel showed the pre-inspection app for 2+ hours. Recovered by pushing all 9 in one batch. Lesson: green build alone is meaningless until pushed.

---

## Notion — Read These Pages at Session Start
1. PartyTime Driver App — Master Project Hub
2. v1.1 Build Plan — Revised (April 26, 2026)
3. Session Summary — April 26, 2026 (Evening)

Always check Notion for the latest status before writing any code.
