'use client'

// WeekScheduleView — driver-app variant.
// Mirrors the dashboard's component shape but renders with the Editorial
// inline-style tokens used elsewhere in this app (no Tailwind ptw.* classes).
// Data source: GET /api/schedule/week?start&days (this repo's copy of the
// endpoint, identical payload shape to the dashboard's).

import { useEffect, useMemo, useState } from 'react'

const C = {
  blue:     '#0000FF',
  ink:      '#0A0B14',
  cream:    '#FFF9EE',
  gold:     '#FFB800',
  goldTint: '#FFF6E0',
  goldFill: '#FFFAEC',
  muted:    '#6B7488',
  paper:    '#FFFFFF',
  off:      '#F4F6FA',
  amber:    '#F59E0B',
  amberTint:'#FFF6E0',
  border:   'rgba(10,11,20,0.10)',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

interface Stop {
  id:            string
  stop_type:     string
  customer_name: string
  town:          string
  line_items:    string
}
interface Route {
  id:          string
  name:        string
  driver_id:   string | null
  driver_name: string | null
  stop_count:  number
  status:      string
  stops:       Stop[]
}
interface Day {
  date:   string
  routes: Route[]
}
interface ScheduleResponse { days: Day[] }

interface Props {
  startDate?:       string
  days?:            number
  currentUserId?:   string | null
  currentUserRole?: string | null
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function formatDayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}
function formatRange(start: string, end: string): string {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const a = new Date(sy, sm - 1, sd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const b = new Date(ey, em - 1, ed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${a} — ${b}`
}

function storageKey(userId: string | null | undefined, suffix: string): string {
  return `schedule:${userId ?? 'anon'}:${suffix}`
}
function loadCollapseSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
function saveCollapseSet(key: string, set: Set<string>) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(key, JSON.stringify(Array.from(set))) } catch {}
}

export default function WeekScheduleView({
  startDate,
  days = 8,
  currentUserId = null,
  currentUserRole = null,
}: Props) {
  const start = startDate ?? todayISO()
  const endInclusive = addDays(start, days - 1)
  const today = todayISO()

  const [data, setData] = useState<ScheduleResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)
    fetch(`/api/schedule/week?start=${start}&days=${days}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: ScheduleResponse) => {
        if (!cancelled) {
          setData(json)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setIsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [start, days])

  const dayKey   = useMemo(() => storageKey(currentUserId, 'day'),    [currentUserId])
  const routeKey = useMemo(() => storageKey(currentUserId, 'route'),  [currentUserId])
  const filterKey = useMemo(() => storageKey(currentUserId, 'filters'), [currentUserId])

  const [collapsedDays,   setCollapsedDays]   = useState<Set<string>>(new Set())
  const [collapsedRoutes, setCollapsedRoutes] = useState<Set<string>>(new Set())
  const [townFilter,  setTownFilter]  = useState(false)
  const [equipFilter, setEquipFilter] = useState(false)

  useEffect(() => {
    setCollapsedDays(loadCollapseSet(dayKey))
    setCollapsedRoutes(loadCollapseSet(routeKey))
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(filterKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed?.town === 'boolean') setTownFilter(parsed.town)
          if (typeof parsed?.equip === 'boolean') setEquipFilter(parsed.equip)
        }
      } catch {}
    }
  }, [dayKey, routeKey, filterKey])

  const toggleDay = (date: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      saveCollapseSet(dayKey, next)
      return next
    })
  }
  const toggleRoute = (id: string) => {
    setCollapsedRoutes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveCollapseSet(routeKey, next)
      return next
    })
  }
  const setFilter = (key: 'town' | 'equip', value: boolean) => {
    if (key === 'town') setTownFilter(value)
    else setEquipFilter(value)
    if (typeof window !== 'undefined') {
      const next = { town: key === 'town' ? value : townFilter, equip: key === 'equip' ? value : equipFilter }
      try { window.localStorage.setItem(filterKey, JSON.stringify(next)) } catch {}
    }
  }

  const showYou = !!currentUserId && (currentUserRole === 'driver' || currentUserRole === 'super_admin')

  return (
    <div style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink, minHeight: '100%' }}>
      <div style={{ padding: '14px 18px 6px' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <NavBtn label="←" disabled />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 16, color: C.ink }}>
              Schedule
            </div>
            <div style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>
              {formatRange(start, endInclusive)} · {days} days
            </div>
          </div>
          <NavBtn label="→" disabled />
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: C.muted }}>
          <span style={{ fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Show</span>
          <FilterPill label="Town"  active={townFilter}  onClick={() => setFilter('town',  !townFilter)} />
          <FilterPill label="Equip" active={equipFilter} onClick={() => setFilter('equip', !equipFilter)} />
          <span style={{
            color: !townFilter && !equipFilter ? C.ink : C.muted,
            fontWeight: !townFilter && !equipFilter ? 700 : 400,
          }}>
            · all
          </span>
        </div>
      </div>

      <div style={{ padding: '6px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && (
          <div style={{ padding: 14, color: C.muted, fontSize: 13 }}>Loading schedule…</div>
        )}
        {error && (
          <div style={{ padding: 14, color: '#DC2626', fontSize: 13 }}>
            Failed to load schedule: {error}
          </div>
        )}

        {data?.days.map((day) => {
          const isToday = day.date === today
          const isCollapsed = collapsedDays.has(day.date)
          const totalStops = day.routes.reduce((s, r) => s + r.stop_count, 0)
          const isEmpty = day.routes.length === 0
          return (
            <section
              key={day.date}
              style={{
                background: C.paper,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                overflow: 'hidden',
                opacity: isEmpty ? 0.7 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => toggleDay(day.date)}
                style={{
                  width: '100%', padding: '10px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, textAlign: 'left',
                  background: 'transparent', border: 0, cursor: 'pointer',
                  fontFamily: 'inherit', color: 'inherit',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 14, lineHeight: 1.15 }}>
                    {formatDayHeader(day.date)}
                    {isToday && (
                      <span style={{ marginLeft: 8, color: C.blue, fontWeight: 900 }}>· TODAY</span>
                    )}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11, color: C.muted }}>
                    {isEmpty
                      ? 'no routes scheduled'
                      : `${day.routes.length} route${day.routes.length === 1 ? '' : 's'} · ${totalStops} stop${totalStops === 1 ? '' : 's'}`}
                  </div>
                </div>
                <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 12 }}>
                  {isCollapsed ? '+' : '−'}
                </span>
              </button>

              {!isCollapsed && !isEmpty && (
                <div style={{ borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
                  {day.routes.map((route) => (
                    <RouteBlock
                      key={route.id}
                      route={route}
                      isCollapsed={collapsedRoutes.has(route.id)}
                      onToggle={() => toggleRoute(route.id)}
                      isYou={showYou && route.driver_id === currentUserId}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function NavBtn({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 10,
        background: C.paper, border: `1px solid ${C.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: C.muted, fontSize: 14,
        display: 'grid', placeItems: 'center',
        fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
      }}
      aria-label={label === '←' ? 'Previous week' : 'Next week'}
      title="Week navigation lands in a follow-up"
    >
      {label}
    </button>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
        border: 0, cursor: 'pointer',
        background: active ? C.blue : 'rgba(10,11,20,0.06)',
        color: active ? '#fff' : C.muted,
      }}
    >
      {label}
    </button>
  )
}

function RouteBlock({
  route, isCollapsed, onToggle, isYou,
}: {
  route: Route; isCollapsed: boolean; onToggle: () => void; isYou: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        borderLeft: isYou ? `4px solid ${C.gold}` : '4px solid transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            width: '100%', padding: '8px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, textAlign: 'left',
            background: isYou ? C.goldTint : '#EAF0FF',
            border: 0, cursor: 'pointer',
            fontFamily: 'inherit', color: C.ink,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {isYou && (
              <span style={{
                padding: '2px 8px', borderRadius: 999,
                background: C.gold, color: C.ink,
                fontSize: 10, fontWeight: 800,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                YOU
              </span>
            )}
            <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {route.name}
            </span>
            {route.driver_name && (
              <span style={{ color: C.muted, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                · {route.driver_name}
              </span>
            )}
          </div>
          <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>
            {route.stop_count} stop{route.stop_count === 1 ? '' : 's'} · {isCollapsed ? '+' : '−'}
          </span>
        </button>

        {!isCollapsed && (
          <div style={{ background: isYou ? C.goldFill : 'transparent' }}>
            {route.stops.length === 0 && (
              <div style={{ padding: '8px 14px', color: C.muted, fontSize: 11 }}>
                No stops on this route.
              </div>
            )}
            {route.stops.map((stop) => (
              <StopRow key={stop.id} stop={stop} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StopRow({ stop }: { stop: Stop }) {
  const isPickup = stop.stop_type === 'pickup'
  return (
    <div style={{
      padding: '8px 14px',
      borderTop: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          padding: '2px 6px', borderRadius: 4,
          background: isPickup ? '#FEF3C7' : 'rgba(10,11,20,0.08)',
          color: isPickup ? '#92400E' : C.ink,
          fontSize: 10, fontWeight: 800,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          {isPickup ? 'PU' : 'DEL'}
        </span>
        <span style={{ fontSize: 12.5, color: C.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stop.customer_name || '(no name)'}
        </span>
        <span style={{ color: C.muted, fontFamily: 'monospace', fontSize: 11, flexShrink: 0 }}>
          {stop.town}
        </span>
      </div>
      {stop.line_items && (
        <div style={{ paddingLeft: 32, fontSize: 11.5, color: C.muted, lineHeight: 1.35, whiteSpace: 'pre-line' }}>
          {stop.line_items}
        </div>
      )}
    </div>
  )
}
