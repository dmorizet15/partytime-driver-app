# PartyTime Driver App — Tech Debt

Tracking only **open** debt and active blockers. For per-session smoke-test coverage, see `docs/claude/stack.md` NEXT block.

Last reviewed: 2026-05-16.

---

## Active Blockers
- Easy RFID Pro does not launch on real Android device (out of v1.1 scope)
- CoPilot destination import needs final validation on real device
- **Log Service "Save doesn't work" (reported 2026-06-02, investigated — NOT yet fixed).** `src/screens/fleet/LogServiceEntryScreen.tsx`. Root cause is low-visibility failure, not user error:
  - The Save button is **never field-gated** — `disabled={saving}` only. All required-field checks live inside `save()` (`:162-201`) as early-returns. On a **validation** failure `setSaving(true)` is never reached, so the button gives **zero feedback**; the error renders in a red box at the end of the scroll body (`:471-479`), *above* the fixed footer button, so it can be off-screen.
  - **Required + NOT prefilled: Service type** (default `''`; "Custom" with empty text also fails) → *"Choose or enter a service type."* — the most likely everyday trip-wire. (Date prefills to today; mileage/hours/notes/parts/invoice/vendor are optional; external-name required only when "External" picked.)
  - Mileage NULL is **not** a cause: `service_records.mileage_at_service` is nullable and the field is optional.
  - **Compliance partial-failure bug:** picking a compliance service type (NYS Inspection / Registration / Insurance) makes `createServiceEntry` (`queries.ts:546-552`) POST to the dashboard via `postComplianceExpiry` **after** the `service_records` insert already succeeded. If `NEXT_PUBLIC_DASHBOARD_URL` is unset or the dashboard route fails, it throws → no `router.push` → reads as "save failed" but the record IS saved; **re-tapping creates duplicate records.** `NEXT_PUBLIC_DASHBOARD_URL` is only in `.env.local.example` (unset in local dev → throws locally); confirm it's set in the driver-app Vercel project and the dashboard route `/api/fleet/trucks/[truckId]/compliance-expiry` accepts the driver bearer.
  - Schema regression ruled out: `09135db` added `service_term_months` to the insert, but the column exists (nullable int).
  - Likely-fix directions (not yet implemented): give the Save button inline feedback / scroll-to-error, run validation before the API call with the error near the button, and make the compliance POST non-fatal / idempotent (or move it before the record insert) to avoid duplicate `service_records` on retry.

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
