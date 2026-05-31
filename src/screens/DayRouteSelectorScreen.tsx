'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter }                    from 'next/navigation'
import { useAppState }                  from '@/context/AppStateContext'
import { useAuth }                      from '@/hooks/useAuth'
import { useInspectionStatus }          from '@/hooks/useInspectionStatus'
import type { Stop }                    from '@/types'
import BottomNav                        from '@/components/BottomNav'
import PostTripDefectCard               from '@/components/PostTripDefectCard'
import StopWindowBadge                  from '@/components/StopWindowBadge'
import FleetAlertCard                   from '@/components/fleet/FleetAlertCard'
import AvaChip                          from '@/components/AvaChip'
import WeatherFlagCard                  from '@/components/WeatherFlagCard'
import AvaMorningCard                   from '@/components/ava/AvaMorningCard'
import { useRouteWeather }               from '@/hooks/ava/useRouteWeather'
import AskAvaButton                      from '@/components/ava/AskAvaButton'

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
const HAS_AVA = false
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
const TYPE_PILL: Record<StopTypeKey, { bg: string; color: string }> = {
  delivery:         { bg: C.blue, color: '#fff' },
  pickup:           { bg: C.gold, color: C.ink },
  service:          { bg: C.ink,  color: '#fff' },
  // Neutral gray — both depot stop types (legacy 'warehouse' synthetic
  // reload + 'warehouse_return' auto-injected end-of-route) share the
  // same neutral treatment so the driver reads them as "depot, not customer."
  warehouse:        { bg: C.off,  color: C.muted },
  warehouse_return: { bg: C.off,  color: C.muted },
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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
// sub-copy short for homogeneous days. Warehouse depot returns are excluded
// so the breakdown stays a customer-facing summary.
type StopTypeKey = 'delivery' | 'pickup' | 'service' | 'warehouse' | 'warehouse_return'
type CustomerStopKey = Exclude<StopTypeKey, 'warehouse' | 'warehouse_return'>
function typeBreakdown(stops: Array<{ stop_type: StopTypeKey }>): string | null {
  const counts: Record<CustomerStopKey, number> = { delivery: 0, pickup: 0, service: 0 }
  for (const s of stops) {
    // Both depot stop types are excluded from the customer-facing breakdown:
    // legacy 'warehouse' synthetic reload AND the new 'warehouse_return'
    // auto-injected end-of-route depot (dashboard Migration 070/071).
    if (s.stop_type === 'warehouse' || s.stop_type === 'warehouse_return') continue
    counts[s.stop_type]++
  }
  const present = (Object.entries(counts) as Array<[CustomerStopKey, number]>).filter(([, n]) => n > 0)
  if (present.length <= 1) return null
  const labels: Record<CustomerStopKey, [string, string]> = {
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
  const { getRoutesForDate, getStopsForRoute, isLoading, error, loadDay } = useAppState()

  const today = todayStr()
  const [now, setNow]         = useState<Date>(() => new Date())

  // Live eyebrow tick — refresh every 60s so the displayed time stays accurate
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Force-refresh today's routes on every Home mount. AppState's loadDay
  // short-circuits when (state.loadedDate === date && !state.error), so a
  // soft loadDay(today) call after a dashboard-side route delete+recreate
  // would keep the stale Route A in memory — `primaryRouteId` would point
  // at the deleted route, `useInspectionStatus` would query its old
  // inspection, and the quiet-state gate would hide the briefing on a
  // freshly-uninspected route. Force=true skips the cache check. The ref
  // gate ensures we only fetch once per mount even though `loadDay`'s
  // identity changes after a successful fetch (useCallback dep on
  // state.loadedDate), which would otherwise re-fire the effect.
  const initialLoadRef = useRef(false)
  useEffect(() => {
    if (initialLoadRef.current) return
    initialLoadRef.current = true
    loadDay(today, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const routes = getRoutesForDate(today)

  // Pre-trip inspection status — drives the gate (stops non-tappable, pre-trip
  // card stays in "REQUIRED FIRST", gold CTA reads "Inspect & Start Route"
  // until this resolves to a populated row). Per route assignment, so a
  // mid-day reassignment cleanly resets the gate.
  const primaryRouteId = routes[0]?.route_id
  const primaryTruckId = routes[0]?.truck_id
  const inspection = useInspectionStatus(primaryRouteId, primaryTruckId)

  // Aggregate stops across today's routes — the day list renders stops, not
  // routes. Composes existing context methods only; no hook/context edits.
  const dayStops = useMemo(
    () => routes.flatMap((r) => getStopsForRoute(r.route_id)),
    [routes, getStopsForRoute]
  )

  // AVA Phase 2 weather enrichment — forecast wind at each stop's arrival.
  // Drives the morning brief's wind-aware copy (hasWeatherFlag) + per-stop
  // wind pills below. Fails open (empty/no-flag) so Home never breaks.
  const routeWeather = useRouteWeather(dayStops)

  const totalStopCount = dayStops.length
  // Customer-facing stop count — excludes the warehouse / warehouse_return
  // depot legs. Drives the driver-visible totals (hero "N stops scheduled" +
  // the "The day, in N" section header) so they match the type breakdown,
  // which already excludes depot. totalStopCount stays the full count for the
  // route-complete gate and section guards (depot must count toward "all done").
  const customerStopCount = useMemo(
    () => dayStops.filter(
      (s) => s.stop_type !== 'warehouse' && s.stop_type !== 'warehouse_return'
    ).length,
    [dayStops],
  )
  // COD cards are scoped to delivery stops — pickup stops with a balance_due
  // payment state aren't a "collect cash on arrival" scenario from the driver's
  // POV (the customer pays at the lot when picking up, not in the field).
  const codStops = useMemo(
    () => dayStops.filter((s) =>
      s.stop_type === 'delivery' && COD_PAYMENT_STATES.has(s.payment_state ?? '')
    ),
    [dayStops]
  )

  // Route-complete = every stop on today's day list reads as completed.
  // Drives whether the post-trip defect card is offered. Warehouse return
  // stops count toward this — the driver isn't "done" until the truck is
  // back at the depot.
  const routeComplete =
    totalStopCount > 0 && dayStops.every((s) => s.current_status === 'completed')

  // Post-trip defect status — only fetched once route is complete and we have
  // a session/truck. Single boolean: has the driver already submitted a
  // post-trip defect today? Card hides when true. Re-checked on each Home
  // mount; in-session submission also flips local state to hide.
  const [postTripSubmitted, setPostTripSubmitted] = useState<boolean | null>(null)
  useEffect(() => {
    if (!routeComplete || !primaryTruckId) {
      setPostTripSubmitted(null)
      return
    }
    let cancelled = false
    fetch('/api/defects/post-trip')
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((json) => {
        if (cancelled) return
        setPostTripSubmitted(json.submitted_today === true)
      })
      .catch((err) => {
        console.warn('[Home] post-trip status fetch failed:', err instanceof Error ? err.message : err)
        // Fail closed: if we can't confirm, hide the card. Avoids double-submit
        // risk if the network is flaky and the driver submits twice across the
        // failure window.
        if (!cancelled) setPostTripSubmitted(true)
      })
    return () => { cancelled = true }
  }, [routeComplete, primaryTruckId])

  const firstName   = firstNameOf(profile?.display_name)
  const hasGreeting = !!firstName
  const isEmpty     = !isLoading && !error && totalStopCount === 0
  const sub         = daySubcopy(customerStopCount)
  const breakdown   = useMemo(() => typeBreakdown(dayStops), [dayStops])

  // Driver app is single-truck per route per login — only the primary truck
  // surfaces here. truck_2 is dispatcher-side data; ignored on Home.
  const primaryRoute = routes[0]
  const truckName    = primaryRoute?.truck_name?.trim() || null
  const truckPlate   = primaryRoute?.truck_plate?.trim() || null

  // Pre-trip-complete gate. AVA Phase 1 / Session 2 reuses this single boolean
  // to flip Home from "morning briefing" (full layout) to "quiet state" (hero
  // + operational flags only — see post-pre-trip block below).
  const inspected = inspection !== null
  function handleStopTap(stop: Stop) {
    if (!inspected) return
    router.push(`/route/${stop.route_id}/stop/${stop.stop_id}`)
  }

  // Pre-trip card and Gold CTA both launch the inspection flow.
  function handleInspect() {
    if (!primaryRouteId) return
    router.push(`/inspection?route_id=${primaryRouteId}`)
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <AvaChip/>
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

        {/* Sub-copy — hidden in post-pre-trip quiet state (AVA Phase 1 / Session 2
            decision): once the route is active, Home becomes a quiet status
            surface; planning context like the day's stop count belongs on the
            Routes tab. Loading / error / empty states still surface here. */}
        {!inspected && (
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
        )}

        {/* Truck pill — primary truck for today's route (driver app is single-truck
            per login, so truck_2 is intentionally ignored). Hidden when there's
            no truck assignment yet. Plate appears in regular weight after a
            middle dot when present; name-only otherwise. */}
        {!isEmpty && truckName && (
          <div style={{
            marginTop: 18, position: 'relative',
            display: 'inline-flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.16)',
            padding: '6px 14px 6px 6px',
            borderRadius: 999,
            fontFamily: 'inherit',
            color: '#fff',
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <TruckIcon size={14} color={C.ink}/>
            </span>
            <span style={{
              fontSize: 12.5, letterSpacing: '-0.005em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <span style={{ fontWeight: 700 }}>{truckName}</span>
              {truckPlate && (
                <>
                  <span style={{ fontWeight: 400, opacity: 0.85 }}> · </span>
                  <span style={{ fontWeight: 400 }}>{truckPlate}</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Loading state */}
        {isLoading && (
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
        {!isLoading && error && (
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
                onClick={() => loadDay(today)}
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
        {isEmpty && (
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
                Today
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
        {!isLoading && !error && totalStopCount > 0 && (
          <>
            {/* Pre-trip inspection card — only renders pre-pre-trip. AVA Phase 1
                Session 2 dropped the post-inspection "receipt" branch: once the
                route is active, Home goes quiet. Pre-trip → /inspection. */}
            {!inspected && (
              <div style={{ padding: '14px 18px 0' }}>
                <button
                  onClick={handleInspect}
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
            )}

            {/* Post-trip defect card — appears only after the route is complete
                and the driver hasn't already submitted a post-trip defect today.
                Optional (no gate); symmetric end-of-day counterpart to the
                pre-trip card above. Hidden during the day to keep Home focused
                on the active work. */}
            {routeComplete && primaryTruckId && postTripSubmitted === false && (
              <PostTripDefectCard truckId={primaryTruckId}/>
            )}

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
                    aria-disabled={!inspected || undefined}
                    style={{
                      width: '100%',
                      background: C.goldSoft,
                      border: `1.5px solid ${C.gold}`,
                      borderRadius: 18,
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 14,
                      cursor: inspected ? 'pointer' : 'default',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      boxShadow: '0 14px 28px -16px rgba(176,127,0,0.45)',
                      opacity:       inspected ? 1 : 0.4,
                      pointerEvents: inspected ? 'auto' : 'none',
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
                    opacity: inspected ? 1 : 0.4,
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

            {/* Fleet alert — renders only for fleet-access users with ≥1
                open work order; self-fetches, hidden otherwise */}
            <FleetAlertCard />

            {/* Weather heads-up — static-summary card; renders only when wind /
                rain / snow forecast ≥caution at first delivery stop. Hidden in
                quiet state per AVA Phase 1 / Session 2 architecture. */}
            {!inspected && <WeatherFlagCard dayStops={dayStops} />}

            {/* AVA morning brief (Tier 2) — conditional, hidden in quiet state.
                Self-gates internally on (checklist hits | stats opt-in | notes
                match); returns null when AVA has nothing to surface. */}
            {!inspected && profile && (
              <AvaMorningCard
                profile={profile}
                dayStops={dayStops}
                todayKey={today}
                routeDispatcherNote={primaryRoute?.dispatcher_notes ?? null}
                hasWeatherFlag={routeWeather.hasWeatherFlag}
              />
            )}

            {/* Day list eyebrow — hidden post-pre-trip; Routes tab is the
                entry point for the active route. */}
            {!inspected && (
            <div style={{
              padding: '20px 22px 8px',
              fontFamily: FONT_DISPLAY,
              fontSize: 13, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: C.muted,
            }}>
              The day, in {customerStopCount}
            </div>
            )}

            {/* Day stop list — vertical line + numbered circles. Hidden in
                quiet state per AVA Phase 1 / Session 2 architecture. */}
            {!inspected && (
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
                // AVA Phase 2 wind alert — red pill with the forecast wind at
                // arrival (mph) when this stop is above the threshold. Same
                // sizing as the payment/type pills; rendered in both layouts.
                const stopWeather  = routeWeather.weatherByStopId.get(stop.stop_id)
                const windPill     = stopWeather?.weatherAlert && stopWeather.windMph != null ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: '#DC2626', color: '#FFFFFF',
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
                  }}>
                    Wind {Math.round(stopWeather.windMph)}
                  </span>
                ) : null

                return (
                  <button
                    key={stop.stop_id}
                    onClick={() => handleStopTap(stop)}
                    aria-disabled={!inspected || undefined}
                    style={{
                      width: '100%', textAlign: 'left',
                      background: 'transparent', border: 0,
                      cursor: inspected ? 'pointer' : 'default',
                      padding: '8px 0', display: 'flex', gap: 16,
                      alignItems: 'flex-start', fontFamily: 'inherit',
                      position: 'relative', zIndex: 1,
                      opacity:       inspected ? 1 : 0.4,
                      pointerEvents: inspected ? 'auto' : 'none',
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
                        {/* Time-window constraint badge (Phase 4) — sits between the
                            headline and the address/pill row. */}
                        {stop.constraint_confidence && (
                          <div style={{ marginTop: 6 }}>
                            <StopWindowBadge stop={stop} size="sm" />
                          </div>
                        )}
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
                            {windPill}
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
                        {/* Time-window constraint badge (Phase 4). */}
                        {stop.constraint_confidence && (
                          <div style={{ marginTop: 4 }}>
                            <StopWindowBadge stop={stop} size="sm" />
                          </div>
                        )}
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
                            {windPill}
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
            )}

            {/* "Ask Ava about today" — placeholder entry point (AVA Phase 2).
                UI only for now; the Haiku-backed conversation sheet pre-seeded
                with route context lands in a later session. Pre-pre-trip only,
                alongside the Inspect CTA. */}
            {!inspected && <AskAvaButton />}

            {/* Gold CTA — pre-pre-trip only. Once inspected, Home goes quiet
                and the Routes tab becomes the active-route entry point.
                Original (May 9, 2026) two-state design (Inspect → Start Route
                in place) superseded by AVA Phase 1 / Session 2. */}
            {!inspected && (
            <div style={{ padding: '18px 18px 0' }}>
              <button
                onClick={handleInspect}
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
                <span>Inspect & Start Route</span>
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
            )}
          </>
        )}
      </div>

      <BottomNav/>
    </div>
  )
}
