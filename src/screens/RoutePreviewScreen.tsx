'use client'

// ─── RoutePreviewScreen ──────────────────────────────────────────────────────
// Next Day Route Preview — Session 2. Read-only preview of an UPCOMING route
// reached from NextShiftCard's "Preview route". Shows crew, a day-at-a-glance,
// and the full manifest of every stop. NO ETA / check-off / completion / live
// navigation — every action surface is informational only.
//
// Data: reuses GET /api/routes?date=<routeDate> (the single route+stop endpoint;
// it accepts an arbitrary date and is crew-scoped to the caller, so the driver's
// own upcoming route comes back fully transformed). routeDate arrives as a
// ?date= query param from NextShiftCard.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Route, Stop } from '@/types'
import { resolveCategory } from '@/lib/itemCategories'
import { StopWindowBadge } from '@/components/StopWindowBadge'
import AvaConversationSheet from '@/components/ava/AvaConversationSheet'
import SameJobIndicator from '@/components/SameJobIndicator'

const C = {
  blue:    '#1F46FF',
  dark:    '#07070F',
  ink:     '#0A0B14',
  cream:   '#FFF9EE',
  gold:    '#FFB800',
  goldDeep:'#B07F00',
  muted:   '#6B7488',
  paper:   '#FFFFFF',
  off:     '#F4F6FA',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface RoutePreviewScreenProps {
  routeId: string
}

function formatLongDate(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function sentenceCase(s: string): string {
  const t = s.trim()
  if (!t) return ''
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

function sumTents(stops: Stop[]): number {
  let n = 0
  for (const s of stops) for (const it of s.items ?? []) {
    if ((it.category ?? '').toLowerCase().includes('tent')) n += it.qty ?? 1
  }
  return n
}
function sumBucket(stops: Stop[], bucket: 'Chairs' | 'Tables'): number {
  let n = 0
  for (const s of stops) for (const it of s.items ?? []) {
    if (resolveCategory(it.category, it.name ?? '') === bucket) n += it.qty ?? 1
  }
  return n
}

function NavigateIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  )
}

function roleLabel(role?: string, isPrimary?: boolean): string {
  if (isPrimary || role === 'primary_driver') return 'Primary driver'
  if (role === 'secondary_driver') return 'Co-driver'
  return 'Helper'
}

export default function RoutePreviewScreen({ routeId }: RoutePreviewScreenProps) {
  const router = useRouter()
  const search = useSearchParams()
  const date = search.get('date') ?? ''

  const [route, setRoute] = useState<Route | null>(null)
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avaOpen, setAvaOpen] = useState(false)

  useEffect(() => {
    if (!date) { setLoading(false); setError('Missing route date'); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/routes?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: { routes?: Route[]; stops?: Stop[] }) => {
        if (cancelled) return
        const r = (payload.routes ?? []).find((x) => x.route_id === routeId) ?? null
        const s = (payload.stops ?? [])
          .filter((x) => x.route_id === routeId)
          .sort((a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0))
        setRoute(r)
        setStops(s)
        setError(r ? null : 'Route not found')
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [date, routeId])

  const customerStops = useMemo(
    () => stops.filter((s) => s.stop_type !== 'warehouse' && s.stop_type !== 'warehouse_return'),
    [stops],
  )
  const tentCount  = useMemo(() => sumTents(customerStops), [customerStops])
  const chairCount = useMemo(() => sumBucket(customerStops, 'Chairs'), [customerStops])
  const codCount   = useMemo(
    () => customerStops.filter((s) => s.stop_type === 'delivery' && (s.payment_state ?? '') === 'cod').length,
    [customerStops],
  )

  const routeNumber = route?.route_number
  const crew = route?.crew ?? []

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── Header (fixed; sits above the scroll area like RouteListScreen) ── */}
      <div style={{
        background: C.dark, color: '#fff', padding: '16px 18px 18px',
        zIndex: 20, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button" onClick={() => router.back()} aria-label="Back"
            style={{
              background: 'rgba(255,255,255,0.1)', border: 0, color: '#fff',
              width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
              fontSize: 20, lineHeight: 1, flexShrink: 0,
            }}
          >‹</button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em',
              }}>
                {routeNumber != null ? `Route ${routeNumber} preview` : 'Route preview'}
              </div>
              <span style={{
                background: 'rgba(31,70,255,0.25)', color: '#A9BCFF',
                border: `1px solid ${C.blue}`, borderRadius: 6,
                padding: '2px 6px', fontSize: 9, fontWeight: 900,
                letterSpacing: '0.12em', textTransform: 'uppercase',
              }}>Preview</span>
            </div>
            <div style={{ marginTop: 2, fontSize: 12.5, color: 'rgba(255,255,255,0.75)' }}>
              {formatLongDate(date)}
            </div>
          </div>
        </div>
      </div>

      {/* Scroll container — `.screen` is height:100svh + overflow:hidden, so the
          page only scrolls inside a flex:1/overflow-y-auto child (same pattern
          as RouteListScreen's `flex-1 overflow-y-auto`). Bottom padding clears
          the home-indicator inset for the last item. */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
      {loading && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: C.muted }}>Loading preview…</div>
      )}
      {!loading && error && (
        <div style={{ padding: '40px 22px', textAlign: 'center', color: C.muted }}>
          Couldn&apos;t load this route preview.
        </div>
      )}

      {!loading && !error && route && (
        <>
          {/* Dispatcher note — above the fold */}
          {route.dispatcher_notes && route.dispatcher_notes.trim() && (
            <div style={{ padding: '16px 18px 0' }}>
              <div style={{
                background: 'rgba(31,70,255,0.06)', borderLeft: `4px solid ${C.blue}`,
                borderRadius: 10, padding: '12px 14px',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 900, letterSpacing: '0.16em',
                  color: C.blue, textTransform: 'uppercase', marginBottom: 5,
                }}>From dispatch</div>
                <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                  {route.dispatcher_notes.trim()}
                </div>
              </div>
            </div>
          )}

          {/* Crew & trucks */}
          {crew.length > 0 && (
            <div style={{ padding: '18px 18px 0' }}>
              <SectionLabel>Crew &amp; trucks</SectionLabel>
              <div style={{
                background: C.paper, border: `1.5px solid rgba(10,11,20,0.12)`, borderRadius: 16,
                overflow: 'hidden',
              }}>
                {crew.map((c, i) => (
                  <div key={c.profileId ?? i} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    borderTop: i === 0 ? 0 : '1px solid rgba(10,11,20,0.08)',
                  }}>
                    <span aria-hidden="true" style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(31,70,255,0.10)', border: `1px solid ${C.blue}`,
                      color: C.blue, fontSize: 12.5, fontWeight: 800,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{initials(c.name)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted }}>
                        {roleLabel(c.role, c.role === 'primary_driver')}
                      </div>
                    </div>
                    {trucknameForCrew(route, c.role) && (
                      <span style={{
                        flexShrink: 0, background: 'rgba(255,184,0,0.14)', color: C.goldDeep,
                        border: '1px solid rgba(255,184,0,0.45)', borderRadius: 999,
                        padding: '3px 10px', fontSize: 11, fontWeight: 800, letterSpacing: '0.03em',
                      }}>{trucknameForCrew(route, c.role)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day at a glance */}
          <div style={{ padding: '18px 18px 0' }}>
            <SectionLabel>Day at a glance</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <GlanceCell label="Tents" value={tentCount} />
              <GlanceCell label={customerStops.length === 1 ? 'Stop' : 'Stops'} value={customerStops.length} />
              <GlanceCell label="Chairs" value={chairCount} />
              <GlanceCell label="COD stops" value={codCount} gold />
            </div>
          </div>

          {/* Stop list */}
          <div style={{ padding: '20px 18px 0' }}>
            <SectionLabel>Stops</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {stops.map((s, i) => (
                <StopPreviewCard
                  key={s.stop_id}
                  stop={s}
                  index={i + 1}
                  routeDate={date}
                  currentRouteId={routeId}
                />
              ))}
              {stops.length === 0 && (
                <div style={{ color: C.muted, fontSize: 14, padding: '8px 2px' }}>
                  No stops on this route yet.
                </div>
              )}
            </div>
          </div>

          {/* Ava CTA */}
          <div style={{ padding: '22px 18px 8px' }}>
            <button
              type="button" onClick={() => setAvaOpen(true)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                background: 'rgba(255,184,0,0.12)', border: `1.5px solid rgba(255,184,0,0.5)`,
                borderRadius: 16, padding: '16px 18px', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 14,
              }}
            >
              <span aria-hidden="true" style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                background: C.gold, color: C.ink, fontSize: 22, fontWeight: 900,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>✦</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: C.ink, fontFamily: FONT_DISPLAY }}>
                  Ask Ava about this route
                </div>
                <div style={{ fontSize: 12.5, color: C.goldDeep, fontWeight: 600, marginTop: 2 }}>
                  Manifest, stops, crew &amp; how we do things
                </div>
              </div>
            </button>
          </div>
        </>
      )}
      </div>

      <AvaConversationSheet
        open={avaOpen}
        onClose={() => setAvaOpen(false)}
        seedContext={{}}
        routeId={routeId}
        routeDate={date || null}
      />
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: C.muted, margin: '0 0 10px 2px',
    }}>{children}</div>
  )
}

