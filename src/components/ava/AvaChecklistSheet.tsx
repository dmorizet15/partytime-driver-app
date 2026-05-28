'use client'

import { useState } from 'react'
import type { DependencyMapRow } from '@/lib/ava/dependencyHits'

// AVA Tier 2 — morning checklist bottom-sheet.
//
// Opens from the AvaMorningCard "Run through checklist →" button. Two sections:
//   - ALWAYS TAKE   — every active 'always' row (cleaner-bag staples)
//   - FOR TODAY'S ROUTE — manifest-triggered rows, deduped by required_item
//
// Checkbox state is component-local and resets on close — this session is a
// reminder, not a logged action (DB write lives in Session 6 alongside the
// ava_conversations logging work). Footer "All set" closes the sheet; the
// Gold CTA on Home is NOT gated on completion.

const BLUE = '#0000FF'

interface AvaChecklistSheetProps {
  alwaysItems:    DependencyMapRow[]
  triggeredItems: DependencyMapRow[]
  onClose:        () => void
}

export default function AvaChecklistSheet({
  alwaysItems,
  triggeredItems,
  onClose,
}: AvaChecklistSheetProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})

  // Dedupe triggered rows by required_item — multiple rules can fire on the
  // same required item (e.g. SEATING category + 'inflatable' keyword both
  // surface "Hand truck"). Keep the first occurrence; surface its notes if
  // present.
  const triggeredDeduped: DependencyMapRow[] = (() => {
    const seen = new Set<string>()
    const out: DependencyMapRow[] = []
    for (const row of triggeredItems) {
      if (seen.has(row.required_item)) continue
      seen.add(row.required_item)
      out.push(row)
    }
    return out
  })()

  const toggle = (id: string) =>
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Morning checklist"
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

        {/* Header — small AVA waveform + title + × close */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: BLUE,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 2, flexShrink: 0,
          }}>
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
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: 0.2 }}>
            Morning checklist
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              marginLeft: 'auto',
              background: 'transparent', border: 0,
              color: '#94A3B8', fontSize: 26, lineHeight: 1,
              cursor: 'pointer', padding: 4,
            }}
          >×</button>
        </div>

        <Section title="ALWAYS TAKE" rows={alwaysItems} checked={checked} toggle={toggle} />

        {triggeredDeduped.length > 0 && (
          <Section
            title="FOR TODAY'S ROUTE"
            rows={triggeredDeduped}
            checked={checked}
            toggle={toggle}
            style={{ marginTop: 22 }}
          />
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 24, width: '100%',
            background: '#FFB800', color: '#0A0B14',
            border: 0, borderRadius: 999,
            padding: '12px 16px', cursor: 'pointer',
            fontSize: 14, fontWeight: 800, letterSpacing: '0.02em',
          }}
        >
          All set — let&rsquo;s go
        </button>
      </div>
    </div>
  )
}

interface SectionProps {
  title:   string
  rows:    DependencyMapRow[]
  checked: Record<string, boolean>
  toggle:  (id: string) => void
  style?:  React.CSSProperties
}

function Section({ title, rows, checked, toggle, style }: SectionProps) {
  return (
    <div style={style}>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
        color: '#94A3B8', marginBottom: 10,
      }}>
        {title}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {rows.map((row) => {
          const isChecked = !!checked[row.id]
          const label     = row.required_quantity > 1
            ? `${row.required_item} (${row.required_quantity})`
            : row.required_item
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => toggle(row.id)}
                aria-pressed={isChecked}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', textAlign: 'left',
                  background: 'transparent', border: 0,
                  padding: '10px 0', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: `2px solid ${isChecked ? '#FFB800' : '#475569'}`,
                    background: isChecked ? '#FFB800' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'background 120ms ease, border-color 120ms ease',
                  }}
                >
                  {isChecked && (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M4 10.5L8 14.5L16 6"
                        stroke="#0A0B14"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span style={{
                  flex: 1, fontSize: 15,
                  color: isChecked ? '#94A3B8' : '#F4F6FA',
                  textDecoration: isChecked ? 'line-through' : 'none',
                  lineHeight: 1.35,
                }}>
                  {label}
                  {row.notes && (
                    <span style={{
                      display: 'block', marginTop: 2,
                      fontSize: 12, color: '#64748B',
                      textDecoration: 'none',
                    }}>
                      {row.notes}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
