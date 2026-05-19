# Session Summary — 2026-05-19 (evening)

## Headline

Three-commit bug-fix arc, follow-on to the morning's super_admin visibility work. Unassigned drivers now reach Week Schedule via the Routes tab (matching super_admin), `/route/[bad-id]` no longer hides the Today/Week toggle, and `/schedule` scrolls correctly with BottomNav pinned. Driver app only. No migration. No data writes.

## What shipped

| Commit | Surface | Effect |
|---|---|---|
| `ebaebc2` | `src/screens/RouteListScreen.tsx` | Toggle hoisted above the `!route` early return; "Route not found" banner moved inside the My Route tab body. Week tab now reachable on bad routeIds. |
| `ced6aa1` | `src/components/BottomNav.tsx` | Routes-tab `routesHref` simplified — both driver and super_admin land on `/schedule` when unassigned. Removed asymmetric role guard. |
| `d1b1910` | `src/app/schedule/page.tsx` | Dropped inline layout overrides that defeated `.screen`'s `height: 100svh` lock; added `overflowY: 'auto'` to `<main>` so the week list scrolls inside the main area with BottomNav pinned. |

All three pushed direct to `main`. Vercel auto-deploys per commit.

## Bugs caught

1. **Driver with no route assigned had no path to Week Schedule.** Morning's `b49e6e1` routed only super_admin to `/schedule`; drivers fell back to `/`. Original spec said "identical behavior to how super_admin sees it" — meant: drivers too. Fix: remove the role check.
2. **`/route/[bad-id]` hid the Today/Week toggle and the Week tab.** A typo, stale notification, or pre-assignment race could leave a driver stuck on a "Route not found" screen with no way to flip to Week. Fix: move the week-view branch above the `!route` check; render the banner inside the My Route tab body.
3. **`/schedule` clipped at ~3 rows; BottomNav fell off the bottom.** Inline `minHeight: '100vh'` overrode the `.screen` class's `height: 100svh` lock (on iOS, `100vh > 100svh` with toolbar showing). `<main>` had no inner scroll. Fix: delete the inline overrides; add `overflowY: 'auto'` to `<main>` — same pattern RouteListScreen uses when it embeds WeekScheduleView.

## Why this needed a follow-on

The morning fix (`406ed82` → `b49e6e1` → `c0bffa5`) correctly identified the discoverability gap and the day-vs-week scoping problem, but interpreted "identical to super_admin" as super_admin-only. Smoke testing on real driver accounts surfaced the asymmetry within hours.

The `/schedule` scroll bug was latent — the page hasn't been a primary surface for drivers until today, so the layout regression never surfaced. Now that BOTH driver and super_admin land there on unassigned days, it became a P0 immediately.

## Smoke test plan (for the next time Darren is on a phone with an unassigned driver login)

1. Driver, no route today → Routes tab → `/schedule` loads, BottomNav pinned, week list scrolls inside main.
2. super_admin, no route today → same behavior (regression check).
3. Either role, with assignment → Routes tab → `/route/[id]` as before.
4. Direct visit to `/route/[bad-id]` → Today/Week toggle visible; tap Week → WeekScheduleView renders.

## Files touched

- `src/screens/RouteListScreen.tsx`
- `src/components/BottomNav.tsx`
- `src/app/schedule/page.tsx`
- `CLAUDE.md` (Current build state line)
- `docs/CHANGELOG.md` (new evening entry above the morning entry)
- `tasks/lessons.md` (two new lessons: `.screen` is load-bearing; "identical to X" is literal)
- `tasks/todo.md` (smoke-test follow-up + `.screen` audit follow-up)

## Lessons logged

- The `.screen` CSS utility class is load-bearing — inline layout overrides defeat the iOS Safari toolbar lock and BottomNav pin contract.
- "Identical behavior to how X sees it" is a literal spec phrase — trust the comparison, don't add asymmetric role guards.

## Open follow-ups

- Smoke-test the three commits on production once Vercel deploys.
- Audit other `className="screen"` pages for inline layout overrides (likely candidates: pages built before 2026-05-12 when the `.screen` lock was added).

## Verification

`npx next build` passed before each push. No type errors, no lint failures.

## Hard stops respected

- No Notion writes (chat-Claude's domain).
- No migrations. No schema touch.
- No new dependencies.
- No file changes outside the three commit scopes (RouteListScreen, BottomNav, schedule page) plus the doc updates listed above.
