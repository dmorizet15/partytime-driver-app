'use client'

// ─── Pickup Return — lives inside the host's stop detail flow ────────────────
// Same native stop context as delivery (nothing typed). Expected items:
// the stop's lines PLUS the replica's view of what's still out on this
// contract (pre-fetch by last_contract_num — works fully offline).
//
// Scan model (corrected 2026-07-13): the driver chooses the return status
// FIRST — one of the exact six-status vocabulary; Wash/Repair collect their
// required reasons at arm time via DamageDetailForm. Scanning is disabled
// until a status is armed. Then press-and-hold: Individual = first tag only
// with Clear to re-pull; Mass = accumulate, then commit. Every committed
// unit is stamped with the status armed at that moment. There is NO default
// status: an item never scanned back gets NO write and stays 'Delivered'
// upstream — the summary shows it as short.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdapters, useTheme } from '../provider/RfidModuleProvider'
import { useModuleRuntime } from '../provider/useModuleRuntime'
import { useHardwareTrigger } from '../provider/useHardwareTrigger'
import { usePendingPulls } from '../provider/usePendingPulls'
import { ScanSession, type ScanHit } from '../flows/scanSession'
import { CheckoutFlow, type CheckoutSummary } from '../flows/checkoutFlow'
import { ITEM_STATUSES, REASON_REQUIRED_STATUSES } from '../flows/statusVocabulary'
import { ItemRowRFID } from '../components/ItemRowRFID'
import { ScanControls, UnsyncedBadge } from '../components/ScanControls'
import { ScanTray } from '../components/ScanTray'
import { DamageDetailForm } from '../components/DamageDetailForm'
import { Message, ScanModeSwitch, SummaryView, type ScanPullMode } from './DeliveryCheckoutScreen'
import type { ReplicaItem } from '../offline/types'

export interface PickupReturnScreenProps {
  defaultPower?: number
  onDone?: () => void
}

