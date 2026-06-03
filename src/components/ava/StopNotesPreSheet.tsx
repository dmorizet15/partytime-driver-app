'use client'

const BLUE = '#0000FF'

export interface StopNotesSections {
  dispatcherNote?: string | null
  warehouseNote?:  string | null  // dispatch_stops.warehouse_notes (Migration 077)
  deliveryInstr?:  string | null  // notes_additional_delivery
  staffNote?:      string | null  // notes_employee_authored
  flipNote?:       string | null  // notes_flip (pickup only — caller gates)
  timingNote?:     string | null  // notes_set_by_time || notes_strike_time
  avaRemembers?:   string | null  // latest ava_stop_notes.note
}

interface StopNotesPreSheetProps {
  customerName: string
  sections:     StopNotesSections
  ctaLabel:     string          // "Got it" or "Got it — Navigate Now"
  onProceed:    () => void       // dismiss + run the underlying action
}

const SECTION_ORDER: Array<{ key: keyof StopNotesSections; label: string }> = [
  // FROM WAREHOUSE renders first — warehouse note before dispatcher note.
  { key: 'warehouseNote',  label: 'FROM WAREHOUSE' },
  { key: 'dispatcherNote', label: 'DISPATCHER NOTE' },
  { key: 'deliveryInstr',  label: 'DELIVERY INSTRUCTIONS' },
  { key: 'staffNote',      label: 'STAFF NOTE' },
  { key: 'flipNote',       label: 'FLIP / TEARDOWN NOTE' },
  { key: 'timingNote',     label: 'TIMING NOTE' },
  { key: 'avaRemembers',   label: 'AVA REMEMBERS' },
]

export default function StopNotesPreSheet({ customerName, sections, ctaLabel, onProceed }: StopNotesPreSheetProps) {
  const visible = SECTION_ORDER.filter(({ key }) => {
    const v = sections[key]
    return typeof v === 'string' && v.trim().length > 0
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notes for this stop"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      {/* NO backdrop-dismiss and NO auto-dismiss — driver controls close via the CTA. */}
      <div
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
          width: 44, height: 4, background: '#334155', borderRadius: 2, margin: '0 auto 14px',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
          }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} aria-hidden="true" className="ava-wave-bar"
                style={{ width: 2, height: 12, background: '#fff', borderRadius: 1, animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Before you go
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#94A3B8', marginBottom: 16 }}>{customerName}</div>

        {visible.map(({ key, label }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              textTransform: 'uppercase', color: '#FFB800', marginBottom: 5,
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 14.5, lineHeight: 1.5, color: '#E2E8F0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {sections[key]}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onProceed}
          style={{
            marginTop: 6, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999, padding: '13px 16px', cursor: 'pointer',
            fontSize: 14.5, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  )
}
