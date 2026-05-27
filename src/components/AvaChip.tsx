'use client'

import { useEffect, useState } from 'react'

// AVA Tier 1 presence chip — animated waveform in a blue circle, top-right of
// every screen's header. Single tap opens a placeholder bottom-sheet. The
// drawer is intentionally minimal for Session 1; full conversation UI lands
// in a later session.

const BLUE = '#0000FF'

interface AvaChipProps {
  ariaLabel?: string
}

export default function AvaChip({ ariaLabel = 'Open AVA' }: AvaChipProps) {
  const [open, setOpen]   = useState(false)
  const [toast, setToast] = useState(false)

  // Auto-dismiss the "coming soon" toast after 2s.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(false), 2000)
    return () => clearTimeout(t)
  }, [toast])

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

            {/* Voice-input stub — UI only. Session 6 wires the actual
                speech-to-text + SOP lookup behind this button. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setToast(true)
              }}
              aria-label="Talk to AVA"
              style={{
                marginTop: 18,
                width: '100%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 10,
                background: BLUE, color: '#fff',
                border: 0, borderRadius: 14,
                padding: '14px 18px', cursor: 'pointer',
                fontSize: 14, fontWeight: 800, letterSpacing: '0.04em',
                boxShadow: '0 8px 20px -8px rgba(0,0,255,0.55)',
              }}
            >
              <MicGlyph />
              <span>HOLD TO TALK TO AVA</span>
            </button>

            {toast && (
              <div
                role="status"
                style={{
                  position: 'fixed',
                  left: '50%',
                  top: 'calc(env(safe-area-inset-top, 0px) + 24px)',
                  transform: 'translateX(-50%)',
                  background: '#1F2937', color: '#F8FAFC',
                  padding: '10px 16px', borderRadius: 999,
                  fontSize: 13, fontWeight: 600,
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                  zIndex: 220, maxWidth: 'calc(100vw - 32px)',
                  textAlign: 'center', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                Voice input coming in the next update.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function MicGlyph() {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  )
}
