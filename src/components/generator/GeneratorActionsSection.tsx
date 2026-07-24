'use client'

// ─── Generator Stop Actions — photo-first capture card(s) ───────────────────
// One card per metered unit detected on the stop (matchingGeneratorUnits).
// HARD gate: StopDetailScreen reads generatorActionsResolved through the ref
// handle below and ANDs it into the completion CTA — unlike Equipment Return
// (a soft, never-blocking prompt), this must resolve (capture OR skip) before
// the stop can complete. No units on the stop → this renders null and the
// gate is a no-op.
//
// Flow per unit: idle → camera capture (forced native camera, no gallery
// picker — matches the spec's "required camera capture") → hour-meter number
// entry + 5-position fuel selector → confirm. Or: skip → reason + note.
// Resolution is OPTIMISTIC — the local "resolved" flag flips the instant the
// driver finishes either path, before the network write is known to have
// landed (same doctrine as markComplete/runStopComplete elsewhere in this
// app); commitGeneratorAction handles the live-vs-queued split invisibly.
//
// Pickup stops additionally show the delivery OUT reading for reference
// (same prefill-for-context pattern as EquipmentPickupSection), fetched via
// the service-role GET (cross-route — the delivery stop lives on a different
// route than this pickup, so client RLS can't see it directly).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Stop } from '@/types'
import { supabase } from '@/lib/supabase'
import { matchingGeneratorUnits, type GeneratorUnitConfig } from '@/lib/generatorActions/units'
import { commitGeneratorAction } from '@/lib/generatorActions/service'
import { getQueuedGeneratorAction } from '@/lib/generatorActions/offlineQueue'
import type { FuelLevel, SkipReason } from '@/lib/generatorActions/offlineQueue'

const C = {
  blue:    '#0000FF',
  ink:     '#0A0B14',
  gold:    '#FFB800',
  muted:   '#6B7488',
  paper:   '#FFFFFF',
  off:     '#F4F6FA',
  green:   '#1FBF6B',
  greenSoft: '#E5F7ED',
  red:     '#DC2626',
  redSoft: '#FEECEC',
} as const

const FONT_DISPLAY = "var(--font-archivo), 'Archivo', 'Inter', system-ui, -apple-system, sans-serif"
const FONT_BODY    = "var(--font-inter), 'Inter', system-ui, -apple-system, sans-serif"

const FUEL_OPTIONS: { value: FuelLevel; label: string }[] = [
  { value: 'full',          label: 'F' },
  { value: 'three_quarter', label: '¾' },
  { value: 'half',          label: '½' },
  { value: 'quarter',       label: '¼' },
  { value: 'empty',         label: 'E' },
]

const FUEL_DISPLAY: Record<FuelLevel, string> = {
  full: 'Full', three_quarter: '¾', half: '½', quarter: '¼', empty: 'Empty',
}

const SKIP_REASONS: { value: SkipReason; label: string }[] = [
  { value: 'no_meter',   label: 'No meter on this unit' },
  { value: 'unreadable', label: "Meter isn't readable" },
  { value: 'other',      label: 'Other' },
]

interface DeliveryReference {
  hourMeter: number | null
  fuelLevel: FuelLevel | null
  skipReason: SkipReason | null
  photoUrl: string | null
}

type UnitPhase = 'idle' | 'captured_photo' | 'skip' | 'submitting' | 'resolved'

interface UnitLocalState {
  phase: UnitPhase
  photoBlob: File | null
  photoPreviewUrl: string | null
  hourMeter: string
  fuelLevel: FuelLevel | null
  skipReason: SkipReason | null
  skipNote: string
  resolvedSummary: { hourMeter: number | null; fuelLevel: FuelLevel | null; skipReason: SkipReason | null; pending: boolean } | null
}

export interface GeneratorActionsSectionHandle {
  getState: () => { allResolved: boolean }
}

interface Props {
  stop: Stop
  // Mirrors ItemCheckoffPanel's onProgress={setCheckoffProgress} pattern —
  // the reactive gating mechanism StopDetailScreen's CTA disabled condition
  // actually reads. The ref handle below stays too, for a synchronous read
  // where a callback isn't wired (mirrors EquipmentReturnSectionHandle).
  onResolvedChange?: (allResolved: boolean) => void
}

