# Open Tasks — partytime-driver-app

## July 15, 2026 — RFID live-read verification — branch `feat/rfid-native-integration`; NO migration; ZERO writes

Real Easy RFID Pro API proven for READS from this laptop: credentials wired into `.env.local` (production hosts — write guard correctly refuses), full 13,024-record Item Master seeded through the real client path, MockScanner EPC resolution proven against real data online + with network killed. Found + fixed the paging bug (server caps `limit` at 200; old heuristic truncated the fleet to 200 records). `'Delivered'` + all six pickup statuses confirmed live verbatim. `rfid_to_tapgoods_map` confirmed readable from this app (548 rows; join key = `rfid_item_id == rental_class_num`, 547/548). Suite 72 tests (1 = `RFID_LIVE=1`-gated live harness, skipped in CI).

- [ ] Live WRITE verification: batch `success_count == N` against the SANDBOX — still blocked on sandbox API/auth hosts + creds (wired creds are production, where writes are guard-refused by design). Alternative: Darren-approved labeled production test with `EASY_RFID_ALLOW_PRODUCTION`.
- [ ] Quality dropdown: adopt the real live vocabulary `A+ A A- B+ B B- C+ C C-` (no `D` live; 4,628 records are `A+` which the picker can't currently set) — small change, do before drivers write quality.
- [ ] Merge-time join, stop side: determine what `tapgoods_item_id` (8-hex) keys to in `dispatch_stops.items`/`reservations.tapgoods_data` — the replica side of the join is proven; the stop-line side is the remaining unknown (ASSUMPTIONS.md).
- [ ] Exact-string status filters must handle the live `Ready To Rent` case variant (281 rows) + 41 empty-status rows.

## July 13, 2026 — RFID scan-model correction — branch `feat/rfid-native-integration` (`2f974bc`); NO migration

Corrected per Darren: status-first arming, press-and-hold triggers (Individual = first tag + Clear/re-pull; Mass = accumulate + commit), instant replica resolution, no default return status (unscanned retain 'Delivered'), non-RFID lines manual-only (`ExpectedItem.taggable`). 68/68 tests + `next build` green — mock-verified only.

- [ ] Live sandbox verification: delivery + pickup flows against the Easy RFID Pro sandbox; confirm batch write `success_count == N` on one multi-row pickup (credentials: `~/partytime-rfid/.env.local`; sandbox API/auth hosts still unknown — ASSUMPTIONS.md).
- [ ] XR2 device test: press-and-hold trigger feel (on-screen + hardware trigger), first-tag capture latency, Clear/re-pull within the 500ms window in the field.
- [ ] GPS against a REAL permission grant (grant → lat/long on the queued write; deny → coordinate-less write proceeds) — currently UNCONFIRMED, mock adapters only.
- [ ] Merge-time: host StopContext sets `ExpectedItem.taggable` from the rfid_to_tapgoods_map join; decide serialized-asset picker vs free entry (ask Darren whether untagged serialized assets exist in Item Master).
- [x] Confirm the exact live 'Delivered' status string against a legacy-delivered record before any live write — CONFIRMED 2026-07-15: 237 live records carry exactly `Delivered`.
- [ ] Merge-to-main session: VERSION bump (MINOR) + What's New entry — deliberately NOT done on the branch.


## July 6, 2026 — Pickup Answer (Driver-Facing) — ON `main` (`e70e78c`); NO migration

Spec: MBC Part 3 "📞 Pickup Answer (Driver-Facing)" (locked 2026-07-05). Read-only gold card on the delivery stop that answers "when are you picking up?" using the reservation's pickup stop(s). Built on branch `feat/pickup-answer`; Darren merged to `main` accepting the low read-only risk (test opportunistically, quick-fix if needed). **Note:** the card is on the interactive StopDetailScreen only, so it needs a day WITH delivery stops to see (07-06 had 0 deliveries; nearest delivery days 07-07 and 07-10).

**Session 1 — investigation + pure derivation (DONE):**
- [x] Migrations head = **29** (`20260702029`). No migration needed — read-only confirmed.
- [x] **GUARD FIELD CONFIRMED (blocking step):** the early-pickup guard's committed-time value is **`effectiveWindow(pickupStop).startsAt`** in `src/lib/stopConstraints.ts` = `COALESCE(dispatcher_time_override.must_pickup_after, pickup_window_start, notes_classification.extracted.must_pickup_after)`. StopDetailScreen's standby/countdown use exactly `pickupOpensAt = effectiveWindow(stop).startsAt` (+ `formatCountdown`/`formatLocalClock`). The card computes the SAME `effectiveWindow(pickupStop).startsAt` for its "No earlier than" floor → promise and block can never disagree. Narrowed `effectiveWindow`'s param to a structural `WindowResolvable` interface so the card's lighter pickup rows reuse the one resolver (Stop still satisfies it; every existing caller unaffected).
- [x] **Live data facts (project fumprcyavpefyupurvsv, 2026-07-06):** pickups 454; `pickup_window_start/end` 426 (~94%); exact-time (start==end) 87 = inflatable floors; `calculated_eta` on 264 (routed); `linked_stop_id` 453/454 (**can chain pickup→pickup**, so group by `reservation_id`, not linked_stop_id); `dispatcher_time_override` **0%**, `scheduled_time` **0%** (COALESCE forward-compat); `no_pickup_needed` flag unused (0) → no-pickup = ABSENCE of pickup rows (7 deliveries). Multi-pickup reservations: 31 (18 phantom same-date, 13 genuine distinct-date). **scheduled_date DRIFTS from the floor** — verified `388e13ad` floor `2026-09-27T00:00Z` = 8 PM ET 09-26 while scheduled_date = 09-28 → never use scheduled_date for the inflatable time.
- [x] **Inflatable classifier:** both repos' `inflatable.ts` is CATEGORY-ONLY. Live data proves that misses blank-category leaks (EMERALD ICE DRY SLIDE, CASTLE COMBO under blank cat) while name-only misses keyword-less INFLATABLES names (MECHANICAL BULL, JOUST CHALLENGE). Correct = **category OR name**. Built `src/lib/pickupAnswer/classify.ts` reusing `isInflatableCategory` VERBATIM (applied to BOTH category and name) + accessory-name exclusions (sand bag/weight). Tent = pure mirror of `isTentItem` (its module imports the supabase browser client → impure → can't be pulled into a pure module; mirrored with a lockstep note).
- [x] **Pure derivation `src/lib/pickupAnswer/derive.ts`** (+ `types.ts`, `format.ts`): dedup phantom rows by scheduled_date, reservation-scoped, confidence-gated split labels (only when 2 distinct dates + cleanly-separable real inflatable + real tent, else neutral "First trip / Second trip"), ET/DST-safe formatters. **Smoke test 45/45 PASS** (inflatable exact-time, tent routed/unrouted, mixed, no-pickup, phantom-dup, split-both-mixed→neutral, clean-split→labels, TZ/DST EDT+EST, guard-parity, stray-reservation filter). `next build` green (38 pages).

