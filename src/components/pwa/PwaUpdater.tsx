'use client'

import { useEffect, useState } from 'react'

// ─── Feature 2 — Service-worker update banner ────────────────────────────────
// Listens for a new service worker entering the `waiting` state (i.e. a new
// deploy has been precached and is ready, but the old SW still controls the
// page). Shows a non-dismissible banner with a single "Update now" CTA; tapping
// it tells the waiting SW to skipWaiting() and reloads once the new SW takes
// control (controllerchange).
//
// The SW (src/app/sw.ts) is configured `skipWaiting: false`, which makes
// serwist register a `{ type: 'SKIP_WAITING' }` message handler on the worker.
// We only prompt when there is ALREADY a controller, so a first install never
// shows the banner. After this ships, every future deploy self-updates the
// moment the driver taps Update — no re-install needed.
export default function PwaUpdater() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    let cancelled = false

    // Only prompt for an UPDATE — a controller must already exist (otherwise
    // this is the very first install, which activates silently).
    const prompt = (sw: ServiceWorker | null) => {
      if (!cancelled && sw && navigator.serviceWorker.controller) setWaitingWorker(sw)
    }

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return
      // A new SW may already be waiting by the time this mounts.
      if (reg.waiting) prompt(reg.waiting)
      // …or one shows up later.
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing
        if (!incoming) return
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed') prompt(reg.waiting ?? incoming)
        })
      })
    }).catch(() => { /* registration unavailable — no banner */ })

    return () => { cancelled = true }
  }, [])

  const handleUpdate = () => {
    if (!waitingWorker || updating) return
    setUpdating(true)

    // Reload once the new SW takes control. Guarded so we reload exactly once.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })

    // Tell the waiting worker to activate (serwist's SKIP_WAITING handler).
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!waitingWorker) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400,
        background: '#1F46FF', color: '#fff',
        padding: 'calc(env(safe-area-inset-top) + 10px) 16px 10px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}
    >
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.4 }}>
        A new version of PartyTime Work is available.
      </span>
      <button
        type="button"
        onClick={handleUpdate}
        disabled={updating}
        style={{
          flexShrink: 0, padding: '9px 16px',
          background: '#FFB800', color: '#0A0B14', border: 'none', borderRadius: 9,
          fontSize: 13.5, fontWeight: 800, letterSpacing: 0.2,
          cursor: updating ? 'default' : 'pointer', opacity: updating ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {updating ? 'Updating…' : 'Update now'}
      </button>
    </div>
  )
}
