'use client'

// ─── NextShiftCard ───────────────────────────────────────────────────────────
// Next Day Route Preview — Session 1. Home-screen card surfacing the driver's
// SOONEST upcoming shift (route_date strictly after today). Fed by
// GET /api/routes/next-shift. Returns null when there's no upcoming shift or
// the endpoint fails — nothing renders, Home is unaffected.
//
// PTR design: dark #07070F, blue #1F46FF, gold #FFB800.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AvaConversationSheet from './ava/AvaConversationSheet'

const DARK = '#07070F'
const BLUE = '#1F46FF'
const GOLD = '#FFB800'
const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"

interface NextShiftCrew {
  display_name: string | null
  role: string
  is_primary: boolean
  truck_name: string | null
}

interface NextShift {
  route_date: string
  route_id: string
  route_number: number | null
  stop_count: number
  tent_count: number
  chair_count: number
  table_count: number
  cod_flag: boolean
  crew: NextShiftCrew[]
  dispatcher_notes: string | null
}

function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse a bare YYYY-MM-DD into a LOCAL date (never `new Date(iso)` on a bare
// date — that parses as UTC midnight and can day-shift; CLAUDE.md lesson).
function formatShiftDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function roleLabel(c: NextShiftCrew): string {
  if (c.is_primary || c.role === 'primary_driver') return 'Primary driver'
  if (c.role === 'secondary_driver') return 'Co-driver'
  return 'Helper'
}

export default function NextShiftCard() {
  const router = useRouter()
  const [shift, setShift] = useState<NextShift | null>(null)
  const [avaOpen, setAvaOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/routes/next-shift?today=${localToday()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (!cancelled && json?.shift) setShift(json.shift as NextShift)
      })
      .catch((err) => {
        console.warn('[NextShiftCard] fetch failed (non-fatal):', err instanceof Error ? err.message : err)
      })
    return () => { cancelled = true }
  }, [])

  if (!shift) return null

  const stats: Array<[string, number]> = [
    ['Tents', shift.tent_count],
    ['Chairs', shift.chair_count],
    ['Tables', shift.table_count],
  ]
  const visibleStats = stats.filter(([, n]) => n > 0)

  return (
    <div style={{ padding: '18px 18px 0' }}>
      <div style={{
        background: DARK,
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 12px 30px -16px rgba(0,0,0,0.55)',
        fontFamily: 'inherit',
      }}>
        {/* ── Blue header bar ─────────────────────────────────────────────── */}
        <div style={{
          background: BLUE, color: '#fff',
          padding: '14px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.22em',
              color: GOLD, textTransform: 'uppercase',
            }}>
              Next shift
            </div>
            <div style={{
              marginTop: 4, fontSize: 19, fontWeight: 900,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em', lineHeight: 1.05,
            }}>
              {formatShiftDate(shift.route_date)}
              {shift.route_number != null && (
                <span style={{ fontWeight: 700, opacity: 0.85 }}> · Route {shift.route_number}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: FONT_DISPLAY, lineHeight: 1 }}>
              {shift.stop_count}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase',
            }}>
              {shift.stop_count === 1 ? 'stop' : 'stops'}
            </div>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ padding: '14px 18px 18px' }}>
          {/* Crew rows */}
          {shift.crew.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {shift.crew.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span aria-hidden="true" style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(31,70,255,0.18)', border: `1px solid ${BLUE}`,
                    color: '#fff', fontSize: 12.5, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {initials(c.display_name ?? '')}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 14.5, fontWeight: 700, color: '#fff',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {c.display_name}
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#8A90A6' }}>
                      {roleLabel(c)}
                    </div>
                  </div>
                  {c.truck_name && (
                    <span style={{
                      flexShrink: 0,
                      background: 'rgba(255,184,0,0.14)', color: GOLD,
                      border: '1px solid rgba(255,184,0,0.4)',
                      borderRadius: 999, padding: '3px 10px',
                      fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
                    }}>
                      {c.truck_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Equipment stat pills */}
          {(visibleStats.length > 0 || shift.cod_flag) && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8,
              marginTop: shift.crew.length > 0 ? 14 : 0,
            }}>
              {visibleStats.map(([label, n]) => (
                <span key={label} style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 10, padding: '6px 11px',
                  fontSize: 12.5, fontWeight: 700, color: '#E8EAF2',
                }}>
                  <span style={{ color: GOLD, fontWeight: 900 }}>{n}</span>{' '}{label}
                </span>
              ))}
              {shift.cod_flag && (
                <span style={{
                  background: 'rgba(255,184,0,0.16)', border: '1px solid rgba(255,184,0,0.45)',
                  borderRadius: 10, padding: '6px 11px',
                  fontSize: 12.5, fontWeight: 900, color: GOLD, letterSpacing: '0.04em',
                }}>
                  COD
                </span>
              )}
            </div>
          )}

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => router.push(`/route-preview/${shift.route_id}`)}
              style={{
                flex: 1, background: GOLD, color: DARK,
                border: 0, borderRadius: 12, padding: '12px 10px',
                fontSize: 14, fontWeight: 900, cursor: 'pointer',
                fontFamily: FONT_DISPLAY, letterSpacing: '0.01em',
              }}
            >
              Preview route
            </button>
            <button
              type="button"
              onClick={() => setAvaOpen(true)}
              style={{
                flex: 1, background: 'transparent', color: '#fff',
                border: '1.5px solid rgba(255,255,255,0.28)', borderRadius: 12, padding: '12px 10px',
                fontSize: 14, fontWeight: 800, cursor: 'pointer',
                fontFamily: FONT_DISPLAY, letterSpacing: '0.01em',
              }}
            >
              Ask Ava
            </button>
          </div>
        </div>
      </div>

      <AvaConversationSheet
        open={avaOpen}
        onClose={() => setAvaOpen(false)}
        seedContext={{
          stopCount: shift.stop_count,
          codCount: shift.cod_flag ? 1 : 0,
          dispatcherNotes: shift.dispatcher_notes ? [shift.dispatcher_notes] : [],
        }}
        routeId={shift.route_id}
      />
    </div>
  )
}
