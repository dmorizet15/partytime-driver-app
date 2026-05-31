'use client'

import type { Stop } from '@/types'

const BLUE = '#0000FF'

interface AvaDispatchNotesSheetProps {
  stops:   Stop[]   // pre-filtered: stops with a dispatcher note and/or warehouse note
  onClose: () => void
}

const NOTE_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10, fontWeight: 900, letterSpacing: '0.16em',
  textTransform: 'uppercase', color: '#FFB800', marginBottom: 3,
}
const NOTE_TEXT_STYLE: React.CSSProperties = {
  fontSize: 14, color: '#E2E8F0', lineHeight: 1.45,
  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
}

export default function AvaDispatchNotesSheet({ stops, onClose }: AvaDispatchNotesSheetProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stops with notes"
      onClick={onClose}
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
          padding: '16px 22px calc(28px + env(safe-area-inset-bottom))',
          maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} aria-hidden="true" className="ava-wave-bar"
                style={{ width: 2, height: 12, background: '#fff', borderRadius: 1, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Notes for your stops
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{
              marginLeft: 'auto', background: 'transparent', border: 0,
              color: '#94A3B8', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {stops.map((s) => {
            const addr = [s.address_line_1, s.city].filter(Boolean).join(', ')
            return (
              <li key={s.stop_id} style={{
                padding: '12px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F4F6FA', lineHeight: 1.25 }}>
                  {s.customer_name}
                </div>
                {addr && (
                  <div style={{ marginTop: 2, fontSize: 12.5, color: '#94A3B8' }}>{addr}</div>
                )}
                {s.dispatcher_notes?.trim() && (
                  <div style={{ marginTop: 8 }}>
                    <div style={NOTE_LABEL_STYLE}>From dispatch</div>
                    <div style={NOTE_TEXT_STYLE}>{s.dispatcher_notes}</div>
                  </div>
                )}
                {s.warehouse_notes?.trim() && (
                  <div style={{ marginTop: 8 }}>
                    <div style={NOTE_LABEL_STYLE}>From warehouse</div>
                    <div style={NOTE_TEXT_STYLE}>{s.warehouse_notes}</div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <button
          type="button" onClick={onClose}
          style={{
            marginTop: 22, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999, padding: '12px 16px', cursor: 'pointer',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
