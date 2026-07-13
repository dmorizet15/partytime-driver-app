'use client'

import { useEffect, useMemo, useState } from 'react'
import { VERSION, releasesSince, type Release } from '@/lib/appVersion'
import { LAST_SEEN_VERSION_KEY } from '@/lib/pwa'

// ─── Feature 3 — What's New version sheet ────────────────────────────────────
// Slide-up bottom sheet listing what changed SINCE THIS DRIVER'S last update.
// Whether to show is decided once by the PwaHomePrompts coordinator (VERSION !==
// last-seen, AND the re-install banner is NOT showing — they never stack).
// Tapping "Got it" writes VERSION to ptr_last_seen_version so the sheet never
// reappears until the next version bump.
//
// Scoped to unseen releases (2026-07-13). This used to render the ENTIRE
// CHANGELOG array — every bullet ever written — under the newest version's
// header, so a one-line bugfix release presented itself as 26 features. The
// releases live in appVersion.ts; releasesSince() picks the ones this driver
// hasn't acknowledged and caps them so a long absence can't produce a wall.
// Read last-seen BEFORE dismiss() overwrites it.
//
// Dark sheet styling mirrors RouteStartWarehouseSheet / StopNotesPreSheet.
// No backdrop-dismiss — only the "Got it" CTA closes it (so the ack always
// persists the version).

const GOLD = '#FFB800'

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  // Date-only string, formatted from its parts — no UTC parse, no off-by-one.
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function WhatsNewSheet({ onClose }: { onClose: () => void }) {
  // Slide-up: mount off-screen, transition to 0 on the next frame.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Snapshot the last-seen version at MOUNT — dismiss() writes VERSION to that
  // same key, so reading it later would always come back "up to date".
  const { releases, olderCount } = useMemo(() => {
    let lastSeen: string | null = null
    try { lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY) } catch { /* private mode */ }
    return releasesSince(lastSeen)
  }, [])

  // Only label each group when there's more than one — a single release is
  // already named by the "Version X" eyebrow above.
  const showGroupHeaders = releases.length > 1

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

        {releases.map((release: Release, ri) => (
          <div key={release.version} style={{ marginTop: ri === 0 ? 0 : 20 }}>
            {showGroupHeaders && (
              <div style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10,
              }}>
                {release.version} · {formatDate(release.date)}
              </div>
            )}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {release.bullets.map((item, i) => (
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
          </div>
        ))}

        {olderCount > 0 && (
          <div style={{ marginTop: 18, fontSize: 13, lineHeight: 1.5, color: '#94A3B8' }}>
            Plus improvements from {olderCount} earlier update{olderCount === 1 ? '' : 's'} you missed.
          </div>
        )}

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
