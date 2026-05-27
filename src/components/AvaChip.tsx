'use client'

import { useState } from 'react'

// AVA Tier 1 presence chip — animated waveform in a blue circle, top-right of
// every screen's header. Single tap opens a placeholder bottom-sheet. The
// drawer is intentionally minimal for Session 1; full conversation UI lands
// in a later session.

const BLUE = '#0000FF'

interface AvaChipProps {
  ariaLabel?: string
}

export default function AvaChip({ ariaLabel = 'Open AVA' }: AvaChipProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: BLUE, border: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 2, padding: 0, flexShrink: 0,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            className="ava-wave-bar"
            style={{
              width: 2, height: 12,
              background: '#fff', borderRadius: 1,
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AVA"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 448,
              background: '#0F172A', color: '#fff',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '20px 22px calc(28px + env(safe-area-inset-bottom))',
              boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{
              width: 44, height: 4, background: '#334155', borderRadius: 2,
              margin: '0 auto 18px',
            }}/>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: BLUE,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 3, flexShrink: 0,
              }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="ava-wave-bar"
                    style={{
                      width: 2.5, height: 16,
                      background: '#fff', borderRadius: 1,
                      animationDelay: `${i * 120}ms`,
                    }}
                  />
                ))}
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.4 }}>AVA</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent', border: 0,
                  color: '#94A3B8', fontSize: 26, lineHeight: 1,
                  cursor: 'pointer', padding: 4,
                }}
              >×</button>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: '#CBD5E1' }}>
              AVA is coming soon — Phase 1 build in progress. The full
              conversation experience will land in a future session.
            </div>
          </div>
        </div>
      )}
    </>
  )
}
