'use client'

import { useState } from 'react'
import { INSTALL_PROMPTED_KEY, isIOS } from '@/lib/pwa'

// ─── Feature 1 — Re-install banner ──────────────────────────────────────────
// Shown at the top of the Home screen ONLY when the app is NOT running
// standalone (driver is on an old bookmark / Safari tab, not the installed
// PWA). Whether to show is decided once by the PwaHomePrompts coordinator;
// this component only renders the banner + persists the dismissal.
//
// Tapping the banner expands step-by-step re-install instructions inline.
// Dismissing writes ptr_install_prompted = true so it never shows again.

const C = {
  ink:  '#0A0B14',
  gold: '#FFB800',
  line: 'rgba(255,255,255,0.12)',
}

// iOS (Safari Share-sheet) vs Android Chrome (⋮ menu). Many drivers run Android
// Chrome as their primary device (the RFID platform), so the Android path is
// first-class — and short enough that Chrome makes expansion unnecessary.
const IOS_STEPS: string[] = [
  'Press and hold your current PartyTime icon, then tap Remove App → Delete.',
  'Open Safari and go to work.partytime-rentals.com.',
  'Tap the Share button (the square with an up arrow).',
  'Tap Add to Home Screen, then Add.',
  'Open the new PartyTime Work icon to launch the full app.',
]

const ANDROID_STEPS: string[] = [
  'Press and hold your current PartyTime icon, then drag it to Remove.',
  "Tap the ⋮ menu in Chrome → 'Add to Home Screen'.",
]

export default function ReinstallBanner({ onDismiss }: { onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)

  // Platform branch. ReinstallBanner only renders client-side (the coordinator
  // gates it behind a mount effect), so navigator is always available here.
  const ios = isIOS()
  const steps = ios ? IOS_STEPS : ANDROID_STEPS
  // Android's two steps are short enough to show inline — no tap-to-expand.
  const stepsVisible = ios ? expanded : true

  const dismiss = () => {
    try { localStorage.setItem(INSTALL_PROMPTED_KEY, 'true') } catch { /* private mode — just hide */ }
    onDismiss()
  }

  return (
    <div
      role="region"
      aria-label="App update available"
      style={{
        background: C.ink,
        color: '#fff',
        padding: '12px 14px',
        borderBottom: `2px solid ${C.gold}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* iOS: tap to expand the Share-sheet steps. Android: static message. */}
        {ios ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            style={{
              flex: 1, textAlign: 'left', background: 'none', border: 'none',
              color: '#fff', padding: 0, cursor: 'pointer', font: 'inherit',
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4 }}>
              PartyTime Work has been updated.
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#D5D8E0', marginTop: 2 }}>
              Delete your current icon and re-add from your browser to get the full app.{' '}
              <span style={{ color: C.gold, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {expanded ? 'Hide instructions ▲' : 'Tap for instructions ▾'}
              </span>
            </div>
          </button>
        ) : (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.4 }}>
              PartyTime Work has been updated.
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: '#D5D8E0', marginTop: 2 }}>
              Delete your current icon and re-add it to get the full app:
            </div>
          </div>
        )}

        {/* Dismiss — never show again */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, width: 26, height: 26, borderRadius: 7,
            background: 'rgba(255,255,255,0.10)', border: 'none', color: '#fff',
            fontSize: 15, lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {stepsVisible && (
        <ol
          style={{
            margin: '12px 0 2px', paddingLeft: 0, listStyle: 'none',
            borderTop: `1px solid ${C.line}`, paddingTop: 12,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          {steps.map((step, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                  background: C.gold, color: C.ink, fontSize: 11.5, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: '#E6E8EE' }}>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
