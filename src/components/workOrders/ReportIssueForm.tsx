'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  createWorkOrder,
  listTechnicians,
  type TechnicianRow,
} from '@/lib/workOrders/api'
import type {
  CreateWorkOrderPayload,
  WorkOrderAssetType,
  WorkOrderBilling,
  WorkOrderPriority,
} from '@/lib/workOrders/types'
import { WC, FONT_DISPLAY, FONT_BODY } from '@/lib/workOrders/theme'

// ─── Props ─────────────────────────────────────────────────────────────────
export interface ReportIssueFormStopContext {
  stop_id:       string
  order_number:  string
  customer_name: string
  items:         Array<{ category?: string | null; name?: string | null; qty?: number | null }>
}

export interface ReportIssueFormResult {
  workOrderNumber: string
  assigneeName:    string
  stopId:          string | null
}

interface ReportIssueFormProps {
  // When `stop` is provided we render Screen 2A (locked context bar +
  // item picker). When undefined we render Screen 2B (asset-type toggle).
  stop?: ReportIssueFormStopContext
  onSuccess: (result: ReportIssueFormResult) => void
  onCancel?: () => void
}

// ─── Tokens (local; mirror StopDetailScreen) ───────────────────────────────
const C = {
  ink:    WC.ink,
  paper:  WC.paper,
  cream:  WC.cream,
  off:    WC.off,
  muted:  WC.muted,
  gold:   WC.gold,
  green:  WC.green,
  red:    WC.red,
  amber:  WC.amber,
  blue:   WC.blue,
} as const

