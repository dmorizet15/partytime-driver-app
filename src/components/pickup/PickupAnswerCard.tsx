'use client'

// ─── PickupAnswerCard ─────────────────────────────────────────────────────────
// Pickup Answer (driver-facing) — gold card on a DELIVERY stop that instantly
// answers "when are you picking up?" without digging. Spec: MBC Part 3 "📞
// Pickup Answer (Driver-Facing)" (locked 2026-07-05). Read-only.
//
// Self-contained (the EquipmentRetrieveCard / SameJobIndicator pattern): fetches
// GET /api/stops/pickup-answer?stop_id=, which derives the view model
// server-side (src/lib/pickupAnswer/derive.ts). Renders NOTHING until a
// confirmed resolution (`ok:true`) — a transient failure never shows the
// "no pickup scheduled" copy.
//
// Two-line time model:
//   • Line 1 (the promise) — inflatable: "No earlier than [time]"; tent/general:
//     day + flexible window. The inflatable time is `effectiveWindow().startsAt`
//     — the IDENTICAL value the early-pickup guard enforces, so the promise and
//     the block can never disagree. Reuses the guard's `formatCountdown` for an
//     imminent same-day floor.
//   • Line 2 (live ETA) — "Currently expected ~[time]" on any routed pickup,
//     labeled an estimate that can shift. Never promised as firm.
// Everything displays in America/New_York (DST-safe — see ./lib/pickupAnswer).

import { useEffect, useState } from 'react'
import {
  formatEtClock, etDateKey, formatCalendarDay,
} from '@/lib/pickupAnswer/format'
import { formatCountdown } from '@/lib/stopConstraints'
import type { PickupAnswer, PickupTrip } from '@/lib/pickupAnswer/types'

const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  gold:     '#FFB800',
  goldDeep: '#B07F00',
  goldSoft: '#FFF4D6',
  goldLine: 'rgba(176,127,0,0.45)',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
} as const
const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface Props { stopId: string }

// ── icons ──────────────────────────────────────────────────────────────────
function ClockIcon({ size = 20, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  )
}
function CalendarIcon({ size = 20, color = C.ink }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  )
}
function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.goldDeep}
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms', flexShrink: 0 }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// ── date helpers (ET) ────────────────────────────────────────────────────────
function dayLabel(key: string | null, now: Date): string | null {
  if (!key) return null
  const today = etDateKey(now.toISOString())
  const tomorrow = etDateKey(new Date(now.getTime() + 86_400_000).toISOString())
  if (key === today) return 'Today'
  if (key === tomorrow) return 'Tomorrow'
  return formatCalendarDay(key)
}

function tripKindGlyph(kind: PickupTrip['kind']): 'clock' | 'calendar' {
  return kind === 'inflatable' || kind === 'mixed' ? 'clock' : 'calendar'
}

// One-day window → "1:00–5:00 PM"; multi-day span → null (show "flexible window").
function windowClockRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null
  if (etDateKey(start) !== etDateKey(end)) return null
  const a = formatEtClock(start), b = formatEtClock(end)
  if (!a || !b) return null
  if (a === b) return a
  return `${a} – ${b}`
}

function statusChip(t: PickupTrip): { text: string; tone: 'gold' | 'blue' | 'muted' } {
  if (t.status === 'locked')    return { text: 'Set time', tone: 'gold' }
  if (t.status === 'scheduled') return { text: 'Scheduled', tone: 'blue' }
  return { text: 'Planned', tone: 'muted' }
}

// Customer-facing script the driver can read aloud. Never promises a firm ETA.
function sayLine(a: PickupAnswer, now: Date): string {
  if (a.trips.length > 1) {
    return `"We'll pick your items up in ${a.trips.length} trips — I can give you the times for each."`
  }
  const p = a.trips[0]
  const dl = dayLabel(p.day, now)
  const when = dl === 'Today' ? 'today' : dl === 'Tomorrow' ? 'tomorrow' : dl ? `on ${dl}` : 'soon'
  if (p.kind === 'inflatable' || p.kind === 'mixed') {
    const clock = formatEtClock(p.floorTime)
    if (clock) return `"We'll be by to pick up ${when}, no earlier than ${clock}."`
    return `"We'll be by to pick up ${when}."`
  }
  return `"We're scheduled to pick up ${when}. We'll text you when we're on the way."`
}

