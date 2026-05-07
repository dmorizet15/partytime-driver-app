'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter }                    from 'next/navigation'
import { useAppState }                  from '@/context/AppStateContext'
import { useAuth }                      from '@/hooks/useAuth'
import type { Stop }                    from '@/types'
import BottomNav                        from '@/components/BottomNav'

// ─── Direction 03 (Editorial) tokens ──────────────────────────────────────────
const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFEFC2',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  coral:    '#FF5A3C',
  green:    '#1FBF6B',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Phase-2 reservation flags ────────────────────────────────────────────────
// Slots stay in JSX so flipping these to `true` is a one-line change once the
// backend is ready. While `false`, each slot renders a designed stub whose tap
// fires a "Coming soon" toast — no fake data shipped.
const HAS_TRUCK      = false
const HAS_INSPECTION = false
const HAS_AVA        = false
// HAS_WEATHER reserved for the wind/weather pill on stop cards. Render gated
// inline at the pill site rather than as a top-level flag here.

// ─── COD detection ────────────────────────────────────────────────────────────
// Only literal 'cod' triggers cash-collection UI. AR customers (state
// 'balance_due') are billed by the org separately — driver collects nothing
// at the door. 'balance_due' is deliberately excluded from this set; if it
// becomes a COD-collection trigger again, surface BAL DUE pills + amount via
// the same PAYMENT_PILL config rather than reusing the COD treatment.
const COD_PAYMENT_STATES = new Set<string>(['cod'])

// Payment pill colors keyed by payment_state. Drives a single small pill on
// each stop card. `null` = no pill (e.g. ar_customer or unset state).
const PAYMENT_PILL: Record<'cod' | 'balance_due' | 'paid_in_full', { bg: string; color: string; label: string }> = {
  cod:          { bg: C.gold,  color: C.ink,   label: 'COD' },
  balance_due:  { bg: C.off,   color: C.muted, label: 'BAL DUE' },
  paid_in_full: { bg: C.green, color: '#fff',  label: 'PAID' },
}

// ─── Stop type pill colors ────────────────────────────────────────────────────
const TYPE_PILL: Record<'delivery' | 'pickup' | 'service', { bg: string; color: string }> = {
  delivery: { bg: C.blue, color: '#fff' },
  pickup:   { bg: C.gold, color: C.ink },
  service:  { bg: C.ink,  color: '#fff' },
}

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

