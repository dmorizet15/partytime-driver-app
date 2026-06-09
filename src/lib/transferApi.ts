// ─── Phase 2B — Route Handoff client API ─────────────────────────────────────
// Thin fetch wrappers over the two transfer endpoints. The server is the
// authority on the ownership/recipient gates; these just relay + surface errors.

export async function initiateTransfer(routeId: string, toProfileId: string): Promise<void> {
  const r = await fetch('/api/routes/transfer/initiate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ routeId, toProfileId }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.success) throw new Error(j?.error ?? 'Could not start the transfer')
}

export async function respondTransfer(routeId: string, accept: boolean): Promise<void> {
  const r = await fetch('/api/routes/transfer/respond', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ routeId, accept }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.success) throw new Error(j?.error ?? (accept ? 'Could not accept the transfer' : 'Could not decline the transfer'))
}
