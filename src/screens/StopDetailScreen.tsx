'use client'

import { useState, useEffect, useRef, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAppState } from '@/context/AppStateContext'
import AppHeader from '@/components/AppHeader'
import OTWSentBanner from '@/components/OTWSentBanner'
import ConfirmationModal from '@/components/ConfirmationModal'
import { navigationService } from '@/services/NavigationService'
import { externalAppService } from '@/services/ExternalAppService'
import { photoUploadService } from '@/services/PhotoUploadService'
import { logEvent } from '@/services/EventLogger'
import { sendEtaSms, getStopSmsStatus, getDriverLocation } from '@/services/EtaSmsService'
import type { StopSmsStatus } from '@/services/EtaSmsService'

interface StopDetailScreenProps { routeId: string; stopId: string }
type PodStatus = 'idle' | 'uploading' | 'uploaded' | 'failed'
interface PodState { status: PodStatus; url?: string; error?: string }
type EtaStatus = 'idle' | 'sending' | 'sent' | 'error'

function DetailRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start mb-3.5">
      <span className="text-sm w-5 text-gray-400 flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
        {children}
      </div>
    </div>
  )
}

function formatTime(isoString: string): string {
  try { return new Date(isoString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) }
  catch { return '—' }
}

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
  const [rfidMessage, setRfidMessage] = useState<string | null>(null)
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
    if (!rfidMessage) return
    const t = setTimeout(() => setRfidMessage(null), 5000)
    return () => clearTimeout(t)
  }, [rfidMessage])

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

  if (!stop || !route) {
    return (
      <div className="screen">
        <AppHeader title="Stop not found" onBack={() => router.push(`/route/${routeId}`)} />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-8 text-center">This stop could not be found.</div>
      </div>
    )
  }

  const stopIndex = allStops.findIndex((s) => s.stop_id === stopId)
  const nextStop = allStops[stopIndex + 1] ?? null
  const stopPosition = `Stop ${stop.stop_sequence} of ${allStops.length}`
  const isCompleted = stop.current_status === 'completed'
  const isOtwSent = stop.on_the_way_sent
  const cityLine = [stop.city, [stop.state, stop.postal_code].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const fullAddressLines = [stop.address_line_1, stop.address_line_2, cityLine].filter((line) => line && line.trim().length > 0)

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
      logEvent('ON_THE_WAY_SENT', routeId, stopId, stop.order_id, { phone: stop.customer_phone, sent_at })
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

  function handleOpenRfid() {
    if (!stop) return
    logEvent('RFID_APP_OPENED_ATTEMPT', routeId, stopId, stop.order_id)
    const result = externalAppService.launchRfidApp()
    if (result.success) { logEvent('RFID_APP_OPEN_SUCCESS', routeId, stopId, stop.order_id, { url: result.url }); setRfidMessage(`[DEBUG] Intent dispatched: ${result.url ?? 'unknown'}`) }
    else { logEvent('RFID_APP_OPEN_FAILED', routeId, stopId, stop.order_id, { attempted: result.attempted, message: result.message }); if (result.message) setRfidMessage(result.message) }
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
    const result = await sendEtaSms({ stopId: stop.stop_id, routeId, stopType: stop.stop_type, customerPhone: stop.customer_phone, customerName: stop.customer_name, orderId: stop.order_id, driverLat: loc.lat, driverLng: loc.lng, destination })
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

  function renderEtaReplyBadge() {
    if (etaStatus !== 'sent' || !smsReply) return null
    const { sms_status, customer_ready, customer_instructions, awaiting_instructions } = smsReply
    if (customer_ready || sms_status === 'customer_ready') {
      return (
        <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
          <span className="text-base" aria-hidden="true">✅</span>
          <div>
            <div className="text-[11px] font-bold text-green-800 uppercase tracking-wide">Customer Ready</div>
            <div className="text-xs text-green-700 mt-0.5">{smsReply.customer_name ?? stop?.customer_name} confirmed ready for {stop?.stop_type === 'pickup' ? 'pickup' : 'delivery'}.</div>
          </div>
        </div>
      )
    }
    if (customer_instructions || sms_status === 'instructions_received') {
      return (
        <div className="mt-2.5 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
          <div className="flex items-center gap-2 mb-1"><span className="text-base" aria-hidden="true">📩</span><div className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">Delivery Instructions</div></div>
          <div className="text-sm font-semibold text-blue-900 leading-snug">&ldquo;{customer_instructions}&rdquo;</div>
        </div>
      )
    }
    if (awaiting_instructions || sms_status === 'awaiting_instructions') {
      return (
        <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-yellow-50 border border-yellow-200">
          <span className="text-base" aria-hidden="true">⚠️</span>
          <div><div className="text-[11px] font-bold text-yellow-800 uppercase tracking-wide">Customer Not There</div><div className="text-xs text-yellow-700 mt-0.5">Waiting for delivery instructions…</div></div>
        </div>
      )
    }
    if (sms_status === 'opted_out') {
      return (
        <div className="mt-2.5 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-300">
          <span className="text-base" aria-hidden="true">🚫</span>
          <div><div className="text-[11px] font-bold text-gray-600 uppercase tracking-wide">Opted Out of SMS</div><div className="text-xs text-gray-500 mt-0.5">Customer has opted out of text messages.</div></div>
        </div>
      )
    }
    return (
      <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200">
        <span className="text-sm text-gray-400" aria-hidden="true">💬</span>
        <span className="text-[11px] text-gray-500">Awaiting customer reply…</span>
      </div>
    )
  }

  return (
    <div className="screen">
      <AppHeader title={stopPosition} subtitle={route.route_name} onBack={() => router.push(`/route/${routeId}`)} />
      <div className="flex-1 overflow-y-auto pb-8">
        {isCompleted && (
          <div className="mx-4 mt-3 p-3 bg-gray-900 text-white rounded-xl flex items-center gap-2.5">
            <span className="text-base font-bold" aria-hidden="true">✓</span>
            <div><div className="text-sm font-bold">Stop Completed</div>{stop.completed_at && <div className="text-xs text-gray-400 mt-0.5">Completed at {formatTime(stop.completed_at)}</div>}</div>
          </div>
        )}
        <div className="px-4 pt-4 pb-4 border-b border-gray-100">
          {stop.company_name && (
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              {stop.company_name}
            </div>
          )}
          <h2 className="text-[21px] font-extrabold text-gray-900 mb-4 leading-snug">{stop.customer_name}</h2>
          <DetailRow icon="📍" label="Address">
            <address className="not-italic text-sm font-medium text-gray-800 leading-snug">
              {fullAddressLines.map((line, i) => (<span key={i}>{line}{i < fullAddressLines.length - 1 && <br />}</span>))}
            </address>
          </DetailRow>
          {stop.customer_phone && (<DetailRow icon="📞" label="Phone"><a href={`tel:${stop.customer_phone}`} className="text-sm font-medium text-gray-800 underline underline-offset-2">{stop.customer_phone}</a></DetailRow>)}
          {stop.order_id && (<DetailRow icon="#" label="Order Ref"><span className="text-sm font-medium text-gray-800 font-mono tracking-tight">{stop.order_id}</span></DetailRow>)}
          {stop.items_text && (<DetailRow icon="📦" label="Items"><div className="text-sm font-medium text-gray-800 leading-snug">{stop.items_text}</div></DetailRow>)}
          {stop.payment_state === 'cod' && (
            <DetailRow icon="💵" label="Payment">
              <div className="inline-block px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold uppercase tracking-wide">
                COD — Collect on Delivery
              </div>
            </DetailRow>
          )}
          {stop.payment_state === 'balance_due' && (
            <DetailRow icon="💵" label="Payment">
              <div className="inline-block px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-900 text-[11px] font-bold uppercase tracking-wide">
                Balance Due
              </div>
            </DetailRow>
          )}
          {stop.notes && (<DetailRow icon="📝" label="Notes"><div className="text-sm text-gray-600 italic leading-snug bg-gray-50 border border-dashed border-gray-300 rounded-lg p-2.5">{stop.notes}</div></DetailRow>)}
        </div>
        {isOtwSent && stop.on_the_way_sent_at && <OTWSentBanner sentAt={stop.on_the_way_sent_at} phone={stop.customer_phone} />}
        <div className="px-4 pt-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Actions</div>
          <button onClick={handleSendOtw} disabled={otwLoading || isCompleted} className={`w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 transition-colors disabled:opacity-50 ${isOtwSent ? 'border-gray-300 bg-gray-100 text-gray-500 active:bg-gray-200' : 'border-gray-800 bg-white text-gray-900 active:bg-gray-50'}`}>
            <span className="text-lg" aria-hidden="true">💬</span>{otwLoading ? 'Sending…' : isOtwSent ? 'Resend On The Way Text' : 'Send On The Way Text'}
          </button>
          <p className="text-[10px] text-gray-400 text-center mb-1">{isOtwSent ? 'Tap to resend if customer needs another notification' : 'Sends SMS to customer now'}</p>
          {otwError && (<p className="text-[11px] text-red-500 text-center mt-1.5 mb-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">{otwError}</p>)}
          <div className="mb-3.5" />
          <button onClick={handleSendEta} disabled={etaStatus === 'sending' || isCompleted} className={`w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 transition-colors disabled:opacity-50 ${etaStatus === 'sent' ? 'border-gray-300 bg-gray-100 text-gray-500 active:bg-gray-200' : 'border-gray-800 bg-white text-gray-900 active:bg-gray-50'}`}>
            <span className="text-lg" aria-hidden="true">🕐</span>{etaStatus === 'sending' ? 'Sending ETA…' : etaStatus === 'sent' ? 'Resend ETA Text' : 'Send ETA Text'}
          </button>
          <p className="text-[10px] text-gray-400 text-center">{etaStatus === 'sent' && etaRange ? `ETA sent: ${etaRange} · tap to resend` : 'Texts customer your ETA with reply options'}</p>
          {etaStatus === 'error' && etaError && (<p className="text-[11px] text-red-500 text-center mt-1.5 mb-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">{etaError}</p>)}
          {etaCooldownMsg && (<p className="text-[11px] text-amber-700 text-center mt-1.5 mb-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">{etaCooldownMsg}</p>)}
          {renderEtaReplyBadge()}
          <div className="mb-3.5" />
          <button onClick={handleNavigate} disabled={navLoading || isCompleted} className="w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 border-gray-900 bg-gray-900 text-white active:bg-gray-700 disabled:opacity-50 transition-colors">
            <span className="text-lg" aria-hidden="true">🧭</span>{navLoading ? 'Opening…' : 'Navigate'}
          </button>
          <p className="text-[10px] text-gray-400 text-center mb-1">Opens CoPilot with truck routing</p>
          {navMessage && (<p className="text-[11px] text-gray-500 text-center mt-1.5 mb-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg italic">{navMessage}</p>)}
        </div>
        <div className="px-4 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Tools</div>
          {stop.order_id && (
            <>
              <button onClick={handleOpenTapGoods} disabled={tapGoodsLoading} className="w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 border-gray-300 bg-white text-gray-700 active:bg-gray-50 disabled:opacity-50 transition-colors">
                <span className="text-lg" aria-hidden="true">📋</span>{tapGoodsLoading ? 'Opening…' : 'View Order (TapGoods)'}
              </button>
              <p className="text-[10px] text-gray-400 text-center mb-3.5">Opens pick list for order {stop.order_id}</p>
            </>
          )}
          <button onClick={handleOpenRfid} className="w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 border-gray-300 bg-white text-gray-700 active:bg-gray-50 transition-colors">
            <span className="text-lg" aria-hidden="true">📡</span>Easy RFID Pro App
          </button>
          <p className="text-[10px] text-gray-400 text-center mb-1">Launches Easy RFID Pro on Android</p>
          {rfidMessage && (<p className="text-[11px] text-gray-500 text-center mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg italic">{rfidMessage}</p>)}
        </div>
        <div className="px-4 pt-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Proof of Delivery</div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelected} aria-label="Take proof of delivery photo" />
          {pod.status === 'uploaded' && pod.url && (
            <div className="mb-3 rounded-xl overflow-hidden border-2 border-gray-200 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pod.url} alt="Proof of delivery" className="w-full object-cover max-h-56" />
            </div>
          )}
          {pod.status === 'uploaded' && (
            <div className="flex items-center gap-2.5 mb-3 px-3 py-2.5 rounded-xl bg-green-50 border border-green-200">
              <span className="text-base" aria-hidden="true">✅</span>
              <div>
                <div className="text-[11px] font-bold text-green-800 uppercase tracking-wide">Photo Uploaded</div>
                <div className="text-xs text-green-700 mt-0.5">Proof of delivery saved to server.</div>
              </div>
            </div>
          )}
          {pod.status === 'failed' && (
            <div className="flex items-start gap-2.5 mb-3 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <span className="text-base mt-0.5" aria-hidden="true">⚠️</span>
              <div>
                <div className="text-[11px] font-bold text-red-800 uppercase tracking-wide">Upload Failed</div>
                {pod.error && <div className="text-xs text-red-600 mt-0.5">{pod.error}</div>}
              </div>
            </div>
          )}
          <button
            onClick={handleTakePhotoTap}
            disabled={pod.status === 'uploading'}
            className={`w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 transition-colors disabled:opacity-50 ${
              pod.status === 'uploaded'
                ? 'border-gray-300 bg-white text-gray-600 active:bg-gray-50'
                : 'border-[#0000FF] bg-[#0000FF] text-white active:bg-[#0000CC]'
            }`}
          >
            <span className="text-lg" aria-hidden="true">📷</span>
            {pod.status === 'uploading' ? 'Uploading…' : pod.status === 'uploaded' ? 'Retake Photo' : pod.status === 'failed' ? 'Retry Photo' : 'Take Photo'}
          </button>
          <p className="text-[10px] text-gray-400 text-center">
            {pod.status === 'uploading' ? 'Saving to server…' : pod.status === 'uploaded' ? 'Tap to replace with a new photo' : 'Opens camera · saved to server'}
          </p>
        </div>
        {!isCompleted && (
          <div className="px-4 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Complete</div>
            <button onClick={() => setShowCompleteModal(true)} className="w-full flex items-center justify-center gap-2.5 min-h-[54px] rounded-xl text-[15px] font-bold mb-1 border-2 border-dashed border-gray-400 bg-white text-gray-800 active:bg-gray-50 transition-colors">
              <span className="text-lg" aria-hidden="true">✓</span>Mark Stop Complete
            </button>
            <p className="text-[10px] text-gray-400 text-center">{nextStop ? `Requires confirmation · advances to Stop ${nextStop.stop_sequence}` : 'Requires confirmation · returns to route list (last stop)'}</p>
          </div>
        )}
      </div>
      {showCompleteModal && (
        <ConfirmationModal title="Mark Stop Complete?"
          message={nextStop ? `Confirm delivery completed at ${stop.customer_name}. You'll be taken to Stop ${nextStop.stop_sequence} next.` : `Confirm delivery completed at ${stop.customer_name}. This is the last stop — you'll return to the route list.`}
          confirmLabel="Mark Complete" cancelLabel="Cancel"
          onConfirm={handleConfirmComplete} onCancel={() => setShowCompleteModal(false)}
          isLoading={completeLoading} />
      )}
    </div>
  )
}
