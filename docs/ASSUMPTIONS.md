# ASSUMPTIONS — RFID Native Integration (feat/rfid-native-integration)

Every unknown encountered during the build, logged instead of guessed
(session guardrail). Format per entry: What I needed / What I did instead /
How to verify / Risk if wrong. An empty file is a red flag, not a success.

---

## [XR2 SDK] — Dev-doc PDF not available in the build environment

What I needed: `XR2_RFID_Dev_Doc_v2_92049981.pdf` (the brief says it's in the
project folder) to extract signatures, error codes, and RSSI tables.
What I did instead: extracted all of it from stronger evidence — `javap`
against the committed `janam-rfid-sdk.aar` binary (v2.5.0718), Janam's public
demo sources, and the 2026-06-12 on-hardware smoke-test notes — into
`partytime-rfid/docs/xr2-sdk-notes.md` (branch
`claude/partytime-rfid-scanning-nsoiu6`). That file supersedes the PDF.
How to verify: skim the notes file against the PDF on the machine that has
it; any delta should be recorded in the notes file, not silently trusted.
Risk if wrong: low — binary signatures can't lie about shape; only prose
semantics (param meanings for lockTag/addMask) are inferred and are flagged
as unverified in the notes.

## [Item Master paging] — Server silently caps `limit` at 200 — CONFIRMED + FIXED 2026-07-15

What I needed: nothing — this was found, not assumed. First live read against the
production API (host `cs.iot.ptshome.com`, reads only) returned exactly 200 rows
for `limit=1000`; probing showed the server caps any `limit` above 200 down to
200 and echoes `totalcount` (13,024) in the envelope.
What I did instead: `fetchItemMasterRows` no longer treats a short page as the
last page — it trusts the envelope's `totalcount` when present (stops early on a
short page only when `totalcount` is absent, and always on an empty page).
Regression-tested with a capping fake server (450 rows → 3 pages). The old
heuristic would have silently seeded 200 of 13,024 items (1.5% of the fleet).
How to verify: `RFID_LIVE=1 npx vitest run src/modules/rfid/tests/liveResolution.test.ts`
(dev server running) — asserts > 10,000 records seed.
Risk if wrong: none — verified against the live API; the sandbox may differ but
the totalcount logic degrades to the old behavior when the field is absent.

## [Item Master data hygiene] — observed live 2026-07-15 (13,024 rows)

What I needed: nothing — findings from the first full read, logged for filters.
What was observed: status is free text with live variants — `Ready to Rent`
(4,248) AND `Ready To Rent` (281, legacy case variant); 41 rows with empty
status; 34 rows with empty tag_id/common_name/rental_class_num (placeholder
rows). Quality vocabulary live is `A+ A A- B+ B B- C+ C C-` (no `D` in use;
4,628 records are `A+`; 1,889 empty; one garbage value holding an EPC). The
Touch Scan quality dropdown currently offers A/B/C/D + the record's own value —
records keep their real grade, but the picker can't SET `A+`/modifier grades.
How to verify: re-run the live harness; counts drift with operations.
Risk if wrong: low — but any exact-string status filter must remember the
`Ready To Rent` case variant, and the quality dropdown should adopt the real
vocabulary before drivers write quality with it.

## [Easy RFID Pro] — No sandbox credentials or API base on this machine

What I needed: credentials + the sandbox's actual API/auth hosts to run live
sandbox write verification (`sb-easyrfidpro.ptshome.com` is the app host; the
production API is env-configured as cs.iot/login.cloud hosts — the sandbox's
equivalents are not derivable from code, and no `.env.local` exists here).
What I did instead: built the client exactly per guardrails —
`EASY_RFID_BASE_URL` env with the sandbox as default, a guard that refuses
writes to any non-sandbox host unless `EASY_RFID_ALLOW_PRODUCTION` is set
(it is not), startup host assertion + log — and ran ALL session verification
against the fake API layer (which reproduces the live API's confirmed
behaviors: HTTP-200-wrapped failures, `isWriteSuccess` body contract).
How to verify: on a machine with credentials, set `EASY_RFID_BASE_URL` +
credentials for the sandbox, run the delivery/pickup flows, confirm rows in
the sandbox console.
Risk if wrong: medium — if the sandbox API path/shape differs from the
production contract encoded in `partytime-rfid/src/lib/ezrfid.ts` (upsert
operation wrapper, filter syntax, wrapped-401s), the first live run will
surface it; no live writes can happen until someone deliberately supplies
the env, so nothing can be silently wrong in production.

