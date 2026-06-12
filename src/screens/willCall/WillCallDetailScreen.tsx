'use client'

// ─── Will Call — Screen 2: order detail ──────────────────────────────────────
// 4-step ProgressSteps bar, customer info, pickup/return grid, items list,
// and a status-keyed CTA:
//   pending         → "Start Staging →"                       (gold)
//   staged          → "Customer Arrived — Confirm Handoff"    (blue)
//   picked_up       → "Process Return"                        (ink)
//   awaiting_return → "Process Return — Overdue"              (red)
//   returned        → green completion block

import { useRouter } from 'next/navigation'
import { useWillCallOrders } from '@/hooks/willCall/useWillCallOrders'
import { ProgressSteps } from '@/components/willCall/atoms'
import { WL, FONT_BODY, FONT_DISPLAY } from '@/lib/willCall/theme'
import { fmtPickup, fmtReturnBy } from '@/lib/willCall/format'

export default function WillCallDetailScreen({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { orders, loading } = useWillCallOrders()
  const order = orders.find((o) => o.id === orderId)

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
  const status = order.status
  const overdue = status === 'awaiting_return'

  const cta = {
    pending:         { label: 'Start Staging →',                    bg: WL.gold, color: WL.goldInk, to: `/will-call/${order.id}/staging` },
    staged:          { label: 'Customer Arrived — Confirm Handoff', bg: WL.blue, color: '#fff',     to: `/will-call/${order.id}/pickup` },
    picked_up:       { label: 'Process Return',                     bg: WL.ink,  color: '#fff',     to: `/will-call/${order.id}/return` },
    awaiting_return: { label: 'Process Return — Overdue',           bg: WL.red,  color: '#fff',     to: `/will-call/${order.id}/return` },
  }[status as Exclude<typeof status, 'returned'>]

  return (
    <div className="screen" style={{ background: WL.cream, fontFamily: FONT_BODY, color: WL.ink }}>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ background: WL.blue, color: '#fff', padding: '10px 18px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => router.push('/will-call')}
            aria-label="Back to Will Call list"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 0, display: 'flex' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <span style={{ fontSize: 13, opacity: 0.75 }}>Will Call</span>
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{name}</div>
        {phone && (
          <a href={`tel:${phone}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4,
            fontSize: 13, opacity: 0.85, color: '#fff', textDecoration: 'none',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
            {phone}
          </a>
        )}
      </div>

      <ProgressSteps status={status}/>

      {/* Pickup / return grid */}
      <div style={{
        background: WL.paper, padding: '12px 18px', borderBottom: `1px solid ${WL.line}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: WL.muted, marginBottom: 2 }}>PICKUP</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtPickup(order)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: WL.muted, marginBottom: 2 }}>RETURN BY</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: overdue ? WL.red : WL.ink }}>
            {fmtReturnBy(order)}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 18px 120px' }}>
        {order.staged_location && (status === 'staged' || status === 'pending') && (
          <div style={{
            background: '#eff0ff', border: `1px solid ${WL.blue}`, borderRadius: 12,
            padding: '10px 14px', marginBottom: 14, fontSize: 13,
          }}>
            <span style={{ fontWeight: 800, color: WL.blue }}>Staged at:</span>{' '}
            <span style={{ fontWeight: 600 }}>{order.staged_location}</span>
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: WL.muted, marginBottom: 10 }}>
          ITEMS ({order.items.length})
        </div>
        {order.items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 10, padding: '10px 0', borderBottom: `1px solid ${WL.line}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</span>
            <span style={{
              fontSize: 13, fontWeight: 800, background: '#f3f4f6',
              padding: '3px 10px', borderRadius: 999, flexShrink: 0,
            }}>
              ×{it.quantity}
            </span>
          </div>
        ))}
        {order.items.length === 0 && (
          <div style={{ color: WL.muted, fontSize: 13, padding: '12px 0' }}>
            No items on this order.
          </div>
        )}

        {status === 'returned' && order.has_discrepancy && order.return_notes && (
          <div style={{
            marginTop: 16, background: WL.amberTint, border: `1px solid ${WL.amber}`,
            borderRadius: 12, padding: '10px 14px', fontSize: 13,
          }}>
            <div style={{ fontWeight: 800, color: WL.amber, fontSize: 11, letterSpacing: '0.04em', marginBottom: 4 }}>
              RETURN NOTES
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{order.return_notes}</div>
          </div>
        )}
      </div>

      {/* CTA / completion block — pinned bottom */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        padding: '14px 16px calc(18px + env(safe-area-inset-bottom))',
        background: `linear-gradient(180deg, rgba(255,249,238,0) 0%, ${WL.cream} 32%)`,
      }}>
        {cta ? (
          <button
            onClick={() => router.push(cta.to)}
            style={{
              width: '100%', border: 'none', cursor: 'pointer',
              background: cta.bg, color: cta.color,
              fontWeight: 800, fontSize: 15, padding: 15, borderRadius: 16,
              fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
            }}
          >
            {cta.label}
          </button>
        ) : (
          <div style={{
            background: WL.greenTint, borderRadius: 14, padding: 14,
            textAlign: 'center', color: WL.green, fontWeight: 700, fontSize: 14,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={WL.green}
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                 style={{ display: 'block', margin: '0 auto 4px' }}>
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 12l3 3 5-6"/>
            </svg>
            Order complete — all items returned ✓
          </div>
        )}
      </div>
    </div>
  )
}
