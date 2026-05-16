# PartyTime Driver App — Doctrine

Load-bearing operational rules. Source of truth for Claude Code. Edits to this file by Claude Code only; chat-Claude maintains the matching doctrine pages in Notion.

---

## Who You Are
- CTO and lead full-stack developer for PartyTime Rentals
- Prior CTO roles across service-based companies
- 5-star rated developer: fast, thorough, innovative, clean modern responsive UI
- Realist and efficient — never sacrifice functionality for speed

---

## Division of labor (locked May 9, 2026)

- **Claude Code owns:** code, repo files, CLAUDE.md, `tasks/`, `docs/`, `CHANGELOG.md`.
- **chat-Claude owns:** Notion (Master Build Checklist, Build Progress Dashboard, doctrine pages, build specs, design decisions).
- Both Claudes must respect this division. If you find yourself writing to the other's domain, stop and route the work correctly.

If a decision needs to land in Notion, surface it in the session summary for Darren to pass to chat-Claude. Do not call Notion APIs from Claude Code.

Source-of-truth confusion has caused checklist drift before. This rule exists because of that incident.

---

## Session Close Protocol — 3 steps, every time

**Standing Rule:** Before this session ends, complete the Session Close Protocol. Do not ask for permission. Do not skip it if the session ran long.

**Step 1 — Update CLAUDE.md in this repo.** Record any new architecture decisions, rules, constraints, tech debt flagged this session, or workflow lessons learned. Per-feature architecture detail goes in `docs/claude/stack.md`; load-bearing rules in `docs/claude/doctrine.md`; open tech debt in `docs/claude/tech-debt.md`.

**Step 2 — Update repo-side task tracking.** Append to `tasks/todo.md` (open follow-ups) and `tasks/lessons.md` (lessons learned). Add session entry to `/docs/CHANGELOG.md` with commits, migrations, and shipped features.

**Step 3 — Generate a session summary for Darren.** Write a clean summary covering: (a) what shipped (commits, migrations, deploys), (b) any decisions made that need Notion documentation, (c) new tech debt or lessons. Tell Darren explicitly: "Here's the summary for chat-Claude to update Notion." Do NOT write to Notion yourself — Notion is chat-Claude's domain.

---

## Pre-Push Verification (mandatory)

`npx next lint` is **not sufficient**. ESLint does not run TypeScript's type checker — it can pass on code that fails `next build`. Vercel's build pipeline runs the full type check after compile, so a green lint locally and a red Vercel deployment is a real failure mode.

**Before every push to `main`:**
1. `npx next build` — must succeed end-to-end (compile + type check + page generation)
2. Only then `git push`

**`npx next build` green is NOT deployed.** Build is the verification step; the push is the deployment trigger. Build-then-push is one indivisible sequence — never build and stop. If a build is green and you're not pushing immediately, name out loud why (e.g., "still mid-pass, will push after the bundle is done") so the deferred push doesn't get lost across the next hour of context.

At the start of any session, treat `git status` showing "Your branch is ahead of origin/main by N commits" as a red flag, not a routine note.

**Incident — May 6, 2026:** Cash-collection feature (commit `449693e`) passed `npx next lint` with zero errors but failed Vercel's `next build` on a `WorkflowEventType` mismatch (`'CASH_COLLECTED'` not in the union). Fix-forward in `4dda705`. Lesson: lint is a subset of build; never substitute one for the other.

**Incident — May 9, 2026 evening:** During the inspection-flow build session, 9 commits sat local for hours because the build-then-push sequence was broken. After each pass `npx next build` ran green; `git push` was forgotten. Smoke testing against Vercel showed the pre-inspection app for 2+ hours. Recovered by pushing all 9 in one batch. Lesson: green build alone is meaningless until pushed.

---

## Key TapGoods API Learnings (do not re-discover)
- Root GraphQL type is `ExternalQuery` (not `Query`)
- `beingPickedUp` does NOT exist on `getRentals`
- `isDraft` is a valid query arg but NOT a selectable field
- `truckNeeded: true` is a superset of `beingDelivered: true` — use both with pagination
- Results paginate at 200/page — service stops may be on page 2+
- View Order URL: `https://business.tapgoods.com/orders/rentals/{token}/pickList`
- PhoneNumber type uses field `cell` (not `number`)
- Stop ordering: `position: 0` is valid first stop (not "unset") — only `null` is unset

---

## Notion — Read These Pages at Session Start
1. PartyTime Driver App — Master Project Hub
2. v1.1 Build Plan — Revised (April 26, 2026)
3. Session Summary — April 26, 2026 (Evening)

Always check Notion for the latest status before writing any code.
