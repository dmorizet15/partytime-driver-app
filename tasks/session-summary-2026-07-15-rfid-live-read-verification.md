# Session Summary — 2026-07-15 — RFID Live-Read Verification (branch `feat/rfid-native-integration`)

**For chat-Claude to update Notion. Claude Code does not write Notion.**

## Scope

Prove the Easy RFID Pro integration from the laptop with MockScanner standing in for the radio. No physical device. Reads only — zero writes sent anywhere; TapGoods stayed dry-run locked; the Easy RFID production write guard stayed on (and was observed firing). `main` untouched; all work on `feat/rfid-native-integration` (head `b9c7186`).

## What shipped

1. **Plain-language orientation block** at the top of CLAUDE.md's RFID section (own commit `afd1d05`) — states in owner-readable terms that RFID is not live, no driver has it, and what remains before a device test.
2. **Credentials wired** — the four `EZRFID_*` vars copied from `~/partytime-rfid/.env.local` into the driver app's `.env.local` (confirmed gitignored FIRST — the repo is public), plus the `EASY_RFID_*` names the module reads. Hosts are PRODUCTION (`cs.iot.ptshome.com` / `login.cloud.ptshome.com`); startup guard logged `NON-SANDBOX — WRITES WILL BE REFUSED`, which is exactly the wanted state for a read-only session.
3. **THE FIND — Item Master paging bug, fixed (`1cd2353`).** The real API silently caps `limit` at 200. The client's "short page = last page" heuristic stopped after one page — it would have seeded **200 of 13,024 records (1.5% of the fleet)** and every mock test passed anyway (fixtures never exceeded one page). `fetchItemMasterRows` now trusts the envelope's `totalcount`; regression-tested with a limit-capping fake server (3 new tests).
4. **Full live seed proven:** auth → token → 13,024 records in ~12–13s through the real client path (~66 paged requests).
5. **EPC resolution proven against real data:** permanent `RFID_LIVE=1`-gated harness (`src/modules/rfid/tests/liveResolution.test.ts`, honestly SKIPPED in CI) — real API seeds the real replica code, MockScanner emits a real EPC through ScanSession, resolved common name / rental class / quality / status all match; then `fetch` is killed and the DB closed + reopened (app restart) and resolution still works offline. Method caveat, reported honestly: run in Node over fake-indexeddb (the same real IndexedDB code the offline suite exercises), not in Chrome — page routes are login-gated and no driver credentials exist on this laptop; no test users were created in shared production auth.
6. **Version-guard trap defused (`b9c7186`).** The branch CLAUDE.md told sessions to tag branch commits `[skip version]`, but `check-version-bump.mjs` skips its check when ANY commit in the diff range carries the tag — branch commits with it would have silently disabled version enforcement on the eventual merge to `main`. Two commits reworded to strip it (force-pushed clean); merge note corrected.

## Assumptions resolved by real data (docs/ASSUMPTIONS.md updated)

- `'Delivered'` status: CONFIRMED verbatim (237 live records). All six pickup statuses appear live exactly as coded.
- Quality vocabulary: live is `A+ A A- B+ B B- C+ C C-` — no `D` in use; 4,628 records are `A+`, which the current dropdown can't set. Small fix queued in todo before drivers write quality.
- Data hygiene: legacy `Ready To Rent` case variant (281 rows), 41 empty statuses, 34 placeholder rows with no EPC/name/class — exact-string filters must account for these.
- Sandbox-credentials entry: PARTIALLY RESOLVED — reads proven on production; sandbox API/auth hosts still unknown, so write verification stays blocked.

## State of the three open items (device-session planning)

1. **rfid_to_tapgoods join:** `rfid_to_tapgoods_map` is in the shared Supabase, readable with the driver app's service key — 548 rows, all `manual`, none null. Replica-side join key CONFIRMED: `rfid_item_id == rental_class_num` (547/548 against the real Item Master). Coverage 548/947 fleet rental classes. Remaining unknown: what `tapgoods_item_id` (8-hex) keys to on the stop side (stop lines carry only name/qty/pick-list-line id) — likely resolvable via `reservations.tapgoods_data` at merge time.
2. **Batch write:** request shape is ready — `POST {base}/api/v1/data/14223767938169344381` with `{operation:{upsert:[rows]}}`, success = `result.success && failed_count == 0`. Blocked on sandbox hosts/creds (wired creds are production, guard-refused by design) or a deliberate Darren-approved labeled production test with `EASY_RFID_ALLOW_PRODUCTION`.
3. **GPS:** host `LocationAdapter` fully wired (60s cache, null on denial, never blocks a write); lat/long ride every status write. Device test must exercise grant (coords land in payload) AND deny (write proceeds coordinate-less).

## The honest bottom line

**The device test is justified next.** The read half is proven against production data; the one thing real contact surfaced (the paging cap) is found, fixed, and regression-tested — far better caught here than on a device. Nothing the real API returned contradicts the build. Caveat: the write path has never touched a real server and is blocked on sandbox hosts, not laptop work — the device test can proceed on scanning/GPS/UX, but write verification must land (sandbox or labeled production order) before any driver uses this for real.

## Verification

- 72 tests: 71 passed + 1 gated live (passes with `RFID_LIVE=1` + dev server; skipped otherwise, never faked).
- `tsc --noEmit` clean; `npx next build` green (38 pages).
- Zero writes: only GET/login calls left this machine; guard + dry-run locks observed intact.

## Commits (all on `feat/rfid-native-integration`, none on `main`)

- `afd1d05` docs: plain-language RFID orientation block
- `1cd2353` fix(rfid): page past the API's silent 200-row limit cap; live-read verification vs real Item Master
- `b9c7186` docs: correct merge note — no [skip version] on branch commits