// ─── Component ─────────────────────────────────────────────────────────────
export default function ReportIssueForm({
  stop,
  onSuccess,
  onCancel,
}: ReportIssueFormProps) {
  const { user, profile } = useAuth()
  const isStopContext = !!stop

  // ── Asset state ─────────────────────────────────────────────────────────
  // Stop mode: pick from stop.items OR provide custom name+serial.
  // Standalone: choose asset_type, then search/select for truck/equipment
  // or free-text for field_item/other.
  const [stopItemIdx, setStopItemIdx] = useState<number | null>(null)
  const [useStopCustom, setUseStopCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customSerial, setCustomSerial] = useState('')

  const [assetType, setAssetType] = useState<WorkOrderAssetType>(
    isStopContext ? 'field_item' : 'truck'
  )

  // Asset search (Truck / Equipment paths)
  const [assetQuery, setAssetQuery] = useState('')
  const [assetResults, setAssetResults] = useState<Array<{
    id: string; name: string; serial: string | null; type: 'truck' | 'equipment'
  }>>([])
  const [assetSearchLoading, setAssetSearchLoading] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<{
    id: string; name: string; serial: string | null
  } | null>(null)
  const [showManualEntry, setShowManualEntry] = useState(false)

  // ── Related-order search (standalone, optional) ─────────────────────────
  const [orderQuery, setOrderQuery] = useState('')
  const [orderResults, setOrderResults] = useState<Array<{
    stop_id: string; order_number: string; customer_name: string
  }>>([])
  const [orderSearchLoading, setOrderSearchLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{
    stop_id: string; order_number: string; customer_name: string
  } | null>(null)

  // ── Common fields ───────────────────────────────────────────────────────
  const [issueDescription, setIssueDescription] = useState('')
  const [priority, setPriority] = useState<WorkOrderPriority>('medium')
  const [billing, setBilling] = useState<WorkOrderBilling>('undecided')

  // Assign-to: self vs picker. Defaults to self.
  const [assignSelf, setAssignSelf] = useState(true)
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([])
  const [techniciansLoading, setTechniciansLoading] = useState(false)
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null)

  // ── Submit ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // ── Effects: load technicians on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setTechniciansLoading(true)
    listTechnicians().then((rows) => {
      if (cancelled) return
      // Exclude the current user from the picker (self is the other toggle).
      const filtered = rows.filter((r) => r.id !== user?.id)
      setTechnicians(filtered)
      setTechniciansLoading(false)
    }).catch((err) => {
      console.error('[ReportIssueForm] technicians load failed', err)
      if (!cancelled) setTechniciansLoading(false)
    })
    return () => { cancelled = true }
  }, [user?.id])

  // Asset search — debounced. Standalone mode only.
  useEffect(() => {
    if (isStopContext) return
    if (assetType !== 'truck' && assetType !== 'equipment') {
      setAssetResults([])
      return
    }
    const q = assetQuery.trim()
    if (q.length < 1) {
      setAssetResults([])
      return
    }
    let cancelled = false
    setAssetSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        if (assetType === 'truck') {
          const { data, error } = await supabase
            .from('trucks')
            .select('id, name, plate, vin')
            .or(`name.ilike.%${q}%,plate.ilike.%${q}%,vin.ilike.%${q}%`)
            .limit(8)
          if (!cancelled) {
            if (error) {
              console.error('[ReportIssueForm] truck search', error.message)
              setAssetResults([])
            } else {
              setAssetResults((data ?? []).map((r) => ({
                id:     r.id,
                name:   r.name ?? '(unnamed truck)',
                serial: r.plate ?? r.vin ?? null,
                type:   'truck' as const,
              })))
            }
          }
        } else {
          const { data, error } = await supabase
            .from('non_truck_assets')
            .select('id, name, serial_number')
            .or(`name.ilike.%${q}%,serial_number.ilike.%${q}%`)
            .limit(8)
          if (!cancelled) {
            if (error) {
              console.error('[ReportIssueForm] equipment search', error.message)
              setAssetResults([])
            } else {
              setAssetResults((data ?? []).map((r) => ({
                id:     r.id,
                name:   r.name ?? '(unnamed equipment)',
                serial: r.serial_number,
                type:   'equipment' as const,
              })))
            }
          }
        }
      } finally {
        if (!cancelled) setAssetSearchLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isStopContext, assetType, assetQuery])

  // Related-order search — debounced. Standalone mode only.
  useEffect(() => {
    if (isStopContext) return
    const q = orderQuery.trim()
    if (q.length < 2) {
      setOrderResults([])
      return
    }
    let cancelled = false
    setOrderSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('dispatch_stops')
          .select('id, tapgoods_order_token, customer_name, company_name')
          .or(`tapgoods_order_token.ilike.%${q}%,customer_name.ilike.%${q}%,company_name.ilike.%${q}%`)
          .order('scheduled_date', { ascending: false })
          .limit(8)
        if (!cancelled) {
          if (error) {
            console.error('[ReportIssueForm] order search', error.message)
            setOrderResults([])
          } else {
            setOrderResults((data ?? []).map((r) => ({
              stop_id:       r.id,
              order_number:  r.tapgoods_order_token ?? '—',
              customer_name: r.company_name?.trim() || r.customer_name || '—',
            })))
          }
        }
      } finally {
        if (!cancelled) setOrderSearchLoading(false)
      }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isStopContext, orderQuery])

  // ── Derived: validation ─────────────────────────────────────────────────
  const assigneeId = assignSelf ? user?.id ?? null : selectedTechnicianId
  const assigneeName = useMemo(() => {
    if (assignSelf) return profile?.display_name?.trim() || 'You'
    const t = technicians.find((r) => r.id === selectedTechnicianId)
    return t?.display_name?.trim() || 'Assignee'
  }, [assignSelf, selectedTechnicianId, technicians, profile?.display_name])

  // Resolve the asset payload from form state.
  const assetPayload = useMemo<null | {
    asset_type:   WorkOrderAssetType
    asset_name:   string
    asset_id:     string | null
    serial_number: string | null
  }>(() => {
    if (isStopContext) {
      if (!useStopCustom && stopItemIdx != null) {
        const itm = stop!.items[stopItemIdx]
        const nm = (itm?.name ?? '').trim()
        if (!nm) return null
        return {
          asset_type:    'field_item',
          asset_name:    nm,
          asset_id:      null,
          serial_number: null,
        }
      }
      if (useStopCustom) {
        const nm = customName.trim()
        if (!nm) return null
        return {
          asset_type:    'field_item',
          asset_name:    nm,
          asset_id:      null,
          serial_number: customSerial.trim() || null,
        }
      }
      return null
    }
    // Standalone
    if (assetType === 'truck' || assetType === 'equipment') {
      if (selectedAsset) {
        return {
          asset_type:    assetType,
          asset_name:    selectedAsset.name,
          asset_id:      selectedAsset.id,
          serial_number: selectedAsset.serial,
        }
      }
      if (showManualEntry && customName.trim()) {
        return {
          asset_type:    assetType,
          asset_name:    customName.trim(),
          asset_id:      null,
          serial_number: customSerial.trim() || null,
        }
      }
      return null
    }
    // field_item / other — free-text
    const nm = customName.trim()
    if (!nm) return null
    return {
      asset_type:    assetType,
      asset_name:    nm,
      asset_id:      null,
      serial_number: customSerial.trim() || null,
    }
  }, [
    isStopContext, useStopCustom, stopItemIdx, stop,
    customName, customSerial, assetType, selectedAsset, showManualEntry,
  ])

  const canSubmit =
    !!user?.id
    && !!assigneeId
    && !!assetPayload
    && issueDescription.trim().length > 0
    && !submitting

  async function handleSubmit() {
    if (!canSubmit || !user?.id || !assigneeId || !assetPayload) return
    setSubmitting(true)
    setSubmitError(null)

    const payload: CreateWorkOrderPayload = {
      ...assetPayload,
      issue_description:      issueDescription.trim(),
      priority,
      billing_status:         billing,
      assigned_to_user_id:    assigneeId,
      stop_id:                stop?.stop_id ?? selectedOrder?.stop_id ?? null,
      tapgoods_order_number:  stop?.order_number ?? selectedOrder?.order_number ?? null,
      customer_name:          stop?.customer_name ?? selectedOrder?.customer_name ?? null,
    }
    try {
      const res = await createWorkOrder(payload)
      onSuccess({
        workOrderNumber: res.work_order_number,
        assigneeName,
        stopId: payload.stop_id ?? null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit.'
      setSubmitError(msg)
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      background: C.cream,
      fontFamily: FONT_BODY,
      color: C.ink,
      minHeight: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* ── Context bar (stop mode only) ────────────────────────────────── */}
      {isStopContext && stop && (
        <div style={{
          background: C.ink, color: '#fff',
          padding: '14px 18px',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 900, letterSpacing: '0.18em',
            color: C.gold, textTransform: 'uppercase',
          }}>
            Issue for order
          </div>
          <div style={{
            marginTop: 4, fontSize: 18, fontWeight: 900,
            fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em',
            lineHeight: 1.15, color: '#fff',
          }}>
            #{stop.order_number}
          </div>
          <div style={{
            marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.7)',
          }}>
            {stop.customer_name}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto" style={{ padding: '18px 18px 32px' }}>
        {/* ── Section: Asset ─────────────────────────────────────────────── */}
        <SectionLabel>{isStopContext ? 'Which item has the issue?' : 'What is the issue with?'}</SectionLabel>

        {isStopContext ? (
          <StopItemPicker
            items={stop!.items}
            selectedIdx={stopItemIdx}
            useCustom={useStopCustom}
            customName={customName}
            customSerial={customSerial}
            onSelect={(i) => { setStopItemIdx(i); setUseStopCustom(false) }}
            onUseCustom={() => { setStopItemIdx(null); setUseStopCustom(true) }}
            onCustomName={setCustomName}
            onCustomSerial={setCustomSerial}
          />
        ) : (
          <StandaloneAssetPicker
            assetType={assetType}
            onAssetType={(t) => {
              setAssetType(t)
              setSelectedAsset(null)
              setShowManualEntry(false)
              setAssetQuery('')
              if (t === 'field_item' || t === 'other') {
                // free-text path keeps customName / customSerial
              } else {
                setCustomName('')
                setCustomSerial('')
              }
            }}
            assetQuery={assetQuery}
            onAssetQuery={setAssetQuery}
            assetResults={assetResults}
            assetSearchLoading={assetSearchLoading}
            selectedAsset={selectedAsset}
            onSelectAsset={(a) => { setSelectedAsset(a); setShowManualEntry(false) }}
            onClearSelectedAsset={() => setSelectedAsset(null)}
            showManualEntry={showManualEntry}
            onShowManualEntry={() => { setSelectedAsset(null); setShowManualEntry(true) }}
            customName={customName}
            customSerial={customSerial}
            onCustomName={setCustomName}
            onCustomSerial={setCustomSerial}
          />
        )}

        {/* ── Section: Related order (standalone only, optional) ─────────── */}
        {!isStopContext && (
          <>
            <SectionLabel>Related order (optional)</SectionLabel>
            <OrderSearch
              query={orderQuery}
              onQuery={setOrderQuery}
              results={orderResults}
              loading={orderSearchLoading}
              selected={selectedOrder}
              onSelect={(o) => setSelectedOrder(o)}
              onClear={() => { setSelectedOrder(null); setOrderQuery('') }}
            />
          </>
        )}

        {/* ── Section: Issue description ────────────────────────────────── */}
        <SectionLabel>Describe the issue</SectionLabel>
        <textarea
          value={issueDescription}
          onChange={(e) => setIssueDescription(e.target.value)}
          placeholder="What's wrong? Include anything a technician would need to know."
          rows={4}
          style={{
            width: '100%',
            background: C.paper,
            border: `1.5px solid rgba(10,11,20,0.18)`,
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 14, fontFamily: 'inherit', color: C.ink,
            lineHeight: 1.5, resize: 'vertical',
          }}
        />

        {/* ── Section: Priority ─────────────────────────────────────────── */}
        <SectionLabel>Priority</SectionLabel>
        <SegmentToggle<WorkOrderPriority>
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'low',    label: 'Low',    color: C.green },
            { value: 'medium', label: 'Medium', color: C.amber },
            { value: 'high',   label: 'High',   color: C.red },
          ]}
        />

        {/* ── Section: Assign to ────────────────────────────────────────── */}
        <SectionLabel>Assign to</SectionLabel>
        <SegmentToggle<boolean>
          value={assignSelf}
          onChange={(v) => {
            setAssignSelf(v)
            if (v) setSelectedTechnicianId(null)
          }}
          options={[
            { value: true,  label: 'Myself' },
            { value: false, label: 'Someone else' },
          ]}
        />
        {assignSelf && (
          <AssigneeChip
            initials={initialsOf(profile?.display_name || user?.email || '')}
            name={profile?.display_name?.trim() || user?.email || 'You'}
          />
        )}
        {!assignSelf && (
          <TechnicianPicker
            loading={techniciansLoading}
            technicians={technicians}
            selectedId={selectedTechnicianId}
            onSelect={setSelectedTechnicianId}
          />
        )}

        {/* ── Section: Billing ──────────────────────────────────────────── */}
        <SectionLabel>Billing</SectionLabel>
        <SegmentToggle<WorkOrderBilling>
          value={billing}
          onChange={setBilling}
          options={[
            { value: 'undecided',     label: 'Decide later' },
            { value: 'bill_customer', label: 'Bill customer' },
            { value: 'no_charge',     label: 'No charge' },
          ]}
        />

        {/* ── Submit error ──────────────────────────────────────────────── */}
        {submitError && (
          <p style={{
            margin: '14px 0 0', textAlign: 'center',
            fontSize: 12.5, fontWeight: 600, color: C.red,
            background: 'rgba(229,72,77,0.10)',
            border: `1px solid rgba(229,72,77,0.45)`,
            padding: '8px 12px', borderRadius: 12, lineHeight: 1.4,
          }}>
            {submitError}
          </p>
        )}
      </div>

      {/* ── Sticky submit bar ───────────────────────────────────────────── */}
      <div style={{
        background: C.paper,
        borderTop: `1px solid rgba(10,11,20,0.10)`,
        padding: '14px 18px calc(14px + env(safe-area-inset-bottom))',
        display: 'flex', gap: 10,
        flexShrink: 0,
      }}>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: `1.5px solid ${C.ink}`,
              borderRadius: 999,
              padding: '0 18px',
              height: 50,
              fontSize: 14, fontWeight: 800, color: C.ink,
              fontFamily: 'inherit',
              cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit ? C.ink : C.off,
            color: canSubmit ? '#fff' : C.muted,
            border: 0,
            borderRadius: 999,
            padding: '0 22px',
            height: 50,
            fontSize: 15, fontWeight: 900, fontFamily: FONT_DISPLAY,
            letterSpacing: '-0.01em',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'background 120ms ease',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  )
}

