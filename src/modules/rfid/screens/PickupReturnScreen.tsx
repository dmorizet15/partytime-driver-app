'use client'

// ─── Pickup Return — lives inside the host's stop detail flow ────────────────
// Same native stop context as delivery (nothing typed). Expected items:
// the stop's lines PLUS the replica's view of what's still out on this
// contract (pre-fetch by last_contract_num — works fully offline). Driver
// scans items back in; swipe-left (or the Flag button) opens per-item status
// flagging with the exact six-status vocabulary; Wash/Repair require reasons
// via DamageDetailForm; batch-apply flags a whole selection at once.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdapters, useTheme } from '../provider/RfidModuleProvider'
import { useModuleRuntime } from '../provider/useModuleRuntime'
import { ScanSession, type ScanHit } from '../flows/scanSession'
import { CheckoutFlow, type CheckoutSummary } from '../flows/checkoutFlow'
import { ITEM_STATUSES, REASON_REQUIRED_STATUSES } from '../flows/statusVocabulary'
import { ItemRowRFID } from '../components/ItemRowRFID'
import { ScanControls, UnsyncedBadge } from '../components/ScanControls'
import { DamageDetailForm } from '../components/DamageDetailForm'
import { Message, SummaryView } from './DeliveryCheckoutScreen'
import type { ReplicaItem } from '../offline/types'

export interface PickupReturnScreenProps {
  defaultPower?: number
  onDone?: () => void
}

interface FlagTarget {
  epcs: string[]
  label: string
  status?: 'Wash' | 'Repair'
}

