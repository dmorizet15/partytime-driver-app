'use client'

import { useState } from 'react'
import AvaConversationSheet, { type AvaSeedContext } from './AvaConversationSheet'

// AVA Phase 2 — "Ask Ava about today" entry point on the Home screen, between
// the stop list and the Inspect CTA. Session 2 wires it to the real Haiku-backed
// AvaConversationSheet, pre-seeded with the route context the Home screen has
// already computed (stop count, COD count, wind-alerted stop names, dispatcher
// notes, manifest, driver name). Tap opens the conversation sheet.

const GOLD = '#FFB800'
const INK  = '#0A0B14'
const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface AskAvaButtonProps {
  seedContext: AvaSeedContext
  routeId?:    string | null
}

export default function AskAvaButton({ seedContext, routeId = null }: AskAvaButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ padding: '18px 18px 0' }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
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

      <AvaConversationSheet
        open={open}
        onClose={() => setOpen(false)}
        seedContext={seedContext}
        routeId={routeId}
      />
    </div>
  )
}
