# Session summary — AVA Phase 1 · Session 1

**Date:** 2026-05-27
**Branch:** `feature/ava-phase1`
**Commit:** `c43192c`
**Status:** Pushed to branch (Vercel preview deploy). NOT merged to `main`.

---

## What shipped

Schema foundation + Tier 1 presence (header chip) on every screen. Two of nine Phase 1 components delivered. Remaining seven ship in later sessions on the same branch; merge to `main` happens only when all nine are in.

### Schema — 3 migrations applied to `partytime-east`

| File | Adds | RLS |
|---|---|---|
| `20260527013_ava_profile_columns.sql` | `profiles.checklist_enabled` (default true), `personality_preference` text default `'direct'` CHECK in `('direct','personality')`, `stats_enabled` (default false) | Existing profiles RLS covers |
| `20260527014_ava_conversations.sql` | Q&A log table — `driver_id`, `surface` (5-value CHECK), `context_id`, `question`, `answer`, `confidence` (3-value CHECK), `needs_review`, `helpful`, `created_at`. Indexes: `(driver_id, created_at DESC)` + partial `(needs_review, created_at DESC) WHERE needs_review` | Driver R/I own; super_admin reads all via `'super_admin' = ANY(p.roles)` |
| `20260527015_ava_stop_notes.sql` | Address-keyed notes for AVA Remembers — `address_key`, `raw_address`, `note`, `author_id` (ON DELETE SET NULL), `photo_urls text[] DEFAULT '{}'`, `created_at`, `updated_at`. Index on `address_key` | Auth read all; auth insert own; author update/delete own |

Applied via `supabase db query --linked --file` per the two-repo coordination protocol. Each previewed first with a `BEGIN; … ROLLBACK;` wrapper to validate before commit. Tracking rows added via `supabase migration repair --status applied 20260527013 20260527014 20260527015` — confirmed clean in `supabase migration list --linked`.

### Tier 1 chip — `src/components/AvaChip.tsx`

32 px blue square (`#0000FF`) with five white waveform bars; CSS-staggered pulse (`ava-wave` keyframes in `globals.css`, 1 s ease-in-out infinite, 120 ms stagger between bars). Tap opens a dark bottom-sheet drawer with the same waveform at 40 px, "AVA" label, ×-close, and "AVA coming soon" body copy. Backdrop click and × both close.

Wired into 6 screens to the right of the existing rightmost header element, inside a `display:flex; gap:10` wrapper:

- Home (`DayRouteSelectorScreen`) — beside the eyebrow-row PTR mark
- Tools, Training — same pattern
- Profile, Route list — beside `<BrandMark/>`
- Stop detail — beside the distance pill (no brand mark there)

No centralized layout shell — each screen owns its own header. Future-proofing this in a layout shell can wait until more shared chrome appears.

### Types regen

`src/types/supabase.ts` regenerated; new tables and the three profile columns are present in the row/insert/update unions.

---

## Investigation findings

1. **Migration filename convention had to bend.** The recent driver-app convention `YYYYMMDD_NNN_*.sql` works one-file-per-day, because the CLI parses everything before the first `_` as the version. Three migrations on the same date all collide as version `20260527`. Reverted to the older `YYYYMMDD<NNN>_*.sql` form (no underscore between date and sequence) so each gets a unique CLI version. Existing files stay as they are. Updated the convention discussion in `CLAUDE.md`.

2. **The "current highest migration" question has two answers.** The remote `_supabase_migrations` table has 73 rows (dashboard owns most). The driver-app local `supabase/migrations/` directory had 12 files. The user asked for "current highest + 1" — answered against the local file count (next slot was `013`). Now 15 local files; remote table has the 3 new rows tracked under `20260527013/014/015`.

3. **`profiles.roles` is a TEXT/ENUM ARRAY, not a single value.** Verified via `src/types/auth.ts` (`roles: Role[]`) and the `getUserRole` SELECT in `src/lib/auth.ts`. Original Migration 001 created it as a scalar `user_role` enum; the dashboard later migrated it to an array. Wrote the super_admin policy as `'super_admin' = ANY(p.roles)` to match.

4. **Drawer is a real bottom-sheet, not a toast.** Per Darren's approval — the drawer shell (dark, max-width 448 px, safe-area-aware) is reusable for the real conversation UI in a later session; only the body copy needs to change. Costs little, saves churn later.

5. **No centralized header layout** — every screen builds its own hero/header bar. The chip wires into each screen individually (six sites). When the morning brief card lands, it's another per-screen edit on Home only. A future layout-shell refactor could DRY this up, but is not the priority.

---

## Anything for Darren before Session 2

- **Vercel preview URL** — the branch is pushed; once Vercel finishes building, the preview URL should be visible in the GitHub PR template or Vercel dashboard. Smoke-test loops are in `tasks/todo.md`.
- **Session 2 order of operations.** Notion spec doesn't lock the order of the remaining 7 components. Recommendation: morning brief card next (it's the most visible component and the schema for it is already in via `013`). AVA Remembers UI can follow. Voice/TTS hookup is a later session because it has external-vendor setup.
- **Dependency-map authoring is yours.** The 4 driver interviews are in Notion. When you have the dependency-map DB rows ready (table schema is a separate small migration), the checklist UI is its own session.
- **Don't merge `feature/ava-phase1` to `main` until all 9 components are in.** Vercel previews the branch but production stays on `main`. Other unrelated work continues to ship to `main`.

---

## For chat-Claude to update Notion

- **Master Project Hub** — add a Session 1 progress row to the AVA Phase 1 tracker with: 2 of 9 components done (schema + Tier 1 chip), branch `feature/ava-phase1` commit `c43192c`, build green, preview deploying.
- **AI Layer Master Spec (`3550aa6451b881f19285e369387b75b6`)** — under "Next Steps", flip step 9 ("Define ava_conversations Supabase table schema (migration 059)") to done with the actual migration number (`20260527014`). Also mark the chip "next-up" off the list.
- **PartyTime Driver App master tracker** — add the branch + commit reference; flag that morning brief is the suggested next session.
