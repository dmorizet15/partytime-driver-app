'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import ConfirmationModal from '@/components/ConfirmationModal'
import { navigationService } from '@/services/NavigationService'
import { externalAppService } from '@/services/ExternalAppService'
import { photoUploadService } from '@/services/PhotoUploadService'
import { logEvent } from '@/services/EventLogger'
import { sendEtaSms, getStopSmsStatus, getDriverLocation } from '@/services/EtaSmsService'
import type { StopSmsStatus } from '@/services/EtaSmsService'
import { signOut } from '@/lib/auth'
import BottomNav from '@/components/BottomNav'
import StopWeatherModule from '@/components/weather/StopWeatherModule'
import AvaChip from '@/components/AvaChip'
import { HAS_STOP_LEVEL_BADGES } from '@/lib/weather/thresholds'
import { formatEta } from '@/lib/formatEta'
import { useArrivalGeofence } from '@/hooks/useArrivalGeofence'
import StopWindowBadge from '@/components/StopWindowBadge'
import {
  effectiveWindow,
  formatCountdown,
  formatLocalClock,
  isHardConstraintTier,
} from '@/lib/stopConstraints'
import { reportIssueSuccessKey } from '@/screens/workOrders/ReportIssueScreen'
import { useAuthContext } from '@/context/AuthContext'
import { normalizeAddressKey } from '@/lib/ava/addressKey'
import { fetchTodayNotesHitCount, listNotesForAddress } from '@/lib/ava/stopNotesClient'
import AvaNoteSheet from '@/components/ava/AvaNoteSheet'
import StopNotesPreSheet, { type StopNotesSections } from '@/components/ava/StopNotesPreSheet'

// sessionStorage key — driver chose to proceed despite the pickup window
// not yet being open. Set by the standby card's dismiss button AND by the
// pre-navigate gate's "Navigate anyway" button. Once set, both surfaces
// stop gating for this stop until the session ends.
const earlyOverrideKey = (stopId: string) => `early-pickup-override:${stopId}`

interface StopDetailScreenProps { routeId: string; stopId: string }
type PodStatus = 'idle' | 'uploading' | 'uploaded' | 'failed'
interface PodState { status: PodStatus; url?: string; error?: string }
type EtaStatus = 'idle' | 'sending' | 'sent' | 'error'

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

// ─── Stop type pill colors ────────────────────────────────────────────────────
// Keep in lockstep with TYPE_PILL in DayRouteSelectorScreen — both depot
// stop types (legacy 'warehouse' + new 'warehouse_return' from dashboard
// Migration 070/071) share the same neutral treatment.
const TYPE_PILL: Record<'delivery' | 'pickup' | 'service' | 'warehouse' | 'warehouse_return', { bg: string; color: string }> = {
  delivery:         { bg: C.blue, color: '#fff' },
  pickup:           { bg: C.gold, color: C.ink },
  service:          { bg: C.ink,  color: '#fff' },
  warehouse:        { bg: C.off,  color: C.muted },
  warehouse_return: { bg: C.off,  color: C.muted },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch {
    return '—'
  }
}

function formatSentAt(isoStr: string): string {
  const d = new Date(isoStr)
  let h = d.getHours()
  const mins = d.getMinutes()
  const ampm = h >= 12 ? 'p' : 'a'
  h = h % 12 || 12
  return `${h}:${String(mins).padStart(2, '0')}${ampm}`
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})
function formatUSD(amount: number): string {
  return USD_FORMATTER.format(amount)
}

function sentenceCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ─── Inline icons ─────────────────────────────────────────────────────────────
type IconProps = { size?: number; color?: string }

function BackIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}
function CheckIcon({ size = 14, color = C.gold }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12l5 5L20 6"/>
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
function PhoneIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2.1z"/>
    </svg>
  )
}
function DocIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  )
}
function NoteIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}
function NavigateIcon({ size = 18, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 11 22 2 13 21 11 13 3 11"/>
    </svg>
  )
}
function ChatIcon({ size = 18, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
function ClockIcon({ size = 18, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v5l3 2"/>
    </svg>
  )
}
function CameraIcon({ size = 18, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}
function ArrowIcon({ size = 18, color = C.ink }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 5l7 7-7 7"/>
    </svg>
  )
}
function BanIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"/>
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function StopDetailScreen({ routeId, stopId }: StopDetailScreenProps) {
  const router = useRouter()
  const { getRoute, getStop, getStopsForRoute, markOtw, markComplete, markArrived, loadDay } = useAppState()
  const route = getRoute(routeId)
  const stop = getStop(stopId)
  const allStops = getStopsForRoute(routeId)

  const [navLoading, setNavLoading] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [completeLoading, setCompleteLoading] = useState(false)
  const [tapGoodsLoading, setTapGoodsLoading] = useState(false)
  const [navMessage, setNavMessage] = useState<string | null>(null)
  const [pod, setPod] = useState<PodState>({ status: 'idle' })
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [etaStatus, setEtaStatus] = useState<EtaStatus>('idle')
  const [etaRange, setEtaRange] = useState<string | null>(null)
  const [etaError, setEtaError] = useState<string | null>(null)
  const [smsReply, setSmsReply] = useState<StopSmsStatus | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const etaCooldownRef = useRef<number>(0)
  const [etaCooldownMsg, setEtaCooldownMsg] = useState<string | null>(null)

  // Cash collection acknowledgment state — hydrated on mount via GET /api/cash-collections.
  // null = loading (avoids button flash); false = no row on file; true = a row exists
  // (either collected or not_collected — both are terminal for the prompt).
  const [cashConfirmed,   setCashConfirmed]   = useState<boolean | null>(null)
  const [showCashModal,   setShowCashModal]   = useState(false)
  const [cashSubmitting,  setCashSubmitting]  = useState(false)
  const [cashError,       setCashError]       = useState<string | null>(null)
  // Cash modal form state
  const [cashAmountInput,   setCashAmountInput]   = useState<string>('')
  const [cashReasonInput,   setCashReasonInput]   = useState<string>('')
  const [cashReasonVisible, setCashReasonVisible] = useState<boolean>(false)
  const [cashReasonError,   setCashReasonError]   = useState<string | null>(null)

  // Dispatcher note (NEW-D) — read-only modal that pops on stop open when
  // the dashboard has saved a dispatcher_notes value. "Got it" dismisses
  // it for this screen lifetime; the persistent "View note" link below
  // the header can re-open it any time. New mounts (driver navigates
  // back into this stop later) re-pop the modal — intentional, so a
  // dispatch update mid-day isn't missed.
  const [showDispatcherNoteModal, setShowDispatcherNoteModal] = useState(false)
  const dispatcherNoteAutoShownRef = useRef(false)

  // ── Pickup-window standby (Phase 4) ───────────────────────────────────────
  // When a driver arrives at a pickup stop before its time window opens, we
  // surface a standby card with a live HH:MM:SS countdown to the window's
  // start. The driver can dismiss with "Navigate anyway" — that logs an
  // override and returns the normal action card so they can proceed.
  const [now, setNow] = useState<Date>(() => new Date())
  const [earlyOverride, setEarlyOverride] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(earlyOverrideKey(stopId)) === '1'
  })
  // Pre-navigate gate modal. Surfaces when the driver taps Navigate on a
  // hard-tier pickup stop before its window opens. "I'll wait" dismisses.
  // "Navigate anyway" sets the override and proceeds.
  const [showEarlyPickupGate, setShowEarlyPickupGate] = useState(false)

  // Report-issue post-submit pill. ReportIssueScreen stashes a success
  // record in sessionStorage under reportIssueSuccessKey(stopId); we read
  // it on mount, swap the "Report an issue" link for a green confirmation
  // pill for 6s, then clear the key. Re-mounting the stop later doesn't
  // re-show the pill (the key is cleared once consumed).
  const [reportIssueSuccess, setReportIssueSuccess] = useState<
    | { workOrderNumber: string; assigneeName: string }
    | null
  >(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const raw = sessionStorage.getItem(reportIssueSuccessKey(stopId))
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.workOrderNumber && parsed?.assigneeName) {
        setReportIssueSuccess({
          workOrderNumber: String(parsed.workOrderNumber),
          assigneeName:    String(parsed.assigneeName),
        })
      }
    } catch {
      // bad JSON — ignore + drop the key
    }
    sessionStorage.removeItem(reportIssueSuccessKey(stopId))
  }, [stopId])
  useEffect(() => {
    if (!reportIssueSuccess) return
    const t = setTimeout(() => setReportIssueSuccess(null), 6000)
    return () => clearTimeout(t)
  }, [reportIssueSuccess])

  // AVA Remembers — prior notes count for this address. Tier 3 pill renders
  // when > 0; the entry surface below the action buttons swaps copy at the
  // same threshold. `noteRefreshKey` re-runs the count fetch after a save so
  // the surface updates without a page reload.
  const { user: authUser } = useAuthContext()
  const [avaNoteOpen,     setAvaNoteOpen]     = useState(false)
  const [avaNoteCount,    setAvaNoteCount]    = useState(0)
  const [avaNoteRefresh,  setAvaNoteRefresh]  = useState(0)
  // Pre-launch notes sheet — fires before Send-ETA or Navigate when the stop
  // has any note. Once-per-stop guard via a ref Set so it shows at most once
  // per stop per mount; resets naturally on unmount / route reload.
  const [preSheet, setPreSheet] = useState<{ sections: StopNotesSections; mode: 'eta' | 'navigate' } | null>(null)
  const seenNoteStopsRef = useRef<Set<string>>(new Set())
  const [orderNotesOpen, setOrderNotesOpen] = useState(false)
  const avaAddressKey = stop?.address_line_1
    ? normalizeAddressKey(stop.address_line_1)
    : ''
  useEffect(() => {
    if (!avaAddressKey) return
    let cancelled = false
    fetchTodayNotesHitCount([avaAddressKey]).then((distinct) => {
      if (cancelled) return
      // Bucket of 1 — distinct returns 0 or 1 since we passed a single key.
      // We just need to know "has any" for the surface gate.
      setAvaNoteCount(distinct)
    })
    return () => { cancelled = true }
  }, [avaAddressKey, avaNoteRefresh])

  useEffect(() => {
    if (stop) logEvent('STOP_VIEWED', routeId, stopId, stop.order_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId])

  // Auto-open dispatcher-note modal once per stop mount when the note
  // exists. Stop hydration is async via context, so this fires after
  // the stop loads. The ref guards against re-opening after the driver
  // dismisses within the same screen lifetime.
  useEffect(() => {
    if (!stop) return
    if (dispatcherNoteAutoShownRef.current) return
    if (stop.dispatcher_notes && stop.dispatcher_notes.trim().length > 0) {
      setShowDispatcherNoteModal(true)
      dispatcherNoteAutoShownRef.current = true
    }
  }, [stop])

  useEffect(() => {
    if (!navMessage) return
    const t = setTimeout(() => setNavMessage(null), 5000)
    return () => clearTimeout(t)
  }, [navMessage])

  useEffect(() => {
    if (!etaCooldownMsg) return
    const t = setTimeout(() => setEtaCooldownMsg(null), 4000)
    return () => clearTimeout(t)
  }, [etaCooldownMsg])

  useEffect(() => {
    async function rehydrate() {
      const status = await getStopSmsStatus(stopId)
      if (status && status.sms_status) {
        setSmsReply(status)
        setEtaStatus('sent')
        if (status.eta_range) setEtaRange(status.eta_range)
      }
      if (status && status.pod_photo_url) setPod({ status: 'uploaded', url: status.pod_photo_url })
    }
    rehydrate()
  }, [stopId])

  // Hydrate cash-collection state for COD delivery stops only.
  useEffect(() => {
    if (!stop || stop.payment_state !== 'cod' || stop.stop_type !== 'delivery') {
      setCashConfirmed(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/cash-collections?stop_id=${encodeURIComponent(stop.stop_id)}`)
        const j = await r.json()
        if (!cancelled) setCashConfirmed(!!j.exists)
      } catch {
        if (!cancelled) setCashConfirmed(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, stop?.payment_state, stop?.stop_type])

  useEffect(() => {
    if (etaStatus !== 'sent') {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
      return
    }
    async function poll() {
      const status = await getStopSmsStatus(stopId)
      if (status) setSmsReply(status)
    }
    poll()
    pollIntervalRef.current = setInterval(poll, 10_000)
    return () => { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null } }
  }, [etaStatus, stopId])

  // ── GPS Auto-Arrival (Phase 2.5C) ──────────────────────────────────────────
  // Arms a 150m geofence around the stop's coordinates while this screen is
  // mounted. Skipped for legacy `warehouse` mid-stops (no coords on the
  // synthetic row), already-arrived stops, and completed stops. The hook
  // is called unconditionally on every render so hook order stays stable —
  // `enabled` gates the actual watchPosition call.
  // `warehouse_return` stops (Migration 071) are INCLUDED: the depot is a
  // real coordinate, and arrival there marks the end of the route. See the
  // welcomeBackAtRef block below for the auto-complete side of the geofence.
  const geofenceEnabled =
    !!stop
    && (
      stop.stop_type === 'delivery'
      || stop.stop_type === 'pickup'
      || stop.stop_type === 'service'
      || stop.stop_type === 'warehouse_return'
    )
    && stop.latitude  != null
    && stop.longitude != null
    && !stop.arrived_at
    && stop.current_status !== 'completed'

  // "Welcome back — route complete" confirmation timestamp, set when the
  // warehouse_return geofence fires and the auto-complete POST succeeds.
  // Drives a brief inline banner below; cleared by the screen unmount.
  const [welcomeBackAt, setWelcomeBackAt] = useState<string | null>(null)
  useEffect(() => {
    if (!welcomeBackAt) return
    // Auto-logout Layer 1: warehouse_return geofence auto-complete ends the
    // route. After the 6s banner runs in full, sign out so the next driver
    // picking up the shared device lands on /login.
    const t = setTimeout(async () => {
      setWelcomeBackAt(null)
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ptr_session_date')
        }
        await signOut()
      } catch (err) {
        console.error('[autoLogout] signOut after warehouse_return failed', err)
      }
      router.replace('/login')
    }, 6000)
    return () => clearTimeout(t)
  }, [welcomeBackAt, router])

  useArrivalGeofence({
    stopId,
    latitude:  stop?.latitude,
    longitude: stop?.longitude,
    enabled:   geofenceEnabled,
    onArrive:  async (arrivedAt) => {
      markArrived(stopId, arrivedAt)
      // warehouse_return is the only stop type where arrival === completion.
      // Fire /api/complete-stop right after the geofence stamp so the
      // dashboard's realtime toast surfaces immediately without waiting
      // for the driver to tap Mark Complete. Idempotent — repeating the
      // POST against an already-completed stop is harmless.
      if (stop?.stop_type === 'warehouse_return') {
        try {
          const r = await fetch('/api/complete-stop', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ stop_id: stopId }),
          })
          if (r.ok) {
            const completedAt = new Date().toISOString()
            markComplete(stopId, completedAt)
            setWelcomeBackAt(completedAt)
          }
        } catch {
          // Network blip — driver can still tap the manual Mark Complete
          // fallback in the action card below. No-op here.
        }
      }
    },
  })

  // ── Standby tick ──────────────────────────────────────────────────────────
  // Drives the live countdown when the driver has arrived early at a pickup
  // stop. Only runs while standby could conceivably be showing — once the
  // pickup window has opened we tear the interval down on the next tick.
  const pickupWindow = stop ? effectiveWindow(stop) : null
  const pickupOpensAt =
    stop && stop.stop_type === 'pickup' && stop.arrived_at && !earlyOverride
      ? pickupWindow?.startsAt ?? null
      : null
  const isOnStandby =
    !!pickupOpensAt && new Date(pickupOpensAt).getTime() > now.getTime()

  // Pre-navigate gate: pickup, hard tier (verified / inferred / manual), not
  // yet open, and the driver hasn't already chosen to override this session.
  // Suggested tier never gates — the badge alone is the awareness surface.
  // `pickupWindowStart` + `minutesEarly` are also consumed by the modal's
  // message; `now` is recomputed at the click moment in handleNavigateRequest
  // so the displayed minutes stay fresh.
  const pickupWindowStart = pickupWindow?.startsAt ?? null
  const minutesEarly = pickupWindowStart
    ? Math.max(0, Math.round((new Date(pickupWindowStart).getTime() - now.getTime()) / 60_000))
    : 0

  useEffect(() => {
    if (!pickupOpensAt) return
    // Stop ticking once the window opens — no need to spin every second after.
    if (new Date(pickupOpensAt).getTime() <= Date.now()) return
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [pickupOpensAt])

  function persistEarlyOverride(source: 'standby' | 'navigate_gate') {
    setEarlyOverride(true)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(earlyOverrideKey(stopId), '1')
    }
    const startIso = pickupOpensAt ?? pickupWindowStart ?? null
    logEvent('NAVIGATION_STARTED', routeId, stopId, stop?.order_id, {
      early_pickup_override: true,
      override_source:       source,
      pickup_opens_at:       startIso,
      minutes_early:         startIso
        ? Math.max(0, Math.round((new Date(startIso).getTime() - Date.now()) / 60_000))
        : null,
    })
  }

  function handleDismissStandby() {
    persistEarlyOverride('standby')
  }

  // ── Stop not found ──────────────────────────────────────────────────────────
  if (!stop || !route) {
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
              Stop not found
            </div>
            <div style={{
              marginTop: 6, fontSize: 18, fontWeight: 900, color: C.ink,
              fontFamily: FONT_DISPLAY, lineHeight: 1.15, letterSpacing: '-0.02em',
            }}>
              We couldn&apos;t find this stop.
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              Go back to the route list and try again.
            </div>
            <button
              onClick={() => router.push(`/route/${routeId}`)}
              style={{
                marginTop: 14,
                background: C.ink, color: '#fff',
                padding: '10px 18px', borderRadius: 999,
                border: 0, cursor: 'pointer',
                fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
                letterSpacing: '0.02em',
              }}
            >
              Back to route
            </button>
          </div>
        </div>

        <BottomNav/>
      </div>
    )
  }

  const stopIndex = allStops.findIndex((s) => s.stop_id === stopId)
  const nextStop = allStops[stopIndex + 1] ?? null
  const isCompleted = stop.current_status === 'completed'
  const isOtwSent = stop.on_the_way_sent
  // Warehouse stops (Path A — synthetic depot returns from routes.break_blocks)
  // skip SMS / COD / POD / Mark-Stop-Complete per spec. The action card shows
  // a single Open-in-Maps button instead of the standard Mark/quick-actions stack.
  const isWarehouse = stop.stop_type === 'warehouse'
  // warehouse_return — the new auto-injected end-of-route depot stop
  // (dashboard Migration 070/071, Notion spec
  // 3690aa6451b881d6b00fcc9dc5c1890b). Real dispatch_stops row, gets
  // geofenced auto-completion at 150m around the depot, with a manual
  // Mark Complete fallback. Shares the no-SMS/no-COD/no-POD posture of
  // the legacy `warehouse` synthetic stop above.
  const isWarehouseReturn = stop.stop_type === 'warehouse_return'
  // Either one suppresses customer-facing UI (SMS, payment, POD).
  const isDepotStop = isWarehouse || isWarehouseReturn

  // TapGoods-synced order notes for the collapsible "Order Notes" section.
  // Only non-empty fields are shown; section hidden entirely when empty.
  const orderNotes: Array<{ label: string; text: string }> = [
    { label: 'Delivery instructions', text: stop.notes_additional_delivery ?? '' },
    { label: 'Staff note',            text: stop.notes_employee_authored ?? '' },
    { label: 'Flip / teardown note',  text: stop.notes_flip ?? '' },
    { label: 'Set-by time',           text: stop.notes_set_by_time ?? '' },
    { label: 'Strike time',           text: stop.notes_strike_time ?? '' },
  ].filter((n) => n.text.trim().length > 0)

  // Headline = venue/business if available, else customer name. Trailing period
  // applied in JSX so the period color can be toned independently if needed.
  const headlineName = (stop.company_name?.trim() || stop.customer_name).trim()
  const contactName  = stop.customer_name
  const contactPhone = (stop.customer_cell?.trim() || stop.customer_phone || '').trim()
  const initials     = getInitials(contactName)

  const heroAddress = [
    stop.address_line_1,
    [stop.city, stop.state].filter(Boolean).join(' '),
  ].filter((p) => p && p.trim().length > 0).join(' · ')

  const items = stop.items ?? []
  const etaSentTime     = stop.on_the_way_sent_at ? formatSentAt(stop.on_the_way_sent_at) : null
  const etaQuotedSnippet = etaRange ? `We're ${etaRange} out.` : null

  // Pre-navigate gate (Phase 4). Intercepts taps on the Navigate quick
  // action when the stop is a hard-tier pickup with an unopened window.
  // The gate is advisory — it surfaces the constraint and lets the driver
  // choose to wait or override. Override sticks for the session. We re-
  // evaluate against Date.now() here so the gate uses fresh time even
  // when the screen's `now` state hasn't ticked recently.
  async function handleNavigateRequest() {
    if (!stop || navLoading) return
    // Notes sheet is the OUTER gate. When it fires, its "Navigate Now" button
    // resumes the flow via proceedNavigateRequest (which still runs the
    // early-pickup gate). When there's nothing to show (or already seen this
    // stop), fall straight through to proceedNavigateRequest.
    const shown = await maybeShowPreSheet('navigate')
    if (shown) return
    proceedNavigateRequest()
  }

  function proceedNavigateRequest() {
    if (!stop || navLoading) return
    const nowMs = Date.now()
    const shouldGate =
      stop.stop_type === 'pickup'
      && isHardConstraintTier(stop.constraint_confidence)
      && !earlyOverride
      && !!pickupWindowStart
      && new Date(pickupWindowStart).getTime() > nowMs
    if (shouldGate) {
      setNow(new Date(nowMs))
      setShowEarlyPickupGate(true)
      return
    }
    void handleNavigate()
  }

  function handleConfirmEarlyNavigate() {
    setShowEarlyPickupGate(false)
    persistEarlyOverride('navigate_gate')
    void handleNavigate()
  }

  async function handleNavigate() {
    if (!stop || navLoading) return
    setNavLoading(true)
    logEvent('NAVIGATION_STARTED', routeId, stopId, stop.order_id, { address: `${stop.address_line_1}, ${stop.city}`, coordinates: stop.latitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })
    try {
      const result = await navigationService.navigateTo(stop)
      if (result.success) return
      logEvent('NAVIGATION_FAILED', routeId, stopId, stop.order_id, { attempted: result.attempted, message: result.message })

      // iOS fallback — silent (no toast). CoPilot may not be installed;
      // Apple Maps is always available. Try the maps:// scheme first; if the
      // page is still visible 1.5s later, the scheme didn't background us —
      // fall through to the maps.apple.com universal link.
      const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)
      if (isIOS) {
        const addr = encodeURIComponent(
          [stop.address_line_1, stop.city, stop.state, stop.postal_code]
            .filter(Boolean).join(', ')
        )
        window.location.href = `maps://?daddr=${addr}`
        setTimeout(() => {
          if (document.visibilityState === 'visible') {
            window.location.href = `https://maps.apple.com/?daddr=${addr}`
          }
        }, 1500)
        return
      }

      // Non-iOS: keep the existing inline-message behavior.
      if (result.message) setNavMessage(result.message)
    } finally { setNavLoading(false) }
  }

  // Shared completion path — POST /api/complete-stop, update local state,
  // log + refetch, navigate to next stop. Returns true on success.
  // Used by handleConfirmComplete (non-COD modal) and by both cash-modal
  // paths (collected / not_collected) after the cash POST resolves.
  async function runStopComplete(closeModal: () => void, setLoading: (b: boolean) => void): Promise<boolean> {
    if (!stop || !route) return false
    const completedAt = new Date().toISOString()
    try {
      const r = await fetch('/api/complete-stop', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stop_id: stop.stop_id }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.success) {
        setNavMessage(j?.error ?? 'Could not mark stop complete — try again')
        closeModal()
        setLoading(false)
        return false
      }
    } catch (err) {
      console.error('[runStopComplete] network error:', err)
      setNavMessage('Could not mark stop complete — check your connection')
      closeModal()
      setLoading(false)
      return false
    }

    markComplete(stop.stop_id, completedAt)
    logEvent('STOP_COMPLETED', routeId, stopId, stop.order_id, { completed_at: completedAt })

    // 5-second delay: dashboard cascade (realtime → recalculate →
    // writeCalculatedETAs → Supabase write) takes ~3–5s. Refetching sooner
    // reads stale calculated_eta values. Fire-and-forget — navigation
    // happens immediately; LOAD_SUCCESS lands later with the new ETAs.
    setTimeout(() => loadDay(route.operating_date, true), 5000)

    closeModal()
    setLoading(false)
    if (nextStop) { router.replace(`/route/${routeId}/stop/${nextStop.stop_id}`) } else { router.replace(`/route/${routeId}`) }
    return true
  }

  // Mark-Complete tap — for COD delivery stops with no cash record yet,
  // open the cash modal (which IS the confirmation). For every other case
  // (non-COD, pickup, warehouse, or COD where a row already exists), open
  // the standard yes/no confirmation modal.
  function handleMarkCompleteTap() {
    if (!stop) return
    const isCodDelivery = stop.payment_state === 'cod' && stop.stop_type === 'delivery'
    if (isCodDelivery && cashConfirmed === false) {
      // Reset modal form state on open so a previously aborted attempt
      // doesn't leak stale input.
      const prefill = typeof stop.balance_due_amount === 'number' && stop.balance_due_amount > 0
        ? stop.balance_due_amount.toFixed(2)
        : ''
      setCashAmountInput(prefill)
      setCashReasonInput('')
      setCashReasonVisible(false)
      setCashReasonError(null)
      setCashError(null)
      setShowCashModal(true)
      return
    }
    setShowCompleteModal(true)
  }

  async function handleConfirmComplete() {
    setCompleteLoading(true)
    await runStopComplete(() => setShowCompleteModal(false), setCompleteLoading)
  }

  // Cash modal — "Collected" path. Driver-editable amount (partial payments
  // happen in the field). POST first; only complete the stop if the cash row
  // landed.
  async function handleCashCollected() {
    if (!stop) return
    setCashError(null)

    let amount: number | null = null
    const trimmed = cashAmountInput.trim()
    if (trimmed.length > 0) {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        setCashError('Enter a valid amount.')
        return
      }
      amount = n
    }

    setCashSubmitting(true)
    try {
      const r = await fetch('/api/cash-collections', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          stop_id:          stop.stop_id,
          status:           'collected',
          amount_collected: amount,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.success) {
        setCashError(j?.error ?? 'Failed to confirm — try again')
        setCashSubmitting(false)
        return
      }
      setCashConfirmed(true)
    } catch (err) {
      setCashError(err instanceof Error ? err.message : 'Network error')
      setCashSubmitting(false)
      return
    }
    await runStopComplete(() => setShowCashModal(false), setCashSubmitting)
  }

  // Cash modal — "Could Not Collect" path. First tap expands the reason
  // textarea; second tap (with a non-empty reason) posts + completes.
  async function handleCashNotCollected() {
    if (!stop) return
    setCashError(null)

    if (!cashReasonVisible) {
      setCashReasonVisible(true)
      return
    }

    const reason = cashReasonInput.trim()
    if (reason.length === 0) {
      setCashReasonError('A reason is required to skip cash collection.')
      return
    }
    setCashReasonError(null)

    setCashSubmitting(true)
    try {
      const r = await fetch('/api/cash-collections', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          stop_id:              stop.stop_id,
          status:               'not_collected',
          not_collected_reason: reason,
        }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.success) {
        setCashError(j?.error ?? 'Failed to record — try again')
        setCashSubmitting(false)
        return
      }
      setCashConfirmed(true)
    } catch (err) {
      setCashError(err instanceof Error ? err.message : 'Network error')
      setCashSubmitting(false)
      return
    }
    await runStopComplete(() => setShowCashModal(false), setCashSubmitting)
  }

  async function handleOpenTapGoods() {
    if (!stop || tapGoodsLoading) return
    setTapGoodsLoading(true)
    const result = externalAppService.openTapGoodsOrder(stop.order_id)
    logEvent('TAPGOODS_ORDER_OPENED', routeId, stopId, stop.order_id, { url: result.url, success: result.success })
    setTimeout(() => setTapGoodsLoading(false), 600)
  }

  async function runEtaSend(): Promise<{ success: boolean; etaRange?: string; error?: string }> {
    if (!stop) return { success: false, error: 'No stop data' }
    const destination = stop.latitude != null && stop.longitude != null
      ? `${stop.latitude},${stop.longitude}`
      : [stop.address_line_1, stop.city, [stop.state, stop.postal_code].filter(Boolean).join(' ')]
          .filter((p) => p && p.trim().length > 0)
          .join(', ')
    const loc = await getDriverLocation()
    if (!loc) {
      logEvent('ETA_SMS_FAILED', routeId, stopId, stop.order_id, { error: 'no_gps' })
      return { success: false, error: 'Could not determine your location. Enable location services and try again.' }
    }
    // Prefer the explicit Mobile-typed cell number for SMS. Fall back to the
    // legacy customer_phone field (which may be a landline) only if no cell
    // is on file — preserves behavior on stops not yet re-synced.
    const smsTarget = stop.customer_cell?.trim() || stop.customer_phone
    // EtaSmsService's stopType arg is typed 'delivery' | 'pickup'. Coerce
    // anything that isn't 'pickup' → 'delivery'. Service historically squashed
    // to delivery; warehouse never reaches this path (Send ETA UI is hidden
    // for warehouse stops) but the union exhaustiveness check still demands it.
    const smsStopType: 'delivery' | 'pickup' = stop.stop_type === 'pickup' ? 'pickup' : 'delivery'
    const result = await sendEtaSms({ stopId: stop.stop_id, routeId, stopType: smsStopType, customerPhone: smsTarget, customerName: stop.customer_name, orderId: stop.order_id, driverLat: loc.lat, driverLng: loc.lng, destination })
    if (result.success) {
      logEvent('ETA_SMS_SENT', routeId, stopId, stop.order_id, { etaRange: result.etaRange })
      return { success: true, etaRange: result.etaRange }
    }
    logEvent('ETA_SMS_FAILED', routeId, stopId, stop.order_id, { error: result.error })
    return { success: false, error: result.error ?? 'Failed to send ETA text.' }
  }

  // Returns the assembled note sections for the current stop, or null if the
  // stop has no notes at all. notes_flip is pickup-only per spec.
  async function buildStopNoteSections(): Promise<StopNotesSections | null> {
    if (!stop) return null
    const timing = stop.notes_set_by_time?.trim() || stop.notes_strike_time?.trim() || null
    let avaText: string | null = null
    if (avaNoteCount > 0 && avaAddressKey) {
      const rows = await listNotesForAddress(avaAddressKey)
      avaText = rows[0]?.note?.trim() || null
    }
    const sections: StopNotesSections = {
      dispatcherNote: stop.dispatcher_notes?.trim() || null,
      warehouseNote:  stop.warehouse_notes?.trim() || null,
      deliveryInstr:  stop.notes_additional_delivery?.trim() || null,
      staffNote:      stop.notes_employee_authored?.trim() || null,
      flipNote:       stop.stop_type === 'pickup' ? (stop.notes_flip?.trim() || null) : null,
      timingNote:     timing,
      avaRemembers:   avaText,
    }
    const hasAny = Object.values(sections).some((v) => typeof v === 'string' && v.trim().length > 0)
    return hasAny ? sections : null
  }

  // Returns true if the sheet was shown (action should pause); false if there's
  // nothing to show or it's already been seen for this stop (action proceeds).
  async function maybeShowPreSheet(mode: 'eta' | 'navigate'): Promise<boolean> {
    if (!stop) return false
    if (seenNoteStopsRef.current.has(stop.stop_id)) return false
    const sections = await buildStopNoteSections()
    if (!sections) return false
    seenNoteStopsRef.current.add(stop.stop_id)
    setPreSheet({ sections, mode })
    return true
  }

  async function handleSendEtaRequest() {
    if (!stop || etaStatus === 'sending') return
    const shown = await maybeShowPreSheet('eta')
    if (!shown) void handleSendEta()
  }

  async function handleSendEta() {
    if (!stop || etaStatus === 'sending') return
    if (Date.now() < etaCooldownRef.current) { setEtaCooldownMsg('ETA text was just sent. Please wait a moment before resending.'); return }
    etaCooldownRef.current = Infinity
    setEtaStatus('sending'); setEtaError(null)
    const result = await runEtaSend()
    if (result.success) {
      const sent_at = new Date().toISOString()
      etaCooldownRef.current = Date.now() + 30_000
      // Send-ETA also flips the OTW flag so the green "Mark Arrived" state
      // takes effect. (Replaces the dedicated Send-OTW button removed in the
      // editorial redesign.)
      markOtw(stop.stop_id, sent_at)
      setEtaStatus('sent'); setEtaRange(result.etaRange ?? null)
    } else {
      etaCooldownRef.current = 0
      setEtaStatus('error'); setEtaError(result.error ?? 'Failed to send ETA text.')
    }
  }

  function handleTakePhotoTap() { photoInputRef.current?.click() }

  async function compressImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const MAX = 1200
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
          else { width = Math.round((width * MAX) / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.8)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (!stop) return
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPod({ status: 'uploading' })
    try {
      const compressed = await compressImage(file)
      const result = await photoUploadService.upload(compressed, stop.stop_id, routeId)
      if (result.success && result.url) { setPod({ status: 'uploaded', url: result.url }); logEvent('POD_PHOTO_UPLOADED', routeId, stopId, stop.order_id, { url: result.url }) }
      else { setPod({ status: 'failed', error: result.error }); logEvent('POD_PHOTO_FAILED', routeId, stopId, stop.order_id, { error: result.error }) }
    } catch (err) { const msg = String(err); setPod({ status: 'failed', error: msg }); logEvent('POD_PHOTO_FAILED', routeId, stopId, stop.order_id, { error: msg }) }
  }

  // ── ETA reply badge — preserved 5-state renderer from prior version ─────────
  function renderEtaReplyBadge() {
    if (etaStatus !== 'sent' || !smsReply) return null
    const { sms_status, customer_ready, customer_instructions, awaiting_instructions } = smsReply

    if (customer_ready || sms_status === 'customer_ready') {
      return (
        <div style={{
          marginTop: 12, background: C.ink, color: '#fff',
          borderRadius: 16, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,184,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <CheckIcon size={16} color={C.gold}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              color: C.gold, textTransform: 'uppercase',
            }}>
              Customer Ready
            </div>
            <div style={{ marginTop: 2, fontSize: 13.5, lineHeight: 1.35, color: '#fff' }}>
              {smsReply.customer_name ?? stop?.customer_name} confirmed ready for {stop?.stop_type === 'pickup' ? 'pickup' : stop?.stop_type === 'service' ? 'service' : 'delivery'}.
            </div>
          </div>
        </div>
      )
    }
    if (customer_instructions || sms_status === 'instructions_received') {
      return (
        <div style={{
          marginTop: 12, background: C.paper,
          border: `1.5px solid ${C.ink}`,
          borderLeft: `5px solid ${C.gold}`,
          borderRadius: 16, padding: '12px 14px',
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
            color: C.goldDeep, textTransform: 'uppercase',
          }}>
            Delivery Instructions
          </div>
          <div style={{
            marginTop: 6, fontSize: 14.5, fontWeight: 700, color: C.ink,
            lineHeight: 1.35, fontFamily: FONT_DISPLAY, letterSpacing: '-0.005em',
          }}>
            &ldquo;{customer_instructions}&rdquo;
          </div>
        </div>
      )
    }
    if (awaiting_instructions || sms_status === 'awaiting_instructions') {
      return (
        <div style={{
          marginTop: 12, background: C.paper,
          border: `1.5px solid ${C.ink}`,
          borderRadius: 16, padding: '12px 14px',
          boxShadow: `4px 4px 0 ${C.coral}`,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,90,60,0.12)',
            border: `1.5px solid ${C.coral}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: C.coral, fontWeight: 900, fontSize: 16, lineHeight: 1 }}>!</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              color: C.coral, textTransform: 'uppercase',
            }}>
              Customer Not There
            </div>
            <div style={{ marginTop: 2, fontSize: 13, color: C.ink, lineHeight: 1.4 }}>
              Waiting for delivery instructions…
            </div>
          </div>
        </div>
      )
    }
    if (sms_status === 'opted_out') {
      return (
        <div style={{
          marginTop: 12, background: C.off,
          borderRadius: 16, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: C.paper,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <BanIcon size={16} color={C.muted}/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
              color: C.muted, textTransform: 'uppercase',
            }}>
              Opted Out of SMS
            </div>
            <div style={{ marginTop: 2, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
              Customer has opted out of text messages.
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  // ── Inline pill messages (error / warning) ─────────────────────────────────
  function InlinePill({ tone, children }: { tone: 'coral' | 'amber' | 'muted'; children: ReactNode }) {
    const map = {
      coral:  { bg: 'rgba(255,90,60,0.10)',   border: 'rgba(255,90,60,0.45)',   color: C.coral },
      amber:  { bg: 'rgba(255,184,0,0.16)',   border: 'rgba(176,127,0,0.55)',   color: C.goldDeep },
      muted:  { bg: C.off,                    border: 'rgba(10,11,20,0.10)',    color: C.muted },
    }
    const t = map[tone]
    return (
      <p style={{
        margin: '8px 0 0', textAlign: 'center',
        fontSize: 12, fontWeight: 600, color: t.color,
        background: t.bg, border: `1px solid ${t.border}`,
        padding: '8px 12px', borderRadius: 12, lineHeight: 1.4,
      }}>
        {children}
      </p>
    )
  }

  // ── Quick-action tile inside the ActionCard 3-button grid ──────────────────
  function QuickAction({ icon, label, onClick, loading, disabled }: {
    icon: ReactNode; label: string; onClick: () => void; loading?: boolean; disabled?: boolean
  }) {
    const isDisabled = !!(disabled || loading)
    return (
      <button
        onClick={onClick}
        disabled={isDisabled}
        style={{
          background: C.paper,
          border: `1.5px solid rgba(10,11,20,0.12)`,
          borderRadius: 14,
          padding: '14px 6px 12px',
          cursor: isDisabled ? 'default' : 'pointer',
          opacity: isDisabled ? 0.55 : 1,
          fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          minHeight: 86,
          transition: 'opacity 120ms ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28,
        }} aria-hidden="true">
          {icon}
        </div>
        <span style={{
          fontSize: 11.5, fontWeight: 700, color: C.ink, lineHeight: 1.2,
          textAlign: 'center', letterSpacing: '-0.005em',
        }}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* hidden file input — opened by the POD Photo quick-action tile */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoSelected}
        aria-label="Take proof of delivery photo"
      />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '28px 22px 22px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* asymmetric gold star */}
        <svg
          aria-hidden="true"
          width={180} height={180} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -24, top: -18,
            opacity: 0.22,
            transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={C.gold}/>
        </svg>

        {/* Top row: back button + distance pill */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <button
            onClick={() => router.push(`/route/${routeId}`)}
            aria-label="Back to route"
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Distance pill — Phase-2 stub (no GPS this pass) */}
            <div
              aria-label="Distance to stop"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: C.ink, color: '#fff',
                padding: '7px 13px', borderRadius: 999,
                fontSize: 12, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: C.gold,
              }}/>
              — mi
            </div>
            <AvaChip/>
          </div>
        </div>

        {/* Eyebrow + headline + numbered circle */}
        <div style={{
          marginTop: 22, position: 'relative',
          display: 'flex', alignItems: 'flex-start', gap: 16,
        }}>
          <div style={{
            width: 58, height: 58, borderRadius: '50%',
            background: C.gold,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            fontFamily: FONT_DISPLAY,
            fontSize: 24, fontWeight: 900, color: C.ink,
            letterSpacing: '-0.02em',
          }}>
            {stop.stop_sequence}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
                color: C.gold, textTransform: 'uppercase',
                fontVariantNumeric: 'tabular-nums',
              }}>
                Stop {stop.stop_sequence} of {allStops.length}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 800, letterSpacing: '0.22em',
                color: C.gold, textTransform: 'uppercase',
                fontVariantNumeric: 'tabular-nums',
              }}>
                · {formatEta(stop.calculated_eta)}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: TYPE_PILL[stop.stop_type].bg,
                color:      TYPE_PILL[stop.stop_type].color,
                fontSize: 9.5, fontWeight: 900, letterSpacing: '0.18em',
                textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 999,
                flexShrink: 0,
              }}>
                {stop.stop_type}
              </span>
              {stop.arrived_at && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: C.green, color: '#fff',
                  fontSize: 9.5, fontWeight: 900, letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  padding: '3px 8px', borderRadius: 999,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  Arrived · {formatTime(stop.arrived_at)}
                </span>
              )}
            </div>
            <div style={{
              marginTop: 4,
              fontFamily: FONT_DISPLAY,
              fontSize: 24, fontWeight: 900,
              lineHeight: 1.0, letterSpacing: '-0.02em',
              color: '#fff',
              wordBreak: 'break-word',
            }}>
              {headlineName}.
            </div>
          </div>
        </div>

        {/* Address */}
        {heroAddress && (
          <div style={{
            marginTop: 12, fontSize: 13.5,
            color: 'rgba(255,255,255,0.78)', lineHeight: 1.4,
            position: 'relative',
          }}>
            {heroAddress}
          </div>
        )}

        {/* Time-window constraint badge (Phase 4). on-dark variant so the
            amber stays legible against the blue hero. */}
        {stop.constraint_confidence && (
          <div style={{ marginTop: 10 }}>
            <StopWindowBadge stop={stop} size="md" variant="on-dark" />
          </div>
        )}

        {/* AVA Remembers — Tier 3 presence. Only renders when there's a
            prior note for this address. Depot stops never surface notes. */}
        {!isDepotStop && avaNoteCount > 0 && (
          <button
            type="button"
            onClick={() => setAvaNoteOpen(true)}
            aria-label="AVA knows this stop — open notes"
            style={{
              marginTop: 10,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,184,0,0.14)',
              color: '#FFB800',
              border: '1px solid rgba(255,184,0,0.45)',
              borderLeft: '3px solid #FFB800',
              borderRadius: 10,
              padding: '6px 12px 6px 10px',
              fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18, height: 18, borderRadius: 4,
                background: C.blue,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                gap: 1.5, flexShrink: 0,
              }}
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="ava-wave-bar"
                  style={{
                    width: 1.5, height: 9,
                    background: '#fff', borderRadius: 1,
                    animationDelay: `${i * 120}ms`,
                  }}
                />
              ))}
            </span>
            AVA KNOWS THIS STOP
            <span aria-hidden="true" style={{ marginLeft: 2 }}>›</span>
          </button>
        )}

      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Customer card — moved out of the blue hero in the v2 compression
            pass. First card in the cream body so the contact + call CTA stay
            within thumb's reach above the fold. */}
        {contactName && (
          <div style={{ padding: '14px 18px 0' }}>
            <div style={{
              background: C.paper,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 16,
              padding: '14px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: C.off,
                color: C.ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_DISPLAY,
                fontSize: 14, fontWeight: 900, letterSpacing: '-0.01em',
                flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: C.ink, lineHeight: 1.2,
                  fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {contactName}
                </div>
                {contactPhone && (
                  <div style={{
                    marginTop: 2, fontSize: 12.5,
                    color: C.muted,
                    fontVariantNumeric: 'tabular-nums',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {contactPhone}
                  </div>
                )}
              </div>
              {contactPhone && (
                <a
                  href={`tel:${contactPhone}`}
                  aria-label={`Call ${contactName}`}
                  style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: C.gold,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, textDecoration: 'none',
                  }}
                >
                  <PhoneIcon size={18} color={C.ink}/>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Payment state cards — three exclusive states.
              cod          → black card, gold tile, "Collect $X on delivery"
              balance_due  → muted gray card, AR billing, no collection
              paid_in_full → green card, no collection
              other states (ar_customer, undefined) → no card */}
        {/* COD card gated on stop_type — the Supabase sync writes 'cod' to
            both legs of the order, but the pickup leg involves no cash. */}
        {stop.payment_state === 'cod' && stop.stop_type === 'delivery' && (
          <div style={{ padding: '16px 18px 0' }}>
            <div style={{
              background: C.ink,
              borderRadius: 18,
              padding: 14,
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 14px 28px -16px rgba(10,11,20,0.55)',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: C.gold,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CashIcon size={20} color={C.ink}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  color: C.gold, textTransform: 'uppercase',
                }}>
                  Cash Required
                </div>
                <div style={{
                  marginTop: 2, fontSize: 15, fontWeight: 800, color: '#fff',
                  fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                }}>
                  {typeof stop.balance_due_amount === 'number' && stop.balance_due_amount > 0
                    ? `Collect ${formatUSD(stop.balance_due_amount)} on delivery`
                    : 'Collect on delivery'}
                </div>
              </div>
            </div>
            {/* No standalone "Confirm Cash" button — cash confirmation is
                gated through Mark Stop Complete (the cash modal IS the
                completion confirmation for COD delivery stops). */}
          </div>
        )}

        {stop.payment_state === 'balance_due' && (
          <div style={{ padding: '16px 18px 0' }}>
            <div style={{
              background: C.off,
              border: `1px solid rgba(10,11,20,0.10)`,
              borderRadius: 18,
              padding: 14,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: C.paper,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <DocIcon size={20} color={C.muted}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  color: C.muted, textTransform: 'uppercase',
                }}>
                  Balance Due
                </div>
                <div style={{
                  marginTop: 2, fontSize: 15, fontWeight: 800, color: C.ink,
                  fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                }}>
                  Billed to customer account
                </div>
              </div>
            </div>
          </div>
        )}

        {stop.payment_state === 'paid_in_full' && (
          <div style={{ padding: '16px 18px 0' }}>
            <div style={{
              background: C.green,
              borderRadius: 18,
              padding: 14,
              display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 14px 28px -16px rgba(31,191,107,0.45)',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 11,
                background: C.paper,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CheckIcon size={20} color={C.green}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  color: '#fff', textTransform: 'uppercase',
                }}>
                  Paid in Full
                </div>
                <div style={{
                  marginTop: 2, fontSize: 15, fontWeight: 800, color: '#fff',
                  fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                }}>
                  No collection needed
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completed state — Delivered card replaces ETA + ActionCard */}
        {isCompleted ? (
          <div style={{ padding: '16px 18px 0' }}>
            <div style={{
              background: C.ink,
              borderRadius: 18,
              padding: 16,
              display: 'flex', alignItems: 'center', gap: 14,
              borderLeft: `5px solid ${C.green}`,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(31,191,107,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <CheckIcon size={18} color={C.green}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  color: C.green, textTransform: 'uppercase',
                }}>
                  Delivered
                </div>
                <div style={{
                  marginTop: 2, fontSize: 14.5, fontWeight: 700, color: '#fff',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {stop.completed_at ? formatTime(stop.completed_at) : 'Marked complete'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ETA / SMS block — hidden for any depot stop (warehouse reload
                + warehouse_return) since there's no customer to text. */}
            {!isDepotStop && (
            <div style={{ padding: '16px 18px 0' }}>
              {etaStatus === 'sent' ? (
                <>
                  {/* Gold status pill */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: C.gold, color: C.ink,
                    padding: '7px 13px', borderRadius: 999,
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.ink }}/>
                    ETA Sent · Awaiting Reply
                  </div>

                  {/* Awaiting confirmation card */}
                  <div style={{
                    marginTop: 10,
                    background: C.paper,
                    border: `1.5px solid ${C.ink}`,
                    borderRadius: 18,
                    padding: '14px 16px',
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: C.off,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }} aria-hidden="true">
                      <ChatIcon size={18} color={C.muted}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 800, color: C.ink, lineHeight: 1.3,
                        fontFamily: FONT_DISPLAY, letterSpacing: '-0.005em',
                      }}>
                        Awaiting customer confirmation…
                      </div>
                      {(etaSentTime || etaQuotedSnippet) && (
                        <div style={{
                          marginTop: 4, fontSize: 12.5, color: C.muted, lineHeight: 1.4,
                        }}>
                          {etaSentTime && <>Sent {etaSentTime}</>}
                          {etaSentTime && etaQuotedSnippet && <> — </>}
                          {etaQuotedSnippet && (
                            <span style={{ color: C.ink, fontWeight: 600 }}>
                              &ldquo;{etaQuotedSnippet}&rdquo;
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5-state reply badge — preserved */}
                  {renderEtaReplyBadge()}

                  {etaCooldownMsg && <InlinePill tone="amber">{etaCooldownMsg}</InlinePill>}
                </>
              ) : (
                <>
                  {/* Send ETA Text — small gold pill button when idle/sending/error */}
                  <button
                    onClick={handleSendEtaRequest}
                    disabled={etaStatus === 'sending'}
                    style={{
                      width: '100%', height: 50, borderRadius: 999,
                      background: C.gold, color: C.ink,
                      border: 0,
                      cursor: etaStatus === 'sending' ? 'default' : 'pointer',
                      opacity: etaStatus === 'sending' ? 0.65 : 1,
                      fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      letterSpacing: '0.02em',
                      boxShadow: '0 10px 22px -10px rgba(255,184,0,0.55)',
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    <ClockIcon size={16} color={C.ink}/>
                    {etaStatus === 'sending' ? 'Sending ETA…' : 'Send ETA Text'}
                  </button>
                  {etaStatus === 'error' && etaError && <InlinePill tone="coral">{etaError}</InlinePill>}
                  {etaCooldownMsg && <InlinePill tone="amber">{etaCooldownMsg}</InlinePill>}
                </>
              )}
            </div>
            )}

            {/* Note from dispatch — persistent "View note" link card. Always
                visible when dispatcher_notes exists; auto-opens once on stop
                mount (see useEffect above) and stays here so the driver can
                re-open the modal any time. Solid blue border distinguishes
                it from the dashed gold TapGoods notes card below. */}
            {stop.dispatcher_notes && stop.dispatcher_notes.trim().length > 0 && (
              <div style={{ padding: '14px 18px 0' }}>
                <button
                  onClick={() => setShowDispatcherNoteModal(true)}
                  style={{
                    width: '100%',
                    background: C.paper,
                    border: `1.5px solid ${C.blue}`,
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex', gap: 10, alignItems: 'center',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  aria-label="View note from dispatch"
                >
                  <div style={{
                    width: 24, height: 24, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} aria-hidden="true">
                    <NoteIcon size={18} color={C.blue}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                      color: C.blue, textTransform: 'uppercase',
                    }}>
                      Note from dispatch
                    </div>
                    <div style={{
                      marginTop: 4, fontSize: 13, color: C.ink, lineHeight: 1.4,
                      fontWeight: 600,
                    }}>
                      Tap to view
                    </div>
                  </div>
                  <ArrowIcon size={16} color={C.blue}/>
                </button>
              </div>
            )}

            {/* FROM WAREHOUSE — warehouse_notes (dashboard Migration 077). Same
                solid-blue card pattern as "Note from dispatch" above, shown
                inline (no modal). Internal note from the warehouse team. */}
            {stop.warehouse_notes && stop.warehouse_notes.trim().length > 0 && (
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{
                  width: '100%',
                  background: C.paper,
                  border: `1.5px solid ${C.blue}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 24, height: 24, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} aria-hidden="true">
                    <NoteIcon size={18} color={C.blue}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                      color: C.blue, textTransform: 'uppercase',
                    }}>
                      From warehouse
                    </div>
                    <div style={{
                      marginTop: 4, fontSize: 13.5, color: C.ink, lineHeight: 1.45,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {stop.warehouse_notes}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes — dashed-border card, only when notes exist */}
            {stop.notes && stop.notes.trim().length > 0 && (
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{
                  background: C.paper,
                  border: `1.5px dashed ${C.muted}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 24, height: 24, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} aria-hidden="true">
                    <NoteIcon size={18} color={C.goldDeep}/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                      color: C.goldDeep, textTransform: 'uppercase',
                    }}>
                      Notes
                    </div>
                    <div style={{
                      marginTop: 4, fontSize: 13.5, color: C.ink, lineHeight: 1.45,
                      fontStyle: 'italic',
                    }}>
                      {stop.notes}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* POD preview — appears above ActionCard when uploaded */}
            {pod.status === 'uploaded' && pod.url && (
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{
                  background: C.paper,
                  border: `1.5px solid ${C.ink}`,
                  borderRadius: 18,
                  overflow: 'hidden',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pod.url}
                    alt="Proof of delivery"
                    style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }}
                  />
                  <div style={{
                    background: C.gold,
                    padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <CheckIcon size={16} color={C.ink}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                        color: C.goldDeep, textTransform: 'uppercase',
                      }}>
                        Photo Uploaded
                      </div>
                      <div style={{ marginTop: 1, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
                        Proof of delivery saved.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {pod.status === 'uploading' && (
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{
                  background: C.paper,
                  border: `1.5px solid rgba(10,11,20,0.12)`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontSize: 13, color: C.muted,
                }}>
                  <div style={{
                    width: 18, height: 18,
                    border: '2px solid rgba(10,11,20,0.15)',
                    borderTopColor: C.ink,
                    borderRadius: '50%',
                    animation: 'sd-spin 0.9s linear infinite',
                  }}/>
                  Uploading photo…
                  <style>{`@keyframes sd-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              </div>
            )}
            {pod.status === 'failed' && (
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{
                  background: C.paper,
                  border: `1.5px solid ${C.coral}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  boxShadow: `4px 4px 0 ${C.coral}`,
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(255,90,60,0.12)',
                    border: `1.5px solid ${C.coral}`,
                    color: C.coral,
                    fontWeight: 900, fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }} aria-hidden="true">!</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                      color: C.coral, textTransform: 'uppercase',
                    }}>
                      Upload Failed
                    </div>
                    {pod.error && (
                      <div style={{ marginTop: 2, fontSize: 12, color: C.muted }}>
                        {pod.error}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STANDBY CARD — appears when the driver has arrived early at a
                pickup stop and the window hasn't opened yet. Replaces the
                normal action card until the window opens or the driver
                dismisses with "Navigate anyway". */}
            {isOnStandby && pickupOpensAt ? (
              <div style={{ padding: '16px 18px 0' }}>
                <div style={{
                  background: C.paper,
                  border: `1.5px solid ${C.ink}`,
                  borderRadius: 22,
                  padding: '18px 18px 16px',
                  boxShadow: `5px 5px 0 ${C.gold}`,
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 900,
                    letterSpacing: '0.22em', color: C.goldDeep,
                    textTransform: 'uppercase',
                  }}>
                    On Standby
                  </div>
                  <div style={{
                    marginTop: 6,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 22, fontWeight: 900,
                    color: C.ink, lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                  }}>
                    You&apos;re early — pickup opens at {formatLocalClock(pickupOpensAt)}
                  </div>
                  <div style={{
                    marginTop: 14,
                    fontFamily: FONT_DISPLAY,
                    fontSize: 44, fontWeight: 900,
                    color: C.ink, lineHeight: 1.0,
                    letterSpacing: '-0.03em',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {formatCountdown(pickupOpensAt, now)}
                  </div>
                  <div style={{
                    marginTop: 6, fontSize: 11.5,
                    color: C.muted, letterSpacing: '0.04em',
                    textTransform: 'uppercase', fontWeight: 700,
                  }}>
                    until pickup window opens
                  </div>
                  <button
                    onClick={handleDismissStandby}
                    style={{
                      marginTop: 18,
                      width: '100%', height: 52, borderRadius: 999,
                      background: C.ink, color: '#fff',
                      border: 0, cursor: 'pointer',
                      fontSize: 14, fontWeight: 900, fontFamily: FONT_DISPLAY,
                      letterSpacing: '0.02em',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                  >
                    <NavigateIcon size={16} color={C.gold} />
                    Navigate anyway
                  </button>
                </div>
              </div>
            ) : (

            /* ACTION CARD — Mark Arrived + 3 quick actions */
            <div style={{ padding: '16px 18px 0' }}>
              <div style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 22,
                padding: 14,
                boxShadow: `5px 5px 0 ${C.ink}`,
              }}>
                {isWarehouseReturn ? (
                  // warehouse_return — the spec's "active prompt" surface:
                  // a top message line ("Head back to the warehouse — your
                  // day is done"), the big gold Navigate CTA, and a smaller
                  // Mark Complete fallback below. ETA is the calculated_eta
                  // cascade value (already shown in the stop hero), so we
                  // don't repeat it here. Geofence at the depot auto-fires
                  // /api/complete-stop on arrival; the fallback is for cases
                  // where GPS drift prevents the auto-fire from landing.
                  <>
                    <div
                      style={{
                        fontFamily:    FONT_DISPLAY,
                        fontSize:      15,
                        fontWeight:    800,
                        letterSpacing: '-0.01em',
                        color:         C.ink,
                        marginBottom:  12,
                        textAlign:     'center',
                      }}
                    >
                      Head back to the warehouse — your day is done.
                    </div>
                    <button
                      onClick={handleNavigate}
                      disabled={navLoading}
                      style={{
                        width: '100%', height: 60, borderRadius: 999,
                        background: C.gold, color: C.ink,
                        border: 0, cursor: navLoading ? 'default' : 'pointer',
                        fontSize: 16, fontWeight: 900, fontFamily: FONT_DISPLAY,
                        letterSpacing: '-0.01em',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0 8px 0 22px',
                        boxShadow: '0 14px 30px -10px rgba(255,184,0,0.55)',
                        opacity: navLoading ? 0.65 : 1,
                        transition: 'opacity 120ms ease',
                      }}
                    >
                      <span>{navLoading ? 'Opening…' : 'Navigate to Warehouse'}</span>
                      <span style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: C.ink,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <NavigateIcon size={18} color={C.gold}/>
                      </span>
                    </button>
                    <button
                      onClick={handleMarkCompleteTap}
                      style={{
                        marginTop: 10,
                        width: '100%', height: 40, borderRadius: 999,
                        background: 'transparent', color: C.ink,
                        border: `1.5px solid ${C.ink}`, cursor: 'pointer',
                        fontSize: 13, fontWeight: 800, fontFamily: FONT_DISPLAY,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      Mark Complete
                    </button>
                    {welcomeBackAt && (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{
                          marginTop:     12,
                          padding:       '10px 12px',
                          borderRadius:  10,
                          background:    C.green,
                          color:         C.ink,
                          fontFamily:    FONT_DISPLAY,
                          fontSize:      13,
                          fontWeight:    800,
                          letterSpacing: '-0.01em',
                          textAlign:     'center',
                        }}
                      >
                        Welcome back — route complete
                      </div>
                    )}
                  </>
                ) : isWarehouse ? (
                  // Warehouse (legacy synthetic break-block) — navigate-to-depot
                  // only. No Mark Stop Complete (Decision 1A), no SMS, no POD;
                  // the prominent CTA matches the Mark button's geometry/shadow
                  // for visual consistency.
                  <button
                    onClick={handleNavigate}
                    disabled={navLoading}
                    style={{
                      width: '100%', height: 60, borderRadius: 999,
                      background: C.gold, color: C.ink,
                      border: 0, cursor: navLoading ? 'default' : 'pointer',
                      fontSize: 16, fontWeight: 900, fontFamily: FONT_DISPLAY,
                      letterSpacing: '-0.01em',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0 8px 0 22px',
                      boxShadow: '0 14px 30px -10px rgba(255,184,0,0.55)',
                      opacity: navLoading ? 0.65 : 1,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    <span>{navLoading ? 'Opening…' : 'Open in Maps'}</span>
                    <span style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: C.ink,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <NavigateIcon size={18} color={C.gold}/>
                    </span>
                  </button>
                ) : (
                <>
                {/* Mark Arrived — gold (pending) or green (otw_sent) */}
                <button
                  onClick={handleMarkCompleteTap}
                  style={{
                    width: '100%', height: 60, borderRadius: 999,
                    background: isOtwSent ? C.green : C.gold,
                    color: C.ink,
                    border: 0, cursor: 'pointer',
                    fontSize: 16, fontWeight: 900, fontFamily: FONT_DISPLAY,
                    letterSpacing: '-0.01em',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 8px 0 22px',
                    boxShadow: isOtwSent
                      ? '0 14px 30px -10px rgba(31,191,107,0.55)'
                      : '0 14px 30px -10px rgba(255,184,0,0.55)',
                    transition: 'background 160ms ease',
                  }}
                >
                  <span>Mark Stop Complete</span>
                  <span style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: C.ink,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <ArrowIcon size={18} color={isOtwSent ? C.green : C.gold}/>
                  </span>
                </button>

                {/* 3-button grid */}
                <div style={{
                  marginTop: 12,
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                }}>
                  <QuickAction
                    icon={<NavigateIcon size={22} color={C.ink}/>}
                    label={navLoading ? 'Opening…' : 'Open in Maps'}
                    onClick={handleNavigateRequest}
                    loading={navLoading}
                  />
                  <QuickAction
                    icon={<DocIcon size={22} color={C.ink}/>}
                    label={tapGoodsLoading ? 'Opening…' : 'View Order'}
                    onClick={handleOpenTapGoods}
                    loading={tapGoodsLoading}
                    disabled={!stop.order_id}
                  />
                  <QuickAction
                    icon={<CameraIcon size={22} color={C.ink}/>}
                    label={
                      pod.status === 'uploading'
                        ? 'Uploading…'
                        : pod.status === 'uploaded'
                          ? 'Retake Photo'
                          : pod.status === 'failed'
                            ? 'Retry Photo'
                            : 'POD Photo'
                    }
                    onClick={handleTakePhotoTap}
                    loading={pod.status === 'uploading'}
                  />
                </div>

                {/* Report an issue — subtle red-bordered link below the
                    QuickAction grid. After submit, ReportIssueScreen stashes
                    a sessionStorage success record keyed on stopId; the
                    mount-time effect above swaps this link for a 6 s green
                    confirmation pill, then clears the key. */}
                {reportIssueSuccess ? (
                  <div
                    role="status"
                    aria-live="polite"
                    style={{
                      marginTop: 12,
                      background: 'rgba(31,191,107,0.10)',
                      border: `1px solid rgba(31,191,107,0.45)`,
                      borderRadius: 12,
                      padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13, fontWeight: 700, color: C.green,
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: C.green,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12l5 5L20 6"/>
                      </svg>
                    </span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {reportIssueSuccess.workOrderNumber} · {reportIssueSuccess.assigneeName} notified
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push(`/route/${routeId}/stop/${stopId}/report-issue`)}
                    style={{
                      marginTop: 12,
                      width: '100%',
                      background: 'transparent',
                      border: `1px solid rgba(255,90,60,0.45)`,
                      borderRadius: 12,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 13, fontWeight: 700, color: C.coral,
                      letterSpacing: '0.01em',
                    }}
                    aria-label="Report an issue with this order"
                  >
                    <span>Report an issue with this order</span>
                    <span style={{ fontSize: 16, lineHeight: 1, opacity: 0.85 }}>›</span>
                  </button>
                )}

                </>
                )}
              </div>

              {navMessage && <InlinePill tone="muted">{navMessage}</InlinePill>}
            </div>
            )}
          </>
        )}

        {/* STOP WEATHER (Phase 2B) — gated on flag, lat/lng, and non-warehouse */}
        {HAS_STOP_LEVEL_BADGES
          && stop.stop_type !== 'warehouse'
          && stop.latitude  != null
          && stop.longitude != null && (
          <StopWeatherModule lat={stop.latitude} lng={stop.longitude} />
        )}

        {/* MANIFEST */}
        {items.length > 0 && (
          <>
            <div style={{
              padding: '24px 22px 10px',
              fontFamily: FONT_DISPLAY,
              fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: C.muted,
            }}>
              Manifest · {items.length} item{items.length === 1 ? '' : 's'}
            </div>
            <div style={{ padding: '0 18px' }}>
              <div style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 18,
                overflow: 'hidden',
              }}>
                {items.map((item, i) => {
                  const name = (item.name ?? '').trim() || '—'
                  const sub  = item.category ? sentenceCase(item.category) : null
                  const qty  = item.qty ?? 1
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '14px 16px',
                        borderTop: i > 0 ? '1px solid rgba(10,11,20,0.10)' : 0,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 800, color: C.ink, lineHeight: 1.3,
                          letterSpacing: '-0.005em',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {name}
                        </div>
                        {sub && (
                          <div style={{
                            marginTop: 2, fontSize: 12.5, color: C.muted, lineHeight: 1.35,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {sub}
                          </div>
                        )}
                      </div>
                      <div style={{
                        background: C.ink, color: '#fff',
                        padding: '5px 11px', borderRadius: 999,
                        fontSize: 12, fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.005em',
                        flexShrink: 0,
                        marginTop: 1,
                      }}>
                        ×{qty}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Order Notes — TapGoods-synced notes for this order. Collapsed by
            default; hidden entirely when there are none or on depot stops. The
            blue "Note from dispatch" surfaces above are separate and stay. */}
        {!isDepotStop && orderNotes.length > 0 && (
          <div style={{ padding: '14px 18px 0' }}>
            <button
              type="button"
              onClick={() => setOrderNotesOpen((v) => !v)}
              aria-expanded={orderNotesOpen}
              style={{
                width: '100%', textAlign: 'left',
                background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 14,
                padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              }}
            >
              <div style={{
                fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                color: C.ink, textTransform: 'uppercase',
              }}>
                Order Notes ({orderNotes.length})
              </div>
              <span aria-hidden="true" style={{
                fontSize: 14, color: C.muted,
                transform: orderNotesOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease',
              }}>›</span>
            </button>
            {orderNotesOpen && (
              <div style={{
                marginTop: 8, padding: '12px 14px',
                background: C.off, borderRadius: 12,
              }}>
                {orderNotes.map((n, i) => (
                  <div key={n.label} style={{ marginTop: i === 0 ? 0 : 14 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 900, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: C.muted, marginBottom: 4,
                    }}>
                      {n.label}
                    </div>
                    <div style={{
                      fontSize: 14, lineHeight: 1.45, color: C.ink,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {n.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AVA Remembers — entry surface, rendered below the manifest so it
            survives all stop states (completed, on-standby, depot is the only
            excluded class). Amber button when a note exists for this address;
            dashed faint link otherwise. Tap opens the AvaNoteSheet. Tier 3
            hero pill above (top of the screen) is the separate high-prominence
            presence signal — both surfaces share the same setAvaNoteOpen
            handler and the same avaNoteCount source. */}
        {!isDepotStop && (
          <div style={{ padding: '14px 18px 0' }}>
            {avaNoteCount > 0 ? (
              <button
                type="button"
                onClick={() => setAvaNoteOpen(true)}
                style={{
                  width: '100%',
                  background: 'rgba(255,184,0,0.10)',
                  border: '1px solid rgba(255,184,0,0.45)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 13, fontWeight: 700, color: C.gold,
                  letterSpacing: '0.01em',
                }}
                aria-label="AVA has a note about this stop"
              >
                <span>AVA has a note about this stop</span>
                <span style={{ fontSize: 16, lineHeight: 1, opacity: 0.85 }}>›</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAvaNoteOpen(true)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: '1px dashed rgba(10,11,20,0.20)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12.5, fontWeight: 600,
                  color: C.muted,
                  letterSpacing: '0.01em',
                }}
                aria-label="Leave a note for the next driver"
              >
                <span>Leave a note for the next driver</span>
                <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>›</span>
              </button>
            )}
          </div>
        )}
      </div>

      <BottomNav/>

      {showCompleteModal && (
        <ConfirmationModal
          title="Mark Stop Complete?"
          message={nextStop
            ? `Confirm delivery completed at ${stop.customer_name}. You'll be taken to Stop ${nextStop.stop_sequence} next.`
            : `Confirm delivery completed at ${stop.customer_name}. This is the last stop — you'll return to the route list.`}
          confirmLabel="Mark Complete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmComplete}
          onCancel={() => setShowCompleteModal(false)}
          isLoading={completeLoading}
        />
      )}

      {showEarlyPickupGate && pickupWindowStart && (
        <ConfirmationModal
          title="Too early for pickup"
          message={`This stop can't be picked up until ${formatLocalClock(pickupWindowStart)}. You're ${minutesEarly} min early.`}
          confirmLabel="Navigate anyway"
          cancelLabel="I'll wait"
          onConfirm={handleConfirmEarlyNavigate}
          onCancel={() => setShowEarlyPickupGate(false)}
        />
      )}

      {preSheet && stop && (
        <StopNotesPreSheet
          customerName={stop.customer_name}
          sections={preSheet.sections}
          ctaLabel={preSheet.mode === 'navigate' ? 'Got it — Navigate Now' : 'Got it'}
          onProceed={() => {
            const mode = preSheet.mode
            setPreSheet(null)
            if (mode === 'navigate') proceedNavigateRequest()
            else                     void handleSendEta()
          }}
        />
      )}

      {showCashModal && stop && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(10,11,20,0.80)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !cashSubmitting && setShowCashModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cash-modal-title"
        >
          <div
            style={{
              width: '100%', maxWidth: 384,
              background: '#fff', borderRadius: 16, padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="cash-modal-title"
              style={{
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20,
                color: C.ink, margin: 0, marginBottom: 4,
                letterSpacing: '-0.01em',
              }}
            >
              Cash Collection
            </h2>
            <p
              style={{
                fontFamily: FONT_BODY, fontSize: 13.5, color: C.muted,
                lineHeight: 1.5, margin: 0, marginBottom: 16,
              }}
            >
              Confirm cash collected from {stop.customer_name} before completing this stop.
            </p>

            {/* Amount input — editable; pre-filled from balance_due_amount */}
            <label
              htmlFor="cash-amount-input"
              style={{
                display: 'block',
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 11,
                letterSpacing: '0.18em', textTransform: 'uppercase',
                color: C.muted, marginBottom: 6,
              }}
            >
              Amount Collected
            </label>
            <div
              style={{
                display: 'flex', alignItems: 'center',
                border: `1.5px solid ${C.ink}`, borderRadius: 12,
                padding: '0 14px', marginBottom: 16,
                background: '#fff',
              }}
            >
              <span style={{
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18,
                color: C.muted, marginRight: 6,
              }}>
                $
              </span>
              <input
                id="cash-amount-input"
                type="text"
                inputMode="decimal"
                value={cashAmountInput}
                onChange={(e) => {
                  // Permissive: allow digits + one dot. Validation runs on submit.
                  const v = e.target.value.replace(/[^0-9.]/g, '')
                  setCashAmountInput(v)
                  setCashError(null)
                }}
                disabled={cashSubmitting}
                placeholder="0.00"
                style={{
                  flex: 1,
                  padding: '14px 0',
                  border: 'none',
                  outline: 'none',
                  fontFamily: FONT_DISPLAY,
                  fontSize: 18, fontWeight: 800, color: C.ink,
                  letterSpacing: '-0.01em',
                  background: 'transparent',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 0,
                }}
              />
            </div>

            {/* Reason textarea — collapsed by default; expands on first
                "Could Not Collect" tap. Required to submit the uncollected path. */}
            {cashReasonVisible && (
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="cash-reason-input"
                  style={{
                    display: 'block',
                    fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 11,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    color: C.muted, marginBottom: 6,
                  }}
                >
                  Reason — Required
                </label>
                <textarea
                  id="cash-reason-input"
                  value={cashReasonInput}
                  onChange={(e) => {
                    setCashReasonInput(e.target.value)
                    if (cashReasonError) setCashReasonError(null)
                  }}
                  disabled={cashSubmitting}
                  placeholder="e.g. Customer not on site — promised to call dispatch"
                  rows={3}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 14px',
                    border: `1.5px solid ${cashReasonError ? C.coral : C.ink}`,
                    borderRadius: 12,
                    fontFamily: FONT_BODY, fontSize: 14, color: C.ink,
                    lineHeight: 1.45,
                    resize: 'vertical',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
                {cashReasonError && (
                  <div style={{
                    marginTop: 6,
                    fontFamily: FONT_BODY, fontSize: 12.5, color: C.coral,
                  }}>
                    {cashReasonError}
                  </div>
                )}
              </div>
            )}

            {cashError && (
              <div
                style={{
                  marginBottom: 16, padding: '10px 12px',
                  background: '#FEECEA', color: C.coral, borderRadius: 10,
                  fontSize: 13, fontFamily: FONT_BODY,
                }}
              >
                {cashError}
              </div>
            )}

            {/* Primary action — Collected (gold) */}
            <button
              onClick={handleCashCollected}
              disabled={cashSubmitting}
              style={{
                width: '100%', padding: '14px 16px',
                background: C.gold, border: 'none', borderRadius: 14,
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 15,
                color: C.ink,
                cursor: cashSubmitting ? 'default' : 'pointer',
                opacity: cashSubmitting ? 0.7 : 1,
                letterSpacing: '-0.01em',
                boxShadow: '0 14px 28px -16px rgba(255,184,0,0.55)',
              }}
            >
              {cashSubmitting ? 'Working…' : 'Collected · Complete Stop'}
            </button>

            {/* Secondary action — Could Not Collect (outline). First tap
                expands the reason field; second tap (with a reason) submits. */}
            <button
              onClick={handleCashNotCollected}
              disabled={cashSubmitting}
              style={{
                marginTop: 10, width: '100%', padding: '13px 16px',
                background: '#fff',
                border: `1.5px solid ${C.ink}`, borderRadius: 14,
                fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 14.5,
                color: C.ink,
                cursor: cashSubmitting ? 'default' : 'pointer',
                opacity: cashSubmitting ? 0.5 : 1,
                letterSpacing: '-0.01em',
              }}
            >
              {cashReasonVisible
                ? (cashSubmitting ? 'Working…' : 'Submit · Could Not Collect')
                : 'Could Not Collect'}
            </button>

            <button
              onClick={() => setShowCashModal(false)}
              disabled={cashSubmitting}
              style={{
                marginTop: 10, width: '100%', padding: '12px 16px',
                background: 'transparent', border: 'none',
                fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5,
                color: C.muted,
                cursor: cashSubmitting ? 'default' : 'pointer',
                opacity: cashSubmitting ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Dispatcher note (NEW-D) — read-only modal. Auto-pops once per stop
          mount when dispatcher_notes exists; "Got it" dismisses, the
          persistent card above re-opens. Tap-outside also dismisses. */}
      {showDispatcherNoteModal && stop && stop.dispatcher_notes && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(10,11,20,0.80)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowDispatcherNoteModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispatcher-note-modal-title"
        >
          <div
            style={{
              width: '100%', maxWidth: 384,
              background: '#fff', borderRadius: 16, padding: 24,
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              border: `1.5px solid ${C.blue}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
              color: C.blue, textTransform: 'uppercase', marginBottom: 8,
            }}>
              Note from dispatch
            </div>
            <h2
              id="dispatcher-note-modal-title"
              style={{
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20,
                color: C.ink, margin: 0, marginBottom: 14,
                letterSpacing: '-0.01em',
              }}
            >
              {stop.customer_name}
            </h2>
            <div style={{
              fontFamily: FONT_BODY, fontSize: 15, color: C.ink,
              lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              marginBottom: 20,
            }}>
              {stop.dispatcher_notes}
            </div>
            <button
              onClick={() => setShowDispatcherNoteModal(false)}
              style={{
                width: '100%', padding: '13px 16px',
                background: C.blue, border: 'none', borderRadius: 14,
                fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 14.5,
                color: '#fff',
                cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {avaNoteOpen && stop && authUser && (
        <AvaNoteSheet
          stopId={stopId}
          addressKey={avaAddressKey}
          rawAddress={stop.address_line_1}
          authorId={authUser.id}
          onClose={() => setAvaNoteOpen(false)}
          onSaved={() => setAvaNoteRefresh((n) => n + 1)}
        />
      )}
    </div>
  )
}
