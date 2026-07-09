'use client'

// ─── Delivery Checkout — lives inside the host's stop detail flow ────────────
// The driver is already on the stop: contract, client, and expected items come
// from StopContextAdapter. No manual entry, no "Get Expected" button — that is
// the core UX win over the legacy app. Scan modes: RFID mass (continuous),
// RFID single, barcode, NFC, manual qty for non-taggable lines. Conflicts
// interrupt full-screen. Complete produces the summary and enqueues writes
// (sandbox-guarded Easy RFID Pro batch + dry-run TapGoods completion).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdapters, useTheme } from '../provider/RfidModuleProvider'
import { useModuleRuntime } from '../provider/useModuleRuntime'
import { ScanSession, type ScanHit } from '../flows/scanSession'
import { CheckoutFlow, type CheckoutSummary } from '../flows/checkoutFlow'
import { ItemRowRFID } from '../components/ItemRowRFID'
import { ScanControls, UnsyncedBadge } from '../components/ScanControls'
import { ConflictInterrupt } from '../components/ConflictInterrupt'

export interface DeliveryCheckoutScreenProps {
  /** Per-screen power default (live-app precedent: varies by screen). */
  defaultPower?: number
  onDone?: () => void
}

export function DeliveryCheckoutScreen({ defaultPower = 25, onDone }: DeliveryCheckoutScreenProps) {
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

  // Captured once per adapter instance: the stop cannot change mid-scan, and
  // an unstable identity here would tear down the scan session every render.
  const stop = useMemo(() => adapters.stopContext.getCurrentStop(), [adapters.stopContext])

  const flow = useMemo(
    () => (stop ? new CheckoutFlow('delivery', stop, adapters.location) : null),
    [stop, adapters.location],
  )

  const sessionRef = useRef<ScanSession | null>(null)

  const onHit = useCallback(
    (hit: ScanHit) => {
      if (!flow) return
      void flow.ingest(hit).then(rerender)
    },
    [flow, rerender],
  )

  // Build/tear down the scan session with the runtime.
  useEffect(() => {
    if (runtime.status !== 'ready' || !flow) return
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
  }, [runtime, flow, onHit])

  if (!stop) {
    return <Message text="No stop context — open this screen from a stop." tone="error" />
  }
  if (runtime.status === 'starting') return <Message text="Starting scanner…" tone="muted" />
  if (runtime.status === 'error') return <Message text={runtime.message} tone="error" />
  if (!flow) return null

  const { scanner, queue, replica, syncEngine } = runtime.runtime

  // Always read the ref inside handlers: the render that first shows these
  // controls commits BEFORE the effect assigns the session, so a render-time
  // capture would close over null and silently no-op the first tap.
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

  const openConflict = flow.conflicts.find((c) => c.resolution === null)

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
    rerender()
  }

  return (
    <div
      data-testid="delivery-checkout"
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
            Delivery scan · {stop.clientName}
          </div>
          <div style={{ fontSize: 12, color: theme.colors.muted }}>
            Contract {stop.contractNumber} — from the stop, nothing to type
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
              <ItemRowRFID
                key={line.key}
                line={line}
                confirmedQty={flow.confirmedQty(line)}
                onManualQty={(qty) => {
                  flow.setManualQty(line.key, qty)
                  rerender()
                }}
              />
            ))}
          </section>

          {flow.unexpected.length > 0 ? (
            <section
              data-testid="unexpected-queue"
              style={{
                background: theme.colors.accentSoft,
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
                color: theme.colors.ink,
              }}
            >
              <strong>{flow.unexpected.length} unexpected scan(s)</strong>
              {flow.unexpected.map((u, i) => (
                <div key={i} style={{ color: theme.colors.muted }}>
                  {u.hit.item?.commonName ?? u.hit.identifier} — {u.reason}
                </div>
              ))}
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
        <SummaryView
          summary={summary}
          onBack={() => setPhase('scanning')}
          onConfirm={() => void complete()}
        />
      ) : null}

      {phase === 'done' ? (
        <Message
          text="Delivery recorded. Writes are queued and will sync automatically."
          tone="success"
          onDismiss={onDone}
          dismissLabel="Back to stop"
        />
      ) : null}

      {openConflict ? (
        <ConflictInterrupt
          conflict={openConflict}
          onOverride={() => {
            void flow.overrideConflict(flow.conflicts.indexOf(openConflict)).then(rerender)
          }}
          onBlock={() => {
            flow.blockConflict(flow.conflicts.indexOf(openConflict))
            rerender()
          }}
        />
      ) : null}
    </div>
  )
}

// ── Small shared pieces ───────────────────────────────────────────────────────

export function SummaryView({
  summary,
  onBack,
  onConfirm,
}: {
  summary: CheckoutSummary
  onBack: () => void
  onConfirm: () => void
}) {
  const theme = useTheme()
  return (
    <section data-testid="checkout-summary" style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ fontFamily: theme.fonts.display, margin: 0, color: theme.colors.ink }}>
        Summary — {summary.exceptionCount} exception(s)
      </h3>
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.colors.surfaceMuted}` }}>
        {summary.rows.map((row) => (
          <div
            key={`${row.itemNumber}-${row.name}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 14px',
              background: theme.colors.surface,
              borderBottom: `1px solid ${theme.colors.surfaceMuted}`,
              fontSize: 14,
            }}
          >
            <span style={{ color: theme.colors.ink, fontWeight: 600 }}>{row.name}</span>
            <span style={{ color: theme.colors.muted }}>
              {row.confirmedQty}/{row.expectedQty}
              {row.exception ? (
                <strong style={{ color: theme.colors.danger }}> · {row.exception}</strong>
              ) : null}
            </span>
          </div>
        ))}
        {summary.unexpected.map((u, i) => (
          <div
            key={`u-${i}`}
            style={{
              padding: '10px 14px',
              background: theme.colors.accentSoft,
              fontSize: 13,
              color: theme.colors.ink,
            }}
          >
            Unexpected: {u.hit.item?.commonName ?? u.hit.identifier} ({u.reason})
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onBack}
          style={{
            flex: 1,
            minHeight: theme.touchTargetPx,
            borderRadius: 12,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            background: theme.colors.surface,
            color: theme.colors.ink,
            fontWeight: 600,
          }}
        >
          Keep scanning
        </button>
        <button
          onClick={onConfirm}
          style={{
            flex: 2,
            minHeight: theme.touchTargetPx,
            borderRadius: 12,
            border: 'none',
            background: theme.colors.success,
            color: theme.colors.surface,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Confirm &amp; write
        </button>
      </div>
    </section>
  )
}

export function Message({
  text,
  tone,
  onDismiss,
  dismissLabel = 'Dismiss',
}: {
  text: string
  tone: 'error' | 'muted' | 'success'
  onDismiss?: () => void
  dismissLabel?: string
}) {
  const theme = useTheme()
  const color =
    tone === 'error' ? theme.colors.danger : tone === 'success' ? theme.colors.success : theme.colors.muted
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${color}`,
        color,
        background: theme.colors.surface,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      {text}
      {onDismiss ? (
        <button
          onClick={onDismiss}
          style={{
            minHeight: 44,
            borderRadius: 10,
            border: 'none',
            background: color,
            color: theme.colors.surface,
            fontWeight: 700,
          }}
        >
          {dismissLabel}
        </button>
      ) : null}
    </div>
  )
}
