'use client'

// Full-screen blocked-item card. A non-rentable unit was scanned during a
// delivery: the driver must see it, and overriding takes TWO taps (arm, then
// confirm) — never a single accidental thumb.

import { useState } from 'react'
import { useTheme } from '../provider/RfidModuleProvider'
import type { Conflict } from '../flows/checkoutFlow'

export interface ConflictInterruptProps {
  conflict: Conflict
  onOverride: () => void
  onBlock: () => void
}

export function ConflictInterrupt({ conflict, onOverride, onBlock }: ConflictInterruptProps) {
  const theme = useTheme()
  const [armed, setArmed] = useState(false)
  const item = conflict.hit.item

  return (
    <div
      role="alertdialog"
      aria-label="Blocked item"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(10,11,20,0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: theme.fonts.body,
      }}
    >
      <div
        style={{
          background: theme.colors.surface,
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 420,
          borderTop: `6px solid ${theme.colors.danger}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.danger, letterSpacing: 1 }}>
          BLOCKED — NOT RENTABLE
        </div>
        <h2 style={{ fontFamily: theme.fonts.display, fontSize: 22, margin: '8px 0 4px', color: theme.colors.ink }}>
          {item?.commonName ?? conflict.hit.identifier}
        </h2>
        <p style={{ margin: '4px 0 16px', color: theme.colors.muted, fontSize: 14 }}>
          Status is <strong style={{ color: theme.colors.danger }}>{conflict.status}</strong>. This unit
          should not go out on a delivery.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <button
            onClick={onBlock}
            style={{
              minHeight: theme.touchTargetPx,
              borderRadius: 12,
              border: 'none',
              background: theme.colors.ink,
              color: theme.colors.surface,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Leave it — keep blocked
          </button>
          <button
            onClick={() => (armed ? onOverride() : setArmed(true))}
            style={{
              minHeight: theme.touchTargetPx,
              borderRadius: 12,
              border: `2px solid ${theme.colors.danger}`,
              background: armed ? theme.colors.danger : 'transparent',
              color: armed ? theme.colors.surface : theme.colors.danger,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {armed ? 'Tap again to send it anyway' : 'Override (send anyway)'}
          </button>
        </div>
      </div>
    </div>
  )
}