const GeneratorActionsSection = forwardRef<GeneratorActionsSectionHandle, Props>(
  function GeneratorActionsSection({ stop, onResolvedChange }, ref) {
    const units = matchingGeneratorUnits(stop.items ?? [])
    const actionType = stop.stop_type === 'pickup' ? 'pickup_in' : 'delivery_out'
    const [resolvedByAsset, setResolvedByAsset] = useState<Record<string, boolean>>({})
    const [referenceByAsset, setReferenceByAsset] = useState<Record<string, DeliveryReference>>({})
    const [referencesLoaded, setReferencesLoaded] = useState(stop.stop_type !== 'pickup')

    const allResolved = units.length === 0 || units.every((u) => resolvedByAsset[u.assetId] === true)

    useImperativeHandle(ref, () => ({
      getState() {
        return { allResolved }
      },
    }), [allResolved])

    useEffect(() => {
      onResolvedChange?.(allResolved)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allResolved])

    // Hydrate: existing committed rows (same-route RLS read) + queued-but-
    // unsynced records (IndexedDB) + pickup-side delivery reference.
    useEffect(() => {
      if (units.length === 0) return
      let cancelled = false

      async function hydrate() {
        const assetIds = units.map((u) => u.assetId)

        // Existing committed row for THIS stop's own action (re-entry case).
        const { data } = await supabase
          .from('stop_generator_actions')
          .select('asset_id, hour_meter, fuel_level, skip_reason')
          .eq('stop_id', stop.stop_id)
          .eq('action_type', actionType)
          .in('asset_id', assetIds)
        if (cancelled) return

        const committed: Record<string, boolean> = {}
        for (const row of data ?? []) {
          committed[row.asset_id] = true
        }

        // Queued-but-unsynced records also count as resolved locally.
        const queuedChecks = await Promise.all(
          assetIds.map((assetId) => getQueuedGeneratorAction(stop.stop_id, assetId, actionType)),
        )
        if (cancelled) return
        queuedChecks.forEach((rec, i) => {
          if (rec) committed[assetIds[i]] = true
        })
        setResolvedByAsset((prev) => ({ ...prev, ...committed }))

        if (stop.stop_type === 'pickup') {
          try {
            const res = await fetch(`/api/stops/generator-actions?stop_id=${stop.stop_id}`)
            if (res.ok) {
              const json = await res.json() as { references?: Record<string, DeliveryReference> }
              if (!cancelled) setReferenceByAsset(json.references ?? {})
            }
          } catch (err) {
            console.warn('[generator-actions] reference fetch failed', err)
          } finally {
            if (!cancelled) setReferencesLoaded(true)
          }
        }
      }
      hydrate()
      return () => { cancelled = true }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stop.stop_id])

    if (units.length === 0) return null

    return (
      <div style={{ padding: '18px 18px 0', fontFamily: FONT_BODY, color: C.ink, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {units.map((unit) => (
          <GeneratorUnitCard
            key={unit.assetId}
            unit={unit}
            stop={stop}
            actionType={actionType}
            reference={referenceByAsset[unit.assetId] ?? null}
            referenceLoaded={referencesLoaded}
            resolved={resolvedByAsset[unit.assetId] === true}
            onResolved={() => setResolvedByAsset((prev) => ({ ...prev, [unit.assetId]: true }))}
          />
        ))}
      </div>
    )
  },
)

export default GeneratorActionsSection

// ─── Per-unit card ────────────────────────────────────────────────────────────

function GeneratorUnitCard({
  unit, stop, actionType, reference, referenceLoaded, resolved, onResolved,
}: {
  unit: GeneratorUnitConfig
  stop: Stop
  actionType: 'delivery_out' | 'pickup_in'
  reference: DeliveryReference | null
  referenceLoaded: boolean
  resolved: boolean
  onResolved: () => void
}) {
  const [state, setState] = useState<UnitLocalState>({
    phase: 'idle',
    photoBlob: null,
    photoPreviewUrl: null,
    hourMeter: '',
    fuelLevel: null,
    skipReason: null,
    skipNote: '',
    resolvedSummary: null,
  })
  const cameraRef = useRef<HTMLInputElement>(null)

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    const url = URL.createObjectURL(file)
    setState((prev) => ({ ...prev, photoBlob: file, photoPreviewUrl: url, phase: 'captured_photo' }))
  }

  async function confirmCapture() {
    if (!state.photoBlob || !state.fuelLevel) return
    const meter = parseFloat(state.hourMeter)
    if (!Number.isFinite(meter) || meter < 0) return
    setState((prev) => ({ ...prev, phase: 'submitting' }))
    const ext = (state.photoBlob.type.split('/')[1] ?? 'jpg').toLowerCase()
    const outcome = await commitGeneratorAction({
      stopId: stop.stop_id,
      assetId: unit.assetId,
      actionType,
      itemName: unit.itemName,
      unitLabel: unit.unitLabel,
      photoBlob: state.photoBlob,
      photoExt: ext,
      hourMeter: meter,
      fuelLevel: state.fuelLevel,
      reservationId: stop.reservation_id ?? null,
    })
    setState((prev) => ({
      ...prev,
      phase: 'resolved',
      resolvedSummary: { hourMeter: meter, fuelLevel: state.fuelLevel, skipReason: null, pending: outcome === 'queued' },
    }))
    if (outcome !== 'permanent_error') onResolved()
  }

  async function confirmSkip() {
    if (!state.skipReason) return
    setState((prev) => ({ ...prev, phase: 'submitting' }))
    const outcome = await commitGeneratorAction({
      stopId: stop.stop_id,
      assetId: unit.assetId,
      actionType,
      itemName: unit.itemName,
      unitLabel: unit.unitLabel,
      skipReason: state.skipReason,
      skipNote: state.skipNote.trim() || undefined,
      reservationId: stop.reservation_id ?? null,
    })
    setState((prev) => ({
      ...prev,
      phase: 'resolved',
      resolvedSummary: { hourMeter: null, fuelLevel: null, skipReason: state.skipReason, pending: outcome === 'queued' },
    }))
    if (outcome !== 'permanent_error') onResolved()
  }

  const referenceLine = actionType === 'pickup_in' && (
    !referenceLoaded ? (
      <div style={{ fontSize: 12, color: C.muted }}>Loading delivery reading…</div>
    ) : reference ? (
      reference.skipReason ? (
        <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>
          Delivery reading was skipped ({reference.skipReason.replace('_', ' ')}).
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: C.muted }}>
          Out: <b style={{ color: C.ink }}>{reference.hourMeter} hrs</b> · <b style={{ color: C.ink }}>{reference.fuelLevel ? FUEL_DISPLAY[reference.fuelLevel] : '—'}</b>
          {reference.photoUrl && (
            <> · <a href={reference.photoUrl} target="_blank" rel="noreferrer" style={{ color: C.blue, fontWeight: 700 }}>photo</a></>
          )}
        </div>
      )
    ) : (
      <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>No delivery reading on file yet.</div>
    )
  )

  return (
    <div style={{
      background: C.paper, border: `1.5px solid ${C.ink}`, borderRadius: 18, overflow: 'hidden',
    }}>
      <div style={{
        background: 'rgba(0,0,255,0.06)', borderBottom: '1px solid rgba(0,0,255,0.25)',
        padding: '12px 16px',
      }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.ink }}>
          Generator — {unit.unitLabel}
        </div>
        <div style={{ marginTop: 3, fontSize: 12, color: C.muted, lineHeight: 1.35 }}>
          {actionType === 'delivery_out' ? 'Photo required before this stop can complete.' : 'Photo required before this pickup can complete.'}
        </div>
        {referenceLine && <div style={{ marginTop: 6 }}>{referenceLine}</div>}
      </div>

      <div style={{ padding: 16 }}>
        {(resolved || state.phase === 'resolved') && state.resolvedSummary ? (
          <ResolvedSummary summary={state.resolvedSummary} />
        ) : resolved ? (
          <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>✓ Captured</div>
        ) : state.phase === 'idle' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              ref={cameraRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhotoPick} style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              style={{
                width: '100%', background: C.blue, border: 0, borderRadius: 12,
                padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.02em',
              }}
            >
              📷 Take Photo — Meter + Fuel
            </button>
            <button
              type="button"
              onClick={() => setState((prev) => ({ ...prev, phase: 'skip' }))}
              style={{
                width: '100%', background: 'transparent', border: 0, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: C.muted,
                textDecoration: 'underline', textUnderlineOffset: 3, padding: '4px 0',
              }}
            >
              Can&apos;t capture this
            </button>
          </div>
        ) : state.phase === 'captured_photo' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {state.photoPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.photoPreviewUrl} alt="Meter + fuel gauge"
                style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 12, border: `1px solid ${C.off}` }}
              />
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>
                Hour meter
              </span>
              <input
                type="number" inputMode="decimal" step="0.1" min="0"
                value={state.hourMeter}
                onChange={(e) => setState((prev) => ({ ...prev, hourMeter: e.target.value }))}
                placeholder="0.0"
                style={{
                  background: '#FAFBFD', border: `1.5px solid #D9DBE3`, borderRadius: 10,
                  padding: '12px 12px', fontFamily: 'inherit', fontSize: 20, fontWeight: 800,
                  color: C.ink, outline: 'none',
                }}
              />
            </label>
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>
                Fuel level
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {FUEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setState((prev) => ({ ...prev, fuelLevel: opt.value }))}
                    style={{
                      flex: 1, height: 44, borderRadius: 10,
                      background: state.fuelLevel === opt.value ? C.ink : C.off,
                      color: state.fuelLevel === opt.value ? '#fff' : C.ink,
                      border: 0, cursor: 'pointer', fontFamily: FONT_DISPLAY,
                      fontSize: 15, fontWeight: 900,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={confirmCapture}
              disabled={!state.fuelLevel || !state.hourMeter}
              style={{
                width: '100%', background: state.fuelLevel && state.hourMeter ? C.blue : C.off,
                color: state.fuelLevel && state.hourMeter ? '#fff' : C.muted,
                border: 0, borderRadius: 12, padding: '12px 14px',
                cursor: state.fuelLevel && state.hourMeter ? 'pointer' : 'default',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
              }}
            >
              Save reading
            </button>
          </div>
        ) : state.phase === 'skip' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {SKIP_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setState((prev) => ({ ...prev, skipReason: r.value }))}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  background: state.skipReason === r.value ? C.ink : C.off,
                  color: state.skipReason === r.value ? '#fff' : C.ink,
                  border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700,
                }}
              >
                {r.label}
              </button>
            ))}
            <textarea
              value={state.skipNote}
              onChange={(e) => setState((prev) => ({ ...prev, skipNote: e.target.value }))}
              placeholder="Add a note (optional)"
              rows={2}
              style={{
                background: '#FAFBFD', border: `1.5px solid #D9DBE3`, borderRadius: 10,
                padding: '10px 12px', fontFamily: 'inherit', fontSize: 13, color: C.ink,
                outline: 'none', resize: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setState((prev) => ({ ...prev, phase: 'idle', skipReason: null }))}
                style={{
                  flex: 1, background: 'transparent', border: `1.5px solid ${C.ink}`, borderRadius: 12,
                  padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink,
                }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={confirmSkip}
                disabled={!state.skipReason}
                style={{
                  flex: 1, background: state.skipReason ? C.red : C.off, color: state.skipReason ? '#fff' : C.muted,
                  border: 0, borderRadius: 12, padding: '12px 14px',
                  cursor: state.skipReason ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 14, fontWeight: 800,
                }}
              >
                Confirm skip
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: C.muted }}>Saving…</div>
        )}
      </div>
    </div>
  )
}

function ResolvedSummary({ summary }: { summary: { hourMeter: number | null; fuelLevel: FuelLevel | null; skipReason: SkipReason | null; pending: boolean } }) {
  return (
    <div>
      {summary.skipReason ? (
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
          Skipped — {SKIP_REASONS.find((r) => r.value === summary.skipReason)?.label ?? summary.skipReason}
        </div>
      ) : (
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
          {summary.hourMeter} hrs · {summary.fuelLevel ? FUEL_DISPLAY[summary.fuelLevel] : '—'}
        </div>
      )}
      {summary.pending && (
        <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>Saved on your phone — will sync when back online.</div>
      )}
    </div>
  )
}