function formatLiveEyebrow(d: Date): string {
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${wd} · ${hh}:${mm}`
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

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})
function formatUSD(amount: number): string {
  return USD_FORMATTER.format(amount)
}

function daySubcopy(count: number): { opener: string; count: string; suffix: string } {
  if (count === 1) return { opener: 'Easy day.',   count: '1 stop',         suffix: ' scheduled.' }
  if (count <= 3)  return { opener: 'Steady day.', count: `${count} stops`, suffix: ' scheduled.' }
  return             { opener: 'Big day.',         count: `${count} stops`, suffix: ' scheduled.' }
}

// Returns a "3 deliveries · 1 pickup" style breakdown when the day mixes
// stop types. Returns null when all stops share a single type — keeps the
// sub-copy short for homogeneous days.
type StopTypeKey = 'delivery' | 'pickup' | 'service'
function typeBreakdown(stops: Array<{ stop_type: StopTypeKey }>): string | null {
  const counts: Record<StopTypeKey, number> = { delivery: 0, pickup: 0, service: 0 }
  for (const s of stops) counts[s.stop_type]++
  const present = (Object.entries(counts) as Array<[StopTypeKey, number]>).filter(([, n]) => n > 0)
  if (present.length <= 1) return null
  const labels: Record<StopTypeKey, [string, string]> = {
    delivery: ['delivery', 'deliveries'],
    pickup:   ['pickup',   'pickups'],
    service:  ['service',  'services'],
  }
  return present.map(([type, n]) => `${n} ${labels[type][n === 1 ? 0 : 1]}`).join(' · ')
}

// ─── Inline icons ─────────────────────────────────────────────────────────────
type IconProps = { size?: number; color?: string }

function TruckIcon({ size = 16, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h11v9H3z"/>
      <path d="M14 10h4l3 3v3h-7z"/>
      <circle cx="7.5" cy="17.5" r="1.8"/>
      <circle cx="17" cy="17.5" r="1.8"/>
    </svg>
  )
}

function DocIcon({ size = 16, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8"  y1="13" x2="16" y2="13"/>
      <line x1="8"  y1="17" x2="13" y2="17"/>
    </svg>
  )
}

function CashIcon({ size = 14, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function ArrowIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}

function ChevronRightIcon({ size = 16, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 15 12 9 18"/>
    </svg>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function DayRouteSelectorScreen() {
  const router = useRouter()
  const { profile } = useAuth()
  const { getRoutesForDate, getStopsForRoute, isLoading, error, loadDay, clearCache } = useAppState()

  const [selectedDate, setSelectedDate] = useState<string>(todayStr())
  const [now, setNow]                   = useState<Date>(() => new Date())
  const [toast, setToast]               = useState<string | null>(null)

  // Driver auto-load: check on mount whether dispatch has assigned this driver
  // a route for today. Result drives the body skeleton + banner below.
  type AssignmentState = 'checking' | 'navigating' | 'no-assignment' | 'error'
  const [assignmentState, setAssignmentState] = useState<AssignmentState>('checking')

  // Live eyebrow tick — refresh every 60s so the displayed time stays accurate
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Toast auto-dismiss after 3s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Auto-load assigned route — runs once on mount. If dispatch has assigned
  // this driver a route for today, navigate directly (router.replace so the
  // back button doesn't return to the selector). On 'no-assignment' or any
  // failure, fall through to manual selection silently.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/assigned-route')
        const j = await r.json().catch(() => null)
        if (cancelled) return
        if (j?.assigned && typeof j.route_id === 'string') {
          setAssignmentState('navigating')
          router.replace(`/route/${j.route_id}`)
          return
        }
        // Flush any cached route/stop data from a previous session so the
        // banner-only view can't render stale stops underneath it.
        clearCache()
        setAssignmentState('no-assignment')
      } catch (err) {
        console.error('[DayRouteSelector] assigned-route check failed:', err)
        if (!cancelled) setAssignmentState('error')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load routes whenever the selected date changes
  useEffect(() => {
    loadDay(selectedDate)
  }, [selectedDate, loadDay])

  const isToday = selectedDate === todayStr()
  const routes  = getRoutesForDate(selectedDate)

  // Aggregate stops across today's routes — the day list renders stops, not
  // routes. Composes existing context methods only; no hook/context edits.
  const dayStops = useMemo(
    () => routes.flatMap((r) => getStopsForRoute(r.route_id)),
    [routes, getStopsForRoute]
  )

  const totalStopCount = dayStops.length
  // COD cards are scoped to delivery stops — pickup stops with a balance_due
  // payment state aren't a "collect cash on arrival" scenario from the driver's
  // POV (the customer pays at the lot when picking up, not in the field).
  const codStops = useMemo(
    () => dayStops.filter((s) =>
      s.stop_type === 'delivery' && COD_PAYMENT_STATES.has(s.payment_state ?? '')
    ),
    [dayStops]
  )

  const firstName   = firstNameOf(profile?.display_name)
  const hasGreeting = !!firstName
  const isEmpty     = !isLoading && !error && totalStopCount === 0
  // While the assignment check is in flight (or while we're navigating away),
  // suppress every existing body branch so the manual UI doesn't flash. When
  // the check resolves to 'no-assignment' the banner stands alone — no
  // loading/error/empty/populated branches render below it. Only 'error'
  // (silent fallthrough on auth/network failure) keeps the manual selection.
  const showBody    = assignmentState !== 'checking'
                   && assignmentState !== 'navigating'
                   && assignmentState !== 'no-assignment'
  const sub         = daySubcopy(totalStopCount)
  const breakdown   = useMemo(() => typeBreakdown(dayStops), [dayStops])

  function showToast(msg: string) { setToast(msg) }

  function handleStopTap(stop: Stop) {
    router.push(`/route/${stop.route_id}/stop/${stop.stop_id}`)
  }

  function handleStartRoute() {
    if (routes.length === 0) return
    if (HAS_INSPECTION) {
      // TODO Phase 2: navigate to pre-trip inspection screen first
      showToast('Coming soon — this feature is in development.')
      return
    }
    router.push(`/route/${routes[0].route_id}`)
  }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '32px 22px 24px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* asymmetric gold star */}
        <svg
          aria-hidden="true"
          width={200} height={200} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16,
            opacity: 0.22,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        {/* Eyebrow row: live date/time + PTR mark */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatLiveEyebrow(now)}
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: C.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ptr-mark.png"
              alt="PartyTime Rentals"
              style={{ width: '74%', height: '74%', objectFit: 'contain' }}
            />
          </div>
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

        {/* Sub-copy */}
        <div style={{
          marginTop: 14, position: 'relative',
          fontSize: 15, color: 'rgba(255,255,255,0.85)',
          lineHeight: 1.4,
        }}>
          {isLoading ? (
            'Loading today…'
          ) : error ? (
            'Could not load routes.'
          ) : totalStopCount === 0 ? (
            'No stops scheduled today.'
          ) : (
            <>
              {sub.opener}{' '}
              <strong style={{ color: '#fff', fontWeight: 800 }}>{sub.count}</strong>
              {sub.suffix}
              {breakdown && <> {breakdown}.</>}
            </>
          )}
        </div>

        {/* Truck pill — designed stub (HAS_TRUCK=false). Hidden on empty state. */}
        {!isEmpty && (
          <button
            onClick={() => showToast('Coming soon — this feature is in development.')}
            style={{
              marginTop: 18, position: 'relative',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.16)',
              padding: '6px 14px 6px 6px',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: '#fff',
            }}
          >
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TruckIcon size={14} color={C.ink}/>
            </span>
            <span style={{
              fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.005em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              Your truck: — · —
            </span>
          </button>
        )}
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Assigned-route check spinner — suppresses the body until the
            on-mount /api/assigned-route check resolves, so the manual UI
            doesn't flash before a silent navigation happens. */}
        {!showBody && (
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
            <span style={{ fontSize: 13, color: C.muted }}>Checking your route…</span>
            <style>{`@keyframes ptw-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* No-assignment informational banner — only when the API returned
            assigned: false and the driver is viewing today's date. Muted
            text on cream, no gold/alarm treatment. */}
        {assignmentState === 'no-assignment' && isToday && (
          <div style={{ padding: '14px 22px 0' }}>
            <div style={{
              fontSize: 13, color: C.muted, lineHeight: 1.4, fontFamily: FONT_BODY,
            }}>
              No route assigned for today. Contact dispatch.
            </div>
          </div>
        )}

        {/* Loading state */}
        {showBody && isLoading && (
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
        )}

        {/* Error state */}
        {showBody && !isLoading && error && (
          <div style={{ padding: '14px 18px 0' }}>
            <div style={{
              background: C.paper,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 18,
              padding: 18,
              boxShadow: `5px 5px 0 ${C.coral}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.coral,
                letterSpacing: '0.18em', textTransform: 'uppercase',
              }}>
                Couldn&apos;t load
              </div>
              <div style={{
                marginTop: 6, fontSize: 18, fontWeight: 900, color: C.ink,
                fontFamily: FONT_DISPLAY, lineHeight: 1.15, letterSpacing: '-0.02em',
              }}>
                We couldn&apos;t reach the server.
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
        )}

        {/* Empty state — single quiet card. Hides truck pill, pre-trip, list, CTA. */}
        {showBody && isEmpty && (
          <div style={{ padding: '32px 22px 0' }}>
            <div style={{
              background: C.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 18,
              padding: '26px 22px',
              textAlign: 'center',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, color: C.muted,
                letterSpacing: '0.22em', textTransform: 'uppercase',
              }}>
                {isToday ? 'Today' : 'No work'}
              </div>
              <div style={{
                marginTop: 8, fontSize: 22, fontWeight: 900, color: C.ink,
                fontFamily: FONT_DISPLAY, lineHeight: 1.1, letterSpacing: '-0.02em',
              }}>
                You&apos;re clear today.
              </div>
              <div style={{
                marginTop: 6, fontSize: 14, color: C.muted, lineHeight: 1.4,
              }}>
                Enjoy the day off.
              </div>
            </div>
          </div>
        )}

        {/* Populated body — pre-trip + COD cards + day list + Ava + CTA */}
        {showBody && !isLoading && !error && totalStopCount > 0 && (
          <>
            {/* Pre-trip inspection card — designed stub */}
            <div style={{ padding: '14px 18px 0' }}>
              <button
                onClick={() => showToast('Coming soon — this feature is in development.')}
                style={{
                  width: '100%',
                  background: C.ink,
                  border: 0, cursor: 'pointer',
                  borderRadius: 18,
                  padding: '14px 16px',
                  display: 'flex', alignItems: 'center', gap: 14,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: C.gold,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <DocIcon size={20} color={C.ink}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                    color: C.gold, textTransform: 'uppercase',
                  }}>
                    Required First
                  </div>
                  <div style={{
                    marginTop: 2, fontSize: 15, fontWeight: 800, color: '#fff',
                    fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                  }}>
                    Pre-trip inspection
                  </div>
                </div>
                <ChevronRightIcon size={18} color="rgba(255,255,255,0.55)"/>
              </button>
            </div>

            {/* COD card — single stop: tappable card linking to that stop.
                Multi-stop: consolidated rollup with count + names list (no nav
                target since there are multiple — driver taps individual stops
                in the day list below). */}
            {codStops.length === 1 && (() => {
              const stop = codStops[0]
              const headline    = (stop.company_name?.trim() || stop.customer_name).trim()
              const contactName = stop.customer_name
              const showSubName = !!contactName && contactName !== headline
              const amt = stop.balance_due_amount
              const amountText  = (typeof amt === 'number' && amt > 0) ? `${formatUSD(amt)} ` : ''
              return (
                <div key={`cod-${stop.stop_id}`} style={{ padding: '12px 18px 0' }}>
                  <button
                    onClick={() => handleStopTap(stop)}
                    style={{
                      width: '100%',
                      background: C.goldSoft,
                      border: `1.5px solid ${C.gold}`,
                      borderRadius: 18,
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 14,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      boxShadow: '0 14px 28px -16px rgba(176,127,0,0.45)',
                    }}
                  >
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: C.gold,
                      border: `2px solid ${C.ink}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <CashIcon size={18} color={C.ink}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                        color: C.goldDeep, textTransform: 'uppercase',
                      }}>
                        Cash Required
                      </div>
                      <div style={{
                        marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
                        fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {headline}
                      </div>
                      {showSubName ? (
                        <div style={{
                          marginTop: 2, fontSize: 12.5, color: C.goldDeep, lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          Collect {amountText}on arrival from {contactName}
                        </div>
                      ) : (
                        <div style={{
                          marginTop: 2, fontSize: 12.5, color: C.goldDeep, lineHeight: 1.3,
                        }}>
                          Collect {amountText}on arrival
                        </div>
                      )}
                    </div>
                  </button>
                </div>
              )
            })()}

            {codStops.length > 1 && (() => {
              // Total only shown when EVERY COD stop has a numeric, positive
              // amount. If any are null/zero, fall back to the count-only
              // headline — never show a misleading partial total.
              const allHaveAmounts = codStops.every(
                (s) => typeof s.balance_due_amount === 'number' && s.balance_due_amount > 0
              )
              const totalAmount = allHaveAmounts
                ? codStops.reduce((sum, s) => sum + (s.balance_due_amount ?? 0), 0)
                : null
              return (
                <div key="cod-rollup" style={{ padding: '12px 18px 0' }}>
                  <div style={{
                    width: '100%',
                    background: C.goldSoft,
                    border: `1.5px solid ${C.gold}`,
                    borderRadius: 18,
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    boxShadow: '0 14px 28px -16px rgba(176,127,0,0.45)',
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: C.gold,
                      border: `2px solid ${C.ink}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}>
                      <CashIcon size={18} color={C.ink}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                        color: C.goldDeep, textTransform: 'uppercase',
                      }}>
                        {totalAmount !== null
                          ? `Cash Required · ${codStops.length} Stops`
                          : 'Cash Required'}
                      </div>
                      <div style={{
                        marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
                        fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                        lineHeight: 1.25,
                      }}>
                        {totalAmount !== null
                          ? `Collect ${formatUSD(totalAmount)} total`
                          : `${codStops.length} delivery stops require cash collection`}
                      </div>
                      <div style={{
                        marginTop: 4, fontSize: 12.5, color: C.goldDeep, lineHeight: 1.4,
                      }}>
                        {codStops.map((s) => (s.company_name?.trim() || s.customer_name).trim()).join(', ')}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Date nav strip — small ghost buttons + center label */}
            <div style={{
              padding: '20px 22px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10,
            }}>
              <button
                onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
                aria-label="Previous day"
                disabled={isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid rgba(10,11,20,0.14)',
                  color: C.muted,
                  fontSize: 16, fontWeight: 800,
                  cursor: isLoading ? 'default' : 'pointer',
                  opacity: isLoading ? 0.4 : 1,
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ‹
              </button>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.muted,
                letterSpacing: '0.02em',
                fontVariantNumeric: 'tabular-nums',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {isToday && (
                  <span style={{
                    padding: '2px 6px', borderRadius: 4,
                    background: C.ink, color: '#fff',
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                  }}>
                    Today
                  </span>
                )}
                <span>{formatNavDate(selectedDate)}</span>
              </div>
              <button
                onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
                aria-label="Next day"
                disabled={isLoading}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'transparent',
                  border: '1px solid rgba(10,11,20,0.14)',
                  color: C.muted,
                  fontSize: 16, fontWeight: 800,
                  cursor: isLoading ? 'default' : 'pointer',
                  opacity: isLoading ? 0.4 : 1,
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ›
              </button>
            </div>

            {/* Day list eyebrow */}
            <div style={{
              padding: '20px 22px 8px',
              fontFamily: FONT_DISPLAY,
              fontSize: 13, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: C.muted,
            }}>
              The day, in {totalStopCount}
            </div>

            {/* Day stop list — vertical line + numbered circles */}
            <div style={{ padding: '0 18px', position: 'relative' }}>
              {/* connector line — sits behind circles (z-index 0). Center
                  alignment: container padding-left=18, circle width=32 → center
                  at parent-x = 18 + 16 = 34. */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 33, top: 16, bottom: 16,
                  width: 2,
                  background: 'rgba(10,11,20,0.10)',
                  zIndex: 0,
                }}
              />
              {dayStops.map((stop, i) => {
                const num          = i + 1
                // The Supabase sync writes payment_state to BOTH legs of a COD
                // order — delivery and pickup. From the driver's POV only the
                // delivery leg involves cash collection; the pickup is just
                // equipment retrieval. Gate `isCod` on stop_type to avoid
                // showing COD treatment on the pickup row.
                const isCod        = stop.stop_type === 'delivery' && COD_PAYMENT_STATES.has(stop.payment_state ?? '')
                const isBalanceDue = stop.payment_state === 'balance_due'
                const isPaidInFull = stop.payment_state === 'paid_in_full'
                const paymentPill  = isCod        ? PAYMENT_PILL.cod
                                   : isBalanceDue ? PAYMENT_PILL.balance_due
                                   : isPaidInFull ? PAYMENT_PILL.paid_in_full
                                   : null
                const headline     = (stop.company_name?.trim() || stop.customer_name).trim()
                const addressOnly  = stop.address_line_1?.trim() ?? ''
                const distanceTxt  = '— mi'
                const typePill     = TYPE_PILL[stop.stop_type]

                return (
                  <button
                    key={stop.stop_id}
                    onClick={() => handleStopTap(stop)}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: 'transparent', border: 0, cursor: 'pointer',
                      padding: '8px 0', display: 'flex', gap: 16,
                      alignItems: 'flex-start', fontFamily: 'inherit',
                      position: 'relative', zIndex: 1,
                    }}
                  >
                    {/* Numbered circle (32px) — gold for COD, white-ink for standard */}
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      flexShrink: 0,
                      background: isCod ? C.gold : C.paper,
                      border: `2px solid ${C.ink}`, color: C.ink,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900,
                      fontFamily: FONT_DISPLAY,
                      letterSpacing: '-0.02em',
                    }}>
                      {num}
                    </div>

                    {isCod ? (
                      // Elevated card for COD stops
                      <div style={{
                        flex: 1, minWidth: 0,
                        background: C.paper,
                        border: `1.5px solid ${C.ink}`,
                        borderRadius: 16,
                        padding: '12px 14px',
                        boxShadow: `4px 4px 0 ${C.ink}`,
                      }}>
                        <div style={{
                          fontSize: 16, fontWeight: 800, color: C.ink,
                          fontFamily: FONT_DISPLAY, lineHeight: 1.2,
                          letterSpacing: '-0.01em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {headline}
                        </div>
                        <div style={{
                          marginTop: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        }}>
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: 12.5, color: C.muted,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {addressOnly}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                          }}>
                            {paymentPill && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                background: paymentPill.bg, color: paymentPill.color,
                                fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
                                textTransform: 'uppercase',
                                padding: '2px 7px', borderRadius: 999,
                              }}>
                                {paymentPill.label}
                              </span>
                            )}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              background: typePill.bg, color: typePill.color,
                              fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              padding: '2px 7px', borderRadius: 999,
                            }}>
                              {stop.stop_type}
                            </span>
                            <span style={{
                              fontSize: 12.5, color: C.muted,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {distanceTxt}
                            </span>
                          </span>
                        </div>
                      </div>
                    ) : (
                      // Inline row for standard stops
                      <div style={{
                        flex: 1, minWidth: 0,
                        padding: '4px 0 6px',
                      }}>
                        <div style={{
                          fontSize: 16, fontWeight: 800, color: C.ink,
                          fontFamily: FONT_DISPLAY, lineHeight: 1.2,
                          letterSpacing: '-0.01em',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {headline}
                        </div>
                        <div style={{
                          marginTop: 2,
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        }}>
                          <span style={{
                            flex: 1, minWidth: 0,
                            fontSize: 12.5, color: C.muted,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {addressOnly}
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0,
                          }}>
                            {paymentPill && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center',
                                background: paymentPill.bg, color: paymentPill.color,
                                fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
                                textTransform: 'uppercase',
                                padding: '2px 7px', borderRadius: 999,
                              }}>
                                {paymentPill.label}
                              </span>
                            )}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              background: typePill.bg, color: typePill.color,
                              fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              padding: '2px 7px', borderRadius: 999,
                            }}>
                              {stop.stop_type}
                            </span>
                            <span style={{
                              fontSize: 12.5, color: C.muted,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {distanceTxt}
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Ask Ava chip — designed stub, right-aligned */}
            <div style={{
              padding: '18px 18px 0',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => showToast('Coming soon — this feature is in development.')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  background: C.paper,
                  border: `1.5px solid rgba(10,11,20,0.10)`,
                  padding: '6px 14px 6px 6px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: C.ink,
                  boxShadow: '0 6px 16px -8px rgba(10,11,20,0.18)',
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: C.coral,
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 14, fontWeight: 900,
                  fontFamily: FONT_DISPLAY,
                  lineHeight: 1,
                }}>
                  +
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em',
                }}>
                  Ask Ava about today
                </span>
              </button>
            </div>

            {/* Inspect & Start Route gold CTA */}
            <div style={{ padding: '18px 18px 0' }}>
              <button
                onClick={handleStartRoute}
                disabled={routes.length === 0}
                style={{
                  width: '100%', height: 60, borderRadius: 999,
                  background: C.gold, color: C.ink,
                  border: 0,
                  cursor: routes.length === 0 ? 'default' : 'pointer',
                  opacity: routes.length === 0 ? 0.5 : 1,
                  fontSize: 16, fontWeight: 900, fontFamily: FONT_DISPLAY,
                  letterSpacing: '-0.01em',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 8px 0 22px',
                  boxShadow: '0 14px 30px -10px rgba(255,184,0,0.55)',
                }}
              >
                <span>Inspect &amp; Start Route</span>
                <span style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: C.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <ArrowIcon size={18} color="#fff"/>
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      <BottomNav/>

      {/* Toast — fixed bottom, ephemeral. Single state slot, auto-dismiss 3s.
          Bottom offset clears the 80px BottomNav + iOS safe-area inset. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(108px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)',
            background: C.ink, color: '#fff',
            padding: '12px 18px', borderRadius: 999,
            fontSize: 13, fontWeight: 700,
            borderLeft: `4px solid ${C.gold}`,
            boxShadow: '0 12px 30px -10px rgba(0,0,0,0.45)',
            zIndex: 100,
            maxWidth: '80vw',
            fontFamily: 'inherit',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