PARTIALLY RESOLVED 2026-07-15: production credentials are now wired into this
app's `.env.local` (copied from `~/partytime-rfid/.env.local`, hosts
`cs.iot.ptshome.com` / `login.cloud.ptshome.com`). READS are proven live —
login (`/api/v1/login` → `access_token`), paged Item Master GET, 13,024
records seeded through the real client path. The startup guard correctly
logged `NON-SANDBOX — WRITES WILL BE REFUSED`. Still open: the SANDBOX's
API/auth hosts remain unknown, so live WRITE verification (batch upsert,
`success_count == N`) is still blocked — it needs sandbox hosts + creds, or a
deliberate, Darren-approved production test with `EASY_RFID_ALLOW_PRODUCTION`.

## [Bridge] — HAL operations with no bridge support on the XR2 path

What I needed: bridge methods for `readTag` / `writeTag` / `writeTagEpc` /
`setInventoryParameter` / `addMask` / `clearMask` / `getOutputPower`, and TID
delivery on scan events, so the TS `Xr2Scanner` could implement the full HAL.
What I did instead: `Xr2Scanner` implements what the current
`window.rfidBridge` contract supports (inventory start/stop, setPower,
findEpc, barcode, NFC) and throws typed `NotSupportedError` for the rest;
`capabilities.tagMemoryAccess` and `capabilities.inventoryTuning` are `false`
on the XR2 path so UI feature-gates instead of crashing. `TagRead.tid` is
`null` (the `rfid-scan` event carries EPC/rssi/timestamp only). MockScanner
implements the full surface, so the contract is exercised in tests.
How to verify: n/a until the Android bridge is extended (Kotlin work in
partytime-rfid: add bridge methods + events, then flip capabilities).
Risk if wrong: low for this session's features (none require tag-memory
access); locate/assign features in later phases will need the extensions.

## [TapGoods] — Status strings for delivery/pickup completion

What I needed: the real TapGoods API values for "delivered" (legacy UI shows
`Delivered`; specs reference `in_use`) and pickup completion (specs reference
`checked_in`).
What I did instead: no driver-app code writes ANY TapGoods status — the only
proven write path is the quantity-based pick-list write-back via the
dashboard proxy (`POST {dashboard}/api/tapgoods/dispatch/write-back`,
`{stop_id, lines:[{tapgoods_pick_list_item_id, qty}]}`). Dry-run payloads use
that real shape. The speculative status transition (`in_use` / `checked_in`)
is carried in the dry-run payload under `speculative.statusTransition` and
clearly labeled — it is logged for Darren's manual verification, never sent.
How to verify: Darren checks the dashboard write-back route's actual TapGoods
calls (partytime-dashboard repo) or the TapGoods API docs against a labeled
test order.
Risk if wrong: none this session (dry-run only); the merge session must
resolve it before any live TapGoods write.

## [Batch apply] — Easy RFID Pro batch write shape

What I needed: confirmation whether batch status apply is one call with N
rows or N calls (brief says determine from the sandbox — no sandbox access
here).
What I did instead: one upsert call with multiple rows in
`operation.upsert[]` — this matches the production contract reverse-engineered
live on 2026-07-02 (the endpoint accepts an array; `isWriteSuccess` checks
`failed_count`), and the pickup-return spec's expectation.
How to verify: run one batch pickup against the sandbox; confirm N rows
changed and `success_count == N` in the response body.
Risk if wrong: low — worst case the client falls back to per-row calls; the
port interface (`writeItemStatuses(writes[])`) doesn't change either way.

## [Expected items] — Matching stop items to replica items