// ─── Reusable sub-components ───────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 22, marginBottom: 8,
      fontFamily: FONT_DISPLAY,
      fontSize: 11, fontWeight: 800, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: WC.muted,
    }}>
      {children}
    </div>
  )
}

function SegmentToggle<T extends string | boolean>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string; color?: string }>
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${options.length}, 1fr)`,
      gap: 8,
    }}>
      {options.map((opt) => {
        const active = opt.value === value
        const tint = opt.color ?? WC.ink
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            style={{
              background: active ? tint : WC.paper,
              color:      active ? '#fff' : WC.ink,
              border:     `1.5px solid ${active ? tint : 'rgba(10,11,20,0.18)'}`,
              borderRadius: 12,
              padding: '12px 8px',
              fontSize: 13.5, fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
              minHeight: 46,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function StopItemPicker({
  items, selectedIdx, useCustom, customName, customSerial,
  onSelect, onUseCustom, onCustomName, onCustomSerial,
}: {
  items: ReportIssueFormStopContext['items']
  selectedIdx: number | null
  useCustom: boolean
  customName: string
  customSerial: string
  onSelect: (i: number) => void
  onUseCustom: () => void
  onCustomName: (v: string) => void
  onCustomSerial: (v: string) => void
}) {
  if (items.length === 0) {
    // No items on the stop — go straight to free-text. This is the rare case
    // (TG sync gap or service stop without a manifest), so we collapse the UI.
    return (
      <CustomItemFields
        name={customName}
        serial={customSerial}
        onName={onCustomName}
        onSerial={onCustomSerial}
        title="No items on this stop — describe the item manually"
      />
    )
  }
  return (
    <div style={{
      background: WC.paper,
      border: `1.5px solid ${WC.ink}`,
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {items.map((item, i) => {
        const active = !useCustom && selectedIdx === i
        const name = (item.name ?? '').trim() || '—'
        const qty  = item.qty ?? 1
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            style={{
              width: '100%',
              background: active ? 'rgba(0,0,255,0.06)' : 'transparent',
              border: 0,
              borderTop: i > 0 ? '1px solid rgba(10,11,20,0.10)' : 0,
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <CheckCircle on={active} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 800, color: WC.ink,
                lineHeight: 1.3, letterSpacing: '-0.005em',
              }}>
                {name}
              </div>
              {item.category && (
                <div style={{
                  marginTop: 2, fontSize: 12.5, color: WC.muted, lineHeight: 1.35,
                }}>
                  {sentenceCase(item.category)}
                </div>
              )}
            </div>
            <div style={{
              background: WC.ink, color: '#fff',
              padding: '5px 11px', borderRadius: 999,
              fontSize: 12, fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}>
              ×{qty}
            </div>
          </button>
        )
      })}
      {/* "Item not in this order?" fallback row */}
      <button
        onClick={onUseCustom}
        style={{
          width: '100%',
          background: useCustom ? 'rgba(0,0,255,0.06)' : WC.off,
          border: 0,
          borderTop: '1px solid rgba(10,11,20,0.10)',
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <CheckCircle on={useCustom} />
        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: WC.ink }}>
          Item not in this order?
        </div>
      </button>
      {useCustom && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(10,11,20,0.10)' }}>
          <CustomItemFields
            name={customName}
            serial={customSerial}
            onName={onCustomName}
            onSerial={onCustomSerial}
            inline
          />
        </div>
      )}
    </div>
  )
}

function CustomItemFields({
  name, serial, onName, onSerial, title, inline,
}: {
  name: string
  serial: string
  onName: (v: string) => void
  onSerial: (v: string) => void
  title?: string
  inline?: boolean
}) {
  const wrap: React.CSSProperties = inline
    ? { display: 'flex', flexDirection: 'column', gap: 10 }
    : {
        background: WC.paper,
        border: `1.5px solid ${WC.ink}`,
        borderRadius: 16,
        padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }
  return (
    <div style={wrap}>
      {title && (
        <div style={{ fontSize: 12.5, color: WC.muted, marginBottom: 4 }}>{title}</div>
      )}
      <TextInput value={name} onChange={onName} placeholder="Item name (required)" />
      <TextInput value={serial} onChange={onSerial} placeholder="Serial number (optional)" />
    </div>
  )
}

function StandaloneAssetPicker(props: {
  assetType: WorkOrderAssetType
  onAssetType: (t: WorkOrderAssetType) => void
  assetQuery: string
  onAssetQuery: (v: string) => void
  assetResults: Array<{ id: string; name: string; serial: string | null; type: 'truck' | 'equipment' }>
  assetSearchLoading: boolean
  selectedAsset: { id: string; name: string; serial: string | null } | null
  onSelectAsset: (a: { id: string; name: string; serial: string | null }) => void
  onClearSelectedAsset: () => void
  showManualEntry: boolean
  onShowManualEntry: () => void
  customName: string
  customSerial: string
  onCustomName: (v: string) => void
  onCustomSerial: (v: string) => void
}) {
  const {
    assetType, onAssetType,
    assetQuery, onAssetQuery, assetResults, assetSearchLoading,
    selectedAsset, onSelectAsset, onClearSelectedAsset,
    showManualEntry, onShowManualEntry,
    customName, customSerial, onCustomName, onCustomSerial,
  } = props

  const showSearch = (assetType === 'truck' || assetType === 'equipment') && !selectedAsset && !showManualEntry
  const showFreeText = assetType === 'field_item' || assetType === 'other'

  return (
    <>
      {/* Asset type toggle (4 options — wraps to 2x2 on narrow screens) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
      }}>
        {([
          { value: 'truck',      label: 'Truck' },
          { value: 'equipment',  label: 'Equipment' },
          { value: 'field_item', label: 'Field item' },
          { value: 'other',      label: 'Other' },
        ] as const).map((opt) => {
          const active = opt.value === assetType
          return (
            <button
              key={opt.value}
              onClick={() => onAssetType(opt.value)}
              style={{
                background: active ? WC.ink : WC.paper,
                color: active ? '#fff' : WC.ink,
                border: `1.5px solid ${active ? WC.ink : 'rgba(10,11,20,0.18)'}`,
                borderRadius: 12,
                padding: '10px 6px',
                fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit',
                cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Selected-asset card */}
      {selectedAsset && (
        <div style={{
          marginTop: 12,
          background: WC.paper,
          border: `1.5px solid ${WC.ink}`,
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: WC.ink, lineHeight: 1.25 }}>
              {selectedAsset.name}
            </div>
            {selectedAsset.serial && (
              <div style={{ marginTop: 2, fontSize: 12.5, color: WC.muted, fontVariantNumeric: 'tabular-nums' }}>
                {selectedAsset.serial}
              </div>
            )}
          </div>
          <button
            onClick={onClearSelectedAsset}
            style={{
              background: 'transparent', border: 0, color: WC.muted,
              fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Change
          </button>
        </div>
      )}

      {/* Search input + results (truck/equipment only) */}
      {showSearch && (
        <div style={{ marginTop: 12 }}>
          <TextInput
            value={assetQuery}
            onChange={onAssetQuery}
            placeholder={assetType === 'truck' ? 'Search trucks (name, plate, VIN)…' : 'Search equipment (name, serial)…'}
          />
          {assetSearchLoading && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: WC.muted }}>Searching…</div>
          )}
          {!assetSearchLoading && assetQuery.trim().length > 0 && assetResults.length === 0 && (
            <div style={{
              marginTop: 8,
              background: WC.paper,
              border: `1.5px solid rgba(10,11,20,0.10)`,
              borderRadius: 14,
              padding: 14,
            }}>
              <div style={{ fontSize: 13, color: WC.muted, marginBottom: 8 }}>
                No matches.
              </div>
              <button
                onClick={onShowManualEntry}
                style={{
                  background: WC.ink, color: '#fff',
                  border: 0, borderRadius: 999,
                  padding: '8px 16px', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit',
                }}
              >
                Enter manually
              </button>
            </div>
          )}
          {assetResults.length > 0 && (
            <div style={{
              marginTop: 8,
              background: WC.paper,
              border: `1.5px solid ${WC.ink}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}>
              {assetResults.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => onSelectAsset({ id: r.id, name: r.name, serial: r.serial })}
                  style={{
                    width: '100%',
                    background: 'transparent', border: 0,
                    borderTop: i > 0 ? '1px solid rgba(10,11,20,0.10)' : 0,
                    padding: '12px 14px',
                    textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 800, color: WC.ink, lineHeight: 1.25 }}>{r.name}</div>
                  {r.serial && (
                    <div style={{ marginTop: 2, fontSize: 12, color: WC.muted, fontVariantNumeric: 'tabular-nums' }}>{r.serial}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual entry (truck/equipment, no match found) */}
      {showManualEntry && !selectedAsset && (
        <div style={{ marginTop: 12 }}>
          <CustomItemFields
            name={customName}
            serial={customSerial}
            onName={onCustomName}
            onSerial={onCustomSerial}
          />
        </div>
      )}

      {/* Free-text (field_item / other) */}
      {showFreeText && (
        <div style={{ marginTop: 12 }}>
          <CustomItemFields
            name={customName}
            serial={customSerial}
            onName={onCustomName}
            onSerial={onCustomSerial}
          />
        </div>
      )}
    </>
  )
}

