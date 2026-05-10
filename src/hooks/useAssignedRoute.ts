'use client'

import { useEffect, useState } from 'react'
import { useRouter }            from 'next/navigation'

// Session-scoped guard. Once the driver has been auto-navigated to their
// assigned route this session, subsequent returns to Home (via BottomNav)
// skip the redirect so Home stays reachable. This preserves the locked
// invariant from CLAUDE.md's May 8 home rewrite: BottomNav's Home tab must
// not bounce the driver right back out of Home. The earlier blanket
// auto-redirect from `/` → `/route/<id>` (commit `938f4b0`) was reverted
// because it broke that — this hook re-enables the redirect only on cold
// load and only when there's a real route_assignments match.
const SESSION_KEY = 'ptd_autoload_attempted'

export type AssignmentStatus =
  | 'checking'        // request in flight
  | 'navigating'      // assignment found; router.replace fired, unmount imminent
  | 'no_assignment'   // resolved → no row for this driver today
  | 'failed'          // fetch errored; caller should fail-open to manual flow

/**
 * Reads /api/routes/assigned once per session. If the driver has an
 * assignment for today, redirects them straight to `/route/<id>` (the stop
 * list). Otherwise resolves to `no_assignment` so the caller can render the
 * existing day overview as the manual-fallback path.
 *
 * Fail-open contract: fetch errors resolve to `failed`, not a loop. The
 * caller renders normally and the driver can pick a route manually — better
 * than blocking the app behind a flaky network call.
 */
export function useAssignedRoute(): { status: AssignmentStatus } {
  const router = useRouter()
  const [status, setStatus] = useState<AssignmentStatus>('checking')

  useEffect(() => {
    let alreadyAttempted = false
    try {
      alreadyAttempted = sessionStorage.getItem(SESSION_KEY) === '1'
    } catch {
      // Private mode / disabled storage — fall through. Worst case is the
      // assignment is re-fetched on every Home mount, which is cheap.
    }

    if (alreadyAttempted) {
      setStatus('no_assignment')
      return
    }

    let cancelled = false
    fetch('/api/routes/assigned')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json: { route_id: string | null }) => {
        if (cancelled) return
        try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
        if (json.route_id) {
          setStatus('navigating')
          router.replace(`/route/${json.route_id}`)
        } else {
          setStatus('no_assignment')
        }
      })
      .catch((err) => {
        console.warn(
          '[useAssignedRoute] fetch failed; falling back to day overview:',
          err instanceof Error ? err.message : err
        )
        if (!cancelled) setStatus('failed')
      })

    return () => { cancelled = true }
  }, [router])

  return { status }
}
