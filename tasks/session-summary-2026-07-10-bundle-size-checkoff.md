# Session Summary — Bundle size during check-off + AVA (2026-07-10)

**For chat-Claude to update Notion. Claude Code does not write Notion.**

## Headline

Darren reported: at Camp Kinder Ring (route 1, today), the driver only saw
"15× STAGE 4'X4'" with no indication it builds a 12'×20' stage. He was sure we
had built functionality to show the assembled stage size and asked why it broke.

**It never broke — the feature was wired to the wrong screen.** Shipped a fix
(driver `7faf460`, on `main`, **v2.6.1**, **no migration**). Migration count
stays **29**.

## Root cause (investigation)

- Live data is correct. `dispatch_stops 2e92751c` carries
  `bundle_name: "STAGE 12'X20'"` on the `STAGE 4'X4' ×15` line
  (15 × 16 sq ft = 240 = 12×20 ✓). **This confirms the dashboard TapGoods sync
  IS writing `bundle_name`** — closing the "confirm the sync writes bundle_name"
  check that had been pending in CLAUDE.md since 2026-06-18.
- Bundle grouping (driver `c862d24`, 2026-06-18) only ever rendered in the
  **static** manifest branch of `StopDetailScreen` (`!checkoffActive`), which
  shows **after** a stop is completed.
- But `checkoffActive` is true for **every delivery/pickup with items that isn't
  completed** — exactly when the driver is standing at the stop building the
  stage. In that state `ItemCheckoffPanel` renders instead, and it had **zero**
  `bundle_name` awareness → flat "STAGE 4'X4' ×15", no size. The header only
  appeared post-completion. Backwards from when it's useful.
- **Not a regression.** Inline check-off (`8869246`, 2026-06-10) shipped 8 days
  BEFORE bundle grouping (`c862d24`, 2026-06-18), so grouping was born into a
  branch an active delivery stop never hits. It was even a documented scope-out
  at the time ("ItemCheckoffPanel branch untouched — out of scope").

## What shipped (v2.6.1, `7faf460`)

1. **`ItemCheckoffPanel`** now renders bundle section headers (uppercase
   `FONT_DISPLAY`, 28px-indented member rows, no border between a header and its
   first item) — mirroring the static manifest. **Landmine handled:** rows are
   built from `lines`, NOT `items`; each row keeps its original `line.index`, and
   accept / short-count / damage / commit all key off `line.index`. Grouping
   reorders only the display — a short-count can never land on the wrong item.

2. **AVA** (`src/lib/ava/routeContext.ts`) is now bundle-aware: new
   `stopItemsList()` emits `15× STAGE 4'X4' (assembles into STAGE 12'X20')` per
   stop, keyed by name+bundle. `aggregateItems()` untouched → the
   `DELIVERING:` / `PICKING UP:` totals stay byte-for-byte identical.
   `ROUTE_USAGE_RULES` tells AVA to lead with the assembled size ("a 12 by 20
   stage, built from fifteen 4 by 4 decks"). Verified against the real
   production row via a tsx harness.

3. **VERSION 2.6.0 → 2.6.1** + 2 driver-facing CHANGELOG bullets (per the
   auto-bump rule; this touches `src/components` + `src/lib`).

**Verify:** `tsc --noEmit` clean; `next build` green (38 pages); version guard
confirmed the bump; pre-push hook passed.

## Driver-facing changelog copy (Darren may correct)

- "Stage and deck pieces now show the size you're actually building —
  'STAGE 12'X20'' sits above its 15 loose 4x4 decks while you check the stop
  off, not just after"
- "Ask Ava what size stage you're building and she'll tell you the finished
  size, not just the piece count"

## Open item flagged for chat-Claude → Notion / dashboard

**Bundle sync extension.** The driver side is fully generic — it renders/reads a
bundle header for ANY item carrying `bundle_name`. But the **dashboard TapGoods
sync currently tags `bundle_name` only on FLOORING & STAGING deck items.** Every
other TapGoods bundle (multi-piece tent kits, dance-floor tiles, staging
accessory kits) arrives without it, so drivers still see loose pieces with no
assembled-size label for those types — same problem we just fixed for stages,
still live elsewhere.

**Decision for Darren:** extend the sync to tag `bundle_name` on all
bundle-backed TapGoods items? If yes → dashboard-repo change to the sync's
item-mapping only, **zero driver-app work**, lights up automatically next sync
cycle. Low risk (additive field on items JSONB, already flowing through).
Recorded in `tasks/open-questions.md`.

## Commits (all on `main`)

- `7faf460` — fix(manifest): show bundle size during check-off + teach AVA bundles (v2.6.1)
- `d19d679` — docs: record fix + confirm sync writes bundle_name `[skip version]`
- `414831d` — docs: flag bundle-sync extension to chat-Claude `[skip version]`

## On-device smoke (the gate)

Open route 1's Camp Kinder Ring delivery stop in check-off → confirm the
"STAGE 12'X20'" header shows above the indented "STAGE 4'X4' ×15" row; ask AVA
"what size stage am I building?" → she names the 12×20.
