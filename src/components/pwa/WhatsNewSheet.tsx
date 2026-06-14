'use client'

import { useEffect, useState } from 'react'
import { VERSION, CHANGELOG } from '@/lib/appVersion'
import { LAST_SEEN_VERSION_KEY } from '@/lib/pwa'

// ─── Feature 3 — What's New version sheet ────────────────────────────────────
// Slide-up bottom sheet listing this version's changelog. Whether to show is
// decided once by the PwaHomePrompts coordinator (VERSION !== last-seen, AND
// the re-install banner is NOT showing — they never stack). Tapping "Got it"
// writes VERSION to ptr_last_seen_version so the sheet never reappears until
// the next version bump.
//
// Dark sheet styling mirrors RouteStartWarehouseSheet / StopNotesPreSheet.
// No backdrop-dismiss — only the "Got it" CTA closes it (so the ack always
// persists the version).

const GOLD = '#FFB800'

export default function WhatsNewSheet({ onClose }: { onClose: () => void }) {
  // Slide-up: mount off-screen, transition to 0 on the next frame.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const dismiss = () => {
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, VERSION) } catch { /* private mode — just close */ }
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new in PartyTime Work"
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 448,
          background: '#0F172A', color: '#fff',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '16px 22px calc(24px + env(safe-area-inset-bottom))',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 280ms cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        <div style={{ width: 44, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{
          fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: GOLD, marginBottom: 4,
        }}>
          Version {VERSION}
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: 0.2, marginBottom: 16 }}>
          What&rsquo;s new in PartyTime Work
        </div>

        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {CHANGELOG.map((item, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0, marginTop: 7, width: 7, height: 7, borderRadius: '50%', background: GOLD,
                }}
              />
              <span style={{ fontSize: 15, lineHeight: 1.5, color: '#E2E8F0' }}>{item}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          style={{
            width: '100%', marginTop: 24, padding: '15px 16px',
            background: GOLD, color: '#0A0B14', border: 'none', borderRadius: 12,
            fontSize: 16, fontWeight: 800, letterSpacing: 0.2, cursor: 'pointer',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
