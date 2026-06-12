'use client'

// ─── Will Call — Screen 1: order list ────────────────────────────────────────
// Built to the locked WillCallMockup.jsx (docs/design-references/). Filter
// strip Today / This Week / All (default Today), then four sections within
// the filtered set: Action Needed (pending + awaiting_return), Staged —
// Ready, Out with Customers (picked_up), Complete (returned). Overdue cards
// get a red border; staged cards a blue border.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { useWillCallOrders } from '@/hooks/willCall/useWillCallOrders'
import { StatePill } from '@/components/willCall/atoms'
import { WL, FONT_BODY, FONT_DISPLAY } from '@/lib/willCall/theme'
import { dateKey, fmtPickup, fmtReturnBy, localToday } from '@/lib/willCall/format'
import type { WillCallOrder } from '@/lib/willCall/types'

type Filter = 'today' | 'week' | 'all'

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Today = pickup expected today OR overdue return (always actionable). This
// Week = pickup within the next 7 days OR overdue. All = everything the API
// returned (non-returned + last 7 days of returned).
function matchesFilter(order: WillCallOrder, filter: Filter, today: string): boolean {
  if (filter === 'all') return true
  if (order.status === 'awaiting_return') return true
  const pickup = dateKey(order.expected_pickup_date)
  if (filter === 'today') return pickup === today
  return !!pickup && pickup >= today && pickup <= addDays(today, 6)
}

export default function WillCallListScreen() {
  const router = useRouter()
  const { orders, loading, error } = useWillCallOrders()
  const [filter, setFilter] = useState<Filter>('today')
  const today = localToday()

  const filtered = useMemo(
    () => orders.filter((o) => matchesFilter(o, filter, today)),
    [orders, filter, today]
  )

  const action = filtered.filter((o) => o.status === 'pending' || o.status === 'awaiting_return')
  const staged = filtered.filter((o) => o.status === 'staged')
  const out    = filtered.filter((o) => o.status === 'picked_up')
  const done   = filtered.filter((o) => o.status === 'returned')

  return (
    <div className="screen" style={{ background: WL.cream, fontFamily: FONT_BODY, color: WL.ink }}>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{ background: WL.blue, padding: '18px 18px 16px', color: '#fff', flexShrink: 0 }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: 900,
          letterSpacing: '-0.02em', textTransform: 'uppercase',
        }}>
          Will Call
        </div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>
          {loading && orders.length === 0
            ? 'Loading orders…'
            : `${filtered.length} order${filtered.length === 1 ? '' : 's'} · ${action.length} need${action.length === 1 ? 's' : ''} action`}
        </div>

        {/* Filter strip */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {([['today', 'Today'], ['week', 'This Week'], ['all', 'All']] as const).map(([key, label]) => {
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  border: 0, cursor: 'pointer', borderRadius: 999,
                  padding: '7px 15px', fontSize: 12.5, fontWeight: 800,
                  fontFamily: 'inherit',
                  background: active ? '#fff' : 'rgba(255,255,255,0.16)',
                  color: active ? WL.blue : '#fff',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── SCROLL BODY ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '6px 14px 24px' }}>
        {error && (
          <div style={{
            marginTop: 14, background: WL.redTint, border: `1px solid ${WL.red}`,
            borderRadius: 12, padding: '10px 14px', fontSize: 13, color: WL.red, fontWeight: 600,
          }}>
            {error}
          </div>
        )}

        <Section label="ACTION NEEDED" orders={action} onSelect={(id) => router.push(`/will-call/${id}`)} />
        <Section label="STAGED — READY FOR PICKUP" orders={staged} onSelect={(id) => router.push(`/will-call/${id}`)} />
        <Section label="OUT WITH CUSTOMERS" orders={out} onSelect={(id) => router.push(`/will-call/${id}`)} />
        <Section label="COMPLETE" orders={done} onSelect={(id) => router.push(`/will-call/${id}`)} />

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: WL.muted, fontSize: 14, padding: '48px 20px' }}>
            {filter === 'today' ? 'No Will Call orders need attention today.' : 'No Will Call orders here.'}
          </div>
        )}
      </div>

      <BottomNav/>
    </div>
  )
}

function Section({ label, orders, onSelect }: {
  label: string
  orders: WillCallOrder[]
  onSelect: (id: string) => void
}) {
  if (orders.length === 0) return null
  return (
    <>
      <div style={{
        fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
        color: WL.muted, marginTop: 16, marginBottom: 8,
      }}>
        {label}
      </div>
      {orders.map((o) => <OrderCard key={o.id} order={o} onSelect={onSelect} />)}
    </>
  )
}

function OrderCard({ order, onSelect }: { order: WillCallOrder; onSelect: (id: string) => void }) {
  const st        = order.status
  const isOverdue = st === 'awaiting_return'
  const isStaged  = st === 'staged'
  const name      = order.customer_name?.trim() || order.company_name?.trim() || 'Will Call customer'

  return (
    <button
      onClick={() => onSelect(order.id)}
      style={{
        width: '100%', textAlign: 'left', fontFamily: 'inherit',
        background: WL.paper, borderRadius: 14, marginBottom: 10, cursor: 'pointer',
        border: `1.5px solid ${isOverdue ? WL.red : isStaged ? WL.blue : WL.line}`,
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        color: WL.ink,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </span>
          <StatePill status={st}/>
        </div>
        <div style={{ fontSize: 12, color: WL.muted }}>
          {order.items.length} item{order.items.length === 1 ? '' : 's'}
        </div>
        <div style={{ fontSize: 12, marginTop: 3 }}>
          {isOverdue && <span style={{ color: WL.red, fontWeight: 700 }}>↩ Return due: {fmtReturnBy(order)}</span>}
          {isStaged && <span style={{ color: WL.blue, fontWeight: 700 }}>Pickup: {fmtPickup(order)}</span>}
          {st === 'pending' && <span style={{ color: WL.muted }}>Pickup: {fmtPickup(order)}</span>}
          {st === 'picked_up' && <span style={{ color: WL.muted }}>Returns: {fmtReturnBy(order)}</span>}
          {st === 'returned' && <span style={{ color: WL.green, fontWeight: 600 }}>Complete ✓</span>}
        </div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WL.muted}
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M9 6l6 6-6 6"/>
      </svg>
    </button>
  )
}
