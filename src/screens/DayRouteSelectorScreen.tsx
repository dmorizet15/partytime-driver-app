'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter }                    from 'next/navigation'
import { useAppState }                  from '@/context/AppStateContext'
import { useAuth }                      from '@/hooks/useAuth'
import { signOut }                      from '@/lib/auth'
import { Route }                        from '@/types'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
} as const

const FONT_DISPLAY = "'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "'Inter', system-ui, -apple-system, sans-serif"

// ─── Phase-2 reservation flags ────────────────────────────────────────────────
// Slots are kept in JSX so flipping these to `true` is a one-line change once
// the backend is ready. Default hidden — no fake UI shipped today.
const HAS_INSPECTION_REQUIRED = false
const HAS_AVA                 = false

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocal(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function formatNavDate(dateStr: string): string {
  return parseLocal(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month:   'short',
    day:     'numeric',
  })
}

function formatEyebrowDate(dateStr: string): string {
  const d  = parseLocal(dateStr)
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const mo = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `${wd} · ${mo} ${d.getDate()}`
}

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function firstNameOf(displayName: string | null | undefined): string | null {
  if (!displayName) return null
  const t = displayName.trim()
  if (!t) return null
  return t.split(/\s+/)[0]
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DayRouteSelectorScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const { getRoutesForDate, stops, isLoading, error, loadDay } = useAppState()

  const [selectedDate, setSelectedDate] = useState<string>(todayStr())

  // Load routes whenever the selected date changes
  useEffect(() => {
    loadDay(selectedDate)
  }, [selectedDate, loadDay])

  const isToday = selectedDate === todayStr()
  const routes  = getRoutesForDate(selectedDate)

  // COD aggregation across already-loaded stops (no new backend calls)
  const codStopsByRouteId = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stops) {
      if (s.payment_state === 'cod') {
        map.set(s.route_id, (map.get(s.route_id) || 0) + 1)
      }
    }
    return map
  }, [stops])

  const totalCodCount = useMemo(
    () => Array.from(codStopsByRouteId.values()).reduce((a, b) => a + b, 0),
    [codStopsByRouteId]
  )

  const totalStopCount = useMemo(
    () => routes.reduce((a, r) => a + r.stop_count, 0),
    [routes]
  )

  const firstName   = firstNameOf(profile?.display_name)
  const hasGreeting = !!firstName

  const heroSubhead = (() => {
    if (isLoading)            return 'Loading today…'
    if (error)                return 'Could not load routes.'
    if (routes.length === 0)  return 'No routes scheduled.'
    const r = routes.length === 1 ? '1 route' : `${routes.length} routes`
    const s = totalStopCount === 1 ? '1 stop'  : `${totalStopCount} stops`
    return `${r} · ${s} scheduled.`
  })()

  function handleRouteSelect(route: Route) {
    router.push(`/route/${route.route_id}`)
  }

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '36px 22px 26px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* asymmetric gold star */}
        <svg
          aria-hidden="true"
          width={180} height={180} viewBox="0 0 100 100"
          style={{ position: 'absolute', right: -20, top: -10, opacity: 0.15, pointerEvents: 'none' }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        {/* Eyebrow row: date · sign out */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatEyebrowDate(selectedDate)}
          </div>
          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            style={{
              background: 'rgba(255,255,255,0.10)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.18)',
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Sign out
          </button>
        </div>

        {/* Headline */}
        <div style={{
          marginTop: 22, position: 'relative',
          fontFamily: FONT_DISPLAY,
          fontSize: 38, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
        }}>
          {hasGreeting ? (
            <>
              {timeGreeting()},<br/>
              <span style={{ color: C.gold }}>{firstName}.</span>
            </>
          ) : (
            <>Hey<br/>there.</>
          )}
        </div>

        {/* Subhead */}
        <div style={{
          marginTop: 14, position: 'relative',
          fontSize: 15, color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.4,
        }}>
          {heroSubhead}
        </div>
      </div>

      {/* ── DATE NAV ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: C.cream,
        borderBottom: '1px solid rgba(10,11,20,0.08)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
          disabled={isLoading}
          aria-label="Previous day"
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: `1.5px solid ${C.ink}`, background: '#fff',
            color: C.ink, fontSize: 20, fontWeight: 800,
            cursor: isLoading ? 'default' : 'pointer',
            opacity: isLoading ? 0.4 : 1,
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ‹
        </button>

        <div style={{ textAlign: 'center' }}>
          {isToday && (
            <span style={{
              display: 'inline-block',
              background: C.ink, color: '#fff',
              fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '2px 8px', borderRadius: 4,
              marginBottom: 4,
            }}>
              Today
            </span>
          )}
          <div style={{
            fontSize: 14, fontWeight: 700, color: C.ink,
            fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
          }}>
            {formatNavDate(selectedDate)}
          </div>
        </div>

        <button
          onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
          disabled={isLoading}
          aria-label="Next day"
          style={{
            width: 40, height: 40, borderRadius: 12,
            border: `1.5px solid ${C.ink}`, background: '#fff',
            color: C.ink, fontSize: 20, fontWeight: 800,
            cursor: isLoading ? 'default' : 'pointer',
            opacity: isLoading ? 0.4 : 1,
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ›
        </button>
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      {/* paddingBottom reserves ~80px for the future bottom nav (Phase 2) */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 80 }}>
        {/* Phase-2 slot: Pre-trip inspection — hidden until backend ships */}
        {HAS_INSPECTION_REQUIRED && (
          <div style={{ padding: '14px 18px 0' }}>
            {/* PreTripCard goes here */}
          </div>
        )}

        {/* COD alert — real data from already-loaded stops */}
        {!isLoading && !error && totalCodCount > 0 && (
          <div style={{ padding: '14px 18px 0' }}>
            <div style={{
              background: '#FFF6DB',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 18,
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: `4px 4px 0 ${C.gold}`,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: C.gold, border: `1.5px solid ${C.ink}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }} aria-hidden="true">
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                     stroke={C.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: C.goldDeep,
                }}>
                  Cash on delivery
                </div>
                <div style={{
                  marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
                  lineHeight: 1.25, fontFamily: FONT_DISPLAY,
                }}>
                  {totalCodCount === 1
                    ? '1 stop requires cash collection'
                    : `${totalCodCount} stops require cash collection`}
                </div>
                <div style={{ marginTop: 2, fontSize: 12, color: C.muted }}>
                  Marked routes show the COD highlight below.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section eyebrow */}
        <div style={{
          padding: '24px 22px 8px',
          fontFamily: FONT_DISPLAY,
          fontSize: 13, fontWeight: 800, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: C.muted,
        }}>
          Routes for this day
        </div>

        {/* Body content: loading · error · empty · list */}
        {isLoading ? (
          <div style={{
            padding: '40px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 28, height: 28,
              border: '2px solid rgba(10,11,20,0.15)',
              borderTopColor: C.ink,
              borderRadius: '50%',
              animation: 'ptw-spin 0.9s linear infinite',
            }}/>
            <span style={{ fontSize: 13, color: C.muted }}>Loading routes…</span>
            <style>{`@keyframes ptw-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ padding: '6px 22px 0' }}>
            <div style={{
              background: '#fff',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 18,
              padding: 18,
              boxShadow: `5px 5px 0 ${C.coral}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.coral,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Couldn't load
              </div>
              <div style={{
                marginTop: 6, fontSize: 18, fontWeight: 900, color: C.ink,
                fontFamily: FONT_DISPLAY, lineHeight: 1.15, letterSpacing: '-0.02em',
              }}>
                We couldn't reach the server.
              </div>
              <div style={{
                marginTop: 8, fontSize: 12, color: C.muted,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-all',
              }}>
                {error}
              </div>
              <button
                onClick={() => loadDay(selectedDate)}
                style={{
                  marginTop: 14,
                  background: C.ink, color: '#fff',
                  padding: '10px 18px',
                  borderRadius: 999, border: 0, cursor: 'pointer',
                  fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                  letterSpacing: '0.02em',
                }}
              >
                Try again
              </button>
            </div>
          </div>
        ) : routes.length === 0 ? (
          <div style={{
            padding: '32px 28px',
            textAlign: 'center', color: C.muted, fontSize: 14, lineHeight: 1.5,
          }}>
            No routes scheduled for this day.
          </div>
        ) : (
          // Editorial route list — vertical line + numbered circles
          <div style={{ padding: '0 18px', position: 'relative' }}>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 32, top: 14, bottom: 24,
                width: 2,
                background: 'rgba(10,11,20,0.10)',
              }}
            />
            {routes.map((route, i) => {
              const cod      = codStopsByRouteId.get(route.route_id) ?? 0
              const featured = cod > 0
              const meta: string[] = []
              if (route.truck_name)     meta.push(route.truck_name)
              if (route.truck_2_name)   meta.push(route.truck_2_name)
              if (route.assigned_driver) meta.push(route.assigned_driver)

              return (
                <button
                  key={route.route_id}
                  onClick={() => handleRouteSelect(route)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: 'transparent', border: 0, cursor: 'pointer',
                    padding: '12px 0', display: 'flex', gap: 16,
                    alignItems: 'flex-start', fontFamily: 'inherit',
                    minHeight: 64,
                  }}
                >
                  {/* Numbered circle */}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    flexShrink: 0,
                    background: featured ? C.gold : '#fff',
                    border: `2px solid ${C.ink}`, color: C.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 900,
                    fontFamily: FONT_DISPLAY,
                    position: 'relative', zIndex: 1,
                  }}>
                    {i + 1}
                  </div>

                  {/* Right side */}
                  <div style={{
                    flex: 1, minWidth: 0,
                    background: featured ? '#fff' : 'transparent',
                    border: featured ? `1.5px solid ${C.ink}` : 'none',
                    borderRadius: featured ? 16 : 0,
                    padding: featured ? '12px 14px' : '0 0 6px',
                    boxShadow: featured ? `4px 4px 0 ${C.ink}` : 'none',
                    position: 'relative', zIndex: 0,
                  }}>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'baseline', gap: 8,
                    }}>
                      <div style={{
                        fontSize: 16, fontWeight: 800, color: C.ink,
                        fontFamily: FONT_DISPLAY, lineHeight: 1.2,
                        letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {route.route_name}
                      </div>
                      <div style={{
                        fontSize: 13, fontWeight: 800, color: C.muted,
                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      }}>
                        {route.stop_count} stop{route.stop_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    {meta.length > 0 && (
                      <div style={{
                        marginTop: 2, fontSize: 12.5, color: C.muted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {meta.join(' · ')}
                      </div>
                    )}
                    {featured && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          background: C.green, color: '#fff',
                          padding: '4px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 800,
                          whiteSpace: 'nowrap',
                        }}>
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                               stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="6" width="20" height="12" rx="2"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                          {cod === 1 ? '1 COD stop' : `${cod} COD stops`}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Phase-2 slot: Ava chip — hidden until backend ships */}
        {HAS_AVA && (
          <div style={{ padding: '18px 18px 0', display: 'flex', justifyContent: 'flex-end' }}>
            {/* AvaChip goes here */}
          </div>
        )}
      </div>
    </div>
  )
}
