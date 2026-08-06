# Field media intake — driver → marketing

Phase 1 shipped 2026-08-06, migration 030, v2.11.0 (`main` `4812ffa`, PR #6). Phase 2 the same day, migration 031, v2.12.0.

**Phase 2 adds:** a bounded window on the completed-stop tile, a generic (non-stop) uploader on the driver profile, and a library picker alongside live capture on the shared sheet.

Drivers capture a photo or a clip on a customer stop and it reaches marketing already labelled with the job. Nothing auto-publishes.

---

## Why the private bucket exists (do not "simplify" this away)

`marketing-media` is `public: true`. **Public is a bucket-wide flag** — every object in it is readable by anyone holding the URL. Driver footage is photos and video of customers' homes and events, so it cannot live there.

Two further facts, both verified live on 2026-08-06:

- The only INSERT policies on `marketing-media` are **`TO anon`** (`photo_intake_anon_insert`, `video_intake_anon_insert`). Postgres roles do not inherit, so a signed-in driver — role `authenticated` — could not have written there anyway.
- `social/video-intake/` in that bucket has **zero objects. It has never been used.**

So driver media goes to a **new private bucket, `field-media-intake`**, keeping the same `social/intake/` and `social/video-intake/` prefixes so the marketing sweep only has to change which bucket it reads and mint a signed URL.

**The existing public path is untouched.** `tools/intake.html`, the `media-ingest` edge function, `photo-intake`, and both anon policies all keep working exactly as they did.

---

## ⚠ The project-wide storage upload limit is the real ceiling

A bucket's `file_size_limit` **cannot exceed the project global** (Dashboard → Project Settings → Storage → "Upload file size limit"). Probed with the service role on 2026-08-06:

| Payload | Result |
|---|---|
| 49 MB | `HTTP 200` |
| 60 MB | `HTTP 400`, `statusCode 413`, `EntityTooLarge` |

The global was **50 MB**. Migration 030 sets the bucket to 500 MB and `config.ts` matches, but **that is inert until the global is raised** — Darren agreed to raise it to ~500 MB on 2026-08-06. Resumable (tus) uploads do **not** bypass it.

For scale, Apple's own capture rates for a 60-second clip: 1080p HEVC ≈ 40 MB, 1080p H.264 ≈ 65 MB, 4K HEVC ≈ 135 MB, 4K ≈ 190 MB. **If video uploads start failing around 50 MB with `EntityTooLarge`, the project global is the thing to check first — not the bucket, not the code.**

---

## Architecture

**The capture sheet never uploads.** It validates, writes the blob to IndexedDB and closes. Upload is driven from a module-level store in `src/lib/fieldMedia/service.ts`, kicked by `loadDay` and by the `online` / `visibilitychange` listeners `AppStateContext` already owns.

That is the whole design constraint, stated by Darren: capturing media must never interfere with the driver moving to the next stop or completing anything. It also matches existing doctrine — the App Router unmounts screens on navigation, which is why the co-driver realtime subscription lives in `AppStateProvider` rather than a screen. `<FieldMediaChip/>` is mounted in `src/app/layout.tsx` beside `<PwaUpdater/>` for the same reason.

**Transport split.** Photos take the ordinary `supabase.storage.upload()` (a few hundred KB after compression, cheap to retry). Video takes **tus** (`tus-js-client`) against `/storage/v1/upload/resumable` with 6 MB chunks — Supabase requires exactly 6 MB — so a dropped LTE connection resumes rather than restarting a 100 MB transfer. tus persists its checkpoint in localStorage, so a resume survives a reload.

**The row is written server-side, and that is load-bearing.** `POST /api/media/intake` takes only `stop_id` and `storage_path` from the client and derives every tag column itself from `dispatch_stops` under the service role, behind the same crew gate `equipment-returns` uses. `marketing_media_intake` has **no INSERT policy at all** — service role is the only writer. A client therefore cannot label a clip with a customer it made up. Verified: a simulated `authenticated` insert is blocked `42501`.

**Path validation.** The route rebuilds the expected path and regex-matches it against what the client sent, so a caller cannot point a row at somebody else's object. Verified: valid path passes; another stop's id, a `../` traversal, and a photo claiming the video prefix all fail.

**Idempotency.** `storage_path` is UNIQUE and a duplicate POST is treated as success (`ignoreDuplicates`). The client uploads first and posts second, so a retried post after a successful insert must not 500 and strand the record in the queue forever. Verified: two posts → one row.

**Snapshot, not a join.** `company_name` / `customer_name` / `client_company` / `address` / `scheduled_date` / `event_start` / `event_end` are copied onto the row. TapGoods sync rewrites `dispatch_stops` (dates drift, orders get renamed), and a marketing asset has to record the job as it was on the day it was shot. All **three** names are stored per the three-name rule — 407 of 958 live stops carry a `client_company` whose text appears nowhere in `customer_name`.

---

## Placement

A 4th tile, **Add Media**, in Stop Detail's QuickAction grid (`repeat(2, 1fr)` when shown, `repeat(3, 1fr)` on depot legs where it's hidden). Rendered on `delivery` / `pickup` / `service` only — a warehouse leg has no customer or event to tag, and an untagged upload is the exact thing this feature exists to prevent.