What I needed: a deterministic key linking the host's expected item lines
(TapGoods pick-list: name/qty/line id) to replica item records
(rental_class_id keyed). The mapping table (`rfid_to_tapgoods_map`, 548 rows,
397 known gaps) lives in Supabase in the partytime-rfid project scope and is
not readable from this build environment.
What I did instead: the module matches via an injectable `rentalClassId` on
`ExpectedItem` when the host supplies it, else falls back to normalized-name
matching against replica `commonName`; unmatched scans surface as
"scanned-but-not-expected" exceptions rather than being force-matched.
How to verify: wire the real mapping (host-side join against
rfid_to_tapgoods_map when building StopContext) at merge time; run a real
stop and count exceptions.
Risk if wrong: medium — name matching will miss renamed items and produce
noisy exceptions; it can never mis-write (writes key on scanned EPC, not on
the match).

PROGRESS 2026-07-15 (read-only investigation): `rfid_to_tapgoods_map` IS in
the shared Supabase and readable with this app's service key — 548 rows, all
`match_type='manual'`, zero null `tapgoods_item_id`. Join key CONFIRMED
against the real Item Master: `rfid_item_id` equals the Item Master's
`rental_class_num` (= replica `rentalClassId`) for 547/548 rows. Coverage:
548 of 947 distinct rental classes in the live fleet (~399 classes unmapped —
those lines stay name-match/manual). STILL UNKNOWN: what `tapgoods_item_id`
(8-hex, e.g. `A0840FE9`) keys to on the stop side — `dispatch_stops.items`
lines carry only name/qty/category/`tapgoods_pick_list_item_id`, so the
merge-time StopContext builder needs the tapgoods_item_id ↔ pick-list-line
linkage (likely via `reservations.tapgoods_data`) before `ExpectedItem.
rentalClassId`/`taggable` can be set from the map instead of the name.

## [Delivery] — Exact "delivered" status string

