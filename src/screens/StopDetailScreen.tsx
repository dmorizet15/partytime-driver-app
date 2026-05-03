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
import type { PaymentState } from '@/types'

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
const FONT_MONO    = "ui-monospace, SFMono-Regular, Menlo, monospace"

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

function paymentLabel(state: PaymentState | undefined): string | null {
  if (state === 'cod')         return 'COD'
  if (state === 'balance_due') return 'BAL DUE'
  return null
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
function PinIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12z"/>
      <circle cx="12" cy="10" r="2.5"/>
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
function BoxIcon({ size = 14, color = C.muted }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
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

// ─── Detail row inside the customer/order card ────────────────────────────────
function DetailRow({
  icon, label, children,
}: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <div style={{
        width: 22, height: 22, marginTop: 2, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} aria-hidden="true">
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: C.muted,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function StopDetailScreen({ routeId, stopId }: StopDetailScreenProps) {
  const router = useRouter()
  const { getRoute, getStop, getStopsForRoute, markOtw, markComplete } = useAppState()
  const route = getRoute(routeId)
  const stop = getStop(stopId)
  const allStops = getStopsForRoute(routeId)

  const [otwLoading, setOtwLoading] = useState(false)
  const [otwError, setOtwError] = useState<string | null>(null)
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
      </div>
    )
  }

  const stopIndex = allStops.findIndex((s) => s.stop_id === stopId)
  const nextStop = allStops[stopIndex + 1] ?? null
  const isCompleted = stop.current_status === 'completed'
  const isOtwSent = stop.on_the_way_sent
  const cityLine = [stop.city, [stop.state, stop.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const fullAddressLines = [stop.address_line_1, stop.address_line_2, cityLine]
    .filter((line) => line && line.trim().length > 0)
  const heroAddress = [stop.address_line_1, stop.city, [stop.state, stop.postal_code].filter(Boolean).join(' ')]
    .filter((p) => p && p.trim().length > 0).join(', ')
  const payLabel = paymentLabel(stop.payment_state)
  const otwSentTime = stop.on_the_way_sent_at ? formatSentAt(stop.on_the_way_sent_at) : null

  async function handleSendOtw() {
    if (!stop || otwLoading) return
    if (Date.now() < etaCooldownRef.current) { setEtaCooldownMsg('ETA text was just sent. Please wait a moment before resending.'); return }
    etaCooldownRef.current = Infinity
    setOtwLoading(true)
    setOtwError(null)
    const result = await runEtaSend()
    if (result.success) {
      const sent_at = new Date().toISOString()
      etaCooldownRef.current = Date.now() + 30_000
      markOtw(stop.stop_id, sent_at)
      setEtaStatus('sent')
      setEtaRange(result.etaRange ?? null)
      logEvent('ON_THE_WAY_SENT', routeId, stopId, stop.order_id, { phone: stop.customer_cell?.trim() || stop.customer_phone, sent_at })
    } else {
      etaCooldownRef.current = 0
      logEvent('ON_THE_WAY_FAILED', routeId, stopId, stop.order_id, { error: result.error })
      setOtwError(result.error ?? 'Failed to send On The Way text. Please try again.')
    }
    setOtwLoading(false)
  }

  async function handleNavigate() {
    if (!stop || navLoading) return
    setNavLoading(true)
    logEvent('NAVIGATION_STARTED', routeId, stopId, stop.order_id, { address: `${stop.address_line_1}, ${stop.city}`, coordinates: stop.latitude != null ? { lat: stop.latitude, lng: stop.longitude } : null })
    try {
      const result = await navigationService.navigateTo(stop)
      if (!result.success) { logEvent('NAVIGATION_FAILED', routeId, stopId, stop.order_id, { attempted: result.attempted, message: result.message }); if (result.message) setNavMessage(result.message) }
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
    const result = await sendEtaSms({ stopId: stop.stop_id, routeId, stopType: stop.stop_type, customerPhone: smsTarget, customerName: stop.customer_name, orderId: stop.order_id, driverLat: loc.lat, driverLng: loc.lng, destination })
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
      etaCooldownRef.current = Date.now() + 30_000
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

  // ── ETA reply badge — 5 states, restyled editorially ────────────────────────
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
              {smsReply.customer_name ?? stop?.customer_name} confirmed ready for {stop?.stop_type === 'pickup' ? 'pickup' : 'delivery'}.
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
    return (
      <div style={{
        marginTop: 12, background: C.paper,
        border: `1.5px solid ${C.ink}`,
        borderRadius: 16, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: C.off,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ display: 'flex', gap: 3 }} aria-hidden="true">
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, animation: 'sd-dot 1.2s ease-in-out infinite' }}/>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, animation: 'sd-dot 1.2s ease-in-out 0.15s infinite' }}/>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, animation: 'sd-dot 1.2s ease-in-out 0.3s infinite' }}/>
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
          Awaiting customer reply…
        </div>
        <style>{`@keyframes sd-dot { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
      </div>
    )
  }

  // ── Status pill (hero, on the blue) ─────────────────────────────────────────
  function HeroStatusPill() {
    if (isCompleted) {
      const t = stop?.completed_at ? formatTime(stop.completed_at) : null
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: C.ink, color: C.gold,
          padding: '6px 12px', borderRadius: 999,
          fontSize: 11, fontWeight: 900, letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <CheckIcon size={12} color={C.gold}/>
          Delivered{t ? ` · ${t}` : ''}
        </span>
      )
    }
    if (isOtwSent) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: C.gold, color: C.ink,
          padding: '6px 12px', borderRadius: 999,
          fontSize: 11, fontWeight: 900, letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.ink }}/>
          ETA Sent{otwSentTime ? ` · ${otwSentTime}` : ''}
        </span>
      )
    }
    return null
  }

  // ── Section eyebrow (gold-tracked) ──────────────────────────────────────────
  function SectionEyebrow({ children }: { children: ReactNode }) {
    return (
      <div style={{
        padding: '20px 22px 10px',
        fontFamily: FONT_DISPLAY,
        fontSize: 12, fontWeight: 800, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: C.muted,
      }}>
        {children}
      </div>
    )
  }

  // ── Helper text under buttons ──────────────────────────────────────────────
  function HelperText({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ink' }) {
    return (
      <p style={{
        margin: '6px 0 0', textAlign: 'center',
        fontSize: 11, color: tone === 'ink' ? C.ink : C.muted, lineHeight: 1.4,
      }}>
        {children}
      </p>
    )
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

  return (
    <div className="screen" style={{ background: C.cream, fontFamily: FONT_BODY, color: C.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{
        background: C.blue, color: '#fff',
        padding: '46px 22px 22px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
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
          Stop {stop.stop_sequence} of {allStops.length}
        </div>

        {/* Headline — customer name */}
        <div style={{
          marginTop: 6,
          fontFamily: FONT_DISPLAY,
          fontSize: 32, fontWeight: 900,
          lineHeight: 0.95, letterSpacing: '-0.03em',
          color: '#fff',
          position: 'relative',
          wordBreak: 'break-word',
        }}>
          {stop.customer_name}
        </div>

        {/* Subtitle — company_name */}
        {stop.company_name && (
          <div style={{
            marginTop: 6, fontSize: 14, fontWeight: 600,
            color: 'rgba(255,255,255,0.85)', lineHeight: 1.3,
            position: 'relative',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {stop.company_name}
          </div>
        )}

        {/* Address */}
        {heroAddress && (
          <div style={{
            marginTop: 8, fontSize: 13,
            color: 'rgba(255,255,255,0.72)', lineHeight: 1.4,
            position: 'relative',
          }}>
            {heroAddress}
          </div>
        )}

        {/* Status pill (state-aware) */}
        {(isCompleted || isOtwSent) && (
          <div style={{ marginTop: 14, position: 'relative' }}>
            <HeroStatusPill/>
          </div>
        )}
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 80 }}>
        {/* ── Customer / order detail card ───────────────────────────────── */}
        <div style={{ padding: '16px 18px 4px' }}>
          <div style={{
            background: C.paper,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 18,
            padding: '16px 16px 6px',
          }}>
            {stop.client_company && (
              <div style={{
                fontSize: 12.5, fontWeight: 600, color: C.muted,
                marginBottom: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {stop.client_company}
              </div>
            )}

            <DetailRow icon={<PinIcon/>} label="Address">
              <address style={{ fontStyle: 'normal' }}>
                {fullAddressLines.map((line, i) => (
                  <span key={i}>
                    {line}
                    {i < fullAddressLines.length - 1 && <br/>}
                  </span>
                ))}
              </address>
            </DetailRow>

            {stop.customer_cell && (
              <DetailRow icon={<PhoneIcon color={C.gold}/>} label="Cell">
                <a href={`tel:${stop.customer_cell}`}
                   style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {stop.customer_cell}
                </a>
              </DetailRow>
            )}
            {stop.customer_phone && stop.customer_phone !== stop.customer_cell && (
              <DetailRow icon={<PhoneIcon/>} label={stop.customer_cell ? 'Office' : 'Phone'}>
                <a href={`tel:${stop.customer_phone}`}
                   style={{ color: C.ink, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  {stop.customer_phone}
                </a>
              </DetailRow>
            )}
            {stop.order_id && (
              <DetailRow icon={<DocIcon/>} label="Order Ref">
                <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {stop.order_id}
                </span>
              </DetailRow>
            )}
            {stop.items_text && (
              <DetailRow icon={<BoxIcon/>} label="Items">
                <div style={{
                  fontSize: 13.5, fontWeight: 600, color: C.ink, lineHeight: 1.4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {stop.items_text}
                </div>
              </DetailRow>
            )}
            {payLabel && (
              <DetailRow icon={<CashIcon/>} label="Payment">
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: C.gold, color: C.ink,
                  padding: '4px 10px', borderRadius: 999,
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>
                  <CashIcon size={12} color={C.ink}/>
                  {payLabel}
                </span>
              </DetailRow>
            )}
            {stop.notes && (
              <DetailRow icon={<NoteIcon/>} label="Notes">
                <div style={{
                  fontStyle: 'italic',
                  color: C.ink,
                  background: C.off,
                  border: `1px dashed ${C.muted}`,
                  borderRadius: 10,
                  padding: '8px 10px',
                  fontSize: 13, lineHeight: 1.4,
                  fontWeight: 500,
                }}>
                  {stop.notes}
                </div>
              </DetailRow>
            )}
          </div>
        </div>

        {/* ── OTW Sent banner (inline editorial — replaces OTWSentBanner) ── */}
        {isOtwSent && stop.on_the_way_sent_at && !isCompleted && (
          <div style={{ padding: '10px 18px 0' }}>
            <div style={{
              background: C.ink, color: '#fff',
              borderRadius: 14, padding: '10px 14px',
              borderLeft: `5px solid ${C.gold}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'rgba(255,184,0,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <CheckIcon size={14} color={C.gold}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
                  color: C.gold, textTransform: 'uppercase',
                }}>
                  On The Way Text Sent
                </div>
                <div style={{ marginTop: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' }}>
                  Sent at {formatTime(stop.on_the_way_sent_at)} · {stop.customer_cell?.trim() || stop.customer_phone}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIONS ────────────────────────────────────────────────────── */}
        <SectionEyebrow>Actions</SectionEyebrow>
        <div style={{ padding: '0 18px' }}>
          {/* Send OTW */}
          <button
            onClick={handleSendOtw}
            disabled={otwLoading || isCompleted}
            style={{
              width: '100%', height: 58, borderRadius: 999,
              background: C.paper,
              color: isOtwSent ? C.muted : C.ink,
              border: `1.5px solid ${isOtwSent ? 'rgba(10,11,20,0.18)' : C.ink}`,
              cursor: (otwLoading || isCompleted) ? 'default' : 'pointer',
              opacity: (otwLoading || isCompleted) ? 0.55 : 1,
              fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'opacity 120ms ease',
            }}
          >
            <ChatIcon size={18} color={isOtwSent ? C.muted : C.ink}/>
            {otwLoading ? 'Sending…' : isOtwSent ? 'Resend On The Way Text' : 'Send On The Way Text'}
          </button>
          <HelperText>
            {isOtwSent ? 'Tap to resend if customer needs another notification' : 'Sends SMS to customer now'}
          </HelperText>
          {otwError && <InlinePill tone="coral">{otwError}</InlinePill>}

          {/* Send ETA */}
          <div style={{ height: 12 }}/>
          <button
            onClick={handleSendEta}
            disabled={etaStatus === 'sending' || isCompleted}
            style={{
              width: '100%', height: 58, borderRadius: 999,
              background: C.paper,
              color: etaStatus === 'sent' ? C.muted : C.ink,
              border: `1.5px solid ${etaStatus === 'sent' ? 'rgba(10,11,20,0.18)' : C.ink}`,
              cursor: (etaStatus === 'sending' || isCompleted) ? 'default' : 'pointer',
              opacity: (etaStatus === 'sending' || isCompleted) ? 0.55 : 1,
              fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'opacity 120ms ease',
            }}
          >
            <ClockIcon size={18} color={etaStatus === 'sent' ? C.muted : C.ink}/>
            {etaStatus === 'sending' ? 'Sending ETA…' : etaStatus === 'sent' ? 'Resend ETA Text' : 'Send ETA Text'}
          </button>
          <HelperText>
            {etaStatus === 'sent' && etaRange ? `ETA sent: ${etaRange} · tap to resend` : 'Texts customer your ETA with reply options'}
          </HelperText>
          {etaStatus === 'error' && etaError && <InlinePill tone="coral">{etaError}</InlinePill>}
          {etaCooldownMsg && <InlinePill tone="amber">{etaCooldownMsg}</InlinePill>}

          {/* ETA reply badge — 5 states preserved */}
          {renderEtaReplyBadge()}

          {/* Navigate — signature D03 CTA shape */}
          <div style={{ height: 14 }}/>
          <button
            onClick={handleNavigate}
            disabled={navLoading || isCompleted}
            style={{
              width: '100%', height: 58, borderRadius: 999,
              background: C.ink, color: '#fff',
              border: 0,
              cursor: (navLoading || isCompleted) ? 'default' : 'pointer',
              opacity: (navLoading || isCompleted) ? 0.55 : 1,
              fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px 0 24px',
              boxShadow: '0 14px 30px -10px rgba(10,11,20,0.45)',
              transition: 'opacity 120ms ease',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <NavigateIcon size={18} color="#fff"/>
              {navLoading ? 'Opening…' : 'Navigate'}
            </span>
            <span style={{
              width: 42, height: 42, borderRadius: '50%',
              background: C.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowIcon size={18} color={C.ink}/>
            </span>
          </button>
          <HelperText>Opens CoPilot with truck routing</HelperText>
          {navMessage && <InlinePill tone="muted">{navMessage}</InlinePill>}
        </div>

        {/* ── TOOLS (View Order only — Easy RFID Pro removed) ──────────── */}
        {stop.order_id && (
          <>
            <SectionEyebrow>Tools</SectionEyebrow>
            <div style={{ padding: '0 18px' }}>
              <button
                onClick={handleOpenTapGoods}
                disabled={tapGoodsLoading}
                style={{
                  width: '100%',
                  background: C.paper,
                  border: `1.5px solid ${C.ink}`,
                  borderRadius: 16,
                  padding: '14px 16px',
                  cursor: tapGoodsLoading ? 'default' : 'pointer',
                  opacity: tapGoodsLoading ? 0.55 : 1,
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 12,
                  textAlign: 'left',
                  transition: 'opacity 120ms ease',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: C.off,
                  border: `1.5px solid ${C.ink}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <DocIcon size={20} color={C.ink}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14.5, fontWeight: 800, color: C.ink,
                    fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
                  }}>
                    {tapGoodsLoading ? 'Opening…' : 'View Order'}
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11.5, color: C.muted }}>
                    Opens pick list for order {stop.order_id}
                  </div>
                </div>
                <ArrowIcon size={16} color={C.muted}/>
              </button>
            </div>
          </>
        )}

        {/* ── PROOF OF DELIVERY ─────────────────────────────────────────── */}
        <SectionEyebrow>Proof of Delivery</SectionEyebrow>
        <div style={{ padding: '0 18px' }}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handlePhotoSelected}
            aria-label="Take proof of delivery photo"
          />

          {pod.status === 'uploaded' && pod.url && (
            <div style={{
              marginBottom: 10,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 16,
              overflow: 'hidden',
              background: C.paper,
              boxShadow: `4px 4px 0 ${C.ink}`,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pod.url}
                alt="Proof of delivery"
                style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }}
              />
            </div>
          )}

          {pod.status === 'uploaded' && (
            <div style={{
              marginBottom: 10,
              background: C.gold, color: C.ink,
              borderRadius: 14, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <CheckIcon size={16} color={C.ink}/>
              <div>
                <div style={{
                  fontSize: 10.5, fontWeight: 900, letterSpacing: '0.16em',
                  color: C.goldDeep, textTransform: 'uppercase',
                }}>
                  Photo Uploaded
                </div>
                <div style={{ marginTop: 1, fontSize: 12.5, fontWeight: 600, color: C.ink }}>
                  Proof of delivery saved to server.
                </div>
              </div>
            </div>
          )}

          {pod.status === 'failed' && (
            <div style={{
              marginBottom: 10,
              background: C.paper,
              border: `1.5px solid ${C.ink}`,
              borderRadius: 14, padding: '10px 14px',
              boxShadow: `4px 4px 0 ${C.coral}`,
              display: 'flex', alignItems: 'flex-start', gap: 10,
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
              <div>
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
          )}

          <button
            onClick={handleTakePhotoTap}
            disabled={pod.status === 'uploading'}
            style={{
              width: '100%', height: 58, borderRadius: 999,
              background: pod.status === 'uploaded' ? C.paper : C.gold,
              color: C.ink,
              border: pod.status === 'uploaded' ? `1.5px solid rgba(10,11,20,0.18)` : 0,
              cursor: pod.status === 'uploading' ? 'default' : 'pointer',
              opacity: pod.status === 'uploading' ? 0.55 : 1,
              fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 8px 0 24px',
              boxShadow: pod.status === 'uploaded' ? 'none' : '0 14px 30px -10px rgba(255,184,0,0.55), inset 0 -2px 0 rgba(0,0,0,0.18)',
              transition: 'opacity 120ms ease',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <CameraIcon size={18} color={C.ink}/>
              {pod.status === 'uploading'
                ? 'Uploading…'
                : pod.status === 'uploaded'
                  ? 'Retake Photo'
                  : pod.status === 'failed'
                    ? 'Retry Photo'
                    : 'Take Photo'}
            </span>
            <span style={{
              width: 42, height: 42, borderRadius: '50%',
              background: C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ArrowIcon size={18} color={C.gold}/>
            </span>
          </button>
          <HelperText>
            {pod.status === 'uploading'
              ? 'Saving to server…'
              : pod.status === 'uploaded'
                ? 'Tap to replace with a new photo'
                : 'Opens camera · saved to server'}
          </HelperText>
        </div>

        {/* ── COMPLETE (only when not yet completed) ────────────────────── */}
        {!isCompleted && (
          <>
            <SectionEyebrow>Complete</SectionEyebrow>
            <div style={{ padding: '0 18px' }}>
              <button
                onClick={() => setShowCompleteModal(true)}
                style={{
                  width: '100%', height: 58, borderRadius: 999,
                  background: C.ink, color: '#fff',
                  border: 0, cursor: 'pointer',
                  fontSize: 16, fontWeight: 800, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 8px 0 24px',
                  boxShadow: '0 14px 30px -10px rgba(10,11,20,0.45)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <CheckIcon size={18} color="#fff"/>
                  Mark Stop Complete
                </span>
                <span style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: C.gold,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CheckIcon size={18} color={C.ink}/>
                </span>
              </button>
              <HelperText>
                {nextStop
                  ? `Requires confirmation · advances to Stop ${nextStop.stop_sequence}`
                  : 'Requires confirmation · returns to route list (last stop)'}
              </HelperText>
            </div>
          </>
        )}
      </div>

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
