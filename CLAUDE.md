# PartyTime Driver App — Claude Code Context

You are the CTO and lead developer for PartyTime Rentals.
Follow the Darren AI Protocol in Notion before doing anything.

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
- **Branch strategy:** Work on `dev`, merge to `main` to deploy

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

---

## Design System (PTR v1.0)
- **Mode:** Dark (driver app)
- **Primary:** `#0000FF` blue
- **Black:** `#000000`
- **Yellow:** `#F4C01E`
- **Grid:** 8px base spacing
- **Principle:** Zero friction for field workers — no slow animations

---

## Current Build State (as of April 27, 2026)

### COMPLETE ✅
- Phase 0: Dashboard repo scaffolded and deployed
- Phase 0.5: PTR Design System v1.0 defined in Notion
- Phase 1 — Supabase Auth (both apps, production) ✅ April 27, 2026
  - Migrations 001–005 applied to partytime-east
  - Driver app + dashboard auth live in production
  - Session persistence, refresh, and sign out all working
  - Critical fix: INITIAL_SESSION deadlock in supabase-js v2 — `getUserRole()` uses direct fetch() with access_token to bypass internal getSession() call
- Phase 2 — Cross-Device OTW State Sync ✅ April 27, 2026
  - Migration 006: `stops` table gets `otw_status`, `otw_timestamp`, `otw_set_by`
  - `StopStateService.ts` — writes localStorage first (instant UI), then Supabase async; offline queue flushed on reconnect
  - `AppStateContext.loadDay` merges Supabase OTW > localStorage > TapGoods default
  - OTW state is now cross-device; localStorage remains fallback if Supabase unreachable
- ETA/SMS Phase 1 live in production (April 21, 2026)
- TapGoods Phase 1 integration live in production (April 20, 2026)

### NEXT — Phase 3
- [ ] Wire Send ETA button to `/api/send-eta` — endpoint is already live
- [ ] Surface sent/failed/already-sent states on stop screen
- [ ] Confirm correct params: stopId, routeId, phone

### AFTER PHASE 3
- Phase 4: POD photo UI polish only — no logic changes

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

## Notion — Read These Pages at Session Start
1. PartyTime Driver App — Master Project Hub
2. v1.1 Build Plan — Revised (April 26, 2026)
3. Session Summary — April 26, 2026 (Evening)

Always check Notion for the latest status before writing any code.
