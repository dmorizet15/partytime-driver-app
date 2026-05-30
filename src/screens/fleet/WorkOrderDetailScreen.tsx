'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BottomNav from '@/components/BottomNav'
import BottomSheet from '@/components/fleet/BottomSheet'
import InvoiceUpload from '@/components/fleet/InvoiceUpload'
import ServiceLogEntry from '@/components/fleet/ServiceLogEntry'
import PartCard from '@/components/fleet/PartCard'
import { PriorityPill, SourcePill, WorkOrderStatusPill } from '@/components/fleet/FleetPills'
import { CheckIcon } from '@/components/fleet/fleetIcons'
import { useAuth } from '@/hooks/useAuth'
import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'
import {
  assignWorkOrder,
  fetchAssignableUsers,
  fetchWorkOrderDetail,
  resolveWorkOrder,
  uploadInvoice,
} from '@/lib/fleet/queries'
import { formatDate, prettyServiceType } from '@/lib/fleet/format'
import type {
  AssignableUser,
  ServiceRecordView,
  WorkOrderDetail,
} from '@/lib/fleet/types'

export default function WorkOrderDetailScreen({ workOrderId }: { workOrderId: string }) {
  const router = useRouter()
  const { user, profile } = useAuth()

  const [data, setData] = useState<WorkOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'resolve' | 'assign' | 'upload'>(null)

  const load = useCallback(async () => {
    const detail = await fetchWorkOrderDetail(workOrderId)
    if (!detail) { setNotFound(true); setLoading(false); return }
    setData(detail)
    setLoading(false)
  }, [workOrderId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const wo = data?.workOrder
  const isResolved = wo?.status === 'resolved'

  return (
    <div className="screen" style={{ background: FC.bg, fontFamily: FONT_BODY, color: FC.white }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, background: FC.bg,
        borderBottom: `0.5px solid ${FC.divider}`,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center',
      }}>
        <button
          onClick={() => router.push('/tools/fleet')}
          aria-label="Back to fleet"
          style={{
            background: 'transparent', border: 0, color: FC.amber,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
            cursor: 'pointer', fontFamily: 'inherit', padding: 0, textTransform: 'uppercase',
          }}
        >
          ← Fleet
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ background: FC.bg }}>
        {loading && <CenterNote>Loading work order…</CenterNote>}
        {!loading && notFound && <CenterNote tone="error">Work order not found.</CenterNote>}

        {!loading && data && wo && (
          <div style={{ padding: '20px 18px 28px' }}>
            {/* Title + pills */}
            <div style={{
              fontFamily: FONT_DISPLAY, fontSize: 23, fontWeight: 900,
              lineHeight: 1.15, letterSpacing: '-0.02em', color: FC.white,
            }}>
              {wo.title}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <WorkOrderStatusPill status={wo.status} />
              <SourcePill source={wo.source} />
              <PriorityPill priority={wo.priority} />
            </div>

            {isResolved && (
              <div style={{
                marginTop: 14,
                background: FC.greenBg, border: `0.5px solid ${FC.greenBorder}`,
                borderRadius: 12, padding: '12px 14px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{ flexShrink: 0, marginTop: 1 }}><CheckIcon size={18} color={FC.green} /></div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: FC.green }}>
                    Resolved {formatDate(wo.resolved_at)}
                  </div>
                  {wo.resolution_notes && (
                    <div style={{ marginTop: 3, fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.45 }}>
                      {wo.resolution_notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Asset */}
            <Card style={{ marginTop: 16 }}>
              <FieldLabel>Asset</FieldLabel>
              <div style={{ fontSize: 15, fontWeight: 800, color: FC.white }}>
                {data.asset?.name ?? 'Unknown asset'}
              </div>
              {data.asset?.subtitle && (
                <div style={{ marginTop: 2, fontSize: 12.5, color: FC.muted }}>{data.asset.subtitle}</div>
              )}
            </Card>

            {/* Meta */}
            <Card style={{ marginTop: 10 }}>
              <MetaRow label="Opened" value={formatDate(wo.created_at)} />
              <MetaRow
                label="Assigned to"
                value={data.assignedUser?.display_name?.trim() || (wo.assigned_to_user_id ? 'Assigned user' : 'Unassigned')}
                last
              />
            </Card>

            {/* Description */}
            {wo.description?.trim() && (
              <Card style={{ marginTop: 10 }}>
                <FieldLabel>Details</FieldLabel>
                <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>
                  {wo.description}
                </div>
              </Card>
            )}

            {/* Service log */}
            <SectionTitle>Service log</SectionTitle>
            {data.serviceRecords.length === 0 ? (
              <EmptyCard text="No service entries logged for this asset yet." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.serviceRecords.map((r) => <ServiceLogEntry key={r.id} record={r} />)}
              </div>
            )}

            {/* Parts */}
            <SectionTitle>Parts for this asset</SectionTitle>
            {data.parts.length === 0 ? (
              <EmptyCard text="No parts mapped to this asset." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.parts.map((p) => <PartCard key={p.part.id} entry={p} />)}
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => router.push(`/tools/fleet/work-orders/${workOrderId}/log-service`)}
                style={primaryBtn}
              >
                Log service entry
              </button>

              {!isResolved && (
                <button onClick={() => setSheet('resolve')} style={secondaryBtn}>
                  Mark resolved
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => setSheet('upload')} style={tertiaryBtn}>Upload invoice</button>
                <button onClick={() => setSheet('assign')} style={tertiaryBtn}>Assign</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomNav />

      {/* Sheets */}
      {data && wo && (
        <>
          <ResolveSheet
            open={sheet === 'resolve'}
            onClose={() => setSheet(null)}
            onResolved={() => { setSheet(null); setToast('Work order resolved'); load() }}
            workOrderId={workOrderId}
            userId={user?.id ?? null}
          />
          <AssignSheet
            open={sheet === 'assign'}
            onClose={() => setSheet(null)}
            onAssigned={(label) => { setSheet(null); setToast(label); load() }}
            workOrderId={workOrderId}
            currentUserId={user?.id ?? null}
            currentUserName={profile?.display_name ?? null}
            assignedUserId={wo.assigned_to_user_id}
          />
          <UploadSheet
            open={sheet === 'upload'}
            onClose={() => setSheet(null)}
            onUploaded={() => { setSheet(null); setToast('Invoice uploaded'); load() }}
            records={data.serviceRecords}
            userId={user?.id ?? null}
          />
        </>
      )}

      {toast && <Toast text={toast} />}
    </div>
  )
}

// ─── Resolve sheet ──────────────────────────────────────────────────────────

function ResolveSheet({
  open, onClose, onResolved, workOrderId, userId,
}: {
  open: boolean
  onClose: () => void
  onResolved: () => void
  workOrderId: string
  userId: string | null
}) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setErr(null)
    try {
      await resolveWorkOrder(workOrderId, userId, notes)
      setNotes('')
      onResolved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not resolve the work order.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Mark resolved">
      <p style={sheetHint}>
        Closes this work order. It does <strong>not</strong> create a service
        record — log that separately if work was performed.
      </p>
      <FieldLabel>Resolution notes (optional)</FieldLabel>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What was done / why it’s being closed"
        rows={3}
        style={textareaStyle}
      />
      {err && <div style={errStyle}>{err}</div>}
      <button onClick={confirm} disabled={busy} style={{ ...primaryBtn, marginTop: 14, opacity: busy ? 0.6 : 1 }}>
        {busy ? 'Resolving…' : 'Mark resolved'}
      </button>
    </BottomSheet>
  )
}

// ─── Assign sheet ───────────────────────────────────────────────────────────

function AssignSheet({
  open, onClose, onAssigned, workOrderId, currentUserId, currentUserName, assignedUserId,
}: {
  open: boolean
  onClose: () => void
  onAssigned: (toastLabel: string) => void
  workOrderId: string
  currentUserId: string | null
  currentUserName: string | null
  assignedUserId: string | null
}) {
  const [users, setUsers] = useState<AssignableUser[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    fetchAssignableUsers().then((u) => { setUsers(u); setLoaded(true) })
  }, [open, loaded])

  async function assign(userId: string | null, label: string) {
    setBusy(true)
    setErr(null)
    try {
      await assignWorkOrder(workOrderId, userId)
      onAssigned(label)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not update the assignment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Assign work order">
      {err && <div style={errStyle}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: busy ? 0.6 : 1 }}>
        {currentUserId && currentUserId !== assignedUserId && (
          <SheetRow
            label={`Assign to me${currentUserName ? ` · ${currentUserName}` : ''}`}
            onClick={() => assign(currentUserId, 'Assigned to you')}
          />
        )}
        {assignedUserId && (
          <SheetRow label="Unassign" tone="muted" onClick={() => assign(null, 'Work order unassigned')} />
        )}
        {!loaded && <div style={sheetHint}>Loading fleet users…</div>}
        {loaded && users
          .filter((u) => u.id !== currentUserId)
          .map((u) => (
            <SheetRow
              key={u.id}
              label={u.display_name?.trim() || 'Fleet user'}
              selected={u.id === assignedUserId}
              onClick={() => assign(u.id, `Assigned to ${u.display_name?.trim() || 'fleet user'}`)}
            />
          ))}
        {loaded && users.length === 0 && !currentUserId && (
          <div style={sheetHint}>No assignable fleet users found.</div>
        )}
      </div>
    </BottomSheet>
  )
}

// ─── Upload invoice sheet ───────────────────────────────────────────────────

function UploadSheet({
  open, onClose, onUploaded, records, userId,
}: {
  open: boolean
  onClose: () => void
  onUploaded: () => void
  records: ServiceRecordView[]
  userId: string | null
}) {
  const [targetId, setTargetId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setTargetId(null); setErr(null) }
  }, [open])

  async function doUpload(file: File) {
    if (!targetId) return
    setBusy(true)
    setErr(null)
    try {
      await uploadInvoice(targetId, file, userId)
      onUploaded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Upload invoice">
      {records.length === 0 ? (
        <p style={sheetHint}>
          No service records yet. Log a service entry first, then attach its invoice here.
        </p>
      ) : (
        <>
          <p style={sheetHint}>Pick the service record this invoice belongs to.</p>
          {err && <div style={errStyle}>{err}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {records.map((r) => (
              <div key={r.id}>
                <SheetRow
                  label={`${prettyServiceType(r.service_type)} · ${formatDate(r.service_date)}`}
                  selected={r.id === targetId}
                  onClick={() => setTargetId((cur) => (cur === r.id ? null : r.id))}
                />
                {targetId === r.id && (
                  <div style={{ padding: '10px 2px 4px' }}>
                    {busy
                      ? <div style={sheetHint}>Uploading…</div>
                      : <InvoiceUpload value={null} onChange={(f) => { if (f) doUpload(f) }} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  )
}

// ─── Small shared pieces ────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 14, padding: '14px 14px', ...style,
    }}>
      {children}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: FC.faint, marginBottom: 5,
    }}>
      {children}
    </div>
  )
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '7px 0',
      borderBottom: last ? 'none' : `0.5px solid ${FC.divider}`,
    }}>
      <span style={{ fontSize: 12.5, color: FC.muted }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: FC.white, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '24px 0 10px',
      fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 800,
      letterSpacing: '0.2em', textTransform: 'uppercase', color: FC.muted,
    }}>
      {children}
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 14, padding: '18px 16px',
      fontSize: 13, color: FC.muted, textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

function SheetRow({
  label, onClick, selected, tone,
}: {
  label: string
  onClick: () => void
  selected?: boolean
  tone?: 'muted'
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: selected ? 'rgba(96,140,255,0.12)' : FC.cardRaised,
        border: `0.5px solid ${selected ? 'rgba(96,140,255,0.32)' : FC.cardBorder}`,
        borderRadius: 12, padding: '13px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        color: tone === 'muted' ? FC.muted : FC.white,
        fontSize: 14, fontWeight: 700,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {selected && <CheckIcon size={16} color="#7DA0FF" />}
    </button>
  )
}

function CenterNote({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: tone === 'error' ? FC.red : FC.muted, fontSize: 14 }}>
      {children}
    </div>
  )
}

function Toast({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%',
        bottom: 'calc(108px + env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)',
        background: FC.cardRaised, color: FC.white,
        padding: '10px 18px', borderRadius: 999,
        fontSize: 13, fontWeight: 600,
        border: `0.5px solid ${FC.cardBorder}`,
        boxShadow: '0 12px 30px -10px rgba(0,0,0,0.6)',
        zIndex: 300, maxWidth: '80vw', textAlign: 'center',
      }}
    >
      {text}
    </div>
  )
}

// ─── Button styles ──────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  background: FC.blue, color: FC.white,
  border: 0, borderRadius: 12, padding: '14px 16px',
  fontSize: 14, fontWeight: 800, letterSpacing: '0.01em',
}

const secondaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  background: 'transparent', color: FC.green,
  border: `1px solid ${FC.greenBorder}`, borderRadius: 12, padding: '13px 16px',
  fontSize: 14, fontWeight: 800,
}

const tertiaryBtn: React.CSSProperties = {
  width: '100%', cursor: 'pointer', fontFamily: 'inherit',
  background: FC.card, color: FC.white,
  border: `0.5px solid ${FC.cardBorder}`, borderRadius: 12, padding: '13px 10px',
  fontSize: 13, fontWeight: 700,
}

const textareaStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: FC.cardRaised, color: FC.white,
  border: `0.5px solid ${FC.cardBorder}`, borderRadius: 12,
  padding: '11px 12px', fontSize: 14, fontFamily: 'inherit',
  resize: 'vertical', lineHeight: 1.45,
}

const sheetHint: React.CSSProperties = {
  fontSize: 12.5, color: FC.muted, lineHeight: 1.5, margin: '0 0 14px',
}

const errStyle: React.CSSProperties = {
  background: FC.redBg, color: FC.red,
  border: `0.5px solid ${FC.redBorder}`, borderRadius: 10,
  padding: '9px 12px', fontSize: 12.5, marginBottom: 12,
}