function OrderSearch({
  query, onQuery, results, loading, selected, onSelect, onClear,
}: {
  query: string
  onQuery: (v: string) => void
  results: Array<{ stop_id: string; order_number: string; customer_name: string }>
  loading: boolean
  selected: { stop_id: string; order_number: string; customer_name: string } | null
  onSelect: (o: { stop_id: string; order_number: string; customer_name: string }) => void
  onClear: () => void
}) {
  if (selected) {
    return (
      <div style={{
        background: WC.paper,
        border: `1.5px solid ${WC.ink}`,
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: WC.ink }}>#{selected.order_number}</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: WC.muted }}>{selected.customer_name}</div>
        </div>
        <button
          onClick={onClear}
          style={{
            background: 'transparent', border: 0, color: WC.muted,
            fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Clear
        </button>
      </div>
    )
  }
  return (
    <>
      <TextInput
        value={query}
        onChange={onQuery}
        placeholder="Search by order # or customer name…"
      />
      {loading && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: WC.muted }}>Searching…</div>
      )}
      {!loading && results.length > 0 && (
        <div style={{
          marginTop: 8,
          background: WC.paper,
          border: `1.5px solid ${WC.ink}`,
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {results.map((r, i) => (
            <button
              key={r.stop_id}
              onClick={() => onSelect(r)}
              style={{
                width: '100%',
                background: 'transparent', border: 0,
                borderTop: i > 0 ? '1px solid rgba(10,11,20,0.10)' : 0,
                padding: '12px 14px',
                textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: WC.ink }}>#{r.order_number}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: WC.muted }}>{r.customer_name}</div>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function TechnicianPicker({
  loading, technicians, selectedId, onSelect,
}: {
  loading: boolean
  technicians: TechnicianRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (loading) {
    return <div style={{ marginTop: 10, fontSize: 12.5, color: WC.muted }}>Loading technicians…</div>
  }
  if (technicians.length === 0) {
    return (
      <div style={{
        marginTop: 10, fontSize: 12.5, color: WC.muted,
        background: WC.paper, border: `1.5px solid rgba(10,11,20,0.10)`,
        borderRadius: 12, padding: 12,
      }}>
        No other technicians available. Assign to yourself or contact a super admin.
      </div>
    )
  }
  return (
    <div style={{
      marginTop: 10,
      background: WC.paper,
      border: `1.5px solid ${WC.ink}`,
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      {technicians.map((t, i) => {
        const active = selectedId === t.id
        const name = t.display_name?.trim() || '(unnamed user)'
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              width: '100%',
              background: active ? 'rgba(0,0,255,0.06)' : 'transparent',
              border: 0,
              borderTop: i > 0 ? '1px solid rgba(10,11,20,0.10)' : 0,
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            }}
          >
            <Avatar initials={initialsOf(name)} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: WC.ink }}>
              {name}
            </div>
            <CheckCircle on={active} />
          </button>
        )
      })}
    </div>
  )
}

function AssigneeChip({ initials, name }: { initials: string; name: string }) {
  return (
    <div style={{
      marginTop: 10,
      background: WC.paper,
      border: `1.5px solid ${WC.ink}`,
      borderRadius: 14,
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <Avatar initials={initials} />
      <div style={{ fontSize: 14, fontWeight: 800, color: WC.ink }}>{name}</div>
    </div>
  )
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%',
      background: WC.off, color: WC.ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT_DISPLAY,
      fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em',
      flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

function CheckCircle({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      background: on ? WC.ink : 'transparent',
      border: `1.5px solid ${on ? WC.ink : 'rgba(10,11,20,0.25)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }} aria-hidden="true">
      {on && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5L20 6"/>
        </svg>
      )}
    </div>
  )
}

function TextInput({
  value, onChange, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        background: WC.paper,
        border: `1.5px solid rgba(10,11,20,0.18)`,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14, fontFamily: 'inherit', color: WC.ink,
      }}
    />
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function sentenceCase(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function initialsOf(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
