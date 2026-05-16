# PartyTime Driver App — Tech Debt

Tracking only **open** debt and active blockers. For per-session smoke-test coverage, see `docs/claude/stack.md` NEXT block.

Last reviewed: 2026-05-16.

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

## Open cleanup items (low priority)
- Delete unused `AppStateContext.clearCache` (orphan since the cold-load auto-redirect was reversed May 14). Comment block references stale "assigned-route check" infra. One-line removal; bundle with the next AppStateContext touch.
- Drop the orphan `dispatch_stops.cod_acknowledged_at` / `dispatch_stops.cod_acknowledged_by` columns. Audited 2026-05-13 — zero readers, zero writers across both repos. Cash Collection v2 uses payment_state-based auto-resolution instead. Safe to drop; bundleable with the next housekeeping migration once schema confidence is high.
- **Regen dashboard repo Supabase types** so the `as any` casts in `partytime-dashboard/src/lib/boardClient.ts` (`fetchUncollectedCodRows`) come out. Driver-app types are already current (`c308c81`). One-line: `cd ~/Projects/partytime-dashboard && supabase gen types typescript --linked > src/types/supabase.ts` — but strip the stderr lines that the CLI bleeds into the redirected file ("Initialising login role…" header, "A new version…" footer); see `tasks/lessons.md`.

## Phase 2 follow-ups (deferred until pressure exists)
- Pre-trip Phase 2 polish: transactional submit RPC, real OOS auto-notify (SMS/email), `'never'`-truck trailer-row hide
- Real-time push/SMS to dispatch on COD "Could Not Collect" (cash_collections INSERT already fans realtime; no audible signal today)
- Real-time push/SMS to dispatch on Phase 2.5C arrival (realtime channel already fans timestamp; no audible signal today)
- Background geofencing (requires Capacitor / Android Geofence API — current PWA `watchPosition` is foreground-only)
- Driver-side "location off" warning surface for `useArrivalGeofence` `denied` / `unavailable` / `error` states (currently silently degrades)
- Dashboard-side arrival → completion delta analytics surface
- Phase 2C wind-aware anchoring guidance (content layer + `HAS_ANCHORING_GUIDANCE` flag flip)
- TapGoods tent-size threshold differentiation (`HAS_TENT_SIZE_DATA` flag flip)
- Tenting subcategory screen — promised "3 live" (Squaring + Drawings + Certs); today the Tenting tile lands directly on `/tools/tent-squaring`. When second/third tenting tools land, convert into a sub-hub.
- Driver Profile / Compliance — doc upload, expiry tracking, 30-day reminders
- Tools Hub content authoring (calculators, fire code checklist, equipment KB)
- Training Module content authoring
- Arcade follow-ups: per-game personal-high-score history beyond top-10, arcade-side rate limit, optional hi-res PTR logo at `public/images/PARTYTIME-RENTALS-LOGO.png`

## Open architecture follow-ups
- Duplicated layout components between `ToolsScreen` and `TrainingScreen` (`C` token object, `BadgePill`, `IconWrap`, `CategoryCardGrid`, `CategoryCardWide`, Tabler icons, inline toast). Extract to `src/components/hub/*` when a third hub-style surface appears.
- Three mirrored helpers — `src/lib/equipmentSummary.ts`, `src/lib/inflatable.ts`, `src/lib/itemCategories.ts` — duplicated byte-for-byte with `partytime-dashboard/src/lib/*`. Any change to one MUST be applied to the other in the same session. Extract to shared npm package eventually.
- 12-category list duplicated locally in `src/components/PostTripDefectCard.tsx` + `src/app/api/defects/post-trip/route.ts` with `// TODO: extract to src/lib/defect-categories.ts when pre-trip stabilizes` marker.
- Add an FK from `cash_collections.stop_id` to `dispatch_stops.id` so PostgREST can embed cash_collections in a stops fetch (one query instead of two). Bundle with the schema cleanup migration above.

---

## Closed (kept here briefly to prevent re-litigation)

- **Migration 051 (cash_collections status)** — applied 2026-05-14 via Management API path.
- **Multi-Role Auth Migration** — driver app caught up to dashboard 2026-05-09 (commit `b937892`).
- **TapGoods direct-call cluster** — removed 2026-05-10 (Phase 2.5a, commit `15d3476`).
- **`/games` 404 from Arcade tile** — resolved 2026-05-15. Arcade tile now points at `/training/arcade`.
- **Cold-load auto-redirect** — removed 2026-05-14 (commit `ff006c6`). Cold sign-in lands on Home.
- **`/api/routes` driver-scope bug** — fixed 2026-05-14 (commit `ff006c6`). Endpoint now session-aware.
- **Completion not persisted across refetch** — fixed 2026-05-14 (commit `4788034`). `stop_status` now read end-to-end.

If you find an item listed under "Closed" that still appears in the codebase, treat it as re-opened and investigate.
