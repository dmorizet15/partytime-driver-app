'use client'

// ─── RFID scan section on the stop detail screen (HOST component) ────────────
// Additive per doctrine: existing stop detail flow is untouched; this renders
// a launch card on delivery/pickup stops that expands into the RFID module's
// screen with the module wired through host adapters. RFID-capable items
// auto-confirm via scan; everything else keeps the existing manual flow.

import { useMemo, useState } from 'react'
import type { Stop } from '@/types'
import { RfidModuleProvider } from '@/modules/rfid'
import { DeliveryCheckoutScreen } from '@/modules/rfid/screens/DeliveryCheckoutScreen'
import { PickupReturnScreen } from '@/modules/rfid/screens/PickupReturnScreen'
import { buildStopAdapters } from '@/lib/rfid/hostAdapters'

const C = { blue: '#0000FF', ink: '#0A0B14', paper: '#FFFFFF', off: '#F4F6FA', muted: '#6B7488' }
const FONT_BODY = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

export default function RfidStopSection({ stop }: { stop: Stop }) {
  const [open, setOpen] = useState(false)
  const adapters = useMemo(() => buildStopAdapters(stop, () => setOpen(false)), [stop])

  if (stop.stop_type !== 'delivery' && stop.stop_type !== 'pickup') return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="rfid-launch"
        style={{
          width: '100%',
          minHeight: 56,
          borderRadius: 14,
          border: `2px solid ${C.blue}`,
          background: C.paper,
          color: C.blue,
          fontFamily: FONT_BODY,
          fontSize: 15,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <span aria-hidden>⎙</span>
        {stop.stop_type === 'delivery' ? 'Scan items — delivery checkout' : 'Scan items — pickup return'}
      </button>
    )
  }

  return (
    <div
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid ${C.off}`,
        background: C.paper,
      }}
    >
      <RfidModuleProvider adapters={adapters}>
        {stop.stop_type === 'delivery' ? (
          <DeliveryCheckoutScreen onDone={() => setOpen(false)} />
        ) : (
          <PickupReturnScreen onDone={() => setOpen(false)} />
        )}
      </RfidModuleProvider>
      <button
        onClick={() => setOpen(false)}
        style={{
          width: '100%',
          minHeight: 44,
          border: 'none',
          background: C.off,
          color: C.muted,
          fontFamily: FONT_BODY,
          fontWeight: 600,
        }}
      >
        Close scanner
      </button>
    </div>
  )
}
