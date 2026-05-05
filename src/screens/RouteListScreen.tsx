'use client'

import { useRouter } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import { Stop, PaymentState } from '@/types'
import BottomNav from '@/components/BottomNav'

interface RouteListScreenProps {
  routeId: string
}

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatHeroDate(dateStr: string): string {
  return parseLocal(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
  })
}

function formatSentAt(isoStr: string): string {
  const d = new Date(isoStr)
  let h = d.getHours()
  const mins = d.getMinutes()
  const ampm = h >= 12 ? 'p' : 'a'
  h = h % 12 || 12
  return `${h}:${String(mins).padStart(2, '0')}${ampm}`
}

function paymentLabel(state: PaymentState | undefined): string | null {
  if (state === 'cod')         return 'COD'
  if (state === 'balance_due') return 'BAL DUE'
  return null
}

// ─── Inline icons (matches home + login pattern) ──────────────────────────────
function BackIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}

function CheckIcon({ size = 14, color = C.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6"/>
    </svg>
  )
}

function CashIcon({ size = 12, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// ─── Brand mark — small white rounded square with PTR logo ───────────────────
function BrandMark() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 9,
      background: C.paper,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <img
        src="/ptr-mark.png"
        alt="PartyTime Rentals"
        style={{ width: '74%', height: '74%', objectFit: 'contain' }}
      />
    </div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RouteListScreen({ routeId }: RouteListScreenProps) {
  const router = useRouter()
  const { getRoute, getStopsForRoute, getRoutesForDate } = useAppState()

  const route = getRoute(routeId)
  const stops = route ? getStopsForRoute(routeId) : []
  const completedCount = stops.filter((s) => s.current_status === 'completed').length

  // ── Route not found ────────────────────────────────────────────────────────
  if (!route) {
    return (
      <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
        <div style={{
          padding: '48px 22px', flex: 1,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 18,
            padding: 22,
            boxShadow: `5px 5px 0 ${C.coral}`,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: C.coral,
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              Route not found
            </div>
            <div style={{
              marginTop: 6, fontSize: 18, fontWeight: 900, color: C.ink,
              fontFamily: FONT_DISPLAY, lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              We couldn&apos;t find this route.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              Go back and select a valid route from today&apos;s list.
            </div>
            <button
              onClick={() => router.push('/')}
              style={{
                marginTop: 14,
                background: C.ink, color: '#fff',
                padding: '10px 18px', borderRadius: 999,
                border: 0, cursor: 'pointer',
                fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                letterSpacing: '0.02em',
              }}
            >
              Back to routes
            </button>
          </div>
        </div>

        <BottomNav/>
      </div>
    )
  }

  // Route index in the day's routes (1-based, pure derivation — no new data)
  const dayRoutes  = getRoutesForDate(route.operating_date)
  const idx        = dayRoutes.findIndex((r) => r.route_id === routeId)
  const routeIndex = idx >= 0 ? idx + 1 : null
  const totalRoutes = dayRoutes.length

  const trucksLabel = [route.truck_name, route.truck_2_name].filter(Boolean).join(' · ')
  const subheadParts: string[] = [formatHeroDate(route.operating_date)]
  if (trucksLabel) subheadParts.push(trucksLabel)

  const stopWord = stops.length === 1 ? 'stop' : 'stops'
  const showDots = stops.length > 0 && stops.length <= 8

  function handleStopTap(stop: Stop) {
    router.push(`/route/${routeId}/stop/${stop.stop_id}`)
  }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '46px 22px 22px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Decorative tilted gold star — smaller / dimmer than home */}
        <svg
          aria-hidden="true"
          width={160} height={160} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -14, top: -8,
            opacity: 0.20,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        {/* Top row: back button + PTR mark */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <button
            onClick={() => router.push('/')}
            aria-label="Back to routes"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: 'rgba(255,255,255,0.16)',
              border: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BackIcon/>
          </button>
          <BrandMark/>
        </div>

        {/* Eyebrow */}
        <div style={{
          marginTop: 18,
          fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
          color: C.gold, textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
          position: 'relative',
        }}>
          {routeIndex !== null && totalRoutes > 0
            ? `Route ${routeIndex} of ${totalRoutes} · ${stops.length} ${stopWord}`
            : `${stops.length} ${stopWord}`}
        </div>

        {/* Headline */}
        <div style={{
          marginTop: 6,
          fontFamily: FONT_DISPLAY,
          fontSize: 32, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff',
          position: 'relative',
        }}>
          {route.route_name}
        </div>

        {/* Subhead */}
        <div style={{
          marginTop: 8,
          fontSize: 13, color: 'rgba(255,255,255,0.80)',
          lineHeight: 1.4, position: 'relative',
        }}>
          {subheadParts.join(' · ')}
        </div>

        {/* Mini progress: dots when ≤8 stops, plus tracked label */}
        {stops.length > 0 && (
          <div style={{
            marginTop: 14,
            display: 'flex', alignItems: 'center', gap: 10,
            position: 'relative',
          }}>
            {showDots && (
              <div style={{ display: 'flex', gap: 5 }} aria-hidden="true">
                {stops.map((s) => {
                  const done = s.current_status === 'completed'
                  return (
                    <span
                      key={s.stop_id}
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: done ? C.gold : 'transparent',
                        border: done ? 'none' : '1.5px solid rgba(255,255,255,0.45)',
                        flexShrink: 0,
                      }}
                    />
                  )
                })}
              </div>
            )}
            <div style={{
              fontSize: 11, fontWeight: 700,
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {completedCount} of {stops.length} complete
            </div>
          </div>
        )}
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {stops.length === 0 ? (
          <div style={{
            padding: '32px 28px',
            textAlign: 'center', color: C.muted, fontSize: 14, lineHeight: 1.5,
          }}>
            No stops scheduled for this route.
          </div>
        ) : (
          <div style={{ padding: '14px 18px 0', position: 'relative' }}>
            {/* Vertical line connector */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 32, top: 14, bottom: 24,
                width: 2,
                background: 'rgba(10,11,20,0.10)',
              }}
            />

            {stops.map((stop) => {
              const isCompleted = stop.current_status === 'completed'
              const isOtw       = stop.current_status === 'on_the_way_sent'
              const payLabel    = paymentLabel(stop.payment_state)
              const sentAt      = stop.on_the_way_sent_at ? formatSentAt(stop.on_the_way_sent_at) : null
              const addressLine = [stop.address_line_1, stop.city].filter(Boolean).join(', ')
              const hasChips    = isOtw || isCompleted || !!payLabel

              return (
                <button
                  key={stop.stop_id}
                  onClick={() => handleStopTap(stop)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: 'transparent', border: 0, cursor: 'pointer',
                    padding: '12px 0', display: 'flex', gap: 16,
                    alignItems: 'flex-start', fontFamily: 'inherit',
                  }}
                >
                  {/* Numbered circle (with optional gold-dot OTW indicator) */}
                  <div style={{
                    position: 'relative',
                    flexShrink: 0,
                    width: 28, height: 28,
                    zIndex: 1,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isCompleted ? C.ink : '#fff',
                      border: `2px solid ${C.ink}`,
                      color: isCompleted ? C.gold : C.ink,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 900,
                      fontFamily: FONT_DISPLAY,
                    }}>
                      {isCompleted
                        ? <CheckIcon size={14} color={C.gold}/>
                        : stop.stop_sequence}
                    </div>
                    {isOtw && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: -2, right: -2,
                          width: 9, height: 9, borderRadius: '50%',
                          background: C.gold,
                          border: `1.5px solid ${C.ink}`,
                        }}
                      />
                    )}
                  </div>

                  {/* Right side */}
                  <div style={{
                    flex: 1, minWidth: 0,
                    padding: '0 0 6px',
                  }}>
                    {stop.company_name && (
                      <div style={{
                        fontSize: 10.5, fontWeight: 800,
                        letterSpacing: '0.16em',
                        color: C.muted, textTransform: 'uppercase',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {stop.company_name}
                      </div>
                    )}

                    <div style={{
                      marginTop: stop.company_name ? 2 : 0,
                      fontSize: 16, fontWeight: 800,
                      color: isCompleted ? C.muted : C.ink,
                      fontFamily: FONT_DISPLAY, lineHeight: 1.2,
                      letterSpacing: '-0.01em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {stop.customer_name}
                    </div>

                    {stop.client_company && (
                      <div style={{
                        marginTop: 2, fontSize: 12.5, color: C.muted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {stop.client_company}
                      </div>
                    )}

                    {addressLine && (
                      <div style={{
                        marginTop: 2, fontSize: 12.5, color: C.muted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {addressLine}
                      </div>
                    )}

                    {stop.items_text && (
                      <div style={{
                        marginTop: 2, fontSize: 11.5,
                        color: 'rgba(107,116,136,0.75)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {stop.items_text}
                      </div>
                    )}

                    {/* Chips row: status + payment */}
                    {hasChips && (
                      <div style={{
                        marginTop: 8,
                        display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
                      }}>
                        {isOtw && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: C.ink, color: C.gold,
                            padding: '4px 10px', borderRadius: 999,
                            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: '50%', background: C.gold,
                            }}/>
                            ETA Sent{sentAt ? ` · ${sentAt}` : ''}
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: C.ink, color: '#fff',
                            padding: '4px 10px', borderRadius: 999,
                            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            <CheckIcon size={11} color={C.gold}/>
                            Delivered
                          </span>
                        )}
                        {payLabel && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: C.gold, color: C.ink,
                            padding: '4px 10px', borderRadius: 999,
                            fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                          }}>
                            <CashIcon size={12} color={C.ink}/>
                            {payLabel}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav/>
    </div>
  )
}