// ── promise (Line 1) text for a trip ─────────────────────────────────────────
function promiseLine(t: PickupTrip, now: Date): { lead: string; strong: string; sub: string | null } {
  const dl = dayLabel(t.day, now)
  if (t.kind === 'inflatable' || t.kind === 'mixed') {
    const clock = formatEtClock(t.floorTime)
    return {
      lead: 'No earlier than',
      strong: clock ?? 'a set time',
      sub: dl && dl !== 'Today' ? dl : null,
    }
  }
  const range = windowClockRange(t.window.start, t.window.end)
  return {
    lead: t.status === 'scheduled' ? 'Scheduled' : 'Planned',
    strong: dl ?? 'a scheduled day',
    sub: range ?? 'Flexible window',
  }
}

export default function PickupAnswerCard({ stopId }: Props) {
  const [state, setState] = useState<{ ok: boolean; answer: PickupAnswer | null }>({ ok: false, answer: null })
  const [expanded, setExpanded] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date())

  useEffect(() => {
    if (!stopId) { setState({ ok: false, answer: null }); return }
    let cancelled = false
    fetch(`/api/stops/pickup-answer?stop_id=${encodeURIComponent(stopId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        if (cancelled) return
        if (json?.ok && json.answer) setState({ ok: true, answer: json.answer as PickupAnswer })
        else setState({ ok: false, answer: null })
      })
      .catch((err) => {
        console.warn('[PickupAnswerCard] fetch failed (non-fatal):', err instanceof Error ? err.message : err)
        if (!cancelled) setState({ ok: false, answer: null })
      })
    return () => { cancelled = true }
  }, [stopId])

  const answer = state.answer
  const primary = answer?.trips[0] ?? null
  const floorIso = primary?.floorTime ?? null

  // Imminent same-day inflatable floor → live countdown (reuse the guard's fn).
  const floorToday  = floorIso ? etDateKey(floorIso) === etDateKey(now.toISOString()) : false
  const floorFuture = floorIso ? new Date(floorIso).getTime() > now.getTime() : false
  const imminent = floorToday && floorFuture

  useEffect(() => {
    if (!imminent) return
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [imminent])

  if (!state.ok || !answer) return null

  // ── No pickup scheduled (approved copy) ────────────────────────────────────
  if (answer.kind === 'none' || answer.trips.length === 0) {
    return (
      <div style={{ padding: '16px 18px 0' }}>
        <div style={{
          background: C.off,
          border: `1px solid rgba(10,11,20,0.10)`,
          borderRadius: 16,
          padding: '13px 15px',
          display: 'flex', alignItems: 'flex-start', gap: 11,
          fontFamily: FONT_BODY,
        }}>
          <span style={{ marginTop: 1, flexShrink: 0 }}><CalendarIcon size={18} color={C.muted} /></span>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: C.muted, marginBottom: 3,
            }}>Pickup</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.4, color: C.ink }}>
              There&apos;s no pickup currently scheduled for your items. If that changes, you&apos;ll get a text or email.
            </div>
          </div>
        </div>
      </div>
    )
  }

  const glyph = tripKindGlyph(primary!.kind)
  const prom = promiseLine(primary!, now)
  const etaClock = formatEtClock(answer.etaTime)
  const isSplit = answer.trips.length > 1

  return (
    <div style={{ padding: '16px 18px 0', fontFamily: FONT_BODY }}>
      <div style={{
        background: `linear-gradient(180deg, ${C.goldSoft} 0%, #FFFBF0 100%)`,
        border: `1.5px solid ${C.goldLine}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* ── collapsed header (tap to expand) ── */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Pickup answer — tap to expand"
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'transparent', border: 'none',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '13px 15px', fontFamily: 'inherit',
          }}
        >
          <span style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: C.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {glyph === 'clock' ? <ClockIcon size={20} color={C.ink} /> : <CalendarIcon size={20} color={C.ink} />}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.09em',
              textTransform: 'uppercase', color: C.goldDeep, marginBottom: 2,
            }}>
              {isSplit ? `Pickup · ${answer.trips.length} trips` : 'Pickup'}
            </div>
            <div style={{
              fontSize: 15.5, fontWeight: 800, color: C.ink, lineHeight: 1.2,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {prom.lead} <span style={{ color: C.goldDeep }}>{prom.strong}</span>
            </div>
            {/* collapsed secondary: countdown / eta / sub */}
            <div style={{ marginTop: 2, fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {imminent && floorIso ? (
                <span style={{ color: C.goldDeep, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  Opens in {formatCountdown(floorIso, now)}
                </span>
              ) : etaClock ? (
                <>
                  <span className="ptr-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, display: 'inline-block' }} />
                  <span>Expected ~{etaClock}</span>
                </>
              ) : prom.sub ? (
                <span>{prom.sub}</span>
              ) : null}
            </div>
          </div>

          <Chevron open={expanded} />
        </button>

        {/* ── expanded detail ── */}
        {expanded && (
          <div style={{ padding: '0 15px 15px', borderTop: `1px solid ${C.goldLine}` }}>
            {/* single trip → two-line model + say line; split → per-trip rows */}
            {!isSplit ? (
              <>
                <TwoLine trip={primary!} now={now} imminent={imminent} floorIso={floorIso} etaClock={etaClock} />
              </>
            ) : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {answer.trips.map((t, i) => (
                  <TripRow key={i} trip={t} now={now} />
                ))}
              </div>
            )}

            {/* Tell the customer */}
            <div style={{
              marginTop: 12, padding: '10px 12px',
              background: C.paper, border: `1px solid ${C.goldLine}`, borderRadius: 12,
            }}>
              <div style={{
                fontSize: 9.5, fontWeight: 800, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: C.goldDeep, marginBottom: 4,
              }}>Tell the customer</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.45, color: C.ink, fontStyle: 'italic' }}>
                {sayLine(answer, now)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Two-line time model for a single trip.
function TwoLine({ trip, now, imminent, floorIso, etaClock }: {
  trip: PickupTrip; now: Date; imminent: boolean; floorIso: string | null; etaClock: string | null
}) {
  const prom = promiseLine(trip, now)
  const chip = statusChip(trip)
  const chipStyle =
    chip.tone === 'gold' ? { bg: 'rgba(255,184,0,0.18)', fg: C.goldDeep, bd: C.goldLine }
    : chip.tone === 'blue' ? { bg: 'rgba(0,0,255,0.10)', fg: C.blue, bd: 'rgba(0,0,255,0.28)' }
    : { bg: C.off, fg: C.muted, bd: 'rgba(10,11,20,0.12)' }
  return (
    <div style={{ marginTop: 12 }}>
      {/* Line 1 — the promise */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {prom.lead}
        </div>
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 999,
          background: chipStyle.bg, color: chipStyle.fg, border: `1px solid ${chipStyle.bd}`,
        }}>{chip.text}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.ink, fontFamily: FONT_DISPLAY, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: 2 }}>
        {prom.strong}
      </div>
      {prom.sub && (
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{prom.sub}</div>
      )}
      {imminent && floorIso && (
        <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 800, color: C.goldDeep, fontVariantNumeric: 'tabular-nums' }}>
          Pickup opens in {formatCountdown(floorIso, now)}
        </div>
      )}

      {/* Line 2 — live ETA (any routed pickup) */}
      {etaClock && (
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.goldLine}`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="ptr-pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue, display: 'inline-block', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>Currently expected ~{etaClock}</div>
            <div style={{ fontSize: 11, color: C.muted }}>Live estimate — can shift as the day runs.</div>
          </div>
        </div>
      )}
    </div>
  )
}

// One row in a split pickup.
function TripRow({ trip, now }: { trip: PickupTrip; now: Date }) {
  const prom = promiseLine(trip, now)
  const etaClock = formatEtClock(trip.etaTime)
  const glyph = tripKindGlyph(trip.kind)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', background: C.paper,
      border: `1px solid ${C.goldLine}`, borderRadius: 12,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 9, flexShrink: 0, marginTop: 1,
        background: 'rgba(255,184,0,0.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {glyph === 'clock' ? <ClockIcon size={16} color={C.goldDeep} /> : <CalendarIcon size={16} color={C.goldDeep} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.goldDeep }}>
          {trip.label ?? 'Pickup'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, fontFamily: FONT_DISPLAY, marginTop: 1 }}>
          {prom.lead} {prom.strong}
        </div>
        {prom.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{prom.sub}</div>}
        {etaClock && (
          <div style={{ marginTop: 3, fontSize: 12, color: C.blue, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="ptr-pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, display: 'inline-block' }} />
            Expected ~{etaClock}
          </div>
        )}
      </div>
    </div>
  )
}
