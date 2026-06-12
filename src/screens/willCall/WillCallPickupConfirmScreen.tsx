'use client'

// ─── Will Call — Screen 4: pickup confirm (handoff) ──────────────────────────
// Customer identity verify card (blue border), the items going with the
// customer (full quantities — staging exceptions live in Phase 2's per-item
// rows; Phase 1 hands off the staged order as-is), vehicle plate photo STUB
// (no camera / upload in Phase 1), return date, then "Mark as Picked Up" →
// POST dashboard /api/willcall/[id]/pickup.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWillCallOrders } from '@/hooks/willCall/useWillCallOrders'
import { pickupWillCallOrder } from '@/lib/willCall/api'
import { WL, FONT_BODY, FONT_DISPLAY } from '@/lib/willCall/theme'
import { fmtReturnBy } from '@/lib/willCall/format'

export default function WillCallPickupConfirmScreen({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { orders, loading } = useWillCallOrders()
  const order = orders.find((o) => o.id === orderId)

  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [photoSkipped, setPhotoSkipped] = useState(false)

  if (!order) {
    return (
      <div className="screen" style={{
        background: WL.cream, fontFamily: FONT_BODY,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: WL.muted, fontSize: 14 }}>
          {loading ? 'Loading…' : 'Will Call order not found.'}
        </p>
      </div>
    )
  }

  const name  = order.customer_name?.trim() || order.company_name?.trim() || 'Will Call customer'
  const phone = order.customer_cell?.trim() || order.customer_phone?.trim() || null
  const firstName = name.split(' ')[0]

  async function confirm() {
    if (!order || busy) return
    setBusy(true)
    setSubmitError(null)
    try {
      await pickupWillCallOrder(order.id)
      router.replace(`/will-call/${order.id}`)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Something went wrong — try again.')
      setBusy(false)
    }
  }

  return (
    <div className="screen" style={{ background: WL.cream, fontFamily: FONT_BODY, color: WL.ink }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: WL.blue, color: '#fff', padding: '10px 18px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => router.push(`/will-call/${order.id}`)}
            aria-label="Back to order"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <span style={{ fontSize: 13, opacity: 0.75 }}>Confirm Handoff</span>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800 }}>{name}</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>All items staged ✓</div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px 18px 140px' }}>
        {/* Identity verify */}
        <div style={{ background: WL.paper, border: `2px solid ${WL.blue}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: WL.blue, letterSpacing: '0.04em', marginBottom: 6 }}>
            VERIFY CUSTOMER IDENTITY
          </div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{name}</div>
          {phone && (
            <div style={{ fontSize: 13, color: WL.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WL.muted}
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {phone}
            </div>
          )}
        </div>

        {/* Items going with customer */}
        <div style={{ background: WL.paper, border: `1px solid ${WL.line}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: WL.muted, letterSpacing: '0.04em', marginBottom: 10 }}>
            GOING WITH CUSTOMER
          </div>
          {order.items.map((it, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              padding: '8px 0', borderBottom: `1px solid ${WL.line}`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{it.name}</span>
              <span style={{ fontSize: 13, fontWeight: 800, flexShrink: 0 }}>×{it.quantity}</span>
            </div>
          ))}
          {order.items.length === 0 && (
            <div style={{ color: WL.muted, fontSize: 13 }}>No items on this order.</div>
          )}
        </div>

        {/* Vehicle plate photo — STUB ONLY (Phase 1: no camera, no upload). */}
        {!photoSkipped && (
          <div style={{
            background: WL.paper, border: `1.5px dashed ${WL.muted}`, borderRadius: 14,
            padding: 14, marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: WL.off, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={WL.muted}
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>Vehicle plate photo</span>
                <span style={{
                  background: WL.amberTint, color: WL.amber,
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                  padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase',
                }}>
                  Recommended
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: WL.muted, marginTop: 2 }}>
                Photo capture coming in a later update.
              </div>
            </div>
            <button
              onClick={() => setPhotoSkipped(true)}
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: WL.muted, fontSize: 12.5, fontWeight: 700,
                fontFamily: 'inherit', textDecoration: 'underline', flexShrink: 0,
              }}
            >
              Skip
            </button>
          </div>
        )}

        {/* Return date */}
        <div style={{ background: WL.greenTint, border: `1px solid rgba(31,191,107,0.3)`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: WL.green, letterSpacing: '0.04em', marginBottom: 4 }}>
            RETURN DATE
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtReturnBy(order)}</div>
        </div>

        {submitError && (
          <div style={{
            marginTop: 12, background: WL.redTint, border: `1px solid ${WL.red}`,
            borderRadius: 12, padding: '10px 14px', fontSize: 13, color: WL.red, fontWeight: 600,
          }}>
            {submitError}
          </div>
        )}
      </div>

      {/* ── CTA — pinned ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: '14px 16px calc(18px + env(safe-area-inset-bottom))',
        background: `linear-gradient(180deg, rgba(255,249,238,0) 0%, ${WL.cream} 32%)`,
      }}>
        <button
          disabled={busy}
          onClick={() => { void confirm() }}
          style={{
            width: '100%', border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
            background: busy ? '#d6d4ce' : WL.blue, color: busy ? '#9b9890' : '#fff',
            fontWeight: 800, fontSize: 15, padding: 15, borderRadius: 16,
            fontFamily: FONT_DISPLAY,
            boxShadow: busy ? 'none' : '0 4px 14px rgba(0,0,255,0.28)',
          }}
        >
          {busy ? 'Marking picked up…' : `Mark as Picked Up — ${firstName} takes it now`}
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: WL.muted, marginTop: 8 }}>
          Order moves to &ldquo;Out with Customer&rdquo; after this
        </div>
      </div>
    </div>
  )
}