export function PickupReturnScreen({ defaultPower = 25, onDone }: PickupReturnScreenProps) {
  const theme = useTheme()
  const adapters = useAdapters()
  const runtime = useModuleRuntime()
  const [, bump] = useState(0)
  const rerender = useCallback(() => bump((n) => n + 1), [])
  const [power, setPower] = useState(defaultPower)
  const [phase, setPhase] = useState<'scanning' | 'summary' | 'done'>('scanning')
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState({ rfid: false, barcode: false, nfc: false })
  const [expectedBack, setExpectedBack] = useState<ReplicaItem[]>([])
  const [scanned, setScanned] = useState<ReplicaItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [flagTarget, setFlagTarget] = useState<FlagTarget | null>(null)
  const [statusPickFor, setStatusPickFor] = useState<FlagTarget | null>(null)

  // Captured once per adapter instance (see DeliveryCheckoutScreen note).
  const stop = useMemo(() => adapters.stopContext.getCurrentStop(), [adapters.stopContext])
  const flow = useMemo(
    () => (stop ? new CheckoutFlow('pickup', stop, adapters.location) : null),
    [stop, adapters.location],
  )
  const sessionRef = useRef<ScanSession | null>(null)

  const onHit = useCallback(
    (hit: ScanHit) => {
      if (!flow) return
      void flow.ingest(hit).then((outcome) => {
        if (outcome === 'matched' && hit.item) setScanned((prev) => [...prev, hit.item as ReplicaItem])
        rerender()
      })
    },
    [flow, rerender],
  )

  useEffect(() => {
    if (runtime.status !== 'ready' || !flow || !stop) return
    // Pre-fetch what should come back — replica-side, by last contract, offline.
    void runtime.runtime.replica.getByLastContract(stop.contractNumber).then(setExpectedBack)
    const session = new ScanSession({
      scanner: runtime.runtime.scanner,
      bridge: runtime.runtime.bridge,
      replica: runtime.runtime.replica,
      onHit,
      dedupeMode: 'session',
    })
    sessionRef.current = session
    return () => {
      sessionRef.current = null
      void session.dispose()
    }
  }, [runtime, flow, stop, onHit])

  if (!stop) return <Message text="No stop context — open this screen from a stop." tone="error" />
  if (runtime.status === 'starting') return <Message text="Starting scanner…" tone="muted" />
  if (runtime.status === 'error') return <Message text={runtime.message} tone="error" />
  if (!flow) return null

  const { scanner, queue, replica, syncEngine } = runtime.runtime

  // Read the ref inside handlers — see DeliveryCheckoutScreen note on the
  // render-before-effect null capture.
  const toggle = async (kind: 'rfid' | 'barcode' | 'nfc') => {
    const session = sessionRef.current
    if (!session) return
    try {
      if (kind === 'rfid') {
        if (session.active.rfid) await session.stopRfid()
        else {
          await session.startRfid()
          await scanner.setOutputPower(power)
        }
      } else if (kind === 'barcode') {
        session.active.barcode ? session.stopBarcode() : session.startBarcode()
      } else {
        session.active.nfc ? session.disableNfc() : session.enableNfc()
      }
      setActive({ ...session.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const applyFlag = (target: FlagTarget, status: string, reasons: string[] = [], freeText: string | null = null) => {
    try {
      flow.batchFlagStatus(target.epcs, status, reasons, freeText)
      setFlagTarget(null)
      setStatusPickFor(null)
      setSelected(new Set())
      rerender()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const pickStatus = (target: FlagTarget, status: string) => {
    if (REASON_REQUIRED_STATUSES.has(status)) {
      setStatusPickFor(null)
      setFlagTarget({ ...target, status: status as 'Wash' | 'Repair' })
    } else {
      applyFlag(target, status)
    }
  }

  const complete = async () => {
    const driver = await adapters.identity.getCurrentDriver()
    if (!driver) {
      setError('No signed-in driver — cannot write scans without an identity.')
      return
    }
    await sessionRef.current?.stopRfid()
    const nowDate = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const timestamp = `${nowDate.getFullYear()}-${p(nowDate.getMonth() + 1)}-${p(nowDate.getDate())} ${p(nowDate.getHours())}:${p(nowDate.getMinutes())}:${p(nowDate.getSeconds())}`
    await flow.complete({
      queue,
      replica,
      scannedBy: driver.displayName,
      timestamp,
      completedAtIso: nowDate.toISOString(),
    })
    void syncEngine.kick()
    setPhase('done')
  }

  const toggleSelect = (epc: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(epc)) next.delete(epc)
      else next.add(epc)
      return next
    })

  return (
    <div
      data-testid="pickup-return"
      style={{
        background: theme.colors.background,
        fontFamily: theme.fonts.body,
        padding: 16,
        display: 'grid',
        gap: 14,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.ink }}>
            Pickup scan · {stop.clientName}
          </div>
          <div style={{ fontSize: 12, color: theme.colors.muted }}>
            Contract {stop.contractNumber} — expecting {expectedBack.length || flow.lines.length} item(s) back
          </div>
        </div>
        <UnsyncedBadge queue={queue} />
      </header>

      {error ? <Message text={error} tone="error" onDismiss={() => setError(null)} /> : null}

      {phase === 'scanning' ? (
        <>
          <ScanControls
            active={active}
            onToggleRfid={() => void toggle('rfid')}
            onToggleBarcode={() => void toggle('barcode')}
            onToggleNfc={() => void toggle('nfc')}
            power={power}
            onPower={(v) => {
              setPower(v)
              if (sessionRef.current?.active.rfid) void scanner.setOutputPower(v)
            }}
            maxPower={scanner.capabilities.powerRange.max}
          />

          <section style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.colors.surfaceMuted}` }}>
            {flow.lines.map((line) => (
              <ItemRowRFID key={line.key} line={line} confirmedQty={flow.confirmedQty(line)} />
            ))}
          </section>

          {scanned.length > 0 ? (
            <section style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.ink }}>
                Scanned back — swipe left or tap Flag to set status
              </div>
              {scanned.map((item) => {
                const flag = flow.flags.get(item.epc)
                const isSelected = selected.has(item.epc)
                return (
                  <div
                    key={item.epc}
                    data-testid={`scanned-${item.epc}`}
                    onTouchStart={(e) => {
                      ;(e.currentTarget as HTMLElement).dataset.x = String(e.touches[0].clientX)
                    }}
                    onTouchEnd={(e) => {
                      const start = Number((e.currentTarget as HTMLElement).dataset.x ?? 0)
                      if (start - e.changedTouches[0].clientX > 60) {
                        setStatusPickFor({ epcs: [item.epc], label: item.commonName })
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: theme.colors.surface,
                      borderRadius: 10,
                      padding: '8px 12px',
                      border: `1px solid ${isSelected ? theme.colors.primary : theme.colors.surfaceMuted}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.epc)}
                      aria-label={`Select ${item.commonName}`}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.ink }}>
                        {item.commonName}
                      </div>
                      <div style={{ fontSize: 12, color: flag ? theme.colors.danger : theme.colors.muted }}>
                        {flag ? `→ ${flag.status}${flag.reasons.length ? `: ${flag.reasons.join(', ')}` : ''}` : 'No flag (defaults to Needs to be Inspected)'}
                      </div>
                    </div>
                    <button
                      onClick={() => setStatusPickFor({ epcs: [item.epc], label: item.commonName })}
                      style={{
                        minHeight: 44,
                        padding: '0 14px',
                        borderRadius: 10,
                        border: `1px solid ${theme.colors.surfaceMuted}`,
                        background: theme.colors.surface,
                        color: theme.colors.ink,
                        fontWeight: 600,
                      }}
                    >
                      Flag
                    </button>
                  </div>
                )
              })}
              {selected.size > 0 ? (
                <button
                  onClick={() =>
                    setStatusPickFor({ epcs: Array.from(selected), label: `${selected.size} selected item(s)` })
                  }
                  style={{
                    minHeight: theme.touchTargetPx,
                    borderRadius: 12,
                    border: `2px solid ${theme.colors.primary}`,
                    background: theme.colors.surface,
                    color: theme.colors.primary,
                    fontWeight: 700,
                  }}
                >
                  Batch-apply status to {selected.size} selected
                </button>
              ) : null}
            </section>
          ) : null}

          <button
            onClick={() => {
              setSummary(flow.summary())
              setPhase('summary')
            }}
            style={{
              minHeight: theme.touchTargetPx,
              borderRadius: 12,
              border: 'none',
              background: theme.colors.primary,
              color: theme.colors.surface,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Review &amp; complete
          </button>
        </>
      ) : null}

      {phase === 'summary' && summary ? (
        <SummaryView summary={summary} onBack={() => setPhase('scanning')} onConfirm={() => void complete()} />
      ) : null}

      {phase === 'done' ? (
        <Message
          text="Pickup recorded. Writes are queued and will sync automatically."
          tone="success"
          onDismiss={onDone}
          dismissLabel="Back to stop"
        />
      ) : null}

      {statusPickFor ? (
        <div
          role="dialog"
          aria-label="Pick status"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 70,
            background: theme.colors.surface,
            borderRadius: '16px 16px 0 0',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.25)',
            padding: 20,
          }}
        >
          <h3 style={{ fontFamily: theme.fonts.display, margin: '0 0 12px', color: theme.colors.ink }}>
            Status for {statusPickFor.label}
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {ITEM_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => pickStatus(statusPickFor, status)}
                style={{
                  minHeight: theme.touchTargetPx,
                  borderRadius: 12,
                  border: `1px solid ${theme.colors.surfaceMuted}`,
                  background: theme.colors.surface,
                  color: theme.colors.ink,
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: 'left',
                  paddingLeft: 16,
                }}
              >
                {status}
                {REASON_REQUIRED_STATUSES.has(status) ? ' — reasons required' : ''}
              </button>
            ))}
            <button
              onClick={() => setStatusPickFor(null)}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: theme.colors.surfaceMuted,
                color: theme.colors.muted,
                fontWeight: 600,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {flagTarget?.status ? (
        <DamageDetailForm
          status={flagTarget.status}
          itemName={flagTarget.label}
          onCancel={() => setFlagTarget(null)}
          onSubmit={(reasons, freeText) => applyFlag(flagTarget, flagTarget.status as string, reasons, freeText)}
        />
      ) : null}
    </div>
  )
}