What I needed: the exact free-text status value a delivery write should set
(the six-status vocabulary is the PICKUP set; delivery is separate).
What I did instead: `DELIVERY_STATUS = 'Delivered'` in
`src/modules/rfid/flows/checkoutFlow.ts` — sourced from partytime-rfid
CLAUDE.md doctrine ("Delivery write: status = 'Delivered'"), but the
delivery-checkout spec itself warns the value must be confirmed against a
live record (status is free text, not an enum).
How to verify: GET one item that the legacy app marked delivered; read its
`status` field verbatim.
Risk if wrong: medium — a mismatched string forks the dataset (filters/
conflict checks won't see legacy-delivered items as delivered). One-line fix.

RESOLVED 2026-07-15: confirmed against the live Item Master — 237 records
carry exactly `Delivered` (and all six pickup-vocabulary statuses appear live
verbatim: Needs to be Inspected / Ready to Rent / Repair / Staged / Wash /
Wet). `DELIVERY_STATUS = 'Delivered'` is correct as shipped.

## [Pickup] — Default status for unflagged returned items — RESOLVED 2026-07-13

RESOLVED by Darren's scan-model correction: there IS no default. The status
is chosen BEFORE scanning (armed), every scanned unit is stamped with the
armed status, and an item never scanned back gets NO write at all — it
retains 'Delivered' upstream. `DEFAULT_RETURN_STATUS` was removed from
`src/modules/rfid/flows/checkoutFlow.ts`; `CheckoutFlow.ingest` now throws in
pickup mode until `armStatus()` has been called (Wash/Repair collect their
required reasons at arm time).

## [Scan model] — Non-RFID line detection ("taggable")

What I needed: a per-line signal that a stop's expected item carries no RFID
tag (those lines never enter the scan path; they are completed manually as
individual serialized assets or bulk quantities).
What I did instead: added `ExpectedItem.taggable?: boolean` to the adapter
contract for the host to set (PTR: derivable from the rfid_to_tapgoods_map
join at merge time — mapped rental class ⇒ taggable). Default heuristic when
the host omits it: `rentalClassId !== null`. `CheckoutFlow.matchLine` only
matches taggable lines; manual entry refuses taggable lines.
How to verify: at merge time, wire the host StopContext builder to set
`taggable` from the mapping table; confirm a known untagged line (e.g. dance
floor) renders in the Manual items section.
Risk if wrong: medium — a mis-flagged taggable line would force manual entry
on a scannable item (annoying, not corrupting); the reverse would leave a
line unscannable but visibly short in the summary.

## [Scan model] — Serialized-asset source for manual units

What I needed: where the list of individually-serialized non-RFID assets
lives so the driver can pick real units (the replica is EPC-keyed, so
untagged serialized assets are not in it).
What I did instead: free-entry — `ManualItemRow` lets the crew add units one
at a time with an optional serial # (defaults to "Unit N"); stored on the
line as `manualUnits: string[]` and counted toward `confirmedQty`. No
invented catalog lookup.
How to verify: ask Darren whether Easy RFID Pro Item Master rows exist for
untagged serialized assets (serial_num populated, no tag) — if so, a picker
can replace free entry in a later session.
Risk if wrong: low — worst case serials are typo-prone free text; quantities
stay correct either way.

## [GPS] — Capture NOT confirmed against a real permission grant

What I needed: confirmation that `navigator.geolocation`-backed capture
works end-to-end in the Android WebView against a real runtime permission
grant (ACCESS_FINE_LOCATION dialog → WebView geolocation callback → lat/long
on the write).
What I did instead: everything runs through the injectable
`LocationAdapter` (`getCurrentPosition(): Promise<GeoPoint | null>`, resolves
null on denial/timeout, never rejects); all session verification used mock
adapters. The real adapter + the WebView's `onGeolocationPermissionsShowPrompt`
wiring in the Android wrapper have NOT been exercised against a real grant.
How to verify: on-device (XR2) — grant location, run one Touch Scan status
write, confirm lat/long land in the queued payload; then deny and confirm the
write proceeds coordinate-less.
Risk if wrong: medium — writes degrade gracefully to no-GPS by design, so
nothing breaks; but the "GPS included on every write" doctrine is silently
unmet until the device test passes.

## [Touch Scan] — Quality dropdown vocabulary

What I needed: the confirmed option list for the Quality dropdown.
What I did instead: A/B/C/D + whatever value the record already carries
(`TouchScanScreen.ItemDetailCard`). Existing fixture/replica data only shows
single-letter grades.
How to verify: check the legacy app's quality dropdown or distinct
`quality` values across the live Item Master.
Risk if wrong: low — free-text field upstream; wrong options just annoy.

## [Device detect] — Bridge has no device-identity query

What I needed: a way to ask the native wrapper WHICH device it is, for honest
auto-detect once a second wrapper (C72) exists.
What I did instead: bridge-present ⇒ XR2 (the only wrapper that injects
window.rfidBridge today), manual override in Settings storage
(`rfid_scanner_override`), dev-build Mock fallback, production explicit error
(`selectScanner` — never silent).
How to verify: n/a today; add `getDeviceModel()` to the Android bridge before
shipping a second wrapper.
Risk if wrong: none until a second native wrapper exists.

## [Build env] — Container builds need placeholder Supabase env

What I needed: `npx next build` green as the pre-push gate.
What I did instead: the build container has no `.env.local`; existing app
routes (e.g. /api/ava/route-weather) construct Supabase clients during page-
data collection and throw without env. Verified my branch touches zero AVA
files, then built with placeholder NEXT_PUBLIC_SUPABASE_URL/ANON_KEY +
SUPABASE_URL/SERVICE_KEY values. Pre-existing condition, not introduced here.
How to verify: build on a machine with the real .env.local — no placeholders
needed.
Risk if wrong: none at runtime (placeholders are build-time only, never
committed).

## [Hardware trigger] — Behavior when the barcode toggle is armed during a trigger hold

What I needed: how the physical trigger should behave when the driver has the
Barcode toggle armed and then holds the trigger.
What I did instead: the web layer always treats a trigger press as the RFID
press-and-hold (useHardwareTrigger → scanStart). But Session 14 (partytime-rfid)
proved that with a barcode session armed the FRAMEWORK also drives the imager
on the same physical trigger — so a hold with barcode armed may fire BOTH the
RFID inventory (web-decided) and a barcode decode (native-decided) at once.
How to verify: on an unlocked XR2 with the module runtime up: arm Barcode,
hold the trigger over a tag + a barcode; observe whether both modalities land
and whether that's desirable (both paths dedupe/resolve safely, so it may be
fine — or the imager fire may surprise the driver).
Risk if wrong: low — both events resolve through the same ScanSession intake
and unit-level dedupe; worst case is a surprising double-capture UX, not bad
data.