**Session 2 — UI card + wiring (see below, DONE this session):**
- [x] Service-role `GET /api/stops/pickup-answer?stop_id=` (linked delivery↔pickup rows live on a different route → client RLS can't read them; mirrors `/api/stops/equipment-returns`).
- [x] `PickupAnswerCard` on delivery StopDetail, below customer/address, above manifest; collapsed glanceable → tap expand; two-line time model; say-line; split/mixed trip rows; no-pickup copy; reuses the guard's `formatCountdown` for an imminent same-day floor.
- [x] **Darren device smoke — PASSED 2026-07-07** (live delivery day, "looks good"). Feature complete. Concrete delivery stop_ids (live, 2026-07-06) retained below for reference:
  - Inflatable (near-term, exact floor) — `5ab4e402-56f9-4146-bb06-a22be35506cd` (EMILY CHAMBERS, deliver 07-07 → card should read "No earlier than 12:30 PM" + "Currently expected ~3:30 PM").
  - Mixed, single pickup, exact — `5f01bcaf-3fb4-41d1-b652-48b193a4f72e` (Toniann Cortina, 08-19).
  - Mixed, genuine split (2 dates) — `ed5aecaa-70de-461d-b363-4ecee060c206` (Jordan Hoener, 09-13) → expect two trip rows.
  - Tent-only — `75a96ec5-eeef-47fb-aa2f-72bd586daa65` (CELINE MARTIN, 07-07; null pickup window → "Planned" + flexible window).
  - No-pickup — pick any delivery whose reservation has zero pickup rows (7 live) → the "no pickup currently scheduled" copy.
  - Open a stop via `/route/<routeId>/stop/<stopId>`; the card is delivery-only, sits under the customer card, above the manifest.

## July 2, 2026 — Driver App Bug Queue cleanup (ON `main`; no migration)

Four May-17 items. Three fixed + shipped; one investigated then built as a follow-up build session.

- [x] **BUG-001** Android Arcade Play button unreachable — `.screen` (`height:100svh; overflow:hidden`) clipped the last hub tile; made the tiles container the scroll region in `ArcadeHub.tsx`. Committed `ccff357` (v2.1.1→ rebased into 2.3.1). Lesson recorded in `tasks/lessons.md`.
- [x] **BUG-002** Training badges wrongly "Live" → all 5 non-Arcade items set to "Coming Soon" (`TrainingScreen.tsx`). Committed `ccff357`.
- [x] **BUG-003** Snow forecast year-round → `isSnowSeason()` gate (Oct 1–Apr 15) around `<SnowForecastCard>` (`WeatherScreen.tsx`). Committed `ccff357`.
- [x] **INVESTIGATION-001** → **built** (`ad15703`, v2.4.0). Persistent route-level "From Dispatch" block on `DayRouteSelectorScreen` below the "The day, in N" eyebrow, gated `inspected === true` (no duplicate render vs the pre-inspection AVA card). Uses existing `routes.dispatcher_notes` — no fetch/column/migration.
- [ ] **On-device smoke (all four):** Android — Arcade tiles scroll, Party Kong Play tappable; Training badges read "Coming Soon"; Weather snow section hidden now (July, out of season); a route WITH a dispatcher note shows the Home "From Dispatch" block after pre-trip, a route WITHOUT one shows nothing, and the note is not double-shown pre-inspection.

## July 2, 2026 — Equipment Return Tracking: reservation-scoped ledger revision (Migration 029; v2.3.0)

Design correction over the initial ship: running ledger per `(reservation_id, equipment_key)` replaces pairwise pickup↔delivery matching. See CLAUDE.md → "Equipment Return Tracking (Driver App) → Ledger revision" + Known Landmines (ledger model).

- [x] Migration 029 `equipment_return_alerts` (once-per-reservation alert stamp) — applied live, tracker at `20260702029`. `dispatch_stops.reservation_id` already indexed.
- [x] `ledger.ts` (pure computeBalances/traceLines) + GET rewrite (`returns` for cards + `balances` for prefill).
- [x] POST pickup-completion path: crew-gated upsert → live final-pickup check → discrepancy alert (insert-once, `retryAlert` keeps the queue retrying a failed send).
- [x] `EquipmentPickupSection` (prefilled steppers, one-tap confirm, below-prefill inline note) + `runStopComplete` pickup wiring + queue kinds.
- [x] Ledger smoke 12/12 (scenarios a–d) + live-DB round trip on a real 2-del/2-pickup reservation + build green.
- [x] **`RESEND_API_KEY` set + verified end-to-end (2026-07-02):** live test send from production delivered to Darren's inbox. Caught + fixed a domain bug in the defaults — the Resend-verified domain is HYPHENATED `partytime-rentals.com` (un-hyphenated 403s); defaults now from alerts@ / to dispatch@ on the hyphenated domain.
- [ ] **On-device smoke (THE gate):** pickup stop shows pre-filled expected counts; one-tap confirm at prefill → completes, no alert; final pickup reporting a shortfall → dispatch email with per-stop trace; intermediate pickup below prefill → NO alert; offline pickup completion queues the POST + flushes.

## July 2, 2026 — Equipment Return Tracking (Migration 028; v2.2.0)

Delivery crews log equipment left on-site (cords / china racks / glassware racks / flatware crates / chair carts); pickup crews see "Retrieve N …" on the linked pickup stop. See CLAUDE.md → "Equipment Return Tracking (Driver App)" + `docs/CHANGELOG.md`.

- [x] Migration 028 `stop_equipment_returns` (crew RLS matching stop_item_checkoffs, updated_at trigger) — applied live, tracker at `20260702028`.
- [x] Shared rules config (`equipmentReturns/rules.ts`) + service (upsert, `ptd_equipreturn_queue`, draft) + flush wired into `loadDay`.
- [x] `EquipmentReturnSection` (delivery StopDetail, grouped steppers, soft prompt) + commit in `runStopComplete`.
- [x] `GET /api/stops/equipment-returns` (linked_stop_id → reservation fallback) + `EquipmentRetrieveCard` in StopDetail / RouteList / RoutePreview pickup contexts.
- [x] Rule-matrix smoke (tent-only, china+glassware = two racks, flatware, two chair types = ONE stepper, cushions-only = no trigger) ALL PASS; live-DB round trip incl. 164-day Will Call gap; build green (38 pages).
- [ ] **On-device smoke (THE gate):** complete a delivery with counts entered → rows land in `stop_equipment_returns`; open the linked pickup stop → blue "Retrieve from this site" card shows the counts (StopDetail + RouteList + RoutePreview); untouched steppers write nothing; offline completion queues the counts and flushes on reconnect.
- [x] ~~Flag to Darren: two pickups linked to the SAME delivery both show the same reminder~~ — **RESOLVED by the ledger revision** (the second crew sees the post-first-crew balance).
- [ ] **Flag to Darren:** service-labor item names ("SETUP -TABLES/CHAIRS") can render a harmless extra chair-cart stepper — tighten the rule only if drivers notice.

## June 22, 2026 — Next Day Route Preview (3 sessions) (ON `main`: `083821c` / `fedc216` / `6589a87`; no migration)

Surface a driver's upcoming shift on Home, a read-only preview of that route, and multi-truck-job awareness. Spec was 3 locked sessions, "investigate then immediately proceed." See CLAUDE.md → "Next Day Route Preview (Driver App)" + `docs/CHANGELOG.md`.

- [x] **S1** investigation (live DB): future `route_crew`→`routes`→`trucks` join confirmed (truck_id nullable); `dispatch_stops` reachable via `route_id`+`scheduled_date`; route_crew RLS moot (service-role read).
- [x] **S1** `GET /api/routes/next-shift` (service-role, soonest future shift, optional `?today=` for tz-correct "future", `{shift:null}` never errors) + `NextShiftCard.tsx` (returns null on no data) wired into Home empty + completed states. Committed `083821c`.
- [x] **S2** confirmed `/api/routes` already accepts `?date=` (crew-scoped) — reused, no new endpoint. `AvaConversationSheet` `routeDate` prop loads that date's payload as AVA context. `RoutePreviewScreen` (`/route-preview/[routeId]?date=`, Suspense-wrapped) — read-only, disabled Navigate, no ETA/check-off/completion. Committed `fedc216`.
- [x] **S3** investigation: `reservation_id` null rate on delivery/pickup = **0/848**; insertion points RouteList ~677 / StopDetail ~2788. `reservation_id` plumbed through `/api/routes` SELECT + transform + Stop type (no regen). `GET /api/stops/same-job` (service-role) + `SameJobIndicator.tsx` (null when no siblings) dropped into RoutePreview + RouteList + StopDetail. Committed `6589a87`.
- [x] **Follow-up fix — RoutePreviewScreen didn't scroll** (`1adbd48`). Content was a direct child of `.screen` (`height:100svh; overflow:hidden`) so anything past one viewport was clipped. Wrapped the body in a `flex:1; overflow-y-auto` scroll container (RouteListScreen's pattern), header stays `flexShrink:0`, scroll container clears the safe-area inset.
- [x] **Follow-up fix — AVA upcoming-route context broken** (`af3b900`). Preview/next-shift "Ask Ava" couldn't answer about the route ("how many tents Wednesday?" → logged a gap). Moved context loading server-side: `AskBody.routeDate` → `/api/ava/ask` `loadRouteDateContext()` crew-scopes + injects explicit Tents/Chairs/Tables counts + full manifest; removed the client `buildContextFromPayload`. Tent count uses the strict `countTentItems` rule (loose category match counted "CAFE LIGHTS" qty 200 → 202 tents; strict → real 2). Verified vs live DB.
- [ ] **On-device phone smoke (S3's explicit gate + the two follow-ups):** NextShiftCard shows the upcoming shift; "Preview route" opens read-only, **scrolls top→bottom**, looks right; "Ask Ava" answers about the *upcoming* route ("how many tents on my route Wednesday?" → from route data, **no gap**); `SameJobIndicator` chip + bottom sheet render correctly on a live multi-truck job on RouteListScreen + StopDetailScreen.

## June 22, 2026 — Offline freeze fix — AbortController + visibilitychange (ON `main`: `6cfe9ff`; no migration)

Prevent the app from freezing when cell reception drops mid-operation. Root cause: iOS stalls fetches indefinitely on connection loss (no throw/reject), permanently blocking any code that runs after `await fetch(...)`. Three additive fixes — driver-app only, no migrations, no schema changes, no shared files. See `docs/CHANGELOG.md` + `tasks/lessons.md` (iOS fetch-hang lesson).

- [x] Investigation (read-only): traced the three freeze scenarios — (a) stop-complete spinner never clears → `handleMarkCompleteTap` / `runStopComplete`; (b) cash modal locks → `handleCashCollected`/`handleCashNotCollected`; (c) stale Home after foreground → `AppStateContext` listener gap.
- [x] Fix 1 — `StopDetailScreen`: 8 s AbortController on cash-status hydration fetch; 12 s on completion POST (`runStopComplete`); 12 s on cash-confirm POST (`handleCashCollected`); 12 s on cash-not-collected POST (`handleCashNotCollected`). Timeout catch paths route into existing error handling (enqueue completion / setCashError + unlock modal).
- [x] Fix 2 — `useInspectionStatus`: 8 s AbortController on the `/api/inspection/status` fetch; `controller.abort()` added to the cleanup return. Timeout catch → `setInspection(null)` (safe default, gate closed).
- [x] Fix 3 — `AppStateContext`: `document.visibilitychange` listener (fires `loadDay` on `visibilityState === 'visible'`) wired alongside `window 'online'`/`'offline'` in the existing network-listener `useEffect`, cleaned up in the same return.
- [x] `tsc --noEmit` clean; committed `6cfe9ff`; pushed to feature branch + `main`.
- [ ] **On-device smoke test (THE gate):** (a) load route online, kill network, complete a stop → completion modal unlocks within ≤12 s, stop queued for sync, driver advances to next stop; (b) drop connection mid-cash modal → error message appears after ≤12 s, inputs unlock, driver can retry or close; (c) background + foreground app → Home/route data refreshes automatically without manual pull-to-refresh.

## Cleanup (low priority)

- [ ] personalStatsClient.ts:3 — file header comment still says 'route_assignments'; update to reflect route_crew. One-line edit, no logic change, no migration.

## June 21, 2026 — AVA inflatable specs batch insert (DONE — data patch applied; no migration, no code)

57-row inflatable setup-specs batch into `ava_knowledge` (bin, blower count/HP, stake counts, accessories) so AVA can answer e.g. "what does the Wild Rapids need to set up?". chat-Claude generated the SQL; pasted in + applied this session. See CLAUDE.md → "AVA (Driver App)", `docs/CHANGELOG.md`, `tasks/lessons.md`.

- [x] Schema confirmed (project `fumprcyavpefyupurvsv`, table `ava_knowledge`): 12 cols. Required = `question` + `answer`. Defaults: `category='general'`, `source='answer_queue'`, **`status='published'`** (a status string, NOT a `published` boolean), `version=1`, timestamps `now()`. AVA's `/api/ava/ask` surfaces `status='published'`. Constraints: **PK on `id` only — no UNIQUE on `question`, no CHECKs.**
- [x] Wrote `supabase/data-patches/ava_inflatable_specs.sql` (1 UPDATE Pirate Battle + 56 INSERTs; `category='inflatables'`, `source='inflatable_specs'`). The pre-existing Pirate Battle row was UPDATE'd (re-pointed to the inflatables category + canonical answer), not duplicated.
- [x] Applied **once** via `supabase db query --linked --file …`. Verified: Pirate Battle rows = **1**; `COUNT(*) WHERE category='inflatables'` = **57**; Wild Rapids spot-check = `Wild Rapids — Bin R4-3 — takes 1 blower at 2 HP. Stakes: 4 hook stakes and 4 large stakes. No accessories needed.` (counts captured via a separate read-only query — `db query --file` only echoes the last statement; see lessons).
- [ ] **⚠️ DO NOT RE-RUN this file** — no UNIQUE on `question` → a second run inserts 56 silent duplicates (UPDATE half is safe; INSERT half is not). On a fresh DB rebuild apply exactly once. (Unlike the `dependency_map` patches, this is not self-healing/replay-safe.)
- [ ] **On-device AVA smoke:** ask the Ask-Ava sheet "what does the Wild Rapids need to set up?" → expect bin R4-3 / 1 blower @ 2 HP / 4 hook + 4 large stakes spoken back. Try Pirate Battle, the UFO carpet-blower caveat, and a double-unit (Vertical Rush / Leaps and Bounds) to confirm the knowledge injection reads these rows.
- [ ] **Source coverage (Darren):** confirm the 57 entries cover the full active inflatable fleet — any unit absent from `INFLATABLE_WORKSHEET.xlsx` / `Book_1.xlsx` (or added since) won't be in AVA's knowledge. Add follow-ups as a NEW one-shot patch (don't re-run this one).
- [ ] **Commit the patch file** — `supabase/data-patches/ava_inflatable_specs.sql` is currently untracked; commit it so it survives a rebuild (Darren to confirm commit/push).

## June 21, 2026 — AVA tent specs batch (DONE — data patches applied + committed; no migration, no code)

35 `tents` rows into `ava_knowledge` across 5 one-shot patches so AVA answers tent set-up/load/weight questions. Committed `5491770` (Stillwater) + `70053d9` (30-wide frame), both pushed to `main`. See CLAUDE.md → "Ava Studio Foundation — Session A1" note, `docs/CHANGELOG.md`, `tasks/lessons.md`.

- [x] Stillwater 44-wide sailcloth — 25 rows: `ava_stillwater_44_specs.sql` (15) + `ava_stillwater_44_weights_total.sql` (5) + `ava_stillwater_44_weights_v2.sql` (5 + tent-top-breakdown UPDATEs). Run order: specs → weights_total → weights_v2.
- [x] 30-wide traditional CPB frame — 10 rows: `ava_30wide_frame_tent.sql` (8) + `ava_30wide_frame_spreaders.sql` (2 + 30x45 "11 spreaders" UPDATE). Run order: frame_tent → spreaders. Spreader count 30x45=11 (Darren-confirmed; Notion had 6, flagged VERIFY).
- [x] Verified read-only: count 25 → 33 → 35; 44x83 stakes = "52 double-head stakes and 26 ratchets."; both spreader rows present; 30x45 "What goes on" includes "11 spreaders." All 5 files committed + pushed.
- [ ] **⚠️ DO NOT RE-RUN** any of these — no UNIQUE on `question` → re-run duplicates. Fresh DB rebuild: apply each once, in family order (above).
- [ ] **On-device AVA smoke:** ask the Ask-Ava sheet "what goes on the 44 by 83 Stillwater?", "how many spreaders on the 30 by 45 frame?", "how much does the 44 by 123 weigh?" → expect the seeded answers spoken back (knowledge injection reads these `tents` rows).
- [ ] **Source coverage (Darren):** these cover Stillwater 44-wide (43–123) + 30-wide frame (30x30/30x45) only. Other tent families (other widths, pole tents, etc.) aren't in AVA's knowledge yet — add as NEW one-shot patches (don't re-run these).

## June 18, 2026 — Manifest bundle grouping (ON `main`: `c862d24`; no migration)

`dispatch_stops.items` now carries `bundle_name` on FLOORING & STAGING deck items (e.g. `STAGE 8'X12'`). The static manifest on StopDetailScreen groups bundled items under an uppercase section header above its item(s); items without `bundle_name` render flat exactly as before. Rendering only — qty/status/check-off untouched. See CLAUDE.md → "Manifest bundle grouping", `docs/CHANGELOG.md`.

- [x] Investigation — render location is `StopDetailScreen` static-manifest `!checkoffActive` branch (`items.map`); `ItemCheckoffPanel` branch out of scope. Type plumbing: added `bundle_name?: string | null` to `Stop['items']` (`types/index.ts`) + `RawItem` (`supabaseTransform.ts`) — type-only, value already flows through items JSONB.
- [x] Group by `bundle_name` (first-appearance order); header above item(s); same row style for items; slight indent on bundled items; border never sits between header and its first item.
- [x] `npx next build` green (38 pages, ✓ Compiled, types valid); committed `c862d24`, pushed.
- [ ] **On-device / data check:** confirm the dashboard sync is actually writing `bundle_name` into `dispatch_stops.items` for live reservations (render path + types verified driver-side; data presence is dashboard-side). Verify reservation `0F5B5AE2` manifest renders `STAGE 8'X12'` header with `STAGE 4'X4' ×6` indented under it.

## June 16, 2026 — DOT inspection safety net — truckless primary-driver guard (ON `main`: `e8b26fe`; no migration)

Investigation found the DOT pre-trip didn't surface for a 1-driver/2-truck route because the gate keys on the signed-in driver's OWN `route_crew.truck_id` (`truck_is_own`), not the route trucks — a lone primary with a null crew-row truck fell through to "Join Route" and silently bypassed the pre-trip. Added a data-gap guard (no inspection logic touched). See CLAUDE.md → "DOT inspection safety net", `docs/CHANGELOG.md`, `tasks/lessons.md`.

- [x] Investigation (no code first) — traced `stopsLocked → truck_is_own → ownTruck → route_crew.truck_id`; root cause = silent pass when the per-driver crew-row truck is unassigned.
- [x] `truckUnassigned = !hasTruck && is_primary === true` (scoped to primary; co-drivers/soft-fail excluded) in both `DayRouteSelectorScreen` + `RouteListScreen` (fix-both mirror).
- [x] Home: CTA disabled + "Truck Not Assigned" + amber "Contact dispatch to assign your truck".
- [x] Route list: amber banner + stops non-tappable via `stopsTappable = !stopsLocked && !truckUnassigned` (closes the Routes-tab deep-link bypass; `stopsLocked` does NOT cover this case). **Darren-approved Option B.**
- [x] `tsc --noEmit` clean; `npx next build` green (38 pages); committed `e8b26fe`, pushed.
- [ ] **On-device gate:** put a driver in the 1-driver/2-truck state (lone primary, no crew-row truck) → Home CTA disabled + "Truck Not Assigned" + amber line; deep-link to `/route/[id]` → amber banner + stops dimmed/non-tappable. Confirm a no-truck **co-driver** (`is_primary === false`) is UNAFFECTED (normal "Join Route"). Confirm a normally truck-assigned primary is unaffected.
- [ ] **Upstream (DASHBOARD repo, separate):** decide whether dispatch should pin a truck to a lone crew row on a multi-truck route — that's the real data fix; this commit is only the driver-app guardrail. Flag to chat-Claude / dashboard session.

## June 15, 2026 — Ava Studio A4 — AVA Remembers Phase 2 (ON `main`: `3c92e9d`; migrations 026–027)

Driver-side freshness loop + single-visit notes + clear-site-notes over `ava_stop_notes`/`stop_visit_notes`. See CLAUDE.md → "Ava Studio — AVA Remembers Phase 2 (A4)", `docs/CHANGELOG.md`, `tasks/lessons.md`. **A4b (dashboard Site/Visit Notes panels) is a separate later dashboard-repo session.**

- [x] Mig 026 — extend `ava_stop_notes` (`created_by_role`/`status`/`last_confirmed_at`/`visit_count_since_added`; **`created_by` skipped** — `author_id` already exists) + freshness-confirm UPDATE policy + `ava_stop_notes_guard_foreign_update` column-guard trigger (skips when `auth.uid()` IS NULL). Applied + verified.
- [x] Mig 027 — `stop_visit_notes` + RLS (insert own; read super_admin-all/others-own). Applied + verified.
- [x] `POST /api/ava/stop-notes/archive-address` (service-role, archives all active rows for the `address_key`).
- [x] Freshness prompt — `runStopComplete` defers nav when an active note exists; non-dismissible Yes/Update modal; staleness qualifier where AVA surfaces the note.
- [x] Visit/remember segmented control in `AvaNoteSheet` (visit → `stop_visit_notes` + category, no photos).
- [x] "Clear site notes" button on Stop Detail (shown only when active notes exist) → confirm → archive. **Start Fresh VOICE command deferred** (no STT; mic is a stub).
- [x] `stopNotesClient` — reads filter `status='active'`; `getMostRecentActiveNote`/`confirmNoteFreshness`/`archiveAddressNotes`/`saveVisitNote`.
- [x] `tsc --noEmit` clean; `npx next build` green (38 pages); DB smoke (trigger/columns/visit table) ok; committed `3c92e9d`, pushed.
- [ ] **On-device live test (THE gate):** (a) add a site note ("Remember for future visits") at an address, complete that stop → the **freshness prompt** fires before you advance; **Yes, still good** advances (and `last_confirmed_at`/`visit_count` bump in DB); **Update note** opens the sheet pre-filled, and after you save/close you advance. (b) Add a **"Just for this visit"** note (pick a category) → it lands in `stop_visit_notes`, NOT `ava_stop_notes` (it should NOT appear as a durable PRIOR NOTE on the next visit). (c) **Clear site notes** (visible only when active notes exist) → confirm → all notes for that address archive, AVA stops showing them, and a "Site notes cleared" toast shows. (d) **Cross-author**: have driver B (not the note author) hit the freshness prompt and tap Yes → it succeeds (the freshness RLS policy + trigger permit it) and driver B canNOT edit the note text from anywhere. (e) Staleness: a note with `visit_count_since_added >= 3` and never confirmed reads with a "(Note from N visits ago)" prefix where AVA surfaces it.
- [ ] **chat-Claude / Notion ledger:** migrations 026–027 are driver-app-owned; next driver-app migration = 028.
- [ ] **A4b (separate dashboard session):** dashboard Site Notes panel + Visit Notes on the dispatch-board stop cards (reads `ava_stop_notes` active + `stop_visit_notes`; `created_by_role='dispatcher'` for dashboard-authored site notes).

## June 15, 2026 — AVA header chip wired + sheet copy fix (ON `main`: `15c6931`, `d84fa44`; no migration)

Tier 1 activation: the AVA header chip now opens the real `AvaConversationSheet` on every screen (was a "coming soon" placeholder). Plus a one-line empty-state copy update to reflect AVA's full knowledge scope. Wiring/copy only — no new components/routes/migrations. See CLAUDE.md → AVA Phase 1 invariants (AvaChip bullet) + `docs/CHANGELOG.md`.

- [x] Chip wired inside `AvaChip.tsx` (one change → all 6 screens); placeholder drawer + mic stub + toast removed; button visual/position untouched; mirrors `AskAvaButton`.
- [x] Context: `routeId = routes.length === 1 ? routes[0].route_id : null` from `useAppState()` (no prop drilling); `seedContext={{}}`. Graceful degradation when no unambiguous route.
- [x] Copy: `AvaConversationSheet.tsx:218` description → "Ask me anything — your route, stops, equipment, SOPs, or how we do things at PTR." (1 match in codebase).
- [x] `tsc --noEmit` clean; `npx next build` green (38 pages) both commits; only the one file changed per commit; pushed; **both Vercel READY**.
- [ ] **Browser/on-device tap-through (the gate):** tap the header chip on Home → `AvaConversationSheet` opens; close → chip tappable again; confirm the morning-brief "Ask Ava about today" + Training Hub SOP search Ava entry points still work (left untouched). Sanity-check the new empty-state copy renders.

## June 15, 2026 — Ava Studio Foundation A1 (ON `main`: `da3a352`; migrations 022–025)

Three new tables (`ava_knowledge`, `ava_knowledge_gaps`, `ava_vocabulary`) + `sop_entries` studio columns, plus knowledge injection & `UNKNOWN:` gap detection in `/api/ava/ask`. See CLAUDE.md → "Ava Studio Foundation — Session A1", `docs/CHANGELOG.md`, `tasks/lessons.md`.

- [x] Step 0 — read CLAUDE.md + route.ts; confirmed zero existing `ava_knowledge`/`ava_vocabulary`/`ava_knowledge_gaps` refs; recorded highest migrations (020/021 → new files start 022).
- [x] Migrations 022–025 written + applied to shared DB via `db query --linked --file` + `migration repair --status applied`. **Spec's `profiles.role` corrected to `'super_admin' = ANY(p.roles)`** (live DB has no `role` column — see lessons).
- [x] Verified counts: `ava_knowledge`=2, `ava_knowledge_gaps`=0, `ava_vocabulary`=25, `sop_entries` studio cols=4.
- [x] `/api/ava/ask` — 4 additions (vocab fetch, knowledge fetch, prompt sections + `UNKNOWN:` instruction in cached Block 0, gap detection with friendly-copy swap). `tsc --noEmit` clean; `npx next build` green (38 pages).
- [x] Committed `da3a352` (5 files only), pushed; **Vercel READY**.
- [ ] **On-device smoke (the gate):** (a) ask Ava a question using PTR jargon/aliases (e.g. "what's an MQ?" / "do I need wood blocks for a frame tent?") → answer reflects the seeded terminology. (b) Ask something genuinely unknowable from terminology/SOPs/knowledge → Ava returns the friendly "I'm logging your question…" copy (NOT the raw `UNKNOWN:`), and a row lands in `ava_knowledge_gaps` (deduped — asking twice doesn't double-insert). (c) Confirm route questions ("how many stops today?") still answer normally and do NOT falsely trip `UNKNOWN:`.
- [ ] **A2 (NOT started this session, per the locked spec):** the Studio editing/admin UI + answer-queue that consumes `ava_knowledge_gaps` and writes `ava_knowledge`/`ava_vocabulary`. Awaiting the A2 spec.
- [ ] **chat-Claude / Notion ledger:** migrations 022–025 are driver-app-owned (not dashboard mirrors); next driver-app migration = 026.

## June 15, 2026 — Co-driver realtime completion propagation (ON `main`: `13ef281`; no migration)

`dispatch_stops` had NO realtime subscription anywhere — the only channel watched `routes` (transfer state). A co-driver's stop completion wrote `dispatch_stops` correctly but never triggered a refetch on the primary's screen, so completions surfaced only by accident (mount / foreground / the driver's own completion). Fixed by adding a `dispatch_stops` UPDATE subscription in `AppStateProvider` (root layout, always mounted) — NOT a screen, because the App Router unmounts screens on navigation and a screen-scoped channel would drop the moment the driver opens a stop. See CLAUDE.md → "Co-driver realtime completion propagation", `docs/CHANGELOG.md`, and `tasks/lessons.md`.

- [x] Gate check — `dispatch_stops` IS in the `supabase_realtime` publication AND has `dispatch_stops_authenticated_read` (SELECT, `auth.role()='authenticated'`); RLS enabled. Both required (publication alone is a false green). No migration needed.
- [x] Subscription added in `AppStateProvider` (`src/context/AppStateContext.tsx`), keyed on the joined today's-route-IDs string; client-side route-id filter mirrors the proven `routes` channel; cleanup via `removeChannel`.
- [x] `npx next build` green (38 pages).
- [ ] **Two-driver on-device smoke (THE gate — realtime is false-green-prone, see lessons):** put Lucas (primary) and Dylan (co-driver) on the SAME route on two devices. Dylan marks a stop complete on his device → within a few seconds Lucas's screen must reflect the completion (the stop flips to completed and the per-stop progression gate advances) **while Lucas is sitting on StopDetailScreen / RouteListScreen — not just Home**. Test from each surface (Home, Route list, Stop detail) since the fix is provider-level and must survive navigation. Confirm the reverse direction too (Lucas completes → Dylan sees it).

## June 15, 2026 — Stop gate + optimistic completion + per-driver auto-ETA (driver `7bdd39c`; dashboard `31d6f66`/`88f25b5`/`3437e44`; Migration 097)

Three features from a locked spec + a pre-existing dashboard crash fixed. Both repos build green; the toggle is verified persisting (Cameron Keesler → DB `auto_send_eta = true`) and the crashed admin page renders again. Remaining gates are on-device/on-road.

- [x] Migration 097 (`profiles.auto_send_eta`) applied to shared DB + `migration repair` + both repos' `supabase.ts` patched.
- [x] Part 1 — optimistic completion + `ptd_complete_queue` (flush in `loadDay`); soft toast handed forward via `ptd_complete_toast`.
- [x] Part 2 — per-stop progression gate in `DayRouteSelectorScreen` + `RouteListScreen` (route-scoped, layered on inspection gate).
- [x] Part 3 — driver `fireAutoEta` + profile-cache refresh in `loadDay`; dashboard `PATCH /api/admin/drivers/[id]/preferences` + "Driver app settings" toggle. **Toggle write verified persisting.**
- [x] Bug fix — `/admin/drivers/[driverId]` Next-14 `use(params)` crash (React #438) fixed; `error.tsx` + `SectionBoundary` safety nets kept.
- [x] `npx next build` green both repos (driver 38, dashboard 56).
- [ ] **Auto-ETA live road test (THE gate for Part 3):** with Cameron Keesler (flag on) — he must open the app online once first so it caches the flag — complete a customer stop with **location services ON** → the NEXT customer should receive the OTW/ETA text automatically (and his manual Send ETA still works). With **location OFF**, completing a stop must silently send nothing. Confirm no toast/banner/indicator ever appears for the auto path.
- [ ] **Part 1 on-device smoke:** offline, mark a stop complete → it flips to completed locally, the gate opens, you advance to the next stop, and the "Stop saved — will sync when back online" pill shows on the next stop. Reconnect → `ptd_complete_queue` replays (the stop is `completed` server-side) and the banner clears.
- [ ] **Part 2 on-device smoke:** on a multi-stop route, only the current (first incomplete) stop is tappable; future stops are dimmed/untappable; completed stops are tappable (read-only) and dimmed to 0.6; the warehouse_return depot is always reachable. Pre-inspection, the inspection gate still locks everything first.
- [ ] **Known by-design:** a driver who hasn't opened the app online since this deploy won't have a refreshed `ptd_profile_*` → `auto_send_eta` takes effect on their next online Home load, not necessarily mid-session.

## June 15, 2026 — Will Call return queue undercount fix (ON `main`: `30bc068`; no migration)

Return/due-back queue was status-driven (`awaiting_return` only) → `picked_up` orders due back today were silently dropped vs. the date-driven dashboard board. Fixed client-side in `WillCallListScreen.tsx` by wiring `returnByIso` (already in `format.ts`) into `matchesFilter` + the section split. Build green. See CLAUDE.md → "TapGoods Item Check-Off" sibling note in the Will Call Phase 1 block, and `docs/CHANGELOG.md`.

- [x] Fix 1 — `matchesFilter`: `picked_up` orders filter on due-back date (`returnByIso`), not pickup date.
- [x] Fix 2 — section split: `picked_up` + due-back-today → ACTION NEEDED (with `awaiting_return`); future-return → OUT WITH CUSTOMERS.
- [x] `npx next build` green (38 pages).
- [ ] **On-device smoke (the gate):** load `/will-call` as a `will_call` holder → default Today filter's return queue shows ALL `picked_up` orders due back today PLUS all `awaiting_return`, count matching the dashboard board. (Needs ≥1 `picked_up` order whose `checkin_window_end` is today — verify live data has one before testing; per the 2026-06-14 verification pass there were 8 `picked_up` rows.)
- [ ] **Optional follow-up (cosmetic):** a `picked_up`-due-today card renders in ACTION NEEDED with its normal `picked_up` chrome (muted "Returns: Today", default border, not the red overdue border). Flag visually only if Darren wants it after seeing it on device.

## June 15, 2026 — Will Call `awaiting_return` overdue-treatment fix (ON `main`: `9e02159`; no migration)

`awaiting_return` cards were always painted red/overdue, but that status only means the return-reminder SMS fired today — not that the order is late. Split into red (due-back date passed) vs. amber "Due Back" (due today/future) in `OrderCard`, switching all three overdue cues (border + pill + line label) together. One file, styling/label only. See CLAUDE.md → Will Call block, and `docs/CHANGELOG.md`.

- [x] `OrderCard` splits `awaiting_return` on `dateKey(returnByIso(order)) < today`; null due-back date fails safe to amber.
- [x] Custom inline amber pill for the not-late case (the `StatePill` atom is status-keyed → would stay red); shared `STATE_PILL` map + `ProgressSteps` untouched.
- [x] `npx next build` green (38 pages).
- [ ] **On-device smoke (the gate):** needs ≥1 `awaiting_return` row — the dashboard must flip an order to `awaiting_return` first (per 2026-06-14 verification, prod had 0). Then confirm: due-back date today/future → amber border + "Due Back" pill + amber "↩ Due back:" line; due-back date passed → red border + "Return Overdue" pill + red "↩ Return due:" line.

## June 14, 2026 — PWA v2.0.0 + v2.0.1 offline fixes (ON `main`; no migration)

PWA update prompts shipped, then a run of on-device iOS offline smoke-test fixes. Commits: `9cad572` (reinstall/update-waiting/what's-new prompts, v2.0.0), `473879f` (offline auth restore from cached user + warm route shells, v2.0.1 — FAILURE A/B), `68ff739` (inspection gate offline-scoped so stop cards stay tappable), `f168c96` (Home offline loading-hang — `loadDay` offline fast-path + 10s timeout), `3744848` (strip HTML from staff note in Before You Go sheet). In-app `VERSION` stays `2.0.0` (fixes, no new What's New sheet). See CLAUDE.md → "PWA Update Prompts" + its v2.0.1 follow-up block, and `docs/CHANGELOG.md`.

- [x] Reinstall banner (iOS Share-sheet / Android Chrome ⋮ branched), SW update-waiting banner (`skipWaiting:false`), What's New sheet, all coordinated so they don't stack.
- [x] Offline auth: `ptd_auth_user` cache + synchronous offline restore before the 3s safety timer; cleared on all 4 signOut sites.
- [x] Offline nav: warmed `/route/*` shells + SW `text/html` rule + cold-boot rehydrate.
- [x] Offline gate/loading fixes: `!isOfflineMode` on `stopsLocked` (both screens); `loadDay` offline fast-path + fetch timeout; `useInspectionStatus` offline sentinel.
- [ ] **On-device re-test (the merge gate).** Darren reported "90% there" then the loading-hang + tappability fixes landed. Re-run the full offline matrix on iOS standalone AFTER a fresh deploy + one online load (warming + SW activation are prerequisites): (1) load online → airplane mode → tap Routes → route list renders, cards tappable; (2) iOS home-button background → return → no black `/offline`, no stuck spinner; (3) force-close → reopen offline → restores (not `/login`) within access-token lifetime; (4) reconnect → banner clears, queues flush. Known by-design limits: expired-token-offline → offline `/login`; pre-deploy logins have no `ptd_auth_user`/cache until one online session.

## June 14, 2026 — PWA Session B (ON `main`: `f23e314` + `27751f4` + `8af77e5`; no migration)

Offline data layer over the existing `/api/routes` payload — the one response carries the whole day (route list + every stop's detail/manifest + coords), so caching it covers list + detail + Navigate. No new endpoints, no Supabase calls, no schema. Three commits: route cache + banner + connectivity (`f23e314`), offline auth (`27751f4`), iOS loading-hang fix (`8af77e5`). New localStorage keys: `ptd_route_<date>`, `ptd_route_cache_date`, `ptd_profile_<userId>`. Build green throughout. See CLAUDE.md "Offline Data Layer — PWA Session B".

- [x] **Investigation-first** confirmed `/api/routes` is the single full-day payload; the three StopDetail mount-time calls (SMS status, cash-collections, checkoff probe) are status overlays that fail closed offline and were deliberately NOT cached; Navigate makes zero network calls.
- [x] **Tests mostly passed (Darren, 2026-06-14).** iOS standalone still "a little glitchy" — **moved on; cleanup deferred to a later session** (below).
- [ ] **Future — iOS offline cleanup session (deferred by Darren 2026-06-14):** the airplane-mode cold-start path is functional (3s hard timeout guarantees `loading` resolves; non-expired token restores ~1.2s, expired → offline notice ~2.4s) but iOS standalone remains slightly glitchy on-device. Worth a dedicated pass: instrument whether `getSession()` blocks before the race awaits; consider reading the supabase storage key directly to skip the refresh attempt entirely; revisit whether the 1.2s race / 3s backstop windows feel right on a real handset. iOS-WebKit timing — must be tested on the installed PWA, not in a desktop build.
- [ ] **Smoke — happy path (on-device):** load route online (cache writes `ptd_route_<today>`), kill network, force-quit + relaunch → cached route renders, amber "Offline — showing last saved route" banner shows on Home/Route/Stop (NOT on Tools/Will Call/Profile), Navigate opens the maps deep link. Reconnect → banner clears, OTW + checkoff queues flush via the existing `loadDay` success path.
- [ ] **Smoke — offline auth restore:** within the access-token lifetime, force-quit online-authed app → relaunch offline → app restores straight to the route (no login bounce), roles intact (Fleet/Will Call/etc. gates resolve from `ptd_profile_<userId>`).
- [ ] **Smoke — offline no-session:** offline cold-start with an expired/absent token → LoginScreen shows the "You're offline — open the app while connected first" notice (NOT the form); reconnect → form returns automatically.
- [ ] **Known limitation (by design):** expired access token offline → offline notice (can't refresh offline); a driver whose last login predates this deploy has no `ptd_profile_*` yet → first offline cold-start could show "Access denied" until one online session re-caches. Self-heals.

## June 14, 2026 — PWA Session A (MERGED to `main`: PR #4 `4b1688e`; no migration)

App is now an installable PWA: manifest, branded icons (PTR Work), Serwist service worker (app-shell precache + NetworkFirst nav, `/api` & Supabase never cached), offline page with reconnect auto-reload, `statusBarStyle: 'black'`. BottomNav has **zero net change** from its pre-session state (two safe-area attempts made and both reverted). Build green. See CLAUDE.md "PWA / Offline Shell" + "Session A follow-up fixes".

- [ ] **On-device standalone smoke (THE gate — iOS):** Add to Home Screen → confirm it installs with the PTR Work icon + name, launches in standalone chrome (no Safari UI), shows the `#1F46FF` theme color, and the status bar (`black`) does NOT collide with the Dynamic Island.
- [ ] **Smoke — maskable icon:** on Android (or iOS shortcut), confirm the maskable icon's mark sits inside the safe zone (no clipping under a circle/squircle mask).
- [ ] **Smoke — offline page + auto-reload:** airplane-mode a cold navigation → `/offline` shell renders (black/gold "You're offline"); turn network back on → the page reloads itself (the `online` listener in `ReloadOnReconnect.tsx`).
- [ ] **Smoke — SW caching boundaries:** confirm app shell loads offline (precached JS/CSS) but `/api/*` and Supabase calls still go to network (never served stale) — DevTools → Application → Service Workers / Cache Storage.
- [ ] **Smoke — dark-screen safe-area gap (KNOWN, deferred):** in standalone, eyeball Fleet / Reference / WillCall-detail at the home indicator — a small color strip below the nav is the documented pre-existing condition, NOT a Session A regression. Confirm it's only cosmetic; the real fix is a future safe-area audit (touches globals.css `.screen` + the 8 non-nav screens).
- [ ] **Future — safe-area audit session:** resolve the dark-screen nav gap properly. Root cause: globals.css `.screen` reserves its own `padding-bottom: env(safe-area-inset-bottom)` below the cream nav, painted in each screen's own bg. Clean fix must also preserve the 8 `.screen` screens that render NO BottomNav (LoginScreen, InspectionScreen, ArcadeHub, LogServiceEntryScreen, the four WillCall flows) whose bottom CTAs rely on that inset. Verify on-device.
- [x] **Session B candidate — offline route data:** DONE (PWA Session B, 2026-06-14, `f23e314`+). Route-payload cache via `loadDay`/`localStorage` (the SW still never caches `/api/routes` — this is an app-layer cache, not an SW cache). The `/offline` copy promise can now be revisited if desired.

## June 12, 2026 — Will Call Phase 1 (PUSHED: driver `3f7d01a`, dashboard `cb9453f`; no migration)

Six warehouse-counter screens + dashboard auth retrofit + driver read route + `will_call` nav swap. Both builds green + pushed. Spec: `docs/design-references/WillCallMockup.jsx` (committed `e856b9a`).

**Verification pass 2026-06-14 (no code change):** code paths + deploy + DB prereqs + dashboard auth gate ALL verified green (see CHANGELOG). The remaining open items below are the **live, side-effecting tap-through** (fire real customer SMS + dispatch@ email) — Darren's on-device gate, can't be driven autonomously on prod. Targeting from live DB: staging test → pending **"LUKE MORIZET - 6/20 customer pickup"** (family order, safer than texting a stranger); pickup test → staged **Joseph Tresca**; return test → a `picked_up` order (prefer a throwaway/test order — Victoria liebson / Patti Tilford are real customers). **`awaiting_return` has 0 rows** → the "Return Overdue" red-border + overdue-banner path can't be tested until the dashboard flips an order overdue.

- [x] ~~**Grant the `will_call` role**~~ — confirmed 2026-06-14: 5 active holders (Darren, Dylan, Jon Bartolomeo, Joey Paradise, Melissa); Darren active with the role. Darren (super_admin) reaches `/will-call` by URL but gets no nav tab (strict `will_call`, code-confirmed).
- [x] ~~**Code-path / deploy / dashboard-auth verification**~~ — done 2026-06-14: all 6 screens + gates + cross-app bearer POST + `requireWillCallAccess` (gate + CORS + OPTIONS on all 4 routes; plain-driver → 403) verified via Explore agent (20/20 PASS); `next build` green; `/will-call` HTTP 200 on prod `main`. See CHANGELOG.
- [ ] **Smoke — nav swap:** a `will_call` holder sees Home · Routes · Tools · **Will Call** · Profile (Training gone from nav, Training card appears in Tools Hub → opens `/training`). A non-holder sees the unchanged nav and NO Will Call tab; Tools Hub shows no Training card.
- [ ] **Smoke — list:** `/will-call` defaults to Today (pickup today OR overdue); This Week = next 7 days; All shows everything incl. last-7-days returned under COMPLETE. Overdue card = red border + "Return Overdue" pill; staged = blue border + "Staged — Ready".
- [ ] **Smoke — staging flow:** pending order → "Start Staging →" → check-off (NO damage toggle anywhere; qty stepper shorts → amber circle with corrected number) → "Confirm Staging Complete" → **staging SMS/email fires** (check `sms_sent_at`/`sms_error` on the row) → back on detail as Staged — Ready.
- [ ] **Smoke — pickup flow:** staged order → "Customer Arrived — Confirm Handoff" → identity card + items + plate-photo stub (Skip dismisses, no camera) → "Mark as Picked Up" → detail shows Out w/ Customer, `picked_up_at`/`picked_up_by` stamped.
- [ ] **Smoke — return flow (clean):** picked_up order → "Process Return" → "All items back — no issues" → "Complete Return" → Return Done recap → return-confirmation SMS fires, `has_discrepancy=false`, `return_notes` NULL.
- [ ] **Smoke — return flow (exceptions):** short one item + damage-flag another → return notes land on the row (one line per exception), `has_discrepancy=true`, **discrepancy email reaches dispatch@**, recap shows both lines.
- [ ] **Smoke — auth gates** *(code-confirmed 2026-06-14: gate + CORS + OPTIONS present on all 4 routes, role set `will_call|warehouse|scheduler|super_admin`, plain-driver → 403; live regression check still worth one runtime hit):* a plain-driver token POSTing a dashboard `/api/willcall/[id]/*` route gets 403 (was: any authed user accepted). The dashboard Will Call board itself still works for warehouse/scheduler/super_admin (cookie path through the same gate — regression check).
- [ ] **Smoke — refresh model:** dashboard stages an order → driver list updates within ~30s or on app refocus (NO realtime — by design).
- [ ] **Phase 2 candidates (deferred by plan):** per-item check-off DB rows, real camera/upload for the plate photo, staged-location capture driver-side (route already retrofitted), actual work-order creation from the damage flag (today it's a return-note line; dispatch opens the WO from the email).

## June 10, 2026 PM3 — Check-off inline panel compaction (PUSHED: `beca737`; layout-only)

- [ ] **Darren phone re-test (THE gate):** stop detail during check-off shows noticeably more than 4 item rows; gate CTA still pinned (never scrolls away) and compact; no dead band between the "Saved on your phone…" caption and the tab bar; all check-off interactions unchanged (confirm-all, tap-accept, qty stepper, damage toggle, WO round trip).

## June 10, 2026 PM — Check-off live-test revisions 1–3 (PUSHED: driver `8869246`, dashboard `8c8fbcf`; no migration, high-water stays 096)

Rev 1 inline check-off + single gated CTA (sheet retired → `ItemCheckoffPanel`), Rev 2 co-driver permission fixes (`truck_is_own` inspection lock, ex-primary-only transfer lock, `canComplete` co-driver carve-out, handoff-state cleanup at warehouse_return, empty-crew loud guard), Rev 3 silent accessory/add-on full-qty sweep (dashboard). Both builds green + pushed. **Supersedes the "gate is hard" smoke item below (the sheet no longer opens — the gate is the CTA itself).**

- [ ] **Darren live re-test (THE gate), order `#0A819C5A` or fresh:** stop detail shows the check-off list inline at the bottom (no tap to open); bottom CTA reads "Confirm N items to complete" disabled → confirm all → "Complete Stop → Next" → ONE tap completes and advances. TapGoods shows real quantities AND every accessory/add-on Picked/Checked-in in full (order leaves "Partially Picked"). **Note: the accessory sweep needs one TapGoods sync cycle after the dashboard deploy to populate `reservations.tapgoods_data` with the new fields — sync first, then test.**
- [ ] **Smoke — co-driver (Rev 2, two devices):** co-driver on a single-truck route sees the stop list UNLOCKED (no gray), taps stops, checks off, completes. With a transfer active to a third party, the co-driver STILL completes; only the ex-primary sees "Transferred to [Name]" + loses completion. ETA SMS stays primary/active-only on both devices.
- [ ] **Smoke — handoff-state cleanup (Rev 2):** after warehouse_return completes (geofence or manual), `routes.active_driver_id` + `transfer_pending_to` read NULL (check the row). The test route's stale `active_driver_id = Lucas` clears on its next route end — or clear it manually once: `UPDATE routes SET active_driver_id = NULL, transfer_pending_to = NULL WHERE active_driver_id IS NOT NULL AND route_date < CURRENT_DATE`.
- [ ] **Smoke — two-truck route (Rev 2 trade-off check):** each driver still gets "Inspect & Start Route" for their own truck; note the co-driver's stop list is no longer hard-locked pre-inspection (accepted trade-off — never hard-lock co-drivers; the CTA still walks them through the pre-trip).
- [ ] **Smoke — COD funnel (Rev 1):** COD delivery → CTA tap → check-off commits → cash modal → complete. One funnel preserved.
- [ ] **Smoke — WO round trip (Rev 1):** damage toggle → "Open repair work order" → form pre-filled → submit → back on stop detail the inline line shows the WO chip (no sheet reopen needed) and the draft survived.
- [ ] **Smoke — accessory sweep silence (Rev 3):** accessories appear NOWHERE driver-side or dashboard-side (no manifest line, no board line) — verify by eyeball on a tent order; only TapGoods shows them swept.

## June 10, 2026 — TapGoods Item Check-Off, driver UI (PUSHED: driver `ec2fe6e`; dashboard side pre-shipped `87c75f2` + mig 096 applied)

Hard completion gate on delivery/pickup stops: every item line confirmed (Confirm-all / tap-accept / qty-corrected / damage-flagged) before Mark Complete; real quantities write back to TapGoods via the dashboard route; shorts email Melissa once per stop; damage pre-fills the Report-an-issue form. Build green + pushed. **Darren's live test is the completion gate — do NOT mark this feature done on build-green.**

- [ ] **Darren live test (THE gate):** real delivery → confirm items (try one short + one damaged) → Mark Delivery Complete. Verify (1) TapGoods shows the real picked quantities with status `in_use`, (2) the discrepancy email lands at dispatch@ with item/short-qty/stop position, (3) the repair work order exists with the item pre-filled and the `stop_item_checkoffs` row carries its `work_order_id`. Repeat on a pickup (→ `checked_in`).
- [ ] **Smoke — happy path:** delivery with all-good items → "Confirm all" → gate button enables → complete. `stop_item_checkoffs` rows land (full qty, no damage), `dispatch_stops.tapgoods_writeback_at` stamps, no email.
- [x] ~~**Smoke — gate is hard:** tap Mark Stop Complete with unconfirmed items → check-off sheet opens~~ — SUPERSEDED by Rev 1 (2026-06-10 PM): the sheet is gone; the gate is the inline CTA itself (disabled until all lines resolve). See the section above.
- [ ] **Smoke — COD funnel order:** COD delivery → items first, then the cash modal, then complete. Cash gate behavior itself unchanged.
- [ ] **Smoke — co-driver:** a co-driver (no transfer active) can check off + complete (existing completion rights preserved). After a Phase 2B handoff, the non-active driver cannot (canComplete blocks — unchanged).
- [ ] **Smoke — offline/queue:** airplane mode at commit → sheet still commits (local), completion fails with the existing connection message; on reconnect + app-load the queue flushes (audit rows + write-back land). Also verify a `200 {synced:false}` (TapGoods down) re-queues and the discrepancy email does NOT duplicate on retry (server stamp).
- [ ] **Smoke — warehouse_return untouched:** depot geofence auto-complete still fires with no check-off; manual depot Mark Complete shows the plain confirm modal.
- [x] ~~**Types regen (cleanup)**~~ — done 2026-06-10 PM: regen against the live schema (`--project-id`; repo is NOT `supabase link`ed, `--linked` fails) diffed **byte-for-byte identical** to the hand-patch. No drift; committed file was already canonical; build green.
- [ ] **Live-test retest (after device relaunch):** first live test saw no check-off sheet — root cause was the DEVICE running the pre-deploy bundle (feature deploy went Ready 14:46 EDT; no service worker, but an app session opened earlier keeps old JS in memory until force-quit). Verified clean: prod serves `ec2fe6e` (marker string found in live chunk), gate logic correct, test stop `#0A819C5A` has 3 item lines ALL with non-null `tapgoods_pick_list_item_id`, zero checkoff rows / never completed. **Force-quit + relaunch the PWA, then rerun the live test.** If it fails again post-relaunch: capture what appears on tap (old confirm modal vs nothing — discriminates gate-evaluated-false vs render gate).
- [ ] **`.env.local` restore + token hygiene (Darren):** the file had been wiped to just `VERCEL_OIDC_TOKEN` (a dev-scope `vercel env pull`). Rebuilt from the production pull, but ALL sensitive vars (SUPABASE_SERVICE_KEY, TAPGOODS_API_KEY, ANTHROPIC_API_KEY, TOMORROW_IO_API_KEY, NEXT_PUBLIC_ELEVENLABS_API_KEY) pull EMPTY from Vercel — paste real values back for full local dev (anon key + URLs were recovered, they're public). **Also: `SUPABASE_ACCESS_TOKEN` now sits in `.env.local` — remove or rotate it once CLI work is done** (management-API credential; gitignored but broad-powered).
- [ ] **Pending Joe @ TapGoods:** Option B short-pickup quantity shape (`pickedQuantity` stays at ordered). One-line swap server-side in `pickListLine()` — dashboard repo, not here.

## June 9, 2026 — Warehouse IN TRANSIT writer (PUSHED: driver `eaedfb2`, dashboard `ff5c8eb`; schema mig 095 applied to shared DB)

`routes.actual_departure_at` is stamped on route start (`POST /api/routes/[routeId]/depart`), so the warehouse Overview 5-stage tracker + the warehouse board `'out'` column advance on departure. Both repos built green + pushed to `main`. DB-level smoke (rolled-back txn `pulled→in_transit`; dev-server `401`/`405`) done — device-level flow still to verify.

- [ ] **chat-Claude — reconcile mig 095:** add `routes.actual_departure_at` (mig 095) to the Notion migration ledger. Dashboard mirror `20260609200000_095_routes_actual_departure_at.sql` is committed + marked applied in the shared tracker — do NOT `supabase db push` it. Next dashboard migration = 096.
- [ ] **Smoke test — fresh inspection path:** complete a pre-trip on a real route with a clear/non_oos outcome, tap the completion CTA. Confirm `routes.actual_departure_at` stamps (check the row) and the dashboard warehouse Overview shows that route at **IN TRANSIT** + the warehouse board column flips to **OUT**.
- [ ] **Smoke test — already-inspected "Start Route" path:** inspect, return to Home, tap "Start Route". Confirm the stamp fires here too (best-effort, fire-and-navigate).
- [ ] **Smoke test — OOS does NOT stamp:** complete a pre-trip that fails out-of-service; confirm the CTA navigates but `actual_departure_at` stays null (truck is hard-blocked, not departing).
- [ ] **Smoke test — "Join Route" does NOT stamp:** a no-truck co-driver tapping "Join Route" must not stamp departure (and the endpoint would 403 them anyway — primary/active only).
- [ ] **Smoke test — idempotent:** re-tap a start CTA / re-hit the endpoint on an already-departed route → returns the existing timestamp, no overwrite.

## June 9, 2026 — Phase 2B: Route Handoff (ON `main` / origin; schema mig 093 applied to shared DB)

Driver-to-driver mid-route transfer. Owner offers → recipient accepts (takes over ETAs/SMS/completion) or declines. Schema columns `routes.active_driver_id` + `transfer_pending_to` applied from this repo as mig 093 (recorded at `supabase/data-patches/2026-06-09_route-handoff-093-columns.sql`). **Needs two devices / two crew accounts on the same route to test.**

- [ ] **chat-Claude — reconcile mig 093:** the prompt said the columns shipped with mig 092 but they did not exist; applied here as 093 per the locked Notion spec. Mirror the DDL into the dashboard repo's numbered migration 093 and fix the Notion migration ledger (092 stays = warehouse_return sentinel).
- [ ] **Smoke test — initiate + accept:** sign in as the route's primary on device A; "Transfer Route" appears below the stop list. Tap → picker lists the OTHER crew (not self). Pick a co-driver. Device A shows "Waiting for [Name] to accept". Device B (the co-driver), without refreshing, sees the "[Name] is offering you Route N" card appear (realtime). Tap Accept → device B becomes owner (ETA/SMS/Mark Complete available), device A's stop screens show ETA/SMS hidden + Mark Complete hidden + "Transferred to [Name]".
- [ ] **Smoke test — decline:** repeat initiate; on device B tap Decline. Device B's card disappears; device A returns to showing "Transfer Route" (state back to Idle). No ownership changed.
- [ ] **Smoke test — completion gate is active-transfer-only:** BEFORE any transfer, confirm a co-driver can still Mark Complete a stop (Phase 2A behavior preserved). AFTER a transfer, the non-active original primary cannot complete (button hidden; `runStopComplete` blocks with a "transferred" message).
- [ ] **Smoke test — re-transfer, no reclaim:** after B accepts, B sees "Transfer Route" and can offer it onward (e.g. back to A). The original primary A canNOT reclaim — A has no owner actions while `active_driver_id` ≠ A.
- [ ] **Smoke test — Melissa unaffected:** dashboard route view shows nothing new; no WIW writes.
- [ ] **Edge — soft-fail:** if `/api/routes` hits its crew-read soft-fail (no crew row, `is_primary` undefined), with no transfer active the user still sees owner actions (`isActiveDriver` treats undefined `is_primary` as owner). Confirm a transient read miss never strips a real primary.

## June 6, 2026 — wall→ladder `dependency_map` data patch (direct to `main`, `eac74f0`; no build — data only)

Production `dependency_map` Ladders rule broadened: `keyword` `sidewall`→`wall`, `quantity_threshold` 5→1, `required_quantity` 2→1. Applied to prod + recorded at `supabase/data-patches/wall-ladder-threshold-fix.sql`. Triggered by Dylan Morizet's missing-ladder report on a `40x80` pole-tent pickup (walls named `MQSW … SOLID WHITE WALL`).

- [ ] **Smoke test — wall→ladder fires (`eac74f0`):** a route with **any** stop carrying a wall item (`sidewall`, `solid white wall`, `wind wall`, qty ≥ 1) → morning checklist "FOR TODAY'S ROUTE" shows **Ladders** (qty 1). Confirm it fires with a single wall (not the old 5-wall threshold) and that the `MQSW … SOLID WHITE WALL` case specifically now triggers it.
- [ ] **Smoke test — no over-broadening:** a route with **no** wall items → Ladders does NOT appear. Spot-check that no non-wall item name accidentally contains the `'wall'` substring and false-triggers.
- [ ] **Rebuild durability:** if the DB is ever rebuilt, re-apply `supabase/data-patches/wall-ladder-threshold-fix.sql` (the Migration 016 seed restores the old `sidewall`/threshold-5 row; the patch's `WHERE` keys off `trigger_type+required_item` so it re-corrects it).

## June 3, 2026 — Warehouse notes surfacing, route + stop level (direct to `main`, `de05529`; `npx next build` green; Vercel READY)

Fetch + display + AVA wiring only — no schema changes (columns pre-exist: `dispatch_stops.warehouse_notes` mig 077, `routes.warehouse_notes` mig 078). Needs a route/stop carrying warehouse notes to test (dispatcher/warehouse sets them dashboard-side).

- [ ] **Smoke test — Home WH pill (Step 2):** a stop with a warehouse note shows a blue outlined `WH` pill on its Home card (visible without tapping), distinct from the red WIND and gold COD pills. A stop with no warehouse note shows no WH pill.
- [ ] **Smoke test — route-start FROM WAREHOUSE sheet + TTS (Step 3):** a route with `routes.warehouse_notes` set → tapping "Inspect & Start Route" opens the dark "Before you head out" sheet **before** the inspection screen, showing the full warehouse note (FROM WAREHOUSE first, FROM DISPATCH second if a route dispatcher note exists) and **reading the warehouse note aloud automatically** (no tap). "Got it — Start Inspection" proceeds into the pre-trip. A route with NO warehouse note → tapping goes straight to inspection (no sheet). **iOS check:** confirm ElevenLabs (not the robotic Web Speech fallback) plays — if it falls back, the AudioContext wasn't unlocked yet this session (tap "Hear your morning brief" first, then retry).
- [ ] **Smoke test — morning-brief awareness line (Step 4):** a route with a warehouse note → the AVA morning brief includes "There's a warehouse note for your route. You'll hear it when you start." (spoken + displayed). A route with only a warehouse note (no stats/checklist/dispatcher note) → the brief card still appears (warehouse note is a visibility trigger). Full note text is NOT in the brief.
- [ ] **Smoke test — stop-note ordering (Step 5):** on Stop Detail AND the pre-launch notes sheet (`StopNotesPreSheet`), for a stop with both notes, **FROM WAREHOUSE renders ABOVE the dispatcher note** (was below).

## June 2, 2026 — AVA Session 3: SOPs in conversation + role-based access scoping (direct to `main`, `1a1d714`/`64356dd`/`48d5487`; `npx next build` green)

Investigation-first session. No new migration; no UI changes. New libs: `src/lib/ava/sopVisibility.ts` (shared driver-visibility) + `src/lib/ava/access.ts` (`isElevatedRole`). **Not yet smoke-tested against live Haiku — needs an authed session on the deployed build.**

- [ ] **Smoke test — SOP visibility fix (`1a1d714`):** Training Hub → "Look up an SOP" now lists **7** SOPs (001 Gooseneck, 003 Load Securement, 005 Incident, 006 Vehicle Accident, 008 Inflatables, 009 Anti-Shortcut, 010 Tent) — was only 005/008/009. Forklift (002), Chair Return (007), Scheduling (004) stay hidden. (Root cause was the `\b(driver…)\b` regex missing the plural "Drivers"; data was always complete — all 10 in `sop_entries`.)
- [ ] **Smoke test — AVA answers procedural questions (`48d5487`):** as a driver, open "Ask Ava about today" → ask "how do I hook up the gooseneck trailer?" → AVA answers from SOP-001 in plain spoken language and does **NOT** say "per SOP-001." Ask "what do I do after a vehicle accident?" → answers from SOP-006. Ask something with no SOP + not in today's route → she says she doesn't have it / check dispatch (no invented steps).
- [ ] **Smoke test — role scoping (`48d5487`):** as a **driver**, ask AVA about a warehouse-only procedure (forklift inspection / chair return cleaning) → she has no detail (those SOPs aren't loaded for drivers). As a **super_admin**, ask the same → she answers from SOP-002 / SOP-007. (Role read server-side from `profiles.roles`; elevated = `super_admin`.)
- [ ] **Verify prompt-cache hit (optional, logs):** repeated AVA questions in one session should show `cache_read_input_tokens > 0` on the Haiku call — block 0 (persona + SOP base, ≥4096 tokens) is the cached prefix.

## June 2, 2026 — dependency_map data patches + AVA voice copy (direct to `main`, `12c2a91`/`f4785cd`/`3ef660e`; `npx next build` green)

Data/copy only — no schema, no new migration. DB changes recorded under `supabase/data-patches/`. **A fresh DB rebuild re-runs the migrations, so the two data-patch `.sql` files must be re-applied after any rebuild** (they're re-runnable / idempotent-safe).

- [ ] **Smoke test — Pry bar trigger (`12c2a91`):** a route with an MQ cross-cable frame tent (name contains "CROSS CABLE") → morning checklist "FOR TODAY'S ROUTE" includes **Pry bar** (no sub-note). A route whose only tents are pole/keder/legacy/traditional (no "cross cable" in the name) → **Pry bar does NOT appear**. (Was firing on every TENTS-category item.)
- [ ] **Smoke test — checklist notes cleanup (`12c2a91`):** open the morning checklist → Hammer reads "Tent setup", Sledgehammer "Drive tent stakes", Wood blocks "Not needed for frame tents", Ladders "5+ walls threshold" — none show migration/fix/interview text.
- [ ] **Smoke test — tent Hammer drop (`f4785cd`):** tent-only route → **Sledgehammer only** (no Hammer). Inflatable-only → **Hammer + Hand truck**. Tent + inflatable → **Hammer + Sledgehammer + Hand truck**.
- [ ] **Smoke test — AVA morning copy second-person (`f4785cd` + `3ef660e`):** with `personality_preference='personality'`, a routine 1-stop day reads e.g. "You've got one stop today. Quick win." and a routine 2–3-stop day reads e.g. "You've got two stops today. Quick one. Let's roll." (second person, no em dashes). COD / tent / 4+-stop / weather lines unchanged.

## June 2, 2026 — Log Service UX fix (direct to `main`, `52f4016`; `npx next build` green)

- [ ] **Log Service fix (52f4016) — smoke test compliance POST protection:** force `complianceUpdateFailed` by unsetting `NEXT_PUBLIC_DASHBOARD_URL` locally, log a compliance service type, confirm (1) service record saved once, (2) FleetServiceToast appears at destination, (3) no duplicate on retry.

## June 2, 2026 — Three driver-app fixes (direct to `main`, `e41c976`; `npx next build` green; Migration 021 applied + repaired)

- [ ] **Smoke test — Fix 1 (Home post-inspection flow):**
  1. Pre-inspection Home: the "REQUIRED FIRST / Pre-trip inspection" card is GONE; the only inspection trigger is the gold "Inspect & Start Route" bottom CTA. The stop list shows but is dimmed/non-tappable.
  2. Tap "Inspect & Start Route" → complete the inspection → its final CTA lands you on the **Route page** (`/route/[id]`), NOT Home.
  3. Return to Home: the stop list is STILL there (not cleared/hidden), now full-opacity and tappable; the bottom CTA reads **"Continue route"** and jumps to the Route page. (AVA brief / weather / Ask Ava stay hidden post-inspection — intentional, stop-list-only persistence.)
  4. Complete a stop → on BOTH Home and the Route list its numbered circle flips to an ink fill with a gold checkmark.
- [ ] **Smoke test — Fix 2 (zip-ties note):** open the morning checklist → the "Zip ties" always-carry item no longer shows the "Dylan interview May 24" sub-note.
- [ ] **Smoke test — Fix 3 (tent tools):** a route with a tent item → morning checklist "FOR TODAY'S ROUTE" includes **Hammer + Sledgehammer** (plus the existing Pry bar). A route with an inflatable → Hammer + Hand truck. A route with BOTH → Hammer (once), Sledgehammer, Hand truck, Pry bar.
- [ ] **Tent detection caveat (Fix 3):** the new rules use `category='TENTS'` exact match (same as the Pry bar rule), so a stop carrying only TENTS-category accessories (sidewalls/walls, no actual tent) will also pull Hammer + Sledgehammer. Matches the existing Pry bar behavior; revisit only if a walls-only stop wrongly triggers tent tools in practice.

## May 31, 2026 — AVA Phase 2 — Session 2: Haiku conversation sheet + SOP search (MERGED to `main`, merge `02abfc6`; branch deleted)

Two deliverables + two follow-up fixes, all merged to `main` and the branch deleted (local + remote). `npx next build` green throughout and on the merged `main`. Prod SOP sync ran (`{synced:10}`). Migration 020 (`sop_entries` RLS) applied to the linked DB. **Pending: production smoke test on the live `main` deploy.** Next AVA work → a new `feature/ava-phase2-sN` branch.

- [x] ~~**Merge to `main`**~~ — done 2026-05-31 (`--no-ff`, merge `02abfc6`); branch `feature/ava-phase2-session2` deleted local + remote.
- [ ] **Production smoke test — Fix 1 (morning brief copy + tent threshold):** brief reads numbers as words ("two stops", "three tents") and 10+ as digits; no em-dash run-ons (natural pauses when read aloud); says "tents" not "canopies". A day with 2–4 tents gets a plain stop/COD line (NO "big tent day"); the heavy framing only appears at 5+ tents.
- [ ] **Production smoke test — Fix 2 (warehouse_notes):** on a stop with `warehouse_notes` set in the dashboard → Stop Detail shows a blue "FROM WAREHOUSE" block below "Note from dispatch"; navigating/Send-ETA pops the pre-launch sheet with a "FROM WAREHOUSE" section after the dispatcher note. Morning brief "N of your stops have notes" counts dispatcher-OR-warehouse stops (a stop with both counts once); tapping it opens "Notes for your stops" showing both note types labeled. A day with ONLY warehouse notes still shows the AVA card + count.
- [ ] **Production smoke test — Deliverable 1 (Ask Ava):**
  1. Home (pre-trip not yet done) → gold (+) "Ask Ava about today" between the stop list and the Inspect CTA. Tap → dark conversation sheet opens (not the old toast).
  2. Type a question about today (e.g. "How many stops do I have?" / "Any wind on my tents?" / "Which stops are COD?") → "AVA is thinking…" waveform → a concise spoken-style answer. With VOICE on, the answer is read aloud (ElevenLabs); toggle TEXT → no audio, switching mid-playback stops it.
  3. **Grounding check:** answers should match the Home numbers (stop count, COD count) and name the wind-alerted stops correctly; AVA should decline (not invent) anything outside the seeded context.
  4. **Failure path:** tasks rely on `ANTHROPIC_API_KEY` (already set in Vercel) — if a call fails, the sheet shows "AVA is unavailable right now. Try again in a moment." (no crash).
  5. Verify a row lands in `ava_conversations` (`surface='driver_home'`, `driver_id` = the signed-in driver, `context_id` = today's route id, question+answer populated).
- [ ] **Production smoke test — Deliverable 2 (SOP search):**
  1. Training Hub → "Look up an SOP" section at the top. Zero query → all driver-visible SOPs listed, sop_number ascending (SOP-001, 003, 005, …). **Confirm Warehouse-only / Operations SOPs are excluded** and driver/field/all ones are present.
  2. Type a term (e.g. "tent", "load", "incident") → 300 ms debounce → matching SOPs (title + content match). Tap a card → full content expands inline; tap again → collapses.
  3. Search something with no match (e.g. "zzz") → "No SOPs found" + "Ask Ava instead" button → opens the conversation sheet pre-filled with the query.
  4. **RLS check:** confirm a logged-in driver still sees SOPs (authenticated SELECT) and the table is no longer readable with only the anon key (RLS now ON).
- [ ] **AVA persona is route-scoped — SOP/general questions get a weak answer from the Training "Ask Ava instead" path.** The sheet opens with an EMPTY `seedContext` there, so AVA says it doesn't have route context. If Darren wants SOP-aware AVA (retrieve matching SOP text into the prompt), that's a follow-up — wire SOP lookup into `/api/ava/ask` or a dedicated SOP-answer path.
- [ ] **`/api/ava/ask` trusts the client `seedContext`.** Acceptable (auth-gated employees, driver's own route, worst case a fabricated prompt about a fictional route → harmless). If a stricter posture is ever needed, re-derive stop count / COD / dispatcher notes server-side by `routeId` (but keep weather client-seeded — re-running Tomorrow.io per question is wasteful).
- [ ] **No conversation history cap beyond `MAX_HISTORY=12` turns + no cost ceiling.** Fine for single-day Q&A; revisit if a driver holds a very long session.
- [ ] **SOP search is in-memory over ≤10 rows.** If the SOP Library grows large (50+), switch to a Supabase `textSearch`/`ilike` query (note the PostgREST `.or(ilike)` `*`-wildcard gotcha — see `tasks/lessons.md`).

## May 30, 2026 — AVA Phase 2 — Session 1: Weather Alerts + SOP Foundation (merge `0176699`, LIVE on `main`/production; branch deleted)

Weather-alert pipeline + SOP table/sync foundation. Merged to production on Darren's go. **Not yet smoke-tested on production, and SOP sync is inert until env is set.**

- [ ] **SET `NOTION_API_KEY` on the driver-app Vercel project** (production + preview), server-only (NOT `NEXT_PUBLIC_`), and **share the Notion integration into the "SOP Library" page** (`3590aa6451b8816aa156c77f605facfe`). Until then `POST /api/sop/sync` returns 501 and `sop_entries` stays empty. Optional: `SOP_SYNC_SECRET` for a cron caller (sent as `x-sop-sync-secret`).
- [ ] **Run the sync once `NOTION_API_KEY` is set:** `POST /api/sop/sync` (with a logged-in session or the secret header) → expect `{ synced: 10, errors: [] }` and `sop_entries` populated with SOP-001…010. Spot-check that `content` is non-empty (body extraction is bounded to depth 2 — deeply nested toggles/lists could truncate; widen depth if a SOP body looks short).
- [ ] **Production smoke test** (full matrix in `CLAUDE.md` → "AVA Phase 2 (Driver App) → Session 1"): (1) SOP sync; (2) a stop forecast ≥20 mph at its `calculated_eta` → red `WIND {n}` pill + wind line in the brief — **explicitly test the gust-only case** (e.g. sustained 10 / gust 21 must alert, since `getWindAtTime` now returns `max(sustained,gust)`); (3) depot-ending route → hero "N stops" matches the "1 delivery · 1 pickup" breakdown AND "The day, in N"; (4) "Ask Ava about today" button renders between the stop list and Inspect CTA → coming-soon toast; (5) voice brief reads naturally (ear-check the long wind-advisory variant against the 0.6s pause).
- [ ] **Build the REAL "Ask Ava about today" (deferred Step 6) next AVA session.** Today it's a placeholder (coming-soon toast). Needs: an Anthropic API key on the driver-app env, a server route on `claude-haiku-4-5-20251001` (key must NOT ship to the browser), and lifting the `AvaChip` drawer into a shared `<AvaConversationSheet open onClose seedContext={…}/>` so both the chip and the home button reach one sheet. Pre-seed context string (per the step plan): stop count + wind-alerted stop names + COD count + driver name.
- [ ] **SOP search UI** — explicitly out of Session 1 scope. The table + sync exist; the driver-facing lookup (and likely the AvaChip mic → STT → SOP lookup) is a later session.
- [ ] **Geocode backfill is lazy, not batched.** Coords populate on first `/api/ava/route-weather` hit per stop (1 req/sec Nominatim). A cold route's first morning load may show no wind pills until the geocode completes; a refresh fills them. If this is too slow in practice, add a one-time batch backfill job. Edge case: a stop whose address Nominatim can't resolve stays null forever (no alert) — acceptable degrade.
- [ ] **`route-weather` has no result cache beyond the weather layer's 15-min snapshot cache.** Every Home mount re-POSTs and re-reads `dispatch_stops`. Fine at current scale; revisit if Home re-renders hammer it.
- [ ] **Edge case (benign, left as-is):** a route with ONLY a `warehouse_return` and zero customer stops makes the hero read "0 stops scheduled" (`customerStopCount` 0) while the day list still shows the depot row. Not real in production. Add a guard only if it ever surfaces.

## May 30, 2026 — Fleet Maintenance driver app — Session 3 (commit `3bda5d7`, on `main`)

UI-only rebuild of the four locked Fleet Maintenance screens (pill tabs + My Log + compliance badges). No migrations, no API routes. Pushed to `main` for Vercel auto-deploy. **Not confirmed on production yet.**

- [x] ~~Smoke test round 1 (2026-05-30)~~ — Steps 1, 3, 4, 5, 6 passed. Two issues fixed in `0a1cb72`: Bug 1 (My Log infinite spinner — client useEffect race that cancelled its own in-flight fetch; fixed by keying the load on `user.id` only) + Bug 2 (compliance badges added to the Asset Detail header per Darren). **Re-test My Log + Asset Detail badges on production after Vercel deploys `0a1cb72`.**
- [ ] **Smoke-test on production** once Vercel deploys `3bda5d7`/`0a1cb72` (full matrix in `CLAUDE.md` → "Fleet Maintenance Module — Driver App → Session 3 → NEXT smoke test"). Seven loops: (1) three pill tabs + access gate, (2) truck cards w/ mileage + Reg/Insp/Ins badges + WO surfacing, (3) equipment tab + lock chip, (4) My Log = own entries only, (5) Asset Detail tab switching + persistent open-WO block + pinned Log-service CTA, (6) Log Service mileage prefill + entry appears in History AND My Log, (7) Parts tab.
- [ ] **Compliance-badge expiry tiers are driver-app-derived, not dashboard-mirrored.** `complianceStatus()` in `pmStatus.ts` uses a fixed 30-day warning window for registration/inspection/insurance. If the dashboard ever computes a different compliance tier (e.g. per-doc warning columns), mirror it here in the same session — same discipline as the PM-tier logic note at the top of `pmStatus.ts`.
- [ ] **My Log limit is 50 rows.** `fetchMyServiceLog(userId, limit = 50)` caps at the 50 most-recent. No pagination/"load more" — acceptable for the current volume; add paging if a heavy logger tops 50.
- [ ] **Decision deferred:** the spec's Screen 1 truck card lists "year/make/model, current mileage" — we append mileage to the existing subtitle (`"2019 Isuzu NPR · ABC1234 · 12,345 mi"`). If Darren wants mileage on its own line, it's a one-block change in `FleetOverviewScreen` `AssetRow`.

## May 28, 2026 — AVA Phase 1 MERGED to `main` + live in production (merge commit `37f83a9`)

`feature/ava-phase1` merged via `--no-ff` and pushed to `main`; Vercel production deploy READY; branch deleted (local + remote). **All the "NOT merged to main" caveats in the entries below are now historical — the work is live.** The dispatcher/stop-notes smoke matrix (CLAUDE.md → "Dispatcher Notes + Stop Notes surface") now runs against production, not a preview.

- [x] **TTS sentence-pause — confirmed on production (2026-05-28, commit `cc76a02`).** Tuned `SENTENCE_PAUSE` `0.5s → 0.6s` in `src/lib/ava/elevenLabs.ts:26`; pushed to `main`; Darren confirmed the longer pause is audible on the live app. Mechanism unchanged from `9560fb7` (SSML `<break>` on the ElevenLabs request only). Standing fallback if ElevenLabs ever reads the tag *aloud* on turbo_v2 (vs. pausing/ignoring): split the brief into separate audio clips with a real silent gap. Re-tunable any time via the same constant.
- [ ] **Next AVA work goes on a NEW branch** (`feature/ava-phaseN`), not `main` and not the deleted `feature/ava-phase1`.

---

## May 28, 2026 — AVA Phase 1 — Morning-card count fixes (branch `feature/ava-phase1`, commits `71ec8a1`, `dec52c8`)

Two correctness fixes to `AvaMorningCard.tsx` after a live-route test: card visibility decoupled from `checklist_enabled` + stats zero-state; depot stops excluded from all counts; tent count gated on category AND name. Branch still **NOT merged to `main`**.

- [ ] **Smoke-test on the preview deploy:**
  1. **Stop count.** Driver whose route ends at the depot (`warehouse_return`) → Home AVA card / hero stop count excludes the return leg (a 3-leg route reads "2 stops").
  2. **Tent count.** Route with a real tent plus sidewalls/wind walls/door walls (all TapGoods category "TENTS") → checklist/tent count reflects only the actual tent(s), not the accessories. Verify a 20×20 frame tent + walls reads "1 tent", not 5.
  3. **Checklist off, stats on.** Driver with `checklist_enabled=false`, `stats_enabled=true` → AVA card still renders (stats block visible); no checklist offer block.
  4. **Checklist off, stats off, a stop note exists** → card still renders (notes nudge present).
  5. **Stats on, zero completed stops this week** (Monday morning) → stats block shows "No stops completed yet this week." instead of the card vanishing.
- [ ] **Tent/accessory taxonomy is keyword-based, not authoritative.** `countTentItems` name gate (`tent`/`canopy`/`marquee`) is a heuristic over TapGoods names. If a tent product is named without any of those keywords (e.g. a branded "PartyPeak 20×20") it will be missed. The principled fix is TapGoods data hygiene (same root cause as the `resolveCategory` overrides) — revisit if a real tent slips the count. See `tasks/lessons.md`.

---

## May 28, 2026 — AVA Phase 1 — Profile Settings UI (branch `feature/ava-phase1`, commit `35eb566`)

Driver-self-service "AVA Preferences" section on the Profile screen for the three opt-in columns. Branch still **NOT merged to `main`** — pending Darren's go-ahead.

- [ ] **Smoke-test the preview deploy:**
  1. Profile screen → "AVA Preferences" section renders between "My Activity" and "Account": Morning checklist toggle, AVA voice style (Direct | Personality), Weekly stats toggle. Initial states reflect the driver's current DB values.
  2. Flip a toggle → it animates immediately (optimistic). Reload the app → the new value persists (DB write landed). Confirm via dashboard `SELECT checklist_enabled, personality_preference, stats_enabled FROM profiles WHERE id = '<driver>';`.
  3. Flip Weekly stats ON (for a driver with completed stops this week) → return to Home → the AVA morning card now shows the stats line without a logout/login.
  4. Switch AVA voice style to Personality → Home → the morning message uses the personality-variant copy on next mount.
  5. **Failure path:** kill network (DevTools offline) → flip a toggle → it should snap back to the prior state and show the red "Couldn't save preference — try again" toast.
- [ ] **`profiles` has no RLS UPDATE policy (by design).** Driver-editable profile fields must go through `PATCH /api/profile/ava-preferences` (admin client, scoped allow-list). If a future feature needs another driver-editable column, extend that route's allow-list — do NOT add a table-level UPDATE policy (would expose roles / fleet_maintenance_access / work_order_technician to self-mutation).
- [x] ~~**Profile-settings UI for the three opt-in toggles.**~~ Shipped 2026-05-28 (commit `35eb566`).

---

## May 27, 2026 — AVA Phase 1 — Bug Fix Pass (branch `feature/ava-phase1`, commit `4ddcadb`)

Three bug fixes on top of Session 5. Branch still **NOT merged to `main`** — pending Darren's smoke test on the preview deploy, then go-ahead.

- [ ] **Smoke-test the bug fixes on the preview deploy:**
  1. **Bug 1 — Stop Detail note entry.** Open any non-depot stop. Below the manifest block: dashed "Leave a note for the next driver →" link when no notes exist, OR amber "AVA has a note about this stop →" button when ≥1 note exists. Renders on completed stops too (regression from before the fix).
  2. **Bug 1 — Tier 3 hero pill.** Open a stop where a note has been saved → amber "AVA KNOWS THIS STOP" pill below the address in the hero. Open a stop with no notes → no pill.
  3. **Bug 1 — End-to-end note save.** Tap the dashed link → AvaNoteSheet opens → write a note → Save → toast confirms → close the sheet → re-open the stop. Both surfaces (hero pill + post-manifest button) should now show the amber state.
  4. **Bug 2 — Route delete+recreate refresh.** Dashboard: delete the driver's route, create a new route for the same truck same date. Driver app: navigate to Home (or refresh). Home should render the full briefing (hero + day list + AVA card + weather + Gold CTA) for the new, uninspected route. No more blank quiet state.
  5. **Bug 3 — TTS button.** Home → voice mode on (default) → "▶ HEAR YOUR MORNING BRIEF" gold pill button below the message. Tap → ElevenLabs reads the message in natural voice (no robotic WebSpeech fallback on iOS first load). Toggle to TEXT mid-playback → audio stops. Toggle back to VOICE → play button reappears, can replay.
- [ ] **All 9 Phase 1 components + bug fixes landed on `feature/ava-phase1`. Branch is ready to merge to `main` when Darren approves the smoke test.** Don't merge until explicitly told.
- [ ] **Profile-settings UI for the three opt-in toggles** is still pending — columns exist in the DB since Session 1, but the Profile screen has no switches for `checklist_enabled`, `personality_preference`, `stats_enabled`. Pair with whichever upcoming Profile-screen session lets a driver flip these without dashboard support.
- [ ] **Persisting voice/text preference to DB** is deferred. Today it resets to voice default on every card mount. If drivers want a sticky preference, add a `voice_default` column (or extend `personality_preference`) and wire to it from the toggle.
- [ ] **Session 6 — real STT + SOP lookup behind the AvaChip mic button.** Today the button is a stub with a "coming soon" toast. Session 6 wires browser STT (Web Speech API recognition or Whisper) + the SOP retrieval logic, and replaces the toast with the actual conversation UI inside the drawer.

---

## May 27, 2026 — AVA Phase 1 — Session 2 (branch `feature/ava-phase1`)

Morning brief card (Tier 2) + Home post-pre-trip quiet state + weather flag (Part 1). Design doc: `docs/ava/2026-05-27-ava-morning-brief-card.md`. Branch must NOT merge to `main` until all 9 Phase 1 components are in. Vercel auto-deploys as a **preview**.

- [ ] **Smoke-test the preview deploy** once Vercel finishes:
  1. Pre-pre-trip Home: hero (greeting + stop count + truck), day list, "Inspect & Start Route" CTA. AVA card renders only for `stats_enabled=true` drivers (Joey default). Weather card renders only on ≥amber wind/rain/snow at first delivery stop.
  2. Complete pre-trip → return to Home: hero shows greeting + truck only (no sub-copy). Pre-trip receipt, day list, AVA card, weather card, Gold CTA all hidden. FleetAlert + COD still render if applicable.
  3. The "Ask Ava about today" stub button is gone.
  4. Toggle `stats_enabled=true` on a non-Joey profile → AVA card appears on next Home mount.
- [ ] **COD-collected-this-week stat — follow-up.** Stats block currently shows weekly stops only. Adding COD-collected-this-week needs a separate query against `cash_collections` (no FK to dispatch_stops yet — see the Cash Collection v2 follow-up below). When picked up, the field name to use on `PersonalStats` is `weekCodCollectedCents: number | null`. Render line: "$X COD collected this week." appended below the stops line.
- [ ] **Dependency map content authoring** — Darren content task. Until rows exist, `dependencyHits.countHitsForItems` returns 0 and the checklist offer never appears on the AVA card. The helper signature is ready; swap is one file.
- [ ] **Profile-settings UI for the three new toggles** — columns are in the DB (013); the Profile screen still needs the three switches (checklist on/off, personality direct/personality, stats off/on). Pair with this session so Joey can flip his own stats opt-in instead of needing dashboard-side.

---

## May 27, 2026 — AVA Phase 1 — Session 1 (branch `feature/ava-phase1`, commit `c43192c`)

Schema (migrations 013/014/015) + Tier 1 header chip + placeholder drawer pushed to `feature/ava-phase1`. Branch must NOT be merged to `main` until all 9 Phase 1 components are in. Vercel auto-deploys this branch as a **preview**, not production.

- [ ] **Smoke-test the preview deploy** on `feature/ava-phase1` once Vercel finishes:
  1. Open any of Home / Route list / Stop detail / Tools / Training / Profile. Chip renders top-right (32 px blue square with five white waveform bars), bars pulse with staggered animation.
  2. Tap chip → dark bottom-sheet slides up with "AVA coming soon" copy and an X button. Backdrop tap closes; X closes; both leave the screen state unchanged.
  3. From an auth'd dashboard session, `SELECT column_name, column_default FROM information_schema.columns WHERE table_name='profiles' AND column_name IN ('checklist_enabled','personality_preference','stats_enabled');` — confirm all three rows with correct defaults.
  4. `SELECT count(*) FROM public.ava_conversations;` and `SELECT count(*) FROM public.ava_stop_notes;` — both return 0 (tables exist + readable under RLS).
  5. Attempt `INSERT INTO ava_conversations (driver_id, surface, question) VALUES ('<some-other-uuid>', 'driver_home', 'test');` from the driver-app client — should be rejected by RLS (only `driver_id = auth.uid()` allowed).
- [ ] **Session 2 next up — Morning brief card (Tier 2).** Static summary card always renders on Home (driver name, stop count, COD flag, weather flag) — no API call needed, loads instantly. Conditional AVA card below renders only when AVA has something to say. Personality + stats logic per the locked May 24 decisions. Voice/TTS hookup is a separate later session.
- [ ] **Dependency-map content authoring** is a Darren content task, not Claude Code. Driver-app dependency map has 4 driver interviews in (Lucas / Austin / Joey / Dylan); the seed rules in the Notion spec are usable. Dashboard side gets the Melissa voice session before it ships. Once the dependency-map DB rows exist, the checklist component is a session of its own (UI only).
- [ ] **Profile-settings UI for the three new opt-in toggles.** Columns are in the DB (013); the Profile screen still needs the three switches (checklist on/off, personality direct/personality, stats off/on). Pair with the morning brief session so the toggles can be tested end-to-end.
- [ ] **Decision needed before merge to `main`** — order/sequence of remaining Phase 1 sessions (morning brief vs AVA Remembers vs voice). Notion spec doesn't lock the order; pick what unblocks driver feedback fastest.

---

## May 26, 2026 — Work Orders & Field Issues (driver app, Session 2)

Shipped to `main` for Vercel auto-deploy. Driver-app surface on top of dashboard Session 1 (`4e04ac9` — `field_work_orders` Migration 073). Stop-detail link + two Tools Hub cards (ungated "Report an Issue" + technician-gated "Work Orders") + four new routes. One shared `ReportIssueForm` powers both Screen 2A (stop context) and 2B (standalone). Cross-app POSTs go to `${NEXT_PUBLIC_DASHBOARD_URL}/api/work-orders` with the user's bearer token so the assignee email fires; reads pull straight from supabase under RLS.

- [ ] **Set `NEXT_PUBLIC_DASHBOARD_URL` on the driver-app Vercel project** (production + preview) **before smoke testing.** Production value: `https://dashboard.partytimerentals.com`. Without it the form throws "NEXT_PUBLIC_DASHBOARD_URL is not configured" on submit. The example `.env.local.example` already documents it; local dev needs it in `.env.local` too.
- [ ] **Smoke test on production** once env var is live and Vercel redeploys:
  1. Standard driver (no `work_order_technician`): Tools Hub shows "Report an Issue", **not** "Work Orders".
  2. Open a delivery stop → faint-red link below the 3-button quick-action grid. Tap → form opens with locked `#order · customer` bar + item picker. Pick item → Submit → green 6 s `PT-#### · You notified` pill on return. Email arrives.
  3. Same stop → "Item not in this order?" → free-text name + serial → Submit. WO row reflects typed values.
  4. Tools Hub → "Report an Issue" (standalone) → Truck search → pick a truck → Submit. WO row has `asset_id=<truck.id>`, `asset_type='truck'`.
  5. Same flow, no search match → "Enter manually" → Submit. `asset_id=null`, `asset_name` = typed value.
  6. Toggle a profile's `work_order_technician=true` dashboard-side → driver app shows the "Work Orders" Tools Hub card on next mount.
  7. Open `/tools/work-orders` → tabs (Open / In Progress / Done) with counts → tap a card → detail.
  8. Detail: Mark In Progress (only when status='open') → moves between tabs. Mark Complete → Done tab. + Note → bottom-sheet modal → save → notes log shows timestamped entry.
- [ ] **Dashboard route response shape — confirm with dashboard repo.** `createWorkOrder` accepts either `{id, work_order_number, …}` flat OR `{work_order: {…}}` nested. If the route returns something else (e.g. just `{success: true}` with no row data) the success pill will fail with "Dashboard returned an unexpected shape — could not read work order ID." If that happens, pull the actual response shape and tighten `src/lib/workOrders/api.ts`.
- [ ] **PATCH semantics — confirm with dashboard repo.** Add-Note PATCH sends the **full reconstructed `notes` string** (existing + timestamp prefix + new). If the dashboard's PATCH route appends instead of replaces, that will duplicate the old notes. If so, switch to sending only the new note text and let the dashboard append.
- [ ] **listTechnicians query depends on `profiles.work_order_technician` and `roles cs '{super_admin}'` being readable under RLS for any authed user.** Dashboard Session 1 must have set this up, but verify the picker actually populates with non-self technicians in prod. If RLS blocks it, expose a `/api/work-orders/technicians` endpoint on the dashboard and swap the client.

## May 24, 2026 — Auto-logout (driver app, two layers)

Shipped. Drivers share company devices; this closes the gap where the next
driver picked up a device still signed in as the previous driver. Two
complementary layers, driver-app only — no dashboard, no SMS, no migrations.

- **Layer 1 — warehouse_return signOut.** `StopDetailScreen.tsx` welcomeBackAt
  effect: after the 6 s "Welcome back — route complete" banner fully runs,
  clears `ptr_session_date`, calls `supabase.auth.signOut()`, and
  `router.replace('/login')`. The banner finishes naturally — signOut fires
  only on the trailing edge of the existing 6 s timeout.
- **Layer 2 — day-change check.** `LoginScreen.tsx` stamps
  `localStorage.ptr_session_date = YYYY-MM-DD` on a successful sign-in.
  `AuthContext.tsx` checks the value on `INITIAL_SESSION` events (the first
  auth event per page load); if stored ≠ today (or missing), it removes the
  key, signs out, and `window.location.replace('/login')` before any authed
  UI renders. `SIGNED_IN` events are skipped — LoginScreen has just stamped
  the date, so checking would race the new login.

- [ ] **Smoke-test on production** after Vercel deploys this commit:
  1. Trigger the warehouse_return geofence in dev (or run the route to depot)
     → confirm the 6 s welcome-back banner runs in full, then the app
     redirects to `/login` with no session.
  2. DevTools → Application → Local Storage: set `ptr_session_date` to
     yesterday → reload any authed route → expect immediate redirect to
     `/login` before the home screen paints. Console should be clean.
  3. Same-day refresh of an active session → `ptr_session_date` already
     today → no signOut, no redirect, normal render.
  4. Sign in on /login → `ptr_session_date` is set to today; reload → still
     signed in.

## May 23, 2026 — Pre-trip mileage capture (driver app)

Shipped. Required odometer field on Screen 6 (sign_submit), above the certify
checkbox. `POST /api/inspection/submit` validates an integer 0 ≤ n ≤ 2,000,000
(400 on missing/invalid), then writes `trucks.current_mileage` via the admin
client after a successful `vehicle_inspections` insert — unconditional (pre-trip
is ground truth, no forward-only guard) and non-fatal (an UPDATE failure is
logged, never 500s; the federally-required inspection row already exists by
then). Mileage-based PM flagging now activates as soon as a driver submits a
pre-trip — `pmStatus.ts` already knew how to consume the value.

- [ ] **Smoke-test on production** after Vercel deploys this session's commit:
  1. Open a pre-trip on an assigned truck → Screen 6 shows the **Odometer**
     card above the certify checkbox. **Submit Inspection** stays disabled
     until the odometer reads a non-empty digit string AND the certify box is
     checked. The input rejects non-digits, caps at 7 chars.
  2. Submit a valid reading → 200, navigates per outcome. Confirm
     `trucks.current_mileage` is updated on `partytime-east` for that truck.
  3. Hit `POST /api/inspection/submit` with `current_mileage: 3000000` (over
     cap) or missing → 400 with the validator message.
  4. Force a `trucks` UPDATE failure (e.g. flip RLS off-side, or rename the
     column temporarily on staging) → request still returns 200 with the
     inspection id; the failure is logged to Vercel function logs as
     `trucks.current_mileage update failed (non-fatal)`.
  5. Submit two pre-trips in a row with the second reading LOWER than the
     first (unusual but valid for a wrap or admin correction) → the second
     write lands because the write is unconditional.
- [ ] **Optional: confirm dashboard PM tier recompute.** Submit a pre-trip
  whose new `current_mileage` crosses a schedule's `next_due_miles - warning`
  threshold → the dashboard's PM trigger should re-tier on the next read. No
  driver-app code change; just a verification loop.

## May 22, 2026 (evening) — Fleet Maintenance driver-app UI fixes

- [ ] **Equipment management — add/deactivate equipment, split model-level rows
  into per-unit rows (e.g. two forklift models tracked independently), hide
  TapGoods items not relevant to PTR fleet. High priority. Requires dashboard +
  driver app session.** The driver app now shows a disabled "Manage equipment"
  lock affordance on the Equipment section header (tap → toast: "Equipment
  management coming soon — contact your administrator…"). That placeholder sets
  the expectation; the real build is dashboard-owned schema + driver-app UI.
- [ ] **Smoke-test the three UI fixes on production** after Vercel deploys this
  session's commit:
  1. Tap any truck/equipment row on Fleet Overview → Asset Detail loads (name,
     spec, plate/serial, status badge, PM schedule, service history, work
     orders). "Log service" opens the form with **no work order required**.
     "View all work orders" reveals resolved WOs (button shown only when
     resolved WOs exist for the asset).
  2. Fleet Overview layout — Trucks section (open truck WOs above the truck
     list, never collapsed) → Equipment section (open equipment WOs above the
     list; list collapses, default-collapsed at zero equipment WOs,
     default-expanded with ≥1) → "Other work orders" catch-all at the bottom
     (`asset_type` null or asset in neither table; hidden when empty).
  3. Tap the disabled "Manage equipment" lock chip → toast appears, no nav.

## May 22, 2026 — Fleet Maintenance Module (driver app) — commit `46ba851`

- [ ] **Smoke-test on production** after Vercel deploys `46ba851`. Six loops in `CLAUDE.md` → "Fleet Maintenance Module — Driver App" → NEXT block: (1) card gating, (2) overview render + empty states, (3) work order appears in card pill + home alert, (4) log service entry, (5) mark resolved does NOT create a service record, (6) assign + upload invoice.
- [ ] **Darren — populate the `vendors` table.** Empty as of 2026-05-22. The Work Order Detail parts section matches a cross-reference's `brand` text to a `vendors.name` to surface a tap-to-call phone. With zero vendor rows there are no call buttons anywhere — the UI degrades gracefully ("No phone"). Add vendor rows (esp. CarQuest, NAPA) with `phone` set and the call buttons light up automatically, no code change.
- [ ] **Darren — seed CarQuest / NAPA cross-references.** All 26 `part_cross_references` rows are priority-3 (manufacturer-direct: ACDelco, Motorcraft, Mann, Donaldson, Mopar, Fleetguard). Zero priority-1 (CarQuest) or priority-2 (NAPA). The driver-app UI renders whatever exists, sorted by priority, and tags each by tier — it just shows Direct refs until 1/2 are seeded. Verification pass against live CarQuest/NAPA catalogs is a Darren task.
- [ ] **Decide: work-order → parts junction table.** v1 ships with no link between `fleet_work_orders` and `parts`; Screen 3 shows parts that fit the *asset* (via `asset_part_fitments`), labelled "Parts for this asset". A `work_order_parts` junction (curated parts per work order) is a future enhancement — dashboard-side migration if wanted.
- [ ] **chat-Claude — reconcile Notion.** The Fleet Maintenance Build Spec v1.0 access matrix lists "Upload invoice PDF/photo" as ❌ read-only for the driver app. The approved 2026-05-22 mobile design session supersedes that — the driver app DOES upload invoices (Screen 3 action + Screen 4 form). Update the access matrix in Notion.
- [x] ~~**Pre-trip mileage capture (separate driver-app session).**~~ Shipped 2026-05-23 — odometer field on Screen 6 above the certify checkbox; `POST /api/inspection/submit` validates 0–2,000,000 and writes `trucks.current_mileage` via the admin client (unconditional, non-fatal). Mileage-based PM flagging is live.
- [ ] **Work-order-creation notification is a dashboard task.** MBC Part 3 logs "any new `fleet_work_orders` INSERT should email `receives_fleet_notifications` users via Resend." That fires dashboard-side (or a shared cron) — not in the driver app. No driver-app work; noted for cross-repo awareness.
- [ ] **AVA fleet alerts — future session.** Fleet alerts in the AVA morning brief were explicitly deferred. The home `FleetAlertCard` is the interim surface.
- [ ] **Minor — home alert card placement.** `<FleetAlertCard />` sits in `DayRouteSelectorScreen`'s populated-home body (between COD card and day list, per spec). On an empty-route home (e.g. a fleet manager with no route assigned) it does not render — the Tools Hub card is always available as the fallback entry. Revisit only if Darren wants the alert on the empty state too.
- [ ] **Minor — resolved work orders.** A resolved work order's detail screen is reachable only via a stale link (overview + home card list open WOs only). It renders a "Resolved" banner and hides "Mark resolved"; other actions stay enabled. Acceptable.

## May 19, 2026 (evening) — Routes-tab for unassigned drivers + /schedule scroll fix

- [ ] **Smoke-test on production after Vercel deploys** (`ebaebc2` → `ced6aa1` → `d1b1910`):
  1. Driver with no route assigned today → tap Routes tab → lands on `/schedule` (week view), not `/`. BottomNav pinned at bottom. Long week list scrolls inside main area, not at document level.
  2. super_admin with no route assigned → same behavior (regression check vs. morning's `b49e6e1`).
  3. Driver or super_admin with an assigned route → tap Routes → still goes to `/route/[id]` as before.
  4. Land directly on `/route/[bad-id]` (typo'd URL or stale notification) → Today/Week toggle visible at top, "Route not found" banner inside My Route tab body. Tap Week tab → WeekScheduleView renders.
- [ ] **Audit other `className="screen"` pages for inline layout overrides** that conflict with the class. The fix to `/schedule/page.tsx` (commit `d1b1910`) removed inline `minHeight: '100vh'` + `display: flex, flexDirection: column` — the `.screen` class already provides those, and the inline `100vh` actively breaks the iOS Safari toolbar lock (`100vh > 100svh` with the toolbar visible). Grep `className="screen"` across `src/app/` and `src/screens/` and check each for redundant inline `display`/`flexDirection`/`height`/`minHeight`/`overflow`. Likely candidates: any page built before the `.screen` lock was added (pre-2026-05-12). See `tasks/lessons.md` → ".screen utility class is load-bearing."

## May 17, 2026 — Time Window Constraints Phase 4 (driver-app integration)

- [ ] **Smoke-test the three new surfaces on production** after Vercel auto-deploys the three `main` commits (`05b1607`, `ab0bc1e`, `54766d3`). Plan in `CLAUDE.md` → "Time Window Constraints — Phase 4" → NEXT block. Five loops:
  1. Badge renders below the address on StopDetail (on-dark), RouteListScreen rows, and DayRouteSelectorScreen day list (both COD + inline). Constraint-less stops show no badge.
  2. Pickup stop with future `pickup_window_start` → tap Open in Maps → gate modal pops with "Navigate anyway" + "I'll wait". `I'll wait` dismisses cleanly.
  3. Same pickup → tap Open in Maps → tap "Navigate anyway" → maps opens. Re-tap Open in Maps → no modal (override sticky for the session).
  4. Same pickup, fresh session, drive into 150m geofence → `arrived_at` stamps → action card replaced by standby card with live HH:MM:SS countdown. Tap "Navigate anyway" → action card returns.
  5. Suggested-tier stop → badge renders as dashed outline; no gate, no standby.
- [ ] **Walk the visual diff against the Notion confidence-tier table** to confirm the amber palette + dashed-vs-solid treatment matches the dashboard's `StopWindowBlock` chips. Today the driver-app pill is more compact (no event-start anchor line, no ETA cushion math) — that's intentional, but the tier color contract should still match exactly.
- [ ] **Optional: surface the "Event starts X" anchor below the badge on StopDetailScreen** (currently only the badge — the dashboard block also renders the `event_start` / `event_end` anchor as a secondary muted line). Low priority; the badge alone covers the must-deliver-by signal the spec called out as critical.
- [ ] **Optional: persist `early_pickup_override` server-side** via a `stop_workflow_events` row (today it lives only in the `NAVIGATION_STARTED` event detail JSON). Would let the dashboard surface "driver overrode the window" on the stop card without scraping event details. Defer until a dashboard ask materializes.
- [ ] **Long-term: mirroring discipline for `src/lib/stopConstraints.ts`.** Driver-app copy is a strict read-only subset of `partytime-dashboard/src/lib/stopConstraints.ts` (resolver + tier check + clock formatter). If dashboard's resolver changes (new source, reordered priority), mirror here in the same session. Not byte-identical today — driver app has no mutations, no React-Query glue.

## May 16, 2026 — Arcade iPhone controls + canvas layout fix arc

- [x] ~~**iPhone controls + canvas layout — Party Kong.**~~ Confirmed working by Darren after `b7798bf`. Six commits: `78c46c1` (iOS 18 Writing Tools + held-input cancel), `d51e721` (canvas-area shell that pins controls above the fold), `bb4f340` (drop canvas.style.width/height inline lock so CSS drives display), `1b259da` (tighten canvas-to-controls gap), `891adf4` (CSS-crop the empty back-wall + floor-strip band below ground via `VISIBLE_H = 600`), `b7798bf` (switch wrapper to height-driven sizing so aspect-ratio doesn't break on short viewports). Game logic completely untouched. Lessons logged in `tasks/lessons.md` (four new entries).
- [ ] **Smoke-test Route Rush + Tent Tetris on iPhone** to confirm the layout-shell + iOS-guards fixes from `78c46c1`/`d51e721`/`bb4f340` work for them too — Darren confirmed Party Kong but didn't explicitly verify the other two games on iPhone in this arc. Same checklist as the Party Kong loop: controls visible without scrolling, held inputs survive long-press without Writing Tools, truck (RouteRush) and tetromino board (TentTetris) fully visible without clipping at the bottom.
- [ ] **Optional: apply VISIBLE_H-style crop to Route Rush or Tent Tetris** if either game ever shows visible empty space below gameplay. Today Route Rush's truck sits at y=580 of a 720-tall canvas (~140px below sits empty), and Tent Tetris's playfield ends around y=530. Spec for this session was Party Kong-only, but the pattern from `891adf4` + `b7798bf` (`VISIBLE_H` constant + wrapper aspectRatio: `W/VISIBLE_H` + canvas aspectRatio: `W/H` overflowing via `overflow: hidden`, plus the height-driven wrapper sizing) ports directly when needed.

## May 15, 2026 overnight — PartyTime Arcade follow-ups

- [ ] **Smoke-test the arcade on production** after Vercel deploy. Coverage list lives in `CLAUDE.md` → "PartyTime Arcade — Route Rush + Tent Tetris" → NEXT block. Loops: hub load + tile rendering, Route Rush gameplay + leaderboard submit, Tent Tetris gameplay + line clear animation + piece-name labels, cross-device realtime leaderboard fan-out, auth gate.
- [x] ~~**Build Party Kong.**~~ Shipped 2026-05-15 post-overnight session. Single component `PartyKongGame.tsx` + `/training/arcade/party-kong` route + ArcadeHub tile flipped from locked → playable. 4 levels (Warehouse / Loading Dock / Outdoor Tent Setup / Grand Ballroom), DK-style platformer mechanics, NO-OUTLINES shading throughout. Logo loader uses 3-tier fallback chain (spec path → `/ptr-mark.png` → procedural). See CLAUDE.md → "PartyTime Arcade — Party Kong" for architecture details.
- [x] ~~**Smoke-test Party Kong on production**~~ — confirmed working by Darren on iPhone after the 2026-05-16 mobile-fix arc landed (commit `b7798bf`).
- [ ] **Optional: drop the proper hi-res PTR logo at `public/images/PARTYTIME-RENTALS-LOGO.png`.** Today the warehouse sign falls back to `/ptr-mark.png` (which exists). Spec called for a logo at the `/images/` path; the 3-tier loader handles its absence. Drop the file at the spec path and the sign auto-picks it up — no code change needed.
- [ ] **Party Kong v3 — true per-level scenes.** Scoped in `tasks/party-kong-v3-scope.md`. Four-session phased plan: foundation refactor (A) → conveyor stage L2 (B) → elevator stage L3 (C) → rivet/chain-pull stage L4 (D). Each session ships a green-build checkpoint to prod. Total work ≈ 2× current Party Kong codebase. Confirm product direction + pre-flight checklist before starting Session A.
- [ ] **Optional: per-game personal-high-score history.** Today `useGameLeaderboard.personalBestAllTime` reads the user's max score from the all-time top 10. If the user's all-time best falls outside the top 10, the value is `null`. Cheap fix: a dedicated `.from('game_scores').eq('player_id', uid).eq('game_type', gt).order('score desc').limit(1)` call (mirrors the ArcadeHub `bests` loader). Now that all three games are live this is more meaningful to add.
- [ ] **Optional: arcade-side rate limit.** RLS lets any authenticated user spam INSERTs at `auth.uid()`. Acceptable today (trusted driver fleet). If/when public access opens up, throttle via a Postgres function + grant.

## May 14, 2026 night — Tools / Training hub restructure follow-ups (commits `f64d5bb` → `288d120`)

- [ ] **Smoke-test the v2 hubs on production** (latest is `288d120`). Coverage list in `CLAUDE.md` → "Tools Hub + Training Hub — category-card restructure" → NEXT block. `/tools`: dark surface, uppercase title, 6-tile grid, Weather + Equipment guides land on existing routes, Generators full-width, divider, Party layouts anchor card. `/training`: 4-tile grid + orientation + Arcade (no badge). Toast = small dark pill, 2s dismiss, no gold accent. Spot-check that Weather + Reference Library still load identically to pre-restructure.
- [x] ~~**`/games` route does not exist.**~~ Resolved 2026-05-15. The Arcade tile now points at `/training/arcade` (PartyTime Arcade hub) — Route Rush + Tent Tetris are live; Party Kong is the locked third tile.
- [x] ~~**Tenting subcategory screen.**~~ Shipped 2026-05-19. New `/tools/tenting` route + `TentingHubScreen.tsx` — two live tiles: Tent calculator (→ `/tools/tent-squaring`) + Drawings & certs (→ `/reference/tents`). Tenting card in ToolsScreen now points to `/tools/tenting`.
- [ ] **Duplicated layout components between ToolsScreen and TrainingScreen.** `C` token object, `BadgePill`, `IconWrap`, `CategoryCardGrid`, `CategoryCardWide`, and several Tabler-style icons (TentIcon, ShieldCheckIcon) are redeclared in both files. The toast block is also inline-duplicated. Acceptable today (two screens, fully styled differently from the rest of the app); extract to `src/components/hub/*` when a third hub-style surface appears or when an icon needs to change in lockstep across both.
- [x] ~~**Tools hub footer pointer line.**~~ Resolved in v2 (`288d120`) — Weather and Equipment Guides are now first-class tiles in the grid; footer text removed.

## May 14, 2026 — Phase 2.5C session follow-ups (GPS Auto-Arrival)

- [ ] **Smoke-test arrival on production** — driver `73b7509`, dashboard `03dd102` both deployed. Test plan in `CLAUDE.md` → "Phase 2.5C — GPS Auto-Arrival" → NEXT block. Loops: permission prompt on first watch, mid-route entry into the 150m bubble, dashboard teal pin within ~1s, badge coexistence with the green completion check, persistence across refetch.
- [ ] **Phase 2 — Real-time push to dispatch on arrival.** Today Melissa sees the teal pin update visually via realtime; no audible signal. Pair with the existing "real-time COD-uncollected push to dispatch" Phase 2 item — same channel.
- [ ] **Phase 2 — Background geofencing (native shell).** Current implementation is foreground-only (`navigator.geolocation.watchPosition` requires the document visible on mobile browsers). For autonomous arrival when the driver locks the phone or backgrounds the PWA, need Capacitor or a native shell with the Android Geofence API. Out of scope for v1 PWA.
- [ ] **Phase 2 — Driver-side "location off" warning.** `useArrivalGeofence` already surfaces `denied` / `unavailable` / `error` states; the UI currently ignores them. A small inline hint on StopDetailScreen ("Location off — arrival won't auto-detect") would help when permissions are denied. Low priority because Mark Stop Complete still works.
- [ ] **Phase 2 — Arrival → completion delta analytics surface.** The data now flows into `arrived_at` and `completed_at`. A simple report (avg on-site time, outliers) would be useful for ops. Dashboard-side; out of scope this session.

## May 14, 2026 — bug-fix session follow-ups

- [ ] **Smoke-test on production** after the May-14 Vercel deploys clear. Coverage list lives in `CLAUDE.md` → "Driver scope + completion persistence" → NEXT. Three loops: driver-scope (Home + Routes tab), completion persistence (mark-complete → return-nav), Cash Collection v2 (Collected / Could Not Collect paths now that migration 051 is live).
- [ ] **Regen dashboard repo Supabase types** so the `as any` casts in `partytime-dashboard/src/lib/boardClient.ts` (`fetchUncollectedCodRows`) come out. Driver-app types are already current (commit `c308c81`). One-line: `cd ~/Projects/partytime-dashboard && supabase gen types typescript --linked > src/types/supabase.ts` — but strip the stderr lines that the CLI bleeds into the redirected file ("Initialising login role…" header, "A new version…" footer); see lessons.md.
- [ ] **Delete unused `AppStateContext.clearCache`.** Orphaned since the cold-load auto-redirect was removed (no caller). Comment block references stale "assigned-route check" infra. One-line removal; bundle with the next AppStateContext touch.

## Cash Collection v2 — surviving follow-ups (from 2026-05-13)

- [x] ~~**BLOCKING: apply migration 051 to partytime-east.**~~ APPLIED 2026-05-14 via `supabase db query --linked --file`. Tracking repaired. Driver-app types regen'd.
- [ ] **Drop the orphan `dispatch_stops.cod_acknowledged_at` and `dispatch_stops.cod_acknowledged_by` columns.** Audit done 2026-05-13 — zero readers, zero writers. Cash Collection v2 uses payment_state-based auto-resolution instead. Wait until schema confidence is high; bundle with the next housekeeping migration.
- [ ] **Phase 2 — Real-time COD-uncollected push to dispatch.** Today Melissa learns about the flag via the board's visible realtime update (~1s after the driver submits). A push/SMS notification would help if she's heads-down on something else when it lands. Same channel as the planned pre-trip OOS auto-notify (currently Phase 2 stub copy on Screen 7).
- [ ] **Add an FK from `cash_collections.stop_id` to `dispatch_stops.id`** so PostgREST can embed cash_collections in a stops fetch (one query instead of two). Low priority — current pattern (separate query, deduped by tanstack-query) works fine for the dashboard's volume. Bundle with the schema cleanup migration above.

## Cross-repo: Mirrored helpers (added 2026-05-13)

Three helpers are now byte-for-byte mirrored between `partytime-driver-app/src/lib/` and `partytime-dashboard/src/lib/`:
- `equipmentSummary.ts` — two-tier `{ tier1, tier2 }` shape consumed by all condensed surfaces
- `inflatable.ts` — `isInflatableCategory()` + `hasInflatableItem()` keyword detection
- `itemCategories.ts` — `resolveCategory()` + `CATEGORY_MAP` (lowercased keys, canonical-cased values)

There is **no shared package and no build-time validation that the copies match.** Drift is silent until a user-visible bug surfaces.

- [ ] **Long-term:** extract these three files into a shared workspace package (e.g. `@partytime/items`) so a single change updates both consumers. Requires monorepo or git-submodule setup; currently both repos are independent.
- [ ] **Short-term discipline:** any change to one of these files MUST be applied to the other in the same session, with matching commit messages. Document in CLAUDE.md (already done in the equipment-summary architecture section).
- [ ] **`resolveCategory` name overrides are workarounds.** The CHAIR / STAGE / SKIRT / RAMP / DECK / TENT / WALL / DANCE FLOOR name detection rescues TapGoods miscategorizations. The principled long-term fix is to recategorize source items in TapGoods so the API category matches. Audit + clean up the override list when TapGoods data hygiene reaches a steady state.

## Cross-repo: Dashboard data hygiene to simplify driver-app filter (discovered 2026-05-08)

The driver app's `/api/routes` endpoint currently filters stops by `calculated_eta IS NOT NULL` to drop ghost assignments (stops dragged onto a route weeks ago and never optimized or unassigned). This is a workaround. The principled fix lives in the **dashboard repo**:

- [ ] When a dispatcher assigns a stop to a route in the dashboard (drag-drop, or any other path that sets `dispatch_stops.route_id`), also set `dispatch_stops.scheduled_date = routes.route_date` for that stop. Today, only `route_id` and `route_position` are updated, so pickup stubs retain their auto-anchored Monday `scheduled_date` even after assignment.
- [ ] Backfill pass: for every existing `dispatch_stops` row where `route_id IS NOT NULL`, update `scheduled_date` to match the route's `route_date`. One-shot SQL or admin endpoint.
- [ ] After the dashboard ships the above + backfill runs cleanly, revert this repo's `/api/routes/route.ts` filter from `.not('calculated_eta', 'is', null)` back to `.eq('scheduled_date', date)`. Cleaner, doesn't depend on a derived signal.

## Tools Hub — Content Build (Phase 2 — content authoring + UI)

Empty shells exist on `/tools` for the tile grid. Content + per-tool UI is the work:
- [x] Tenting calculator — tent squaring (shipped 2026-05-14 late evening — `/tools/tent-squaring`, replaces the Tenting tile's coming-soon stub. When additional tenting calcs land (anchoring, etc.), convert the route into a tenting sub-hub.)
- [ ] Occupant load calculator — IFC Chapter 31 load factors by layout type
- [ ] Exit count and spacing calculator — 100 ft max rule, 0.2 in/person egress width
- [ ] Generator placement rule flag — 20 ft minimum
- [ ] Fire Code Pre-Job Checklist — dynamic by job config; NFPA 701 fabric cert photo capture; permit trigger by tent size; timestamped completion record
- [ ] Site map generator (Phase 2 — canvas tech stack prototype required first)
- [ ] Multi-tent site map (Phase 2)
- [ ] Jurisdiction-aware fire code (Phase 3 — UpCodes API)
- [ ] Shareable crew report (Phase 3)
- [ ] Tenting reference library — manufacturer-specific diagrams
- [ ] Dance floor / stage / heat-and-air / power / propane calculators
- [ ] Equipment Knowledge Base
- [ ] Wind-aware anchoring guidance (Phase 2C — needs `HAS_ANCHORING_GUIDANCE` flag flip)

## Training Module — Content Build (Phase 2)
- [ ] SOP library — schema and tagging convention in Supabase defined
- [ ] SOP content authored and loaded
- [ ] Quick-hit video integration
- [ ] Short role-based checklists
- [ ] Safety reminders module
- [ ] Equipment basics training content

## Driver Profile / Compliance — Feature Build (Phase 2, Ready)
- [ ] Document upload — DOT medical card, West Point ID, site-specific credentials
- [ ] Expiration date tracking per document type
- [ ] 30-day reminder trigger before expiration
- [ ] Persistent alerts until document is updated
- [ ] Future: supervisor visibility to compliance status per driver

## Phase 2C — Wind-aware anchoring guidance (deferred)
- [ ] Author content layer
- [ ] Flip `HAS_ANCHORING_GUIDANCE = true` in `src/lib/weather/thresholds.ts`
- [ ] Wire stake/ballast guidance into wind cards on Tools weather screen + Stop Detail weather module

## Phase 2B — Tent-size threshold differentiation (deferred)
- [ ] Dashboard pipeline: TapGoods tent size flows through `dispatch_stops` (separate dashboard session)
- [ ] Flip `HAS_TENT_SIZE_DATA = true` in `src/lib/weather/thresholds.ts`
- [ ] Rain thresholds will then differentiate by tent size; the existing 30x40+ conservative defaults stay until that lands

## Phase 2.5 — Driver App Source of Truth Migration (Notion-tracked)
- [x] Phase A: Stop data from Supabase (replace TapGoods direct calls). 2.5a cleanup 2026-05-10 commit `15d3476` deleted the orphaned `/api/tapgoods/routes` handler + `tapgoodsClient.ts` + `tapgoodsQueries.ts` + `tapgoodsTransform.ts`. Driver app now exclusively reads routes/stops from Supabase via `/api/routes`. Surviving `tapgoods_*` column references in `src/types/supabase.ts`, `src/app/api/routes/route.ts`, `src/lib/supabaseTransform.ts`, and `src/config/externalApps.ts` are legitimate (column names + View Order URL template) and stay.
- [ ] Phase B: Live ETA + status sync (mostly done — Migration 033 + cascade live)
- [x] Phase C: Driver assignment from dashboard — auto-load shipped 2026-05-10 evening. New endpoint `/api/routes/assigned` + hook `useAssignedRoute` + DayRouteSelectorScreen wiring. Once-per-session redirect from `/` → `/route/<id>` on cold sign-in when the driver has a `route_assignments` row for today; manual day overview preserved as fallback for unassigned drivers, fetch failures, and post-redirect BottomNav returns to Home.

## Pre-trip inspection — edge cases to revisit (discovered 2026-05-09)

- [ ] **Trailer rows on `dvir_requirement = 'never'` trucks.** Screen 5 currently
      treats `towingTrailer !== false` as "show trailer rows" — for `'always'`
      and `'never'` trucks (no Screen 4 fired), `towingTrailer` stays `null`,
      so the full 12-row checklist renders. Conservative default: include
      trailer rows when we don't know. By definition `'never'` trucks don't tow,
      so hiding the trailer rows for that branch is safe. Low priority — the
      conservative default (show all 12) is compliant and harmless. Likely
      target: when `dvir_requirement === 'never'`, omit `TRAILER_CATEGORIES`
      from the visible list in `case 'checklist'`.
      Location: `src/screens/InspectionScreen.tsx`, `case 'checklist'`.

- [ ] **OOS auto-notify is user-facing copy only.** Screen 7's quiet green
      "Dispatcher has been notified · HH:MM" line on the OOS state promises a
      notification that doesn't actually fire. Today the dispatcher sees the
      OOS via the fleet board's red banner. Wire to real SMS/email in Phase 2
      per the Notion DVIR spec ("Phase 2 — SMS/email alert to designated
      maintenance contact when OOS defect raised").
      Location: `src/screens/InspectionScreen.tsx`, `case 'complete'` (OOS branch).

- [ ] **Non-transactional inspection submit.** `POST /api/inspection/submit`
      inserts `vehicle_inspections` first, then `vehicle_defects` rows. If the
      defects insert fails after the inspection succeeded, the driver has an
      inspection row with no defect rows — Home gate opens (status fetch sees
      a current inspection), but maintenance loses visibility into the flagged
      defects. Fail-open in the wrong direction. Fix with a Postgres RPC that
      wraps both inserts in a transaction. Until then, the existing TODO
      comment in the route handler documents the gap.
      Location: `src/app/api/inspection/submit/route.ts`, around the `defectRows.insert` call.

## Post-trip defect report — feature spec (discovered 2026-05-09, shipped 2026-05-10 partial)

- [x] **Build the post-trip defect report flow.** Built 2026-05-10. Surface lives on Home, appears after route complete, optional (no gate). Single screen with category picker, severity toggle, description, submit. Implementation diverged from the May 9 sketch: a single new column `vehicle_defects.reported_context` (instead of `inspection_type` + parallel `vehicle_inspections` row) was added in migration 009. Post-trip rows have `inspection_id = NULL` (the NOT NULL constraint was dropped in the same migration). Files: `src/components/PostTripDefectCard.tsx`, `src/app/api/defects/post-trip/route.ts`, `supabase/migrations/20260510_009_post_trip_reported_context.sql`. Wired into `src/screens/DayRouteSelectorScreen.tsx`. Category list duplicated locally in the new component pending pre-trip stabilization (TODO comment present in both surfaces).
- [ ] **Apply migration 009 to partytime-east.** Could not be pushed by the driver-app CLI due to the two-repo migration coordination problem (see lessons.md). SQL must be run by Darren via Supabase Studio SQL Editor. Verification SQL + step-by-step instructions in `tasks/open-questions.md`.
- [ ] **Extract 12-category list to `src/lib/defect-categories.ts`** when pre-trip stabilizes. Currently duplicated in `InspectionScreen.tsx`, `PostTripDefectCard.tsx`, `/api/inspection/submit/route.ts`, and `/api/defects/post-trip/route.ts` with `// TODO` markers in the new copies.
- [ ] **Optional: add `route_id` to `vehicle_defects`** so a post-trip defect carries an explicit route link rather than relying on `reported_at::date` for the per-route audit trail. Low priority. Open question logged for Darren.
- [ ] **Optional: real-time post-trip notification.** Today the post-trip submission writes to `vehicle_defects`; surfacing it to maintenance/dispatch is whatever the dashboard's existing defect view does. If push/SMS is desired (parallel to the planned pre-trip OOS auto-notify), that's a separate Phase 2 item.

## Active blockers
- Easy RFID Pro launch on Android (out of v1.1 scope)
- CoPilot destination import — final validation on real device
