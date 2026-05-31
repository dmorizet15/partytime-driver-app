'use client'

import { useEffect, useState } from 'react'

// AVA Phase 2 — "Ask Ava about today" entry point on the Home screen, between
// the stop list and the Inspect CTA. PLACEHOLDER for now: the real Haiku-backed
// conversation sheet (pre-seeded with route context) lands in a later session.
// Tap shows a brief "coming soon" toast, mirroring the AvaChip mic stub.

const GOLD = '#FFB800'
const INK  = '#0A0B14'
const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

export default function AskAvaButton() {
  const [toast, setToast] = useState(false)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(false), 2000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div style={{ padding: '18px 18px 0' }}>
      <button
        type="button"
        onClick={() => setToast(true)}
        aria-label="Ask AVA about today"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 12,
          background: 'transparent', border: 0, cursor: 'pointer',
          padding: 0, fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{
          width: 44, height: 44, borderRadius: '50%',
          background: GOLD, color: INK, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 900, lineHeight: 1,
          boxShadow: '0 8px 20px -8px rgba(255,184,0,0.6)',
        }}>+</span>
        <span style={{
          fontSize: 14.5, fontWeight: 800, color: INK,
          fontFamily: FONT_DISPLAY, letterSpacing: '0.01em',
        }}>
          Ask Ava about today
        </span>
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
          Ask Ava is coming in the next update.
        </div>
      )}
    </div>
  )
}
