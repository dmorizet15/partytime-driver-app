'use client'

import { useState } from 'react'
import { respondTransfer } from '@/lib/transferApi'

// Phase 2B — Route Handoff. Shown on Home when routes.transfer_pending_to equals
// the signed-in user. "[Name] is offering you Route [N]. Accept or Decline."
// Accept → the user becomes active_driver_id (full ownership). Decline → cleared.

const C = {
  ink:    '#0A0B14',
  gold:   '#FFB800',
  green:  '#1FBF6B',
  coral:  '#FF5A3C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface PendingTransferCardProps {
  routeId:     string
  routeNumber?: number
  fromName:    string | null   // the offering owner's display name, if resolvable
  onResolved:  () => void       // refetch after accept/decline
}

export default function PendingTransferCard({
  routeId,
  routeNumber,
  fromName,
  onResolved,
}: PendingTransferCardProps) {
  const [busy,  setBusy]  = useState<'accept' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function respond(accept: boolean) {
    if (busy) return
    setBusy(accept ? 'accept' : 'decline')
    setError(null)
    try {
      await respondTransfer(routeId, accept)
      onResolved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again')
      setBusy(null)
    }
  }

  const routeLabel = routeNumber != null ? `Route ${routeNumber}` : 'this route'
  const offerer    = fromName?.trim() || 'A crew member'

  return (
    <div style={{ padding: '16px 18px 0' }}>
      <div
        role="alert"
        style={{
          background: C.ink, color: '#fff',
          borderRadius: 20, padding: 18,
          borderLeft: `6px solid ${C.gold}`,
        }}
      >
        <div style={{
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.gold, textTransform: 'uppercase',
        }}>
          Route offer
        </div>
        <div style={{
          marginTop: 6, fontSize: 18, fontWeight: 800,
          fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em', lineHeight: 1.25,
        }}>
          {offerer} is offering you {routeLabel}.
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          Accept to take over ETAs, customer texts, and stop completion. Decline to leave it with them.
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
          <button
            onClick={() => respond(true)}
            disabled={!!busy}
            style={{
              flex: 1, height: 50, borderRadius: 999, border: 0,
              background: C.green, color: C.ink,
              cursor: busy ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 900, fontFamily: FONT_DISPLAY,
              letterSpacing: '-0.01em', opacity: busy === 'decline' ? 0.5 : 1,
            }}
          >
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </button>
          <button
            onClick={() => respond(false)}
            disabled={!!busy}
            style={{
              flex: 1, height: 50, borderRadius: 999,
              background: 'transparent', color: '#fff',
              border: '1.5px solid rgba(255,255,255,0.3)',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 800, fontFamily: FONT_DISPLAY,
              letterSpacing: '-0.01em', opacity: busy === 'accept' ? 0.5 : 1,
            }}
          >
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: C.coral, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
