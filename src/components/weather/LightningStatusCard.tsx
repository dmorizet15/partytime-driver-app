'use client'

import StatusBadge from './StatusBadge'
import { evaluateLightning, STATUS_COLORS } from '@/lib/weather/thresholds'
import type { LightningAlert } from '@/lib/weather/types'

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const C_INK   = '#0A0B14'
const C_GOLD  = '#FFB800'
const C_SUB   = 'rgba(255,255,255,0.55)'

interface Props {
  alerts: LightningAlert[]
}

export default function LightningStatusCard({ alerts }: Props) {
  const status = evaluateLightning(alerts)

  if (status.level === 'stop') {
    // Highest priority — full attention. Visually overrides the rest of the page.
    const c = STATUS_COLORS.stop
    return (
      <section
        role="alert"
        aria-label="Lightning alert"
        style={{
          background:   c.bg,
          border:       `2px solid ${c.border}`,
          borderRadius: 16,
          padding:      '20px 18px',
          color:        '#fff',
          fontFamily:   FONT_BODY,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            aria-hidden="true"
            className="ptr-pulse-dot"
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: c.dot, flexShrink: 0,
              boxShadow: `0 0 0 6px rgba(255,0,0,0.18)`,
            }}
          />
          <div>
            <div style={{
              fontSize: 11, fontWeight: 900, letterSpacing: '0.20em',
              color: c.text, textTransform: 'uppercase',
            }}>
              Lightning
            </div>
            <div style={{
              marginTop: 4, fontFamily: FONT_DISPLAY,
              fontSize: 28, fontWeight: 900, lineHeight: 1,
              color: '#fff', letterSpacing: '-0.02em',
            }}>
              STOP — DO NOT WORK
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              style={{
                background:   'rgba(0,0,0,0.30)',
                border:       `1px solid ${c.border}`,
                borderRadius: 10,
                padding:      '10px 12px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, color: c.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {a.event}
              </div>
              {a.headline && (
                <div style={{ marginTop: 4, fontSize: 12, color: '#fff', lineHeight: 1.4 }}>
                  {a.headline}
                </div>
              )}
              {a.expiresAt && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                  Expires {formatExpires(a.expiresAt)}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.45 }}>
          PartyTime does not work in lightning. Hold until alert clears. If long-term or all-day, contact dispatch.
        </div>
      </section>
    )
  }

  // Clear state — compact card
  return (
    <section
      aria-label="Lightning status"
      style={{
        background:   C_INK,
        borderRadius: 16,
        padding:      '14px 18px',
        color:        '#fff',
        fontFamily:   FONT_BODY,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          12,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', color: C_GOLD, textTransform: 'uppercase' }}>
          Lightning
        </div>
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: C_SUB }}>
          {status.reason}
        </div>
      </div>
      <StatusBadge level="clear" label="Clear" />
    </section>
  )
}

function formatExpires(iso: string): string {
  try {
    const dt = new Date(iso)
    return dt.toLocaleString(undefined, {
      hour: 'numeric', minute: '2-digit',
      month: 'short', day: 'numeric',
    })
  } catch {
    return iso
  }
}
