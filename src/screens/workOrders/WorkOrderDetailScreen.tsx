'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import { supabase } from '@/lib/supabase'
import { getWorkOrder, updateWorkOrder } from '@/lib/workOrders/api'
import type { FieldWorkOrder, WorkOrderStatus } from '@/lib/workOrders/types'
import {
  WC, FONT_BODY, FONT_DISPLAY,
  PRIORITY_COLOR, STATUS_LABEL,
} from '@/lib/workOrders/theme'

export interface WorkOrderDetailScreenProps {
  id: string
}

export default function WorkOrderDetailScreen({ id }: WorkOrderDetailScreenProps) {
  const router = useRouter()
  const [row, setRow] = useState<FieldWorkOrder | null>(null)
  const [creatorName,  setCreatorName]  = useState<string | null>(null)
  const [assigneeName, setAssigneeName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [updating, setUpdating] = useState<false | 'status' | 'notes'>(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  // Add-note modal
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteDraft,     setNoteDraft]     = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getWorkOrder(id)
      .then(async (r) => {
        if (cancelled) return
        if (!r) {
          setError('Work order not found.')
          setLoading(false)
          return
        }
        setRow(r)
        // Resolve display names in one batch.
        const ids = Array.from(new Set([r.created_by_user_id, r.assigned_to_user_id])).filter(Boolean)
        const { data: profiles, error: pErr } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', ids)
        if (cancelled) return
        if (pErr) {
          console.error('[WorkOrderDetailScreen] profiles', pErr.message)
        } else if (profiles) {
          for (const p of profiles) {
            const nm = (p.display_name ?? '').trim() || null
            if (p.id === r.created_by_user_id) setCreatorName(nm)
            if (p.id === r.assigned_to_user_id) setAssigneeName(nm)
          }
        }
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load.')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  async function transitionStatus(next: WorkOrderStatus) {
    if (!row || updating) return
    setUpdating('status')
    setUpdateError(null)
    try {
      await updateWorkOrder(row.id, { status: next })
      setRow({ ...row, status: next, updated_at: new Date().toISOString() })
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update.')
    } finally {
      setUpdating(false)
    }
  }

  async function submitNote() {
    if (!row || updating) return
    const trimmed = noteDraft.trim()
    if (!trimmed) return
    setUpdating('notes')
    setUpdateError(null)
    // Build the next notes value: existing + timestamped new entry. We send
    // the full value because we don't control the dashboard's PATCH logic
    // (replace vs append). Replace semantics + client-side concat = safe.
    const stamp = formatStamp(new Date())
    const next = row.notes && row.notes.trim().length > 0
      ? `${row.notes.trim()}\n\n[${stamp}]\n${trimmed}`
      : `[${stamp}]\n${trimmed}`
    try {
      await updateWorkOrder(row.id, { notes: next })
      setRow({ ...row, notes: next, updated_at: new Date().toISOString() })
      setShowNoteModal(false)
      setNoteDraft('')
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update.')
    } finally {
      setUpdating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="screen" style={{ background: WC.bgDark, fontFamily: FONT_BODY, color: '#fff' }}>
        <DetailHeader onBack={() => router.push('/tools/work-orders')} title="Work order" />
        <div style={{ padding: 24, color: WC.whiteDim, fontSize: 13 }}>Loading…</div>
        <BottomNav/>
      </div>
    )
  }

  if (error || !row) {
    return (
      <div className="screen" style={{ background: WC.bgDark, fontFamily: FONT_BODY, color: '#fff' }}>
        <DetailHeader onBack={() => router.push('/tools/work-orders')} title="Work order" />
        <div style={{ padding: 24 }}>
          <div style={{
            color: WC.red, fontSize: 13.5,
            background: 'rgba(229,72,77,0.12)',
            border: `1px solid rgba(229,72,77,0.4)`,
            borderRadius: 12, padding: 12,
          }}>
            {error ?? 'Work order not found.'}
          </div>
        </div>
        <BottomNav/>
      </div>
    )
  }

  const priority = (['low', 'medium', 'high'].includes(row.priority)
    ? (row.priority as 'low' | 'medium' | 'high')
    : 'medium')
  const status = (['open', 'in_progress', 'done'].includes(row.status)
    ? (row.status as WorkOrderStatus)
    : 'open')
  const orderLabel = row.tapgoods_order_number ?? null
  const customer = row.customer_name?.trim() || null

  return (
    <div className="screen" style={{ background: WC.bgDark, fontFamily: FONT_BODY, color: '#fff' }}>
      <DetailHeader
        onBack={() => router.push('/tools/work-orders')}
        title={row.work_order_number}
        subtitle={STATUS_LABEL[status]}
        statusColor={PRIORITY_COLOR[priority]}
      />

      <div className="flex-1 overflow-y-auto" style={{ padding: '14px 16px 96px' }}>
        {/* ── Status / priority row ──────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
        }}>
          <KvPill label="Status"   value={STATUS_LABEL[status]} />
          <KvPill label="Priority" value={priority.toUpperCase()} tint={PRIORITY_COLOR[priority]} />
          <KvPill label="Billing"  value={billingLabel(row.billing_status)} />
        </div>

        {/* ── Asset card ────────────────────────────────────────────── */}
        <Card>
          <CardLabel>Asset</CardLabel>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
            {row.asset_name}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: WC.whiteDim, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {assetTypeLabel(row.asset_type)}
            {row.serial_number && (
              <>
                <span style={{ margin: '0 6px', opacity: 0.5 }}>·</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.serial_number}</span>
              </>
            )}
          </div>
        </Card>

        {/* ── Issue card ────────────────────────────────────────────── */}
        <Card>
          <CardLabel>Issue</CardLabel>
          <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {row.issue_description}
          </div>
        </Card>

        {/* ── Order card (when linked) ──────────────────────────────── */}
        {(orderLabel || customer || row.stop_id) && (
          <Card>
            <CardLabel>Related order</CardLabel>
            {orderLabel && (
              <div style={{
                fontSize: 16, fontWeight: 800, color: '#fff',
                fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
              }}>
                #{orderLabel}
              </div>
            )}
            {customer && (
              <div style={{ marginTop: 4, fontSize: 13, color: WC.whiteDim }}>
                {customer}
              </div>
            )}
          </Card>
        )}

        {/* ── Notes log ─────────────────────────────────────────────── */}
        <Card>
          <CardLabel>Notes</CardLabel>
          {row.notes && row.notes.trim().length > 0 ? (
            <div style={{
              fontSize: 13.5, color: WC.whiteDim, lineHeight: 1.55,
              whiteSpace: 'pre-wrap', fontVariantNumeric: 'tabular-nums',
            }}>
              {row.notes}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: WC.whiteDim, fontStyle: 'italic' }}>No notes yet.</div>
          )}
        </Card>

        {/* ── Meta (created / assigned) ─────────────────────────────── */}
        <Card>
          <CardLabel>Meta</CardLabel>
          <Meta label="Created by" value={creatorName ?? '—'} />
          <Meta label="Created" value={formatLong(row.created_at)} />
          <Meta label="Assigned to" value={assigneeName ?? '—'} />
          <Meta label="Updated" value={formatLong(row.updated_at)} />
        </Card>

        {/* ── Error pill ────────────────────────────────────────────── */}
        {updateError && (
          <div style={{
            marginTop: 6,
            color: WC.red, fontSize: 13,
            background: 'rgba(229,72,77,0.12)',
            border: `1px solid rgba(229,72,77,0.4)`,
            borderRadius: 12, padding: 10,
          }}>
            {updateError}
          </div>
        )}
      </div>

      {/* ── Sticky action bar ─────────────────────────────────────── */}
      <div style={{
        background: WC.cardDark,
        borderTop: `1px solid ${WC.cardDarkBorder}`,
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 8,
        flexShrink: 0,
      }}>
        {status !== 'done' && (
          <>
            {status === 'open' && (
              <ActionBtn
                tint={WC.amber}
                disabled={updating !== false}
                onClick={() => transitionStatus('in_progress')}
              >
                {updating === 'status' ? '…' : 'Mark In Progress'}
              </ActionBtn>
            )}
            <ActionBtn
              tint={WC.green}
              disabled={updating !== false}
              onClick={() => transitionStatus('done')}
            >
              {updating === 'status' ? '…' : 'Mark Complete'}
            </ActionBtn>
          </>
        )}
        <ActionBtn
          tint={WC.gold}
          ink
          disabled={updating !== false}
          onClick={() => { setNoteDraft(''); setShowNoteModal(true) }}
        >
          + Note
        </ActionBtn>
      </div>

      {/* ── Add-note modal ────────────────────────────────────────── */}
      {showNoteModal && (
        <NoteModal
          value={noteDraft}
          onChange={setNoteDraft}
          onCancel={() => { setShowNoteModal(false); setNoteDraft('') }}
          onSave={submitNote}
          saving={updating === 'notes'}
        />
      )}

      <BottomNav/>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function DetailHeader({
  onBack, title, subtitle, statusColor,
}: {
  onBack: () => void
  title: string
  subtitle?: string
  statusColor?: string
}) {
  return (
    <div style={{
      background: WC.blue, color: '#fff',
      padding: '18px 20px 16px',
      flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button
        onClick={onBack}
        aria-label="Back"
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'rgba(255,255,255,0.16)',
          border: 0, cursor: 'pointer', color: '#fff',
          fontSize: 22, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >‹</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 18, fontWeight: 900, color: '#fff',
          letterSpacing: '-0.01em', lineHeight: 1.15,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            marginTop: 2, fontSize: 11, fontWeight: 800,
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: statusColor ?? WC.gold,
          }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: WC.cardDark,
      border: `0.5px solid ${WC.cardDarkBorder}`,
      borderRadius: 14,
      padding: '14px 14px',
      marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 6,
      fontSize: 10.5, fontWeight: 800,
      letterSpacing: '0.18em', textTransform: 'uppercase',
      color: WC.whiteDim,
    }}>
      {children}
    </div>
  )
}

