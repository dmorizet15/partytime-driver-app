'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import { listMyWorkOrders } from '@/lib/workOrders/api'
import type { FieldWorkOrder, WorkOrderStatus } from '@/lib/workOrders/types'
import {
  WC, FONT_BODY, FONT_DISPLAY,
  PRIORITY_COLOR, STATUS_LABEL,
} from '@/lib/workOrders/theme'

type Tab = WorkOrderStatus

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'open',        label: STATUS_LABEL.open },
  { key: 'in_progress', label: STATUS_LABEL.in_progress },
  { key: 'done',        label: STATUS_LABEL.done },
]

export default function WorkOrdersListScreen() {
  const router = useRouter()
  const [tab,  setTab]  = useState<Tab>('open')
  const [rows, setRows] = useState<FieldWorkOrder[]>([])
  const [creators, setCreators] = useState<Record<string, string>>({}) // user_id → display_name
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listMyWorkOrders()
      .then(async (data) => {
        if (cancelled) return
        setRows(data)
        // Resolve creator display names in one batch.
        const ids = Array.from(new Set(data.map((r) => r.created_by_user_id))).filter(Boolean)
        if (ids.length === 0) {
          setLoading(false)
          return
        }
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', ids)
        if (cancelled) return
        if (pErr) {
          console.error('[WorkOrdersListScreen] profiles', pErr.message)
        } else if (profiles) {
          const map: Record<string, string> = {}
          for (const p of profiles) {
            map[p.id] = (p.display_name ?? '').trim() || '—'
          }
          setCreators(map)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => rows.filter((r) => r.status === tab), [rows, tab])
  const counts = useMemo(() => ({
    open:        rows.filter((r) => r.status === 'open').length,
    in_progress: rows.filter((r) => r.status === 'in_progress').length,
    done:        rows.filter((r) => r.status === 'done').length,
  }), [rows])

  return (
    <div className="screen" style={{
      background: WC.bgDark, fontFamily: FONT_BODY, color: '#fff',
      position: 'relative',
    }}>
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <div style={{
        background: WC.blue, color: '#fff',
        padding: '24px 22px 18px',
        flexShrink: 0, position: 'relative', overflow: 'hidden',
      }}>
        <svg
          aria-hidden="true"
          width={180} height={180} viewBox="0 0 100 100"
          style={{
            position: 'absolute', right: -28, top: -16,
            opacity: 0.22, transform: 'rotate(25deg)', transformOrigin: 'center',
            pointerEvents: 'none',
          }}
        >
          <path d="M50 8l8 28 28 8-28 8-8 28-8-28-28-8 28-8z" fill={WC.gold}/>
        </svg>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'relative',
        }}>
          <button
            onClick={() => router.push('/tools')}
            aria-label="Back to Tools Hub"
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.16)',
              border: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, lineHeight: 1,
            }}
          >‹</button>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: '0.24em',
            color: WC.gold, textTransform: 'uppercase',
          }}>
            Technician
          </div>
        </div>

        <div style={{
          marginTop: 16, position: 'relative',
          fontFamily: FONT_DISPLAY,
          fontSize: 32, fontWeight: 900, lineHeight: 0.95,
          letterSpacing: '-0.03em', color: '#fff',
          textTransform: 'uppercase',
        }}>
          Work orders
        </div>
        <div style={{
          marginTop: 8, position: 'relative',
          fontSize: 13, color: 'rgba(255,255,255,0.85)',
        }}>
          Field issues filed by drivers
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        background: WC.bgDark,
        borderBottom: `1px solid ${WC.cardDarkBorder}`,
        padding: '8px 12px 0',
        gap: 4,
        flexShrink: 0,
      }}>
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'transparent',
                border: 0,
                color: active ? '#fff' : WC.whiteDim,
                padding: '12px 8px',
                fontSize: 13, fontWeight: 800,
                fontFamily: 'inherit',
                cursor: 'pointer',
                borderBottom: `2px solid ${active ? WC.gold : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {t.label}
              <span style={{
                background: active ? WC.gold : 'rgba(255,255,255,0.10)',
                color: active ? WC.ink : WC.whiteDim,
                fontSize: 10.5, fontWeight: 900,
                padding: '2px 7px', borderRadius: 999,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
              }}>
                {counts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Scroll body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 16px 96px' }}>
        {loading && <div style={{ color: WC.whiteDim, fontSize: 13, padding: 12 }}>Loading…</div>}
        {error && (
          <div style={{
            color: WC.red, fontSize: 13.5,
            background: 'rgba(229,72,77,0.12)',
            border: `1px solid rgba(229,72,77,0.4)`,
            borderRadius: 12, padding: 12,
          }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{
            color: WC.whiteDim, fontSize: 13.5,
            background: WC.cardDark,
            border: `0.5px solid ${WC.cardDarkBorder}`,
            borderRadius: 14, padding: 24,
            textAlign: 'center',
          }}>
            No {STATUS_LABEL[tab].toLowerCase()} work orders.
          </div>
        )}
        {!loading && !error && filtered.map((r) => (
          <WorkOrderCard
            key={r.id}
            row={r}
            createdByName={creators[r.created_by_user_id]}
            onTap={() => router.push(`/tools/work-orders/${r.id}`)}
          />
        ))}
      </div>

      {/* ── FAB (+) → new work order (Screen 2B) ──────────────────────── */}
      <button
        onClick={() => router.push('/tools/report-issue')}
        aria-label="New work order"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 'calc(96px + env(safe-area-inset-bottom))',
          width: 56, height: 56, borderRadius: 999,
          background: WC.gold, color: WC.ink,
          border: 0, cursor: 'pointer',
          fontSize: 28, fontWeight: 900, lineHeight: 1,
          fontFamily: FONT_DISPLAY,
          boxShadow: '0 14px 30px -8px rgba(255,184,0,0.65)',
          zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        +
      </button>

      <BottomNav/>
    </div>
  )
}

// ─── Work order card ───────────────────────────────────────────────────────
function WorkOrderCard({
  row, createdByName, onTap,
}: {
  row: FieldWorkOrder
  createdByName?: string
  onTap: () => void
}) {
  const priority = (['low', 'medium', 'high'].includes(row.priority)
    ? (row.priority as 'low' | 'medium' | 'high')
    : 'medium')
  const borderColor = PRIORITY_COLOR[priority]
  const dateLabel = formatShortDate(row.created_at)

  return (
    <button
      onClick={onTap}
      style={{
        width: '100%',
        background: WC.cardDark,
        border: `0.5px solid ${WC.cardDarkBorder}`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: 12,
        padding: '14px 14px',
        marginBottom: 10,
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left',
        color: '#fff',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 13.5, fontWeight: 900, letterSpacing: '-0.005em',
          color: '#fff', flexShrink: 0,
        }}>
          {row.work_order_number}
        </div>
        <PriorityPill priority={priority} />
      </div>
      <div style={{
        fontSize: 14.5, fontWeight: 800, color: '#fff', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
      }}>
        {row.asset_name}
      </div>
      <div style={{
        fontSize: 12.5, color: WC.whiteDim, lineHeight: 1.4,
        overflow: 'hidden', textOverflow: 'ellipsis',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {row.issue_description}
      </div>
      <div style={{
        marginTop: 2,
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: WC.whiteDim,
        letterSpacing: '0.02em',
      }}>
        <span>{createdByName ?? '—'}</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{dateLabel}</span>
      </div>
    </button>
  )
}

function PriorityPill({ priority }: { priority: 'low' | 'medium' | 'high' }) {
  const color = PRIORITY_COLOR[priority]
  return (
    <span style={{
      display: 'inline-block',
      background: `${color}26`,  // ~15% alpha
      color,
      border: `0.5px solid ${color}66`,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      lineHeight: 1.3, flexShrink: 0,
    }}>
      {priority}
    </span>
  )
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameYear = d.getFullYear() === now.getFullYear()
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  } catch {
    return '—'
  }
}
