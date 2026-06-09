'use client'

import { useState } from 'react'
import type { Route, RouteCrewMember } from '@/types'
import { initiateTransfer } from '@/lib/transferApi'

// Phase 2B — Route Handoff. The current owner picks which crew member to offer
// the route to. Crew list comes off the Route (route_crew drivers, profile ids
// resolved); the caller passes `selfProfileId` so the picker excludes the owner.
// Dark bottom sheet, no backdrop-dismiss surprises — Cancel / pick are explicit.

const C = {
  ink:    '#0A0B14',
  cream:  '#FFF9EE',
  gold:   '#FFB800',
  paper:  '#FFFFFF',
  coral:  '#FF5A3C',
  muted:  '#6B7488',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface TransferPickerSheetProps {
  route:         Route
  selfProfileId: string
  routeNumber?:  number
  onClose:       () => void
  onDone:        () => void   // called after a successful initiate (triggers refetch)
}

export default function TransferPickerSheet({
  route,
  selfProfileId,
  routeNumber,
  onClose,
  onDone,
}: TransferPickerSheetProps) {
  const candidates: RouteCrewMember[] = (route.crew ?? []).filter((c) => c.profileId !== selfProfileId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  async function pick(member: RouteCrewMember) {
    if (busyId) return
    setBusyId(member.profileId)
    setError(null)
    try {
      await initiateTransfer(route.route_id, member.profileId)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the transfer')
      setBusyId(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transfer this route to a crew member"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: C.ink, color: '#fff',
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: '22px 18px calc(22px + env(safe-area-inset-bottom))',
          boxShadow: '0 -16px 40px -10px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          color: C.gold, textTransform: 'uppercase',
        }}>
          Transfer route{routeNumber != null ? ` ${routeNumber}` : ''}
        </div>
        <div style={{
          marginTop: 4, fontSize: 20, fontWeight: 800,
          fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
        }}>
          Hand off to a crew member
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          They&apos;ll get an offer to accept or decline. You keep the route until they accept.
        </div>

        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {candidates.length === 0 ? (
            <div style={{
              padding: '16px 14px', borderRadius: 14,
              background: 'rgba(255,255,255,0.06)',
              fontSize: 14, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
            }}>
              No other crew on this route to transfer to.
            </div>
          ) : candidates.map((m) => (
            <button
              key={m.profileId}
              onClick={() => pick(m)}
              disabled={!!busyId}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '14px 16px', borderRadius: 14,
                background: C.paper, color: C.ink, border: 0,
                cursor: busyId ? 'default' : 'pointer',
                opacity: busyId && busyId !== m.profileId ? 0.5 : 1,
                fontFamily: FONT_DISPLAY,
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{m.name}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {m.role === 'primary_driver' ? 'Primary driver' : 'Co-driver'}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: busyId === m.profileId ? C.muted : C.gold }}>
                {busyId === m.profileId ? 'Sending…' : 'Offer →'}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: C.coral, textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          onClick={onClose}
          disabled={!!busyId}
          style={{
            marginTop: 16, width: '100%', height: 48, borderRadius: 999,
            background: 'transparent', color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.25)',
            cursor: busyId ? 'default' : 'pointer',
            fontSize: 14, fontWeight: 800, fontFamily: FONT_DISPLAY,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
