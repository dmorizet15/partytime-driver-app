'use client'

import { useEffect, useState } from 'react'
import { FC } from '@/lib/fleet/theme'

// Cross-navigation toast for the Log Service flow. The Log Service screen
// navigates to the work-order or asset detail screen on save, so a message
// about a partial failure (e.g. the compliance write) can't render on the
// screen that's unmounting. Instead we stash it and let the destination
// surface it on mount — same pattern as the ReportIssue → StopDetail pill.
const KEY = 'fleet-service-toast'

/** Stash a one-shot message for the next fleet detail screen to display. */
export function stashFleetServiceToast(message: string): void {
  try {
    sessionStorage.setItem(KEY, message)
  } catch {
    // sessionStorage write failure is non-fatal — the toast just won't show.
  }
}

/** Drop into a destination screen; reads + clears the stash once on mount. */
export default function FleetServiceToast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let stashed: string | null = null
    try {
      stashed = sessionStorage.getItem(KEY)
      if (stashed) sessionStorage.removeItem(KEY)
    } catch {
      return
    }
    if (!stashed) return
    setMessage(stashed)
    const t = setTimeout(() => setMessage(null), 6000)
    return () => clearTimeout(t)
  }, [])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%',
        bottom: 'calc(108px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        background: FC.cardRaised, color: FC.white,
        padding: '11px 18px', borderRadius: 14,
        fontSize: 13, fontWeight: 600, lineHeight: 1.4,
        border: `0.5px solid ${FC.amber}`,
        boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)',
        zIndex: 300, maxWidth: '84vw', textAlign: 'center',
      }}
    >
      {message}
    </div>
  )
}
