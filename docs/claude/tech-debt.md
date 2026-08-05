# PartyTime Driver App — Tech Debt

Tracking only **open** debt and active blockers. For per-session smoke-test coverage, see `docs/claude/stack.md` NEXT block.

Last reviewed: 2026-08-04.

---

## GPS arrival detection is effectively dead at the depot (2026-08-04, mid-route warehouse investigation)
- **`arrived_at` is populated on 0 of 323 `warehouse_return` rows** (277 of which have valid coords), against delivery 152/506 and pickup 120/490 over the same 120-day window. The depot geofence has **never fired in production**, so the "arrival is completion" flow on the end-of-day depot stop (`StopDetailScreen.tsx:780`) has never actually run — all 74 warehouse completions were manual taps.
- **Root cause is architectural, not a bug:** `useArrivalGeofence` is (a) foreground-only `watchPosition` and (b) armed only while that specific stop's detail screen is mounted. Drivers never sit on the warehouse screen while driving to the warehouse. The same limitation caps *any* arrival feature — a PWA cannot do background geofencing; the hook's own comment says that needs native/Capacitor.
- **Planned partial fix** (in the approved mid-route warehouse spec, not yet built): move the depot watcher up to `AppStateProvider`, which is always mounted, so arrival can stamp without the depot screen open. **This does not make it reliable** — screen off or app backgrounded on the drive back still means no fire. Treat auto-arrival as best-effort forever; never make a workflow depend on it.
- **Consequence for design:** completion must stay a manual tap. This is also the only honest departure signal available (see the departure-semantics entry below) — a tap as the driver rolls beats a geofence guess.

---

## Departure semantics (2026-07-31, Route 1 premature-completion incident)
- **`dispatch_stops.actual_departure_at` is still written equal to `completed_at`** by `/api/complete-stop` ("the driver tap IS the departure moment"). Migration 033 split the two columns precisely so "marked done" and "actually left" could diverge — then they were written identically, so the distinction lives in the schema and nowhere in the behaviour. Two consumers believe it: the driver-app auto-ETA and the dashboard ETA cascade anchor. On 2026-07-31 that produced a customer text ~3 hours early and a board whose stop-3 ETA (10:13 AM) read earlier than stop-2's (12:19 PM).
- **Splitting them is audited safe but deliberately NOT done.** Full trace of all nine consumers: `stop_status === 'completed'` covers every `isCompleted` fallback (`StopCard`, `StopRow`, `WarehouseStopCard` — each comments that `actual_departure_at` is only a "fallback in case status didn't write", and since `/api/complete-stop` writes both in ONE update they cannot diverge); `hasAnyDeparted` (warehouse 'out' column) is OR'd with route-level `routes.actual_departure_at`, stamped separately at Start Route; only the `'otw'` last-status label in `warehouseOverviewServer.ts:368` would degrade. **The blocker is not safety, it is the absence of a real departure signal** — moving the stamp to a Navigate tap risks it never being written at all (drivers who know the route skip Navigate), which would silently disable the ETA anchor on every route. The geofence cannot supply it either: `useArrivalGeofence` is arrival-only, foreground-only, and terminal once it fires.
- **Mitigations shipped instead (v2.10.0):** the driver is asked before the text goes out (`AutoEtaOptInRow`), and the dashboard rejects an anchor that lands before a stop's planned dwell-inclusive arrival. Revisit the column split only if premature completions keep distorting the board, and only alongside an explicit departure signal.

## Active Blockers
- Easy RFID Pro does not launch on real Android device (out of v1.1 scope)
- CoPilot destination import needs final validation on real device

## Doc rot (2026-06-12, Will Call investigation)
- **`src/services/PhotoUploadService.ts` header comment is stale** — says the API route "saves the file to public/uploads/" and the result-shape example shows a `/uploads/...` URL. The actual `/api/upload-photo` route uploads to the Supabase Storage `pod-photos` bucket (path `{stopId}/{timestamp}.jpg`, `x-upsert: true`) and writes `stops.pod_photo_url`. Comment-only fix; matters because the Will Call Phase 2 plate-photo work will use this file as its reuse reference.

## AVA — open items (2026-06-02, Session 3 `48d5487`)
- **Elevated "all routes" in AVA not wired.** The AVA access rule grants `super_admin` all routes + all SOPs. SOPs are fully scoped now, but route context in `/api/ava/ask` is **client-seeded** and the only server-side route loader (`/api/routes`) restricts even `super_admin` to their `route_assignments` by design (admins use `/api/schedule/week` for the full board). So an admin asking AVA about "today's routes" sees only their own assigned route. Wiring elevated all-routes would mean adding a server-side route-load layer to the ask route; when built, it reuses `isElevatedRole`. Low priority — drivers (the actual users) are correctly scoped.
- **`/api/routes` soft-fail to an unscoped query.** If the `route_assignments` lookup itself errors (transient Postgres/RLS hiccup), `/api/routes` falls through to an UNSCOPED query so a real driver isn't locked out — documented in that file's header as an availability tradeoff. Means a transient error could briefly expose all routes to the caller. Pre-existing; out of scope for the AVA work. Owner: whoever owns `/api/routes` route-scoping. Revisit if it ever fires in practice (it logs a warning).
- **AVA SOP/scoping not smoke-tested on live Haiku** — see `tasks/todo.md`. Build type-checks clean; runtime check needs an authed session on the deploy (driver vs `super_admin`).
- **Log Service "Save doesn't work" — FIXED 2026-06-02 (`52f4016`, direct to `main`).** Two of the investigated causes are addressed: (1) validation errors now render in the fixed footer above the Save button (was off-screen in the scroll body) + a 150ms red border flash on validation early-returns; (2) the compliance POST is now wrapped in its own try/catch in `createServiceEntry` — non-fatal, no rethrow, returns `complianceUpdateFailed` so the screen navigates anyway (kills the duplicate-`service_records`-on-retry path) and warns via `FleetServiceToast` at the destination. **Smoke test still pending** (`tasks/todo.md`): force the failure locally by unsetting `NEXT_PUBLIC_DASHBOARD_URL`. Residual operational note (NOT a code bug): confirm `NEXT_PUBLIC_DASHBOARD_URL` is set in the driver-app Vercel project and the dashboard route `/api/fleet/trucks/[truckId]/compliance-expiry` accepts the driver bearer — otherwise the compliance write silently no-ops (record still saves; driver sees the toast). The Save button is still not field-gated by design (validation runs in `save()`), which is fine now that failures are visible.

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
