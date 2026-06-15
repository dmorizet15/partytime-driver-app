// ─── Offline stop-completion queue (ptd_complete_queue) ─────────────────────
// Backs optimistic stop completion. runStopComplete now calls markComplete
// BEFORE the /api/complete-stop POST so the per-stop progression gate opens and
// the driver can advance even with no signal. When the POST can't reach the
// server (offline) — or the server is reachable but rejects transiently — the
// completion is queued here and replayed on the next reconnect (flushed from
// AppStateContext.loadDay, alongside flushCheckoffQueue + the OTW queue).
//
// Distinct from ptd_otw_queue (OTW flag write) and ptd_checkoff_queue (audit
// inserts + TapGoods write-back). Net-new key — collision-checked against
// ptd_otw_queue / ptd_checkoff_queue / ptd_route_* / ptd_profile_* / ptd_stop_*
// / ava_pending_notes / ptr_session_date. No conflict.
//
// Every read/write is wrapped in try/catch — a corrupt blob or quota error
// degrades to an empty queue and never throws into the completion flow.

const QUEUE_KEY = 'ptd_complete_queue'

// sessionStorage key for the one-shot "saved offline" confirmation. The source
// StopDetailScreen unmounts the instant it navigates to the next stop, so the
// pill can't render there — it's handed forward and shown on the destination
// stop's mount, then cleared.
export const COMPLETE_TOAST_KEY = 'ptd_complete_toast'

export interface QueuedCompletion {
  stopId:      string
  routeId:     string
  completedAt: string   // ISO — the optimistic completion timestamp (client clock)
  enqueuedAt:  string   // ISO — when it was queued (debug / ordering)
}

function getQueue(): QueuedCompletion[] {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function setQueue(q: QueuedCompletion[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}

// Enqueue a completion that couldn't be confirmed server-side. Dedupe by stopId
// (last write wins) so re-completing the same stop can't pile up duplicates.
export function enqueueCompletion(item: QueuedCompletion): void {
  const q = getQueue().filter((c) => c.stopId !== item.stopId)
  q.push(item)
  setQueue(q)
}

// Replay queued completions. For each: re-POST /api/complete-stop (idempotent —
// the endpoint re-writes the same completed columns by id and returns 200).
//   • 2xx                → drop (synced)
//   • 401 / 403          → drop (permanent auth/ownership failure — never retry)
//   • other 4xx (400/404) → drop (permanent — bogus/again-deleted stop; retrying
//                            forever would poison the queue)
//   • 5xx / network error → keep for the next reconnect
// Fire-and-forget; never throws. Mirrors stopStateService.syncOnReconnect.
export async function flushCompleteQueue(): Promise<void> {
  const queue = getQueue()
  if (!queue.length) return

  const remaining: QueuedCompletion[] = []
  for (const item of queue) {
    try {
      const r = await fetch('/api/complete-stop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stop_id: item.stopId }),
      })
      if (r.ok) continue                       // synced → drop
      if (r.status >= 400 && r.status < 500) continue  // permanent → drop
      remaining.push(item)                     // 5xx → retry next reconnect
    } catch {
      remaining.push(item)                     // network error → retry next reconnect
    }
  }
  setQueue(remaining)
}
