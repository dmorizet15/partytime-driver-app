'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import BottomNav from '@/components/BottomNav'
import CurrentConditionsCard  from '@/components/weather/CurrentConditionsCard'
import LightningStatusCard    from '@/components/weather/LightningStatusCard'
import RainForecastCard       from '@/components/weather/RainForecastCard'
import SnowForecastCard       from '@/components/weather/SnowForecastCard'
import WindForecastCard       from '@/components/weather/WindForecastCard'
import { useAppState } from '@/context/AppStateContext'
import { HAS_STOP_LEVEL_BADGES } from '@/lib/weather/thresholds'
import type { WeatherSnapshot } from '@/lib/weather/types'

// ─── Direction 03 (Editorial) tokens — match ToolsScreen ─────────────────────
const C = {
  blue:  '#0000FF',
  ink:   '#0A0B14',
  cream: '#FFF9EE',
  gold:  '#FFB800',
  paper: '#FFFFFF',
  muted: '#6B7488',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

// ─── Location state ──────────────────────────────────────────────────────────

type LocSource =
  | { kind: 'current'; lat?: number; lng?: number; status: 'idle' | 'requesting' | 'ready' | 'error'; error?: string }
  | { kind: 'stop'; stopId: string; lat: number; lng: number; label: string }

type StopOption = {
  stopId: string
  label:  string
  lat?:   number
  lng?:   number
}

// ─── Component ───────────────────────────────────────────────────────────────

// Match the date-string convention used by DayRouteSelectorScreen so the
// idempotent loader recognises an already-loaded day.
function todayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function WeatherScreen() {
  const router = useRouter()
  const { stops, loadDay, loadedDate } = useAppState()

  // Ensure today's stops are in context so the location dropdown can show
  // them even when the driver lands here without first visiting Home.
  useEffect(() => {
    const today = todayStr()
    if (loadedDate !== today) loadDay(today)
  }, [loadedDate, loadDay])

  // All stops on the active route. Stops without geocoded coordinates are
  // included but rendered disabled so the driver can see they exist (and that
  // the dashboard hasn't geocoded them yet) instead of getting a blank list.
  const stopOptions = useMemo<StopOption[]>(() => {
    return stops.map((s) => ({
      stopId: s.stop_id,
      label:  `${s.stop_sequence}. ${s.address_line_1 || s.customer_name || s.stop_id}`,
      lat:    typeof s.latitude  === 'number' ? s.latitude  : undefined,
      lng:    typeof s.longitude === 'number' ? s.longitude : undefined,
    }))
  }, [stops])

  const ungeocodedCount = stopOptions.filter((s) => s.lat === undefined || s.lng === undefined).length

  const [loc, setLoc] = useState<LocSource>({ kind: 'current', status: 'idle' })
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  const fetchedKeyRef = useRef<string | null>(null)

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Get current location on first mount ──────────────────────────────────
  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLoc({ kind: 'current', status: 'error', error: 'Geolocation not available on this device.' })
      return
    }
    setLoc({ kind: 'current', status: 'requesting' })
    navigator.geolocation.getCurrentPosition(
      (pos) => setLoc({
        kind:   'current',
        lat:    pos.coords.latitude,
        lng:    pos.coords.longitude,
        status: 'ready',
      }),
      (err) => setLoc({
        kind:   'current',
        status: 'error',
        error:  err.code === err.PERMISSION_DENIED
          ? 'Location permission denied. Pick a stop instead, or enable location and retry.'
          : 'Could not get your location. Try again or pick a stop.',
      }),
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    )
  }, [])

  useEffect(() => {
    if (loc.kind === 'current' && loc.status === 'idle') requestCurrentLocation()
  }, [loc, requestCurrentLocation])

  // ── Fetch weather whenever we have coords ────────────────────────────────
  useEffect(() => {
    let lat: number | undefined
    let lng: number | undefined
    if (loc.kind === 'current' && loc.status === 'ready') {
      lat = loc.lat; lng = loc.lng
    } else if (loc.kind === 'stop') {
      lat = loc.lat; lng = loc.lng
    }
    if (lat === undefined || lng === undefined) return

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
    if (fetchedKeyRef.current === key) return  // already fetched these coords this session
    fetchedKeyRef.current = key

    let cancelled = false
    setLoading(true); setError(null)

    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
        if (!cancelled) setSnapshot(json as WeatherSnapshot)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [loc])

  // ── Handlers ─────────────────────────────────────────────────────────────
  function selectStop(stopId: string) {
    if (stopId === '__current__') {
      requestCurrentLocation()
      fetchedKeyRef.current = null
      return
    }
    const opt = stopOptions.find((s) => s.stopId === stopId)
    if (!opt || opt.lat === undefined || opt.lng === undefined) return
    fetchedKeyRef.current = null
    setLoc({ kind: 'stop', stopId: opt.stopId, lat: opt.lat, lng: opt.lng, label: opt.label })
  }

  const showToast = (msg: string) => setToast(msg)

  const locationLabel =
    loc.kind === 'stop'    ? loc.label :
    loc.kind === 'current' && loc.status === 'ready' ? 'Your current location' :
    loc.kind === 'current' && loc.status === 'requesting' ? 'Locating…' :
    loc.kind === 'current' && loc.status === 'error' ? 'Location unavailable' :
    'Locating…'

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* HERO */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '24px 22px 22px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={() => router.push('/tools')}
            aria-label="Back to Tools"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: '#fff', fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              padding: 0,
            }}
          >
            ← Tools
          </button>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Weather Intelligence
          </div>
        </div>

        <div style={{
          marginTop: 16, fontFamily: FONT_DISPLAY,
          fontSize: 34, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em', color: '#fff',
        }}>
          Weather.
        </div>

        {/* Location source switcher */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="weather-loc" style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em',
            color: 'rgba(255,255,255,0.70)', textTransform: 'uppercase',
          }}>
            Location
          </label>
          <select
            id="weather-loc"
            value={loc.kind === 'stop' ? loc.stopId : '__current__'}
            onChange={(e) => selectStop(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.25)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.30)',
              borderRadius: 10,
              padding: '10px 12px',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            <option value="__current__">📍 Current location</option>
            {stopOptions.length > 0 && <option disabled>──── Stops on today&apos;s route ────</option>}
            {stopOptions.map((s) => {
              const missing = s.lat === undefined || s.lng === undefined
              return (
                <option key={s.stopId} value={s.stopId} disabled={missing}>
                  {missing ? `${s.label}  (no coords)` : s.label}
                </option>
              )
            })}
          </select>
          {stopOptions.length === 0 && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
              No stops loaded — current location only.
            </div>
          )}
          {stopOptions.length > 0 && ungeocodedCount === stopOptions.length && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.35 }}>
              Today&apos;s stops aren&apos;t geocoded yet — pick current location for now.
            </div>
          )}
        </div>
      </div>

      {/* SCROLL BODY */}
      <div className="flex-1 overflow-y-auto" style={{ background: C.cream }}>
        <div style={{ padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Location-error / loading */}
          {loc.kind === 'current' && loc.status === 'error' && (
            <Notice tone="warn" title="Location unavailable" body={loc.error ?? ''}>
              <button onClick={requestCurrentLocation} style={NOTICE_BTN}>Retry</button>
            </Notice>
          )}
          {loc.kind === 'current' && loc.status === 'requesting' && (
            <Notice tone="info" title="Getting your location…" body="One moment." />
          )}

          {/* Stale-cache banner */}
          {snapshot?.stale && (
            <Notice
              tone="warn"
              title="Showing last cached forecast"
              body={`Live forecast unavailable — last updated ${formatRelative(snapshot.fetchedAt)}.`}
            />
          )}

          {/* Fetch error (no snapshot to fall back on) */}
          {error && !snapshot && (
            <Notice tone="error" title="Couldn't load forecast" body={error}>
              <button
                onClick={() => { fetchedKeyRef.current = null; setLoc({ ...loc }) }}
                style={NOTICE_BTN}
              >
                Retry
              </button>
            </Notice>
          )}

          {/* Loading shimmer */}
          {loading && !snapshot && <SkeletonBlock />}

          {/* Snapshot UI — Lightning first (overrides), then Current, Wind, Rain, Snow */}
          {snapshot && (
            <>
              <LightningStatusCard alerts={snapshot.lightningAlerts} />
              <CurrentConditionsCard current={snapshot.current} locationLabel={locationLabel} />
              <WindForecastCard
                hourly={snapshot.windHourly}
                daily={snapshot.windDaily}
                onComingSoon={showToast}
              />
              <RainForecastCard hourly={snapshot.rainHourly} />
              <SnowForecastCard daily={snapshot.snowDaily} />

              {/* Designed stub — Phase 2B stop-level badges */}
              {!HAS_STOP_LEVEL_BADGES && (
                <button
                  type="button"
                  onClick={() => showToast('Stop-level weather badges — coming in Phase 2B.')}
                  style={{
                    width: '100%',
                    background: C.paper,
                    border: `1.5px dashed rgba(10,11,20,0.20)`,
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: C.muted,
                    fontSize: 12.5,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                  }}
                >
                  Stop-level badges — coming soon
                </button>
              )}

              {/* Footer meta */}
              <div style={{
                marginTop: 4,
                fontSize: 11,
                color: C.muted,
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                Forecast: Tomorrow.io • Lightning: NWS<br/>
                Updated {formatRelative(snapshot.fetchedAt)}
              </div>
            </>
          )}
        </div>
      </div>

      <BottomNav />

      {/* Toast */}
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

// ─── Subcomponents ───────────────────────────────────────────────────────────

const NOTICE_BTN = {
  marginTop: 8,
  background: '#0A0B14',
  color: '#FFB800',
  border: 0,
  borderRadius: 999,
  padding: '6px 14px',
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer' as const,
  fontFamily: 'inherit',
}

function Notice({
  tone, title, body, children,
}: {
  tone: 'info' | 'warn' | 'error'; title: string; body: string; children?: React.ReactNode
}) {
  const palette = tone === 'error'
    ? { bg: '#2A0A0A', border: '#5C1A1A', accent: '#F87171' }
    : tone === 'warn'
    ? { bg: '#2A200A', border: '#5C400A', accent: '#FBBF24' }
    : { bg: '#0A0B14', border: 'rgba(255,255,255,0.10)', accent: '#FFB800' }

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        background:   palette.bg,
        border:       `1px solid ${palette.border}`,
        borderRadius: 12,
        padding:      '12px 14px',
        color:        '#fff',
        fontFamily:   "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.10em',
        color: palette.accent, textTransform: 'uppercase',
      }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
        {body}
      </div>
      {children}
    </div>
  )
}

function SkeletonBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[120, 160, 220, 180, 200].map((h, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            background: '#0A0B14',
            opacity: 0.65,
            borderRadius: 16,
            height: h,
          }}
        />
      ))}
    </div>
  )
}

function formatRelative(iso: string): string {
  try {
    const dt   = new Date(iso)
    const diff = Math.max(0, Date.now() - dt.getTime())
    const mins = Math.round(diff / 60_000)
    if (mins < 1)  return 'just now'
    if (mins === 1) return '1 min ago'
    if (mins < 60) return `${mins} mins ago`
    const hours = Math.round(mins / 60)
    return hours === 1 ? '1 hr ago' : `${hours} hrs ago`
  } catch {
    return iso
  }
}
