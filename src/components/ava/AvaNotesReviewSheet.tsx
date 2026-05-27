'use client'

import { useRouter } from 'next/navigation'
import type { Stop } from '@/types'
import { addressKey, type StopNoteRow } from '@/lib/ava/stopNotesClient'

// Morning-card review sheet — opens from the AvaMorningCard "Review stop
// notes →" Gold CTA. Each row shows the stop's address + the most recent
// note preview. Tap a row → deep-link to the Stop Detail (where the full
// history + entry sheet are reachable via the Tier 3 pill / footer link).

const BLUE = '#0000FF'

interface AvaNotesReviewSheetProps {
  dayStops:       Stop[]
  notesByAddress: Map<string, StopNoteRow>
  onClose:        () => void
}

export default function AvaNotesReviewSheet({
  dayStops, notesByAddress, onClose,
}: AvaNotesReviewSheetProps) {
  const router = useRouter()

  // Build the list in route order, deduping by address (multiple stops at
  // the same address share notes — link to the first occurrence so the
  // driver lands on a meaningful stop, not a duplicate).
  const seen = new Set<string>()
  const rows: Array<{ stop: Stop; note: StopNoteRow }> = []
  for (const stop of dayStops) {
    const key = addressKey(stop)
    if (!key) continue
    if (seen.has(key)) continue
    const note = notesByAddress.get(key)
    if (!note) continue
    seen.add(key)
    rows.push({ stop, note })
  }

  function openStop(stop: Stop) {
    onClose()
    router.push(`/route/${stop.route_id}/stop/${stop.stop_id}`)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review stop notes"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
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
          boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          width: 44, height: 4, background: '#334155', borderRadius: 2,
          margin: '0 auto 14px',
        }}/>

        {/* Header */}
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
            Today&rsquo;s notes
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

        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5 }}>
            No prior notes for today&rsquo;s stops.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map(({ stop, note }) => (
              <li key={stop.stop_id}>
                <button
                  type="button"
                  onClick={() => openStop(stop)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'transparent', border: 0,
                    padding: '14px 0', cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
                    color: '#FFB800', textTransform: 'uppercase',
                  }}>
                    {stop.company_name?.trim() || stop.customer_name}
                  </div>
                  <div style={{
                    marginTop: 4, fontSize: 13, color: '#94A3B8', lineHeight: 1.4,
                  }}>
                    {stop.address_line_1}
                  </div>
                  <div style={{
                    marginTop: 8, fontSize: 14, color: '#F4F6FA',
                    lineHeight: 1.45,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {note.note}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
