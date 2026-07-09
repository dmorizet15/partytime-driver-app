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