function GlanceCell({ label, value, gold }: { label: string; value: number; gold?: boolean }) {
  return (
    <div style={{
      background: gold ? 'rgba(255,184,0,0.12)' : C.paper,
      border: gold ? '1.5px solid rgba(255,184,0,0.45)' : '1.5px solid rgba(10,11,20,0.12)',
      borderRadius: 14, padding: '14px 16px',
    }}>
      <div style={{
        fontSize: 26, fontWeight: 900, fontFamily: FONT_DISPLAY, lineHeight: 1,
        color: gold ? C.goldDeep : C.ink,
      }}>{value}</div>
      <div style={{
        marginTop: 5, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: gold ? C.goldDeep : C.muted,
      }}>{label}</div>
    </div>
  )
}

function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// The /api/routes transform exposes only THIS user's own truck on the Route
// object (truck_name). Crew rows don't each carry a truck name, so we surface
// the route truck against the primary driver row only — the most useful single
// chip in a preview. (A richer per-crew truck map is a future enhancement.)
function trucknameForCrew(route: Route, role?: string): string | null {
  if (role === 'primary_driver') return route.truck_name?.trim() || null
  return null
}

function StopPreviewCard({
  stop, index, routeDate, currentRouteId,
}: { stop: Stop; index: number; routeDate: string; currentRouteId: string }) {
  const isDepot = stop.stop_type === 'warehouse' || stop.stop_type === 'warehouse_return'
  const items = stop.items ?? []
  const address = [stop.address_line_1, stop.city && `${stop.city}, ${stop.state ?? ''}`.trim()]
    .filter(Boolean).join(' · ')
  const notes = [
    stop.dispatcher_notes?.trim(),
    stop.notes?.trim(),
  ].filter((n): n is string => !!n)

  return (
    <div style={{
      background: C.paper, border: `1.5px solid rgba(10,11,20,0.14)`, borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Card head */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          // Outlined only — never filled (preview, not actionable).
          background: 'transparent', border: `2px solid ${C.ink}`, color: C.ink,
          fontSize: 13, fontWeight: 800,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{index}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.ink, lineHeight: 1.25 }}>
            {isDepot ? 'Return to warehouse' : (stop.customer_name || 'Stop')}
          </div>
          {!!address && (
            <div style={{ marginTop: 3, fontSize: 12.5, color: C.muted, lineHeight: 1.35 }}>{address}</div>
          )}
          <div style={{ marginTop: 6 }}>
            <StopWindowBadge stop={stop} size="sm" />
          </div>
        </div>
        <span style={{
          flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: C.muted, marginTop: 4,
        }}>{stop.stop_type}</span>
      </div>

      {/* Full item list — name + quantity, no summarizing */}
      {items.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(10,11,20,0.08)' }}>
          {items.map((it, k) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 16px',
              borderTop: k === 0 ? 0 : '1px solid rgba(10,11,20,0.06)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
                  {(it.name ?? '').trim() || '—'}
                </div>
                {it.category && (
                  <div style={{ marginTop: 1, fontSize: 11.5, color: C.muted }}>
                    {sentenceCase(it.category)}
                  </div>
                )}
              </div>
              <div style={{
                background: C.ink, color: '#fff', padding: '4px 10px', borderRadius: 999,
                fontSize: 11.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>×{it.qty ?? 1}</div>
            </div>
          ))}
        </div>
      )}

      {/* Same-job indicator — below the full item list, above the notes block.
          Session 3. Self-contained; renders null (0-height) when no siblings. */}
      <div style={{ padding: '0 16px' }}>
        <SameJobIndicator
          reservation_id={stop.reservation_id ?? null}
          route_date={routeDate}
          current_route_id={currentRouteId}
        />
      </div>

      {/* Notes block */}
      {notes.length > 0 && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(10,11,20,0.08)' }}>
          {notes.map((n, i) => (
            <div key={i} style={{ fontSize: 13, color: C.ink, lineHeight: 1.4, marginTop: i === 0 ? 0 : 8 }}>
              {n}
            </div>
          ))}
        </div>
      )}

      {/* Navigate — preview only, disabled */}
      <div style={{ padding: '0 16px 14px', marginTop: notes.length > 0 ? 0 : 4 }}>
        <div
          aria-hidden="true"
          style={{
            opacity: 0.5, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: C.ink, color: '#fff', borderRadius: 12, padding: '11px 14px',
            fontSize: 14, fontWeight: 800,
          }}
        >
          <NavigateIcon size={16} color="#fff" />
          <span>Navigate</span>
          <span style={{
            marginLeft: 6, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
            textTransform: 'uppercase', opacity: 0.85,
          }}>Preview only</span>
        </div>
      </div>
    </div>
  )
}