**It is deliberately NOT in the pinned CTA block.** That space is reserved for controls a driver must see to avoid harm (Landmine #1). This is optional and must not compete with the Complete button.

**Add Media survives completion — deliberately, and it's the only action that does** (v2.11.1). `StopDetailScreen.tsx:2275` is a hard `isCompleted ?` ternary: once a stop is complete the entire ActionCard is replaced by the Delivered card, taking Open in Maps, View Order, POD Photo and Report an issue with it. That is wrong for media specifically — a driver taps Complete, steps back, and *only then* is looking at the finished setup worth photographing. So a second entry point renders inside the Delivered card. `/api/media/intake` needed no change: it gates on route crew, never on completion.

⚠ The other four actions are still gone after completion. That was pre-existing and is untouched — but it has not been confirmed as intentional, so don't cite it as a rule.

Consent is a **hard gate on the Send button**, not a soft prompt below it. The 2026-07-13 equipment-returns lesson applies: a prompt nobody reaches is a prompt that doesn't exist.

---

---

## Phase 2 (mig 031, v2.12.0)

### Two sources, one table

`marketing_media_intake.source` is `'stop'` or `'generic'`. Marketing reads one place; generic rows differ only by `stop_id` null, every job-tag column null, `source = 'generic'`, and a caption that is **mandatory**.

`source` is **optional on the wire and defaults to `'stop'`** — a capture queued in IndexedDB before this deploy predates the field and was stop-tagged by construction. Dropping those would lose a driver's footage.

The contract is enforced **structurally, not only in the route**:

```sql
CHECK (source <> 'generic'
       OR (stop_id IS NULL AND caption IS NOT NULL AND btrim(caption) <> ''))
```

A generic row with no description is an unlabelled file — the exact problem this feature exists to end. Verified in preview: no caption, blank caption, and a generic row carrying a `stop_id` are all rejected.

⚠ **There is deliberately no mirror check** that `source = 'stop'` implies `stop_id IS NOT NULL`. `stop_id` carries `ON DELETE SET NULL`, which fires as an UPDATE on the row and would re-evaluate the constraint — making it impossible to delete a `dispatch_stops` row. The asymmetry is intentional. Leave it.

### Generic storage paths

```
social/generic-intake/generic-{driverId}__{epochMs}.{ext}        # photo
social/generic-video-intake/generic-{driverId}__{epochMs}.{ext}  # video
```

Same private bucket. No `stop-` prefix, so the two kinds can never be confused by a path match on either side. **The path keys on the driver, and the route matches it against the authenticated uid** — never anything the client sent — so a caller cannot file a row against another driver's object. Verified: another driver's path and a `../` traversal both fail the regex, and a generic path fails the stop regex and vice versa.

### The completed-stop window

`COMPLETED_STOP_MEDIA_DAYS = 1`. An **open** stop always offers the tile. A **completed** one offers it only for today's or yesterday's route (`withinCompletedMediaWindow`, keyed on `route.operating_date` with `completed_at` as fallback). Reaching further back puts a live upload control on stops the route list intentionally hides. Anything older belongs on the profile uploader.

**It fails closed** — no date and no `completed_at` means no tile, because a missing signal must not silently re-open every historical stop. The route-list hide logic itself is untouched; this only bounds where the tile appears.

### Capture sources

The shared `MediaCaptureSheet` offers **Take now** (Photo / Video, `capture="environment"`) and **Choose from library** — the same `<input type="file">` *without* `capture`, which is what opens the iOS Photos picker / Android gallery. Both sources funnel through one `handlePick`, so caps, compression, duration probing, consent and upload cannot diverge. Library picks are validated **before** anything is queued, with wording that fits ("choose or trim a clip under 60 seconds", not "record a shorter one").

⚠ **Permissions:** this is a web PWA, not a native shell — there is no PHPicker / `expo-image-picker` call to make and **no permission API to query**. The OS prompts per action on its own, and a denial is indistinguishable from an ordinary cancel: the input's change event simply never fires. `handlePick` returns early on no file and the sheet stays open. There is deliberately no "permission denied" state, because inventing one would show a scary message to everyone who merely changed their mind.

**Orientation:** `compressImage` now prefers `createImageBitmap(blob, { imageOrientation: 'from-image' })`, which resolves EXIF rotation before rasterising. This matters far more for library picks than fresh captures — an old photo is much more likely to carry a non-default orientation, and `new Image()` → canvas does not reliably bake that in. ⚠ The canvas re-encode still drops all *other* EXIF including **GPS**, which is deliberate and worth keeping: the coordinates of a customer's property have no business in a marketing library. Video passes through untouched and keeps its metadata.

---

## Handshake for the marketing side (owned outside this repo)

- Bytes land in **`field-media-intake`** (private), prefixes `social/intake/` (photo) and `social/video-intake/` (video).
- Filenames are `stop-{stopId}__{epochMs}.{ext}`. The `stop-` prefix cannot collide with a real post code under the ledger's space-anchored code match.
- Generic (non-stop) captures land in `social/generic-intake/` and `social/generic-video-intake/` in the **same** private bucket, named `generic-{driverId}__{epochMs}.{ext}`.
- Full context is in **`public.marketing_media_intake`**, joined to storage on `storage_path`. Split the two kinds on **`source`** (`'stop'` | `'generic'`). A generic row has `stop_id` null, every job-tag column null, a **guaranteed non-empty `caption`** (DB-enforced), and an optional free-text `category`.
- The sweep must read with the **service role** and mint signed URLs — anon and public GETs both return 400 (verified).
- `review_status` is the triage column: `new` → `kept` / `rejected` / `published`. An asset becomes public only when Darren approves a specific post.
- `consent_confirmed` / `consent_at` record that a driver confirmed the customer was OK with marketing use. **Do not publish a row without it** — the API route rejects a capture that lacks it (`400 consent_required`), so `false` should never appear, and if it does, something wrote the row outside the route.

---

## Files

| File | Role |
|---|---|
| `supabase/migrations/20260806030_field_media_intake.sql` | bucket + 4 storage policies + table + RLS |
| `src/lib/fieldMedia/config.ts` | bucket, caps, path builder — the one place any of it is defined |
| `src/lib/fieldMedia/offlineQueue.ts` | IndexedDB `ptd-field-media`, store `queue` |
| `src/lib/fieldMedia/resumableUpload.ts` | tus wrapper (video only) |
| `src/lib/fieldMedia/service.ts` | validation, upload, POST, flush, the chip's store |
| `src/lib/imageCompress.ts` | extracted from `StopDetailScreen`, now shared with POD |
| `src/app/api/media/intake/route.ts` | the only writer of `marketing_media_intake` |
| `src/components/media/MediaCaptureSheet.tsx` | capture + caption + consent |
| `src/components/media/FieldMediaChip.tsx` | app-wide progress + Cancel |