function KvPill({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div style={{
      background: WC.cardDark,
      border: `0.5px solid ${WC.cardDarkBorder}`,
      borderRadius: 10,
      padding: '6px 10px',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 800,
        letterSpacing: '0.16em', textTransform: 'uppercase',
        color: WC.whiteDim,
      }}>{label}</span>
      <span style={{
        fontSize: 12, fontWeight: 800, color: tint ?? '#fff',
      }}>{value}</span>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '4px 0',
      fontSize: 13, color: WC.whiteDim,
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 800,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        minWidth: 92, opacity: 0.7,
      }}>{label}</span>
      <span style={{ color: '#fff', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function ActionBtn({
  children, onClick, tint, ink, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  tint: string
  ink?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        background: tint,
        color: ink ? WC.ink : '#fff',
        border: 0,
        borderRadius: 999,
        padding: '0 14px',
        height: 46,
        fontSize: 13.5, fontWeight: 900, fontFamily: FONT_DISPLAY,
        letterSpacing: '-0.005em',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function NoteModal({
  value, onChange, onCancel, onSave, saving,
}: {
  value: string
  onChange: (v: string) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      fontFamily: FONT_BODY,
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: WC.cardDark, color: '#fff',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        padding: '18px 18px calc(18px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 900,
          letterSpacing: '-0.01em',
        }}>
          Add a note
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add an update for the team…"
          rows={4}
          autoFocus
          style={{
            width: '100%',
            background: WC.bgDark,
            color: '#fff',
            border: `1px solid ${WC.cardDarkBorder}`,
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5,
            resize: 'vertical',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              flex: 1, height: 46, borderRadius: 999,
              background: 'transparent',
              border: `1px solid ${WC.cardDarkBorder}`,
              color: '#fff',
              fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || value.trim().length === 0}
            style={{
              flex: 1, height: 46, borderRadius: 999,
              background: WC.gold,
              color: WC.ink, border: 0,
              fontSize: 14, fontWeight: 900, fontFamily: FONT_DISPLAY,
              letterSpacing: '-0.005em',
              cursor: saving ? 'default' : 'pointer',
              opacity: (saving || value.trim().length === 0) ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function assetTypeLabel(t: string): string {
  switch (t) {
    case 'truck':      return 'Truck'
    case 'equipment':  return 'Equipment'
    case 'field_item': return 'Field item'
    case 'other':      return 'Other'
    default:           return t
  }
}

function billingLabel(b: string): string {
  switch (b) {
    case 'undecided':     return 'Decide later'
    case 'bill_customer': return 'Bill customer'
    case 'no_charge':     return 'No charge'
    default:              return b || '—'
  }
}

function formatLong(iso: string): string {
  try {
    const d = new Date(iso)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' }),
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  } catch {
    return '—'
  }
}

function formatStamp(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}
