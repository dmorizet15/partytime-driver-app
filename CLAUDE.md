# PartyTime Driver App

Next.js 14 PWA for the driver mobile workflow. Downstream of `partytime-dashboard`; both share Supabase `partytime-east` + TapGoods. Claude Code = CTO + lead full-stack.

---

## Current build state

- **Active feature:** PartyTime Arcade — Party Kong v3 (4-session phased plan; Session A LevelConfig refactor shipped, Sessions B/C/D pending). Scope doc: `tasks/party-kong-v3-scope.md`.
- **Latest migration:** **053** (`game_scores`, 2026-05-15). Local directory in lockstep with remote `schema_migrations` (repaired via `supabase migration repair --status applied`).
- **Branch strategy:** Commit directly to `main` — Vercel auto-deploys on every push.
- **Next priority:** see `tasks/todo.md` (top of file).

---

## Division of labor

- chat-Claude owns Notion. Claude Code never writes Notion.
- Claude Code owns: code, `CLAUDE.md`, `docs/claude/`, `tasks/`, `docs/`, `CHANGELOG.md`.
- All builds push to `main`. No branches until Darren says otherwise.

Full doctrine: `docs/claude/doctrine.md`.

---

## Session start ritual

- Read `CLAUDE.md` + `tasks/todo.md` + `tasks/lessons.md`.
- Read the relevant sub-doc under `docs/claude/` for the active feature.
- Fetch Notion pages: Master Project Hub + latest v1.1 Build Plan + most recent Session Summary.
- State the current migration count (from `supabase/migrations/`) and the active feature before starting work.

---

## Critical rules (inline — read every session)

- **Pre-push verification.** `npx next build` (not `npx next lint`) must succeed end-to-end before `git push`. Lint is a subset of build — it does not run TypeScript's type checker. Precedent: 2026-05-06 cash-collection deploy red on `WorkflowEventType` mismatch after green lint locally.
- **Build-then-push is one indivisible sequence.** Never build and stop. If a build is green and you're not pushing immediately, name out loud why so the deferred push doesn't get lost. Precedent: 2026-05-09 evening, 9 inspection commits sat local for 2+ hours while smoke testing the pre-inspection app on Vercel.
- **Migrations apply via `supabase db push` or `supabase db query --linked --file <path>`** (Management API path bypasses two-repo history block). Never paste into Supabase SQL Editor. Mark applied with `supabase migration repair --status applied <version>` to keep tracking honest.
- **Cross-repo helpers are byte-for-byte mirrored.** `src/lib/equipmentSummary.ts`, `src/lib/inflatable.ts`, `src/lib/itemCategories.ts` have twins in `partytime-dashboard`. Any change MUST be applied to both in the same session.
- **TapGoods API gotchas** (do not re-discover): see `docs/claude/doctrine.md` → "Key TapGoods API Learnings".

---

## Session close (autonomous — no permission needed)

1. Update `CLAUDE.md` (this file) and the relevant `docs/claude/*.md` sub-doc with new decisions / rules / tech debt.
2. Append to `tasks/todo.md` (open follow-ups) and `tasks/lessons.md` (patterns). Add session entry to `docs/CHANGELOG.md`.
3. Generate a session summary for Darren. Tell him: "Here's the summary for chat-Claude to update Notion." Do not write to Notion.

Full protocol: `docs/claude/doctrine.md` → "Session Close Protocol".

---

## Where things live

| What | Where |
|---|---|
| Stack, infrastructure, design system, per-feature architecture, NEXT smoke tests | `docs/claude/stack.md` |
| Operational doctrine, division of labor, pre-push verification, TapGoods learnings | `docs/claude/doctrine.md` |
| Open tech debt (with dates) | `docs/claude/tech-debt.md` |
| Open and pending tasks | `tasks/todo.md` |
| Patterns and corrections (review at session start) | `tasks/lessons.md` |
| Open questions for Darren | `tasks/open-questions.md` |
| Per-session work log | `docs/CHANGELOG.md` |
| Party Kong v3 scope (4-session phased plan) | `tasks/party-kong-v3-scope.md` |
| Per-session summaries | `tasks/session-summary-*.md` |
| Migration files | `supabase/migrations/` (14-digit timestamp naming) |

Order of authority: Darren AI Protocol parent page in Notion → child pages → this CLAUDE.md → sub-docs under `docs/claude/` → repo docs → current external info.

---

## Autonomy rules (no permission needed)

Run builds, installs, migrations (`supabase db push` / `supabase db query --linked --file`), linting, tests, dev servers, type regens. If a step fails, debug and retry. Stop and ask Darren only when: (1) the action would permanently delete data with no rollback, (2) a required secret is missing from `.env` and cannot be inferred, or (3) two valid approaches have fundamentally different architecture implications that cannot be reversed.
