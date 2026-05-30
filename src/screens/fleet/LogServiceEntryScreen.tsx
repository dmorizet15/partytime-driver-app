'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import InvoiceUpload from '@/components/fleet/InvoiceUpload'
import { CloseIcon, PlusIcon } from '@/components/fleet/fleetIcons'
import { useAuth } from '@/hooks/useAuth'
import { FC, FONT_BODY, FONT_DISPLAY } from '@/lib/fleet/theme'
import {
  createServiceEntry,
  fetchLogServiceContext,
  fetchLogServiceContextForAsset,
} from '@/lib/fleet/queries'
import type { LogServiceContext } from '@/lib/fleet/queries'
import type { AssetType } from '@/lib/fleet/types'

const CUSTOM = '__custom__'

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toNum(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = Number(t)
  return isNaN(n) ? null : n
}

type LineItem = { name: string; qty: string }

/**
 * Log Service Entry — reachable two ways:
 *  • from a work order  → `workOrderId` set; back / save returns to the WO.
 *  • from an asset      → `assetType` + `assetId` set; the standalone path,
 *    so Luke can log a routine service with no work order open. Back / save
 *    returns to that asset's detail screen.
 */
export default function LogServiceEntryScreen({
  workOrderId, assetType, assetId,
}: {
  workOrderId?: string
  assetType?:   string
  assetId?:     string
}) {
  const router = useRouter()
  const { user, profile } = useAuth()

  const routeType: AssetType | null =
    assetType === 'truck' || assetType === 'equipment' ? assetType : null
  const backHref = workOrderId
    ? `/tools/fleet/work-orders/${workOrderId}`
    : `/tools/fleet/assets/${assetType}/${assetId}`
  const backLabel = workOrderId ? 'Work order' : 'Asset'

  const [ctx, setCtx] = useState<LogServiceContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // form state
  const [serviceTypeValue, setServiceTypeValue] = useState('')
  const [customServiceType, setCustomServiceType] = useState('')
  const [serviceDate, setServiceDate]   = useState(todayLocal())
  const [performedBy, setPerformedBy]   = useState<'internal' | 'external'>('internal')
  const [externalName, setExternalName] = useState('')
  const [vendorId, setVendorId]         = useState('')
  const [mileageStr, setMileageStr]     = useState('')
  const [hoursStr, setHoursStr]         = useState('')
  const [notes, setNotes]               = useState('')
  const [invoice, setInvoice]           = useState<File | null>(null)
  const [lineItems, setLineItems]       = useState<LineItem[]>([{ name: '', qty: '' }])

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load: Promise<LogServiceContext | null> = workOrderId
      ? fetchLogServiceContext(workOrderId)
      : routeType && assetId
        ? fetchLogServiceContextForAsset(routeType, assetId)
        : Promise.resolve(null)
    load.then((c) => {
      if (cancelled) return
      if (!c) { setNotFound(true); setLoading(false); return }
      setCtx(c)
      // Prefill the usage reading with the asset's current value (editable).
      if (c.asset?.assetType === 'truck' && c.asset.currentMileage != null) {
        setMileageStr(String(c.asset.currentMileage))
      } else if (c.asset?.assetType === 'equipment' && c.asset.currentHours != null) {
        setHoursStr(String(c.asset.currentHours))
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [workOrderId, routeType, assetId])

  const effectiveAssetType: AssetType = ctx?.asset?.assetType ?? 'truck'

  const effectiveServiceType = useMemo(
    () => (serviceTypeValue === CUSTOM ? customServiceType.trim() : serviceTypeValue),
    [serviceTypeValue, customServiceType],
  )

  function updateLineItem(i: number, patch: Partial<LineItem>) {
    setLineItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addLineItem() {
    setLineItems((rows) => [...rows, { name: '', qty: '' }])
  }
  function removeLineItem(i: number) {
    setLineItems((rows) => (rows.length === 1 ? [{ name: '', qty: '' }] : rows.filter((_, idx) => idx !== i)))
  }

  async function save() {
    const asset = ctx?.asset
    if (!asset) { setError('No asset attached — cannot log a service entry.'); return }
    if (!effectiveServiceType) { setError('Choose or enter a service type.'); return }
    if (!serviceDate) { setError('Pick the date the work was performed.'); return }
    if (performedBy === 'external' && !externalName.trim()) {
      setError('Enter who performed the work.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await createServiceEntry({
        assetType:         asset.assetType,
        assetId:           asset.id,
        serviceType:       effectiveServiceType,
        serviceDate,
        performedByType:   performedBy,
        performedByUserId: performedBy === 'internal' ? user?.id ?? null : null,
        performedByName:   performedBy === 'internal'
          ? profile?.display_name ?? null
          : externalName.trim(),
        vendorId:          performedBy === 'external' && vendorId ? vendorId : null,
        mileageAtService:  effectiveAssetType === 'truck' ? toNum(mileageStr) : null,
        hoursAtService:    effectiveAssetType === 'equipment' ? toNum(hoursStr) : null,
        notes:             notes.trim() || null,
        lineItems:         lineItems.map((li) => ({ name: li.name, qty: toNum(li.qty) })),
        invoice,
      })
      router.push(backHref)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the service entry.')
      setSaving(false)
    }
  }

  return (
    <div className="screen" style={{ background: FC.bg, fontFamily: FONT_BODY, color: FC.white }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, background: FC.bg,
        borderBottom: `0.5px solid ${FC.divider}`,
        padding: '14px 18px',
      }}>
        <button
          onClick={() => router.push(backHref)}
          aria-label={`Back to ${backLabel.toLowerCase()}`}
          style={{
            background: 'transparent', border: 0, color: FC.amber,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
            cursor: 'pointer', fontFamily: 'inherit', padding: 0, textTransform: 'uppercase',
          }}
        >
          ← {backLabel}
        </button>
        <div style={{
          marginTop: 10, fontFamily: FONT_DISPLAY,
          fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: FC.white,
        }}>
          Log service entry
        </div>
        {ctx?.asset && (
          <div style={{ marginTop: 3, fontSize: 12.5, color: FC.muted }}>
            {ctx.asset.name} · {ctx.asset.subtitle}
          </div>
        )}
      </div>

      {/* Scroll body */}
      <div className="flex-1 overflow-y-auto" style={{ background: FC.bg }}>
        {loading && <CenterNote>Loading…</CenterNote>}
        {!loading && notFound && <CenterNote tone="error">Work order not found.</CenterNote>}

        {!loading && !notFound && ctx && (
          <div style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Service type */}
            <Field label="Service type">
              <select
                value={serviceTypeValue}
                onChange={(e) => setServiceTypeValue(e.target.value)}
                style={selectStyle}
              >
                <option value="" disabled>Select a service type…</option>
                {ctx.serviceTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option value={CUSTOM}>Custom / other…</option>
              </select>
              {serviceTypeValue === CUSTOM && (
                <input
                  value={customServiceType}
                  onChange={(e) => setCustomServiceType(e.target.value)}
                  placeholder="Describe the service"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}
            </Field>

            {/* Date */}
            <Field label="Date performed">
              <input
                type="date"
                value={serviceDate}
                max={todayLocal()}
                onChange={(e) => setServiceDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            {/* Performed by */}
            <Field label="Performed by">
              <div style={{ display: 'flex', gap: 8 }}>
                <Toggle active={performedBy === 'internal'} onClick={() => setPerformedBy('internal')} label="Me" />
                <Toggle active={performedBy === 'external'} onClick={() => setPerformedBy('external')} label="External" />
              </div>
              {performedBy === 'internal' ? (
                <div style={{ marginTop: 8, fontSize: 12.5, color: FC.muted }}>
                  Logged as {profile?.display_name?.trim() || 'you'} (from your session).
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={externalName}
                    onChange={(e) => setExternalName(e.target.value)}
                    placeholder="Name — e.g. Mike, Mobile Mechanic"
                    style={inputStyle}
                  />
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Vendor (optional)</option>
                    {ctx.vendors.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {ctx.vendors.length === 0 && (
                    <div style={{ fontSize: 11.5, color: FC.faint }}>
                      No vendors on file yet — leave blank or use the name field.
                    </div>
                  )}
                </div>
              )}
            </Field>

            {/* Mileage / hours */}
            {effectiveAssetType === 'truck' ? (
              <Field label="Mileage at service (optional)">
                <input
                  type="number" inputMode="numeric"
                  value={mileageStr}
                  onChange={(e) => setMileageStr(e.target.value)}
                  placeholder="Odometer reading"
                  style={inputStyle}
                />
              </Field>
            ) : (
              <Field label="Hours at service (optional)">
                <input
                  type="number" inputMode="numeric"
                  value={hoursStr}
                  onChange={(e) => setHoursStr(e.target.value)}
                  placeholder="Hour-meter reading"
                  style={inputStyle}
                />
              </Field>
            )}

            {/* Notes */}
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What was done, parts condition, follow-ups…"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.45 }}
              />
            </Field>

            {/* Invoice */}
            <Field label="Invoice (optional)">
              <InvoiceUpload value={invoice} onChange={setInvoice} disabled={saving} />
            </Field>

            {/* Line items */}
            <Field label="Parts used (optional)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lineItems.map((li, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={li.name}
                      onChange={(e) => updateLineItem(i, { name: e.target.value })}
                      placeholder="Part name"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      type="number" inputMode="numeric"
                      value={li.qty}
                      onChange={(e) => updateLineItem(i, { qty: e.target.value })}
                      placeholder="Qty"
                      style={{ ...inputStyle, width: 72, flexShrink: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => removeLineItem(i)}
                      aria-label="Remove part"
                      style={{
                        background: 'transparent', border: 0, cursor: 'pointer',
                        padding: 6, flexShrink: 0, display: 'flex',
                      }}
                    >
                      <CloseIcon size={18} color={FC.muted} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLineItem}
                style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: '#7DA0FF', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', padding: 0,
                }}
              >
                <PlusIcon size={16} color="#7DA0FF" />
                Add another part
              </button>
            </Field>

            {error && (
              <div style={{
                background: FC.redBg, color: FC.red,
                border: `0.5px solid ${FC.redBorder}`, borderRadius: 10,
                padding: '10px 12px', fontSize: 12.5,
              }}>
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — Save */}
      {!loading && !notFound && ctx && (
        <div style={{
          flexShrink: 0, background: FC.bg,
          borderTop: `0.5px solid ${FC.divider}`,
          padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
        }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              width: '100%', cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
              background: FC.blue, color: FC.white,
              border: 0, borderRadius: 12, padding: '14px 16px',
              fontSize: 14, fontWeight: 800, opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save service entry'}
          </button>
          <div style={{ marginTop: 8, fontSize: 11.5, color: FC.faint, textAlign: 'center', lineHeight: 1.4 }}>
            Work order stays open — resolve it separately when complete.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: FC.faint, marginBottom: 7,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, cursor: 'pointer', fontFamily: 'inherit',
        background: active ? 'rgba(96,140,255,0.14)' : FC.cardRaised,
        border: `1px solid ${active ? 'rgba(96,140,255,0.4)' : FC.cardBorder}`,
        color: active ? '#9DB6FF' : FC.muted,
        borderRadius: 12, padding: '11px 10px',
        fontSize: 13.5, fontWeight: 800,
      }}
    >
      {label}
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

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: FC.cardRaised, color: FC.white,
  border: `0.5px solid ${FC.cardBorder}`, borderRadius: 12,
  padding: '11px 12px', fontSize: 14, fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
}
