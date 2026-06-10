// ─── Route departure (warehouse IN TRANSIT writer) ───────────────────────────
// Thin, BEST-EFFORT wrapper over POST /api/routes/[routeId]/depart. Called when
// the driver starts the route (pre-trip complete). The server owns the ownership
// gate + idempotency; the warehouse boards read routes.actual_departure_at.
//
// Best-effort by design: it NEVER throws and NEVER blocks navigation. A failed
// departure stamp must not trap the driver on the start screen — the route still
// opens; the worst case is the warehouse Overview lagging on IN TRANSIT, which a
// later start-path re-tap or the next driver action recovers. Failures log
// structured context for diagnosis.

export async function departRoute(routeId: string): Promise<void> {
  if (!routeId) return
  try {
    const r = await fetch(`/api/routes/${routeId}/depart`, { method: 'POST' })
    if (!r.ok) {
      const j = await r.json().catch(() => null)
      console.error('[departRoute] non-OK', { routeId, status: r.status, error: j?.error })
    }
  } catch (err) {
    console.error('[departRoute] request failed', { routeId, message: err instanceof Error ? err.message : String(err) })
  }
}
