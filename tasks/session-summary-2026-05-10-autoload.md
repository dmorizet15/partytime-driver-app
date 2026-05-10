# Session Summary — Driver Auto-Load Route (May 10, 2026, evening)

## What shipped

End-to-end driver auto-load: when a driver opens the app, if they have a
`route_assignments` row for today, the app redirects them straight to
`/route/<id>` (RouteListScreen) instead of showing the day overview. Manual
fallback preserved — drivers without an assignment, and any failure of the
assignment lookup, fall through to the existing Home day overview.

No migration required. No dashboard files touched.

## Files created

- `src/app/api/routes/assigned/route.ts` — new GET handler.
  - Auth: session cookie identifies the driver (user.id can't be spoofed).
  - Reads `route_assignments` filtered by `user_id = user.id` and inner-joined
    to `routes` where `route_date = today`, ordered `assigned_at DESC`.
  - Returns `{ route_id: string }` for the freshest assignment, or
    `{ route_id: null }` when there's no match for today.
  - Multi-match edge case (`> 1` row): logs a warning naming the driver, the
    count, and the chosen route_id; returns the most recently assigned one.
    Dispatch reconciles via the dashboard.
  - Service-role client for the actual read (sidesteps RLS verification on
    dashboard-side route_assignments policies — matches the existing pattern
    in `/api/inspection/status` and `/api/defects/post-trip`).

- `src/hooks/useAssignedRoute.ts` — new client hook.
  - Fetches `/api/routes/assigned` on mount, once per session, guarded by
    `sessionStorage['ptd_autoload_attempted']`.
  - On `{ route_id }` non-null: `router.replace('/route/<id>')`.
  - On `{ route_id: null }`: resolves to `'no_assignment'`; caller renders
    the normal day overview.
  - On fetch error: resolves to `'failed'`, logs a warning; caller falls
    through to the day overview (fail-open, never blocks the app).

- `tasks/session-summary-2026-05-10-autoload.md` — this file.

## Files modified

- `src/screens/DayRouteSelectorScreen.tsx`
  - Imports `useAssignedRoute`.
  - Calls the hook; derives `showAssignmentLoader = status === 'checking' ||
    status === 'navigating'`.
  - Adds a new "Finding your route…" spinner branch at the top of the scroll
    body, styled to match the existing "Loading routes…" spinner.
  - Gates the four existing body branches (`isLoading`, `error`, `isEmpty`,
    populated) with `!showAssignmentLoader` so they don't render under the
    loader. The hero remains visible throughout.

## Architecture decisions

**Session-scoped redirect, not every-mount redirect.** CLAUDE.md locks the
May 8 Home rewrite invariant: "BottomNav's Home tab must remain reachable."
The earlier blanket auto-redirect from `/` → `/route/<id>` (commit `938f4b0`)
was reverted precisely because it broke that. To re-enable auto-navigation
without reintroducing the bug, the new hook fires only once per browser
session: cold sign-in / page reload triggers it, but tapping the Home tab in
BottomNav after the initial jump returns the driver to Home as expected.
`sessionStorage['ptd_autoload_attempted']` is the guard; it clears on tab
close.

**Filter vs. redirect.** Considered scoping Home's flattened day list to
just the assigned route's stops (filter approach) as a less invasive
alternative. The user spec explicitly asked for navigation ("auto-navigate
to that route's stop list"), so the redirect path was implemented. The
session guard above is what makes it safe to do so given CLAUDE.md.

**Per-session, not per-route.** A mid-day reassignment to a new route will
NOT auto-redirect the driver to the new route — the session flag persists
through the reassignment. This is the right default: drivers shouldn't get
yanked out of an in-progress stop by a backend change. If a forced re-route
becomes a real workflow, a server-pushed signal (or clearing the flag from
the dashboard) would be the lever.

**No `/api/routes` changes.** The existing endpoint still returns all routes
for the day and joins assignments only for display. Auto-load is a layer on
top, not a rewrite — keeps blast radius small.

**`clearCache` left untouched.** `AppStateContext.clearCache` has an
existing forward-leaning comment about the "assigned-route check resolving
to no-assignment." The current redirect-on-match design doesn't need it:
when there IS an assignment, Home unmounts before stale routes can flicker
through. When there ISN'T, the day overview is what we want to render. The
action remains in the context as future-proofing.

## Build verification

- `pkill -f "next dev"` — no dev server was running
- `npx next build` → ✓ Compiled successfully, all 19 pages generated.
  `/api/routes/assigned` appears in the dynamic route list.

## Smoke test plan (manual on production after Vercel deploy)

1. **Assigned driver — auto-load fires.** Sign in as
   darren@partytime-rentals.com (has a `route_assignments` row for today's
   route in `partytime-east`). Expected: brief "Finding your route…"
   spinner on `/`, then automatic redirect to `/route/<id>` showing the
   route's stop list. Inspection gate and stop list render as on the manual
   path.
2. **Assigned driver — Home tab still reachable.** After step 1, tap the
   Home tab in BottomNav. Expected: Home renders normally (no redirect
   loop), showing the day overview. The sessionStorage guard is working.
3. **Unassigned driver — fallback works.** Sign in as a driver without a
   row in `route_assignments` for today (any test account). Expected:
   "Finding your route…" spinner briefly, then the existing day overview
   renders (or the empty state if no routes for the day).
4. **Network failure — fail-open.** Throttle to Offline in DevTools, reload
   `/`. Expected: spinner resolves to the day overview (or empty state) and
   `console.warn` shows `[useAssignedRoute] fetch failed; falling back...`.
5. **Multi-assignment driver (edge case, if a test account has > 1
   assignment today).** Expected: redirect to the most recently assigned
   route; Vercel runtime logs include the
   `[/api/routes/assigned] driver <uuid> has N assignments...` warning.

## Open questions

- None blocking. The behavior matches the spec end-to-end and the manual
  fallback covers every degraded case.

## What did NOT change

- `/api/routes/route.ts` — untouched. Auto-load is additive.
- Dashboard repo — no files touched.
- `route_assignments` schema — no migration needed (table already has
  `user_id`, `route_id`, `assigned_at`).
- Manual route selection flow — preserved verbatim; the assigned-route
  check fails open into it.
