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

## Current Build State (as of May 6, 2026)

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

### Multi-Role Auth Migration — May 9, 2026 evening (commit `b937892`)
Driver app caught up to the dashboard's Multi-Role Refactor (dashboard Migrations 036/037/038, applied earlier on May 9, dropped `profiles.role` in favor of `profiles.roles text[]`). Driver app was missed in the original sweep and was returning HTTP 400 from `/rest/v1/profiles?select=...,role,...` on every load, surfacing as "Access denied" because `role` resolved to `null`. Fix touched 10 files:
- `src/types/auth.ts` — `UserProfile.role: Role` → `roles: Role[]`
- `src/lib/auth.ts` — PostgREST select column `role` → `roles`
- `src/context/AuthContext.tsx` — context value exposes `roles: Role[] | null` (not singular `role`)
- 5 page guards (`/`, `/profile`, `/training`, `/tools`, `/tools/weather`) — `role !== 'driver' && role !== 'super_admin'` → `!roles?.includes('driver') && !roles?.includes('super_admin')`
- `src/components/BottomNav.tsx` — tab visibility flipped to `roles.some((r) => t.rolesAllowed.includes(r))` (array intersection)
- `src/screens/ProfileScreen.tsx` — `formatRole` takes `Role[]`, prefers `'driver'` for the display label since this is the driver app, else falls back to first role

No schema changes (production schema was already correct as of dashboard's May 9 morning push). No new helpers introduced — driver app's auth check surface is small enough that the inline `roles?.includes(...)` pattern is sufficient. If this app grows more role-gated surfaces, port the dashboard's `hasRole()` / `hasAnyRole()` helpers from `usePermissions`.

### NEXT
- Driver Profile / Compliance — doc upload, expiry tracking, 30-day reminders
- Tools Hub content authoring (calculators, fire code checklist, equipment KB)
- Training Module content authoring
- Phase 2C wind-aware anchoring guidance (content layer + flag flip)

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
- DOT pre-trip inspection (Phase 2+)

---

## Pre-Push Verification (mandatory)

`npx next lint` is **not sufficient**. ESLint does not run TypeScript's type checker — it can pass on code that fails `next build`. Vercel's build pipeline runs the full type check after compile, so a green lint locally and a red Vercel deployment is a real failure mode.

**Before every push to `main`:**
1. `npx next build` — must succeed end-to-end (compile + type check + page generation)
2. Only then `git push`

**Incident — May 6, 2026:** Cash-collection feature (commit `449693e`) passed `npx next lint` with zero errors but failed Vercel's `next build` on a `WorkflowEventType` mismatch (`'CASH_COLLECTED'` not in the union). Fix-forward in `4dda705`. Lesson: lint is a subset of build; never substitute one for the other.

---

## Notion — Read These Pages at Session Start
1. PartyTime Driver App — Master Project Hub
2. v1.1 Build Plan — Revised (April 26, 2026)
3. Session Summary — April 26, 2026 (Evening)

Always check Notion for the latest status before writing any code.