export function PickupReturnScreen({ defaultPower = 25, onDone }: PickupReturnScreenProps) {
  const theme = useTheme()
  const adapters = useAdapters()
  const runtime = useModuleRuntime()
  const [, bump] = useState(0)
  const rerender = useCallback(() => bump((n) => n + 1), [])
  const [power, setPower] = useState(defaultPower)
  const [scanMode, setScanMode] = useState<ScanPullMode>('individual')
  const [phase, setPhase] = useState<'scanning' | 'summary' | 'done'>('scanning')
  const [summary, setSummary] = useState<CheckoutSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState({ rfid: false, barcode: false, nfc: false })
  const [expectedBack, setExpectedBack] = useState<ReplicaItem[]>([])
  const [scanned, setScanned] = useState<ReplicaItem[]>([])
  const [reasonsFor, setReasonsFor] = useState<'Wash' | 'Repair' | null>(null)

  // Captured once per adapter instance (see DeliveryCheckoutScreen note).
  const stop = useMemo(() => adapters.stopContext.getCurrentStop(), [adapters.stopContext])
  const flow = useMemo(
    () => (stop ? new CheckoutFlow('pickup', stop, adapters.location) : null),
    [stop, adapters.location],
  )
  const sessionRef = useRef<ScanSession | null>(null)

  const pulls = usePendingPulls({
    mode: scanMode,
    reject: (hit: ScanHit) => {
      const epc = hit.item?.epc ?? (hit.modality === 'rfid' ? hit.identifier : null)
      return epc !== null && flow !== null && flow.isScanned(epc)
    },
    onIndividualCapture: () => {
      void sessionRef.current?.stopRfid()
      setActive((a) => ({ ...a, rfid: false }))
    },
  })

  const trigger = useHardwareTrigger(runtime.status === 'ready' ? runtime.runtime.scanner : null)

  useEffect(() => {
    if (runtime.status !== 'ready' || !flow || !stop) return
    // Pre-fetch what should come back — replica-side, by last contract, offline.
    void runtime.runtime.replica.getByLastContract(stop.contractNumber).then(setExpectedBack)
    const session = new ScanSession({
      scanner: runtime.runtime.scanner,
      bridge: runtime.runtime.bridge,
      replica: runtime.runtime.replica,
      onHit: pulls.capture,
      // Window dedupe: Clear-and-re-pull must re-fire (see delivery screen).
      dedupeMode: 'window',
    })
    sessionRef.current = session
    return () => {
      sessionRef.current = null
      void session.dispose()
    }
  }, [runtime, flow, stop, pulls.capture])

  if (!stop) return <Message text="No stop context — open this screen from a stop." tone="error" />
  if (runtime.status === 'starting') return <Message text="Starting scanner…" tone="muted" />
  if (runtime.status === 'error') return <Message text={runtime.message} tone="error" />
  if (!flow) return null

  const { scanner, queue, replica, syncEngine } = runtime.runtime
  const armed = flow.armedStatus

  // Read the ref inside handlers — see DeliveryCheckoutScreen note on the
  // render-before-effect null capture.
  const scanStart = async () => {
    const session = sessionRef.current
    if (!session || !flow.armedStatus) return
    try {
      await session.startRfid()
      await scanner.setOutputPower(power)
      setActive({ ...session.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const scanEnd = async () => {
    const session = sessionRef.current
    if (!session) return
    await session.stopRfid()
    setActive({ ...session.active })
  }

  // The physical trigger is the same press-and-hold as the on-screen button —
  // scanStart's armed-status gate applies identically (no status → no scan).
  trigger.current = { onPress: () => void scanStart(), onRelease: () => void scanEnd() }

  const toggle = (kind: 'barcode' | 'nfc') => {
    const session = sessionRef.current
    if (!session || !flow.armedStatus) return
    try {
      if (kind === 'barcode') {
        session.active.barcode ? session.stopBarcode() : session.startBarcode()
      } else {
        session.active.nfc ? session.disableNfc() : session.enableNfc()
      }
      setActive({ ...session.active })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const arm = (status: string, reasons: string[] = [], freeText: string | null = null) => {
    try {
      flow.armStatus(status, reasons, freeText)
      setReasonsFor(null)
      rerender()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const pickStatus = (status: string) => {
    if (REASON_REQUIRED_STATUSES.has(status)) {
      setReasonsFor(status as 'Wash' | 'Repair')
    } else {
      arm(status)
    }
  }

  const commitPulls = async () => {
    for (const hit of pulls.drain()) {
      const outcome = await flow.ingest(hit)
      if (outcome === 'matched' && hit.item) setScanned((prev) => [...prev, hit.item as ReplicaItem])
    }
    rerender()
  }

  const changeScanMode = (next: ScanPullMode) => {
    setScanMode(next)
    pulls.clear()
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
          <section data-testid="status-arm" style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.ink }}>
              1 · Choose the status, then scan — everything you scan gets it
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ITEM_STATUSES.map((status) => {
                const isArmed = armed?.status === status
                return (
                  <button
                    key={status}
                    onClick={() => pickStatus(status)}
                    aria-pressed={isArmed}
                    style={{
                      minHeight: 44,
                      padding: '0 14px',
                      borderRadius: 999,
                      border: `2px solid ${isArmed ? theme.colors.success : theme.colors.surfaceMuted}`,
                      background: isArmed ? theme.colors.success : theme.colors.surface,
                      color: isArmed ? theme.colors.surface : theme.colors.ink,
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    {status}
                    {REASON_REQUIRED_STATUSES.has(status) ? ' *' : ''}
                  </button>
                )
              })}
            </div>
            {armed ? (
              <div data-testid="armed-status" style={{ fontSize: 13, color: theme.colors.success, fontWeight: 700 }}>
                Armed: {armed.status}
                {armed.reasons.length > 0 ? ` — ${armed.reasons.join(', ')}` : ''}
                {armed.freeText ? ` (${armed.freeText})` : ''}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: theme.colors.muted }}>
                No status armed — scanning is off until you choose one.
              </div>
            )}
          </section>

          <ScanModeSwitch mode={scanMode} onChange={changeScanMode} />
          <ScanControls
            active={active}
            onScanStart={() => void scanStart()}
            onScanEnd={() => void scanEnd()}
            onToggleBarcode={() => toggle('barcode')}
            onToggleNfc={() => toggle('nfc')}
            power={power}
            onPower={(v) => {
              setPower(v)
              if (sessionRef.current?.active.rfid) void scanner.setOutputPower(v)
            }}
            maxPower={scanner.capabilities.powerRange.max}
            scanDisabled={!armed}
            disabledLabel="Choose a status first"
          />

          <ScanTray
            mode={scanMode}
            pending={pulls.pending}
            onClear={pulls.clear}
            onCommit={() => void commitPulls()}
            commitLabel={
              armed
                ? scanMode === 'individual'
                  ? `Commit as ${armed.status}`
                  : `Commit ${pulls.pending.length} as ${armed.status}`
                : 'Commit'
            }
          />

          <section style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.colors.surfaceMuted}` }}>
            {flow.lines.map((line) => (
              <ItemRowRFID key={line.key} line={line} confirmedQty={flow.confirmedQty(line)} />
            ))}
          </section>

          {scanned.length > 0 ? (
            <section style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.ink }}>
                Scanned back — status was set when each item was scanned
              </div>
              {scanned.map((item) => {
                const flag = flow.flags.get(item.epc)
                return (
                  <div
                    key={item.epc}
                    data-testid={`scanned-${item.epc}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: theme.colors.surface,
                      borderRadius: 10,
                      padding: '8px 12px',
                      border: `1px solid ${theme.colors.surfaceMuted}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.colors.ink }}>
                        {item.commonName}
                      </div>
                      <div style={{ fontSize: 12, color: theme.colors.muted }}>
                        {flag
                          ? `→ ${flag.status}${flag.reasons.length ? `: ${flag.reasons.join(', ')}` : ''}`
                          : '→ (status missing — re-scan)'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </section>
          ) : null}

          <div style={{ fontSize: 12, color: theme.colors.muted }}>
            Items never scanned back get no write — they stay {`"Delivered"`} in the system.
          </div>

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

      {reasonsFor ? (
        <DamageDetailForm
          status={reasonsFor}
          itemName={`everything scanned while ${reasonsFor} is armed`}
          onCancel={() => setReasonsFor(null)}
          onSubmit={(reasons, freeText) => arm(reasonsFor, reasons, freeText)}
        />
      ) : null}
    </div>
  )
}
