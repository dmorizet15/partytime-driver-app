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
import BottomNav from '@/components/BottomNav'

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

// ─── COD detection ────────────────────────────────────────────────────────────
// TapGoods uses 'balance_due' for stops where the customer owes the rental
// balance on delivery — functionally COD from the driver's POV. Literal 'cod'
// is preserved as a fallback for any data that uses that exact value.
const COD_PAYMENT_STATES = new Set<string>(['cod', 'balance_due'])

// ─── Stop type pill colors ────────────────────────────────────────────────────
const TYPE_PILL: Record<'delivery' | 'pickup' | 'service', { bg: string; color: string }> = {
  delivery: { bg: C.blue, color: '#fff' },
  pickup:   { bg: C.gold, color: C.ink },
  service:  { bg: C.ink,  color: '#fff' },
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
  const { getRoute, getStop, getStopsForRoute, markOtw, markComplete } = useAppState()
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

  useEffect(() => {
    if (stop) logEvent('STOP_VIEWED', routeId, stopId, stop.order_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId])

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

  async function handleConfirmComplete() {
    if (!stop) return
    setCompleteLoading(true)
    const completedAt = new Date().toISOString()
    markComplete(stop.stop_id, completedAt)
    logEvent('STOP_COMPLETED', routeId, stopId, stop.order_id, { completed_at: completedAt })
    setShowCompleteModal(false); setCompleteLoading(false)
    if (nextStop) { router.replace(`/route/${routeId}/stop/${nextStop.stop_id}`) } else { router.replace(`/route/${routeId}`) }
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
    // 'service' → 'delivery' for the SMS (preserves prior behavior — service
    // stops historically went out as deliveries when the mapper squashed them).
    const smsStopType: 'delivery' | 'pickup' = stop.stop_type === 'service' ? 'delivery' : stop.stop_type
    const result = await sendEtaSms({ stopId: stop.stop_id, routeId, stopType: smsStopType, customerPhone: smsTarget, customerName: stop.customer_name, orderId: stop.order_id, driverLat: loc.lat, driverLng: loc.lng, destination })
    if (result.success) {
      logEvent('ETA_SMS_SENT', routeId, stopId, stop.order_id, { etaRange: result.etaRange })
      return { success: true, etaRange: result.etaRange }
    }
    logEvent('ETA_SMS_FAILED', routeId, stopId, stop.order_id, { error: result.error })
    return { success: false, error: result.error ?? 'Failed to send ETA text.' }
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

        {/* COD card — only when payment is COD */}
        {COD_PAYMENT_STATES.has(stop.payment_state ?? '') && (
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
            {/* ETA / SMS block */}
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
                    onClick={handleSendEta}
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

            {/* ACTION CARD — Mark Arrived + 3 quick actions */}
            <div style={{ padding: '16px 18px 0' }}>
              <div style={{
                background: C.paper,
                border: `1.5px solid ${C.ink}`,
                borderRadius: 22,
                padding: 14,
                boxShadow: `5px 5px 0 ${C.ink}`,
              }}>
                {/* Mark Arrived — gold (pending) or green (otw_sent) */}
                <button
                  onClick={() => setShowCompleteModal(true)}
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
                  <span>Mark Arrived</span>
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
                    onClick={handleNavigate}
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
              </div>

              {navMessage && <InlinePill tone="muted">{navMessage}</InlinePill>}
            </div>
          </>
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
    </div>
  )
}
