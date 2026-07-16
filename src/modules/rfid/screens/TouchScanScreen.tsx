'use client'

// ─── Touch Scan — standalone, main-nav reachable, fully offline ──────────────
// Identify any tag by any modality; quick status/quality update. Sub-modes
// (corrected scan model, 2026-07-13):
//   • Individual — press-and-hold, capture the FIRST tag seen only; the item
//     resolves from the on-device replica the instant it lands; Clear
//     discards the pull so the same screen can re-pull immediately.
//   • Mass — press-and-hold, accumulate every distinct tag in range into the
//     grid (each row resolved on landing); Clear resets the list.
//   • Status — choose the status FIRST (Wash/Repair collect required reasons
//     at arm time), then press-and-hold to accumulate, then COMMIT writes the
//     armed status to every recognized tag (one queue entry, N rows).
// Fixed Scan is deliberately absent (fixed portals — out of scope). All reads
// come from the replica; all writes ride the queue: the radio can be off and
// nothing here changes. Per-screen power defaults follow the live app
// (15 individual, 25 status/mass), configurable via props.

import { useEffect, useRef, useState } from 'react'
import { useAdapters, useTheme } from '../provider/RfidModuleProvider'
import { useModuleRuntime } from '../provider/useModuleRuntime'
import { useHardwareTrigger } from '../provider/useHardwareTrigger'
import { usePendingPulls } from '../provider/usePendingPulls'
import { ScanSession } from '../flows/scanSession'
import { ITEM_STATUSES, REASON_REQUIRED_STATUSES } from '../flows/statusVocabulary'
import { formatStatusNotes, type StatusFlag } from '../flows/checkoutFlow'
import { ScanControls, UnsyncedBadge } from '../components/ScanControls'
import { DamageDetailForm } from '../components/DamageDetailForm'
import { Message } from './DeliveryCheckoutScreen'
import type { ReplicaItem } from '../offline/types'

export type TouchScanMode = 'individual' | 'mass' | 'status'

export interface TouchScanScreenProps {
  initialMode?: TouchScanMode
  /** Live-app defaults: 15 individual, 25 mass/status. */
  powerDefaults?: Record<TouchScanMode, number>
  onDone?: () => void
}

interface AccumulatedHit {
  identifier: string
  item: ReplicaItem | null
}

const DEFAULT_POWERS: Record<TouchScanMode, number> = { individual: 15, mass: 25, status: 25 }

export function TouchScanScreen({
  initialMode = 'individual',
  powerDefaults = DEFAULT_POWERS,
  onDone,
}: TouchScanScreenProps) {
  const theme = useTheme()
  const adapters = useAdapters()
  const runtime = useModuleRuntime()
  const [mode, setMode] = useState<TouchScanMode>(initialMode)
  const [power, setPower] = useState(powerDefaults[initialMode])
  const [active, setActive] = useState({ rfid: false, barcode: false, nfc: false })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Mass/status: a tapped row's detail view. Individual uses the pull itself. */
  const [rowDetail, setRowDetail] = useState<AccumulatedHit | null>(null)
  /** Status mode: the status chosen BEFORE scanning. */
  const [armed, setArmed] = useState<StatusFlag | null>(null)
  const [reasonsFor, setReasonsFor] = useState<'Wash' | 'Repair' | null>(null)
  const [meta, setMeta] = useState<{ seededAt: number | null; itemCount: number } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const sessionRef = useRef<ScanSession | null>(null)

  const pulls = usePendingPulls({
    mode: mode === 'individual' ? 'individual' : 'mass',
    onIndividualCapture: () => {
      void sessionRef.current?.stopRfid()
      setActive((a) => ({ ...a, rfid: false }))
    },
  })

  const trigger = useHardwareTrigger(runtime.status === 'ready' ? runtime.runtime.scanner : null)

  useEffect(() => {
    if (runtime.status !== 'ready') return
    void runtime.runtime.replica.meta().then(setMeta)
    const session = new ScanSession({
      scanner: runtime.runtime.scanner,
      bridge: runtime.runtime.bridge,
      replica: runtime.runtime.replica,
      onHit: pulls.capture,
      // Window dedupe: Clear-and-re-pull of the SAME tag must re-fire; the
      // pending list dedupes accumulation.
      dedupeMode: 'window',
    })
    sessionRef.current = session
    return () => {
      sessionRef.current = null
      void session.dispose()
    }
  }, [runtime, pulls.capture])

  const changeMode = (next: TouchScanMode) => {
    setMode(next)
    setPower(powerDefaults[next])
    setRowDetail(null)
    setArmed(null)
    pulls.clear()
  }

  if (runtime.status === 'starting') return <Message text="Starting scanner…" tone="muted" />
  if (runtime.status === 'error') return <Message text={runtime.message} tone="error" />

  const { scanner, queue, replica, syncEngine, tagBackend, connectivity } = runtime.runtime

  const scanGated = mode === 'status' && !armed

  const scanStart = async () => {
    const session = sessionRef.current
    if (!session || scanGated) return
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
  // scanStart's status gate and first-tag-wins apply identically.
  trigger.current = { onPress: () => void scanStart(), onRelease: () => void scanEnd() }

  const toggle = (kind: 'barcode' | 'nfc') => {
    const session = sessionRef.current
    if (!session || scanGated) return
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

  const syncItemList = async () => {
    if (!connectivity.isOnline()) {
      setError('Offline — the item list will refresh when you have signal.')
      return
    }
    setSyncing(true)
    try {
      const written = await replica.seedFromBackend(tagBackend)
      setMeta(await replica.meta())
      setNotice(`Item list refreshed — ${written} records.`)
    } catch {
      setError('Item list refresh failed — check signal and retry.')
    } finally {
      setSyncing(false)
    }
  }

  const submitWrite = async (
    epcs: string[],
    change: { status?: string; quality?: string; statusNotes?: string },
  ) => {
    const driver = await adapters.identity.getCurrentDriver()
    if (!driver) {
      setError('No signed-in driver — cannot write without an identity.')
      return
    }
    const gps = await adapters.location.getCurrentPosition()
    const nowDate = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    const timestamp = `${nowDate.getFullYear()}-${p(nowDate.getMonth() + 1)}-${p(nowDate.getDate())} ${p(nowDate.getHours())}:${p(nowDate.getMinutes())}:${p(nowDate.getSeconds())}`
    const writes = epcs.map((epc) => ({
      epc,
      ...change,
      scannedBy: driver.displayName,
      scannedAt: timestamp,
      lat: gps ? String(gps.lat) : undefined,
      lng: gps ? String(gps.lng) : undefined,
    }))
    for (const w of writes) {
      await replica.applyLocalChange(w.epc, {
        currentStatus: w.status,
        quality: w.quality,
        statusNotes: w.statusNotes,
        lastScanBy: w.scannedBy,
        lastScanDate: w.scannedAt,
      })
    }
    await queue.enqueueItemStatusWrites(writes)
    void syncEngine.kick()
    setNotice(`${writes.length} update(s) queued — they sync automatically.`)
  }

  const arm = (status: string, reasons: string[] = [], freeText: string | null = null) => {
    setArmed({ status, reasons, freeText })
    setReasonsFor(null)
  }

  const pickStatus = (status: string) => {
    if (REASON_REQUIRED_STATUSES.has(status)) {
      setReasonsFor(status as 'Wash' | 'Repair')
    } else {
      arm(status)
    }
  }

  const commitArmedStatus = async () => {
    if (!armed) return
    const epcs = pulls.pending.filter((a) => a.item).map((a) => (a.item as ReplicaItem).epc)
    if (epcs.length === 0) {
      setError('Nothing scanned that the item list recognizes.')
      return
    }
    const statusNotes =
      armed.reasons.length || armed.freeText ? formatStatusNotes(armed) : undefined
    await submitWrite(epcs, { status: armed.status, statusNotes })
    pulls.drain()
    setRowDetail(null)
  }

  const individualPull = mode === 'individual' ? pulls.pending[0] ?? null : null
  const detail = mode === 'individual' ? individualPull : rowDetail

  return (
    <div
      data-testid="touch-scan"
      style={{
        background: theme.colors.background,
        minHeight: '100%',
        fontFamily: theme.fonts.body,
        padding: 16,
        display: 'grid',
        gap: 14,
        alignContent: 'start',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.ink }}>
          Touch Scan
        </div>
        <UnsyncedBadge queue={queue} />
      </header>

      <div style={{ display: 'flex', gap: 8 }}>
        {(['individual', 'mass', 'status'] as const).map((m) => (
          <button
            key={m}
            onClick={() => changeMode(m)}
            aria-pressed={mode === m}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              border: `2px solid ${mode === m ? theme.colors.primary : theme.colors.surfaceMuted}`,
              background: mode === m ? theme.colors.primary : theme.colors.surface,
              color: mode === m ? theme.colors.surface : theme.colors.ink,
              fontWeight: 700,
              fontSize: 13,
              textTransform: 'capitalize',
            }}
          >
            {m}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: theme.colors.muted }}>
        <span data-testid="replica-meta">
          {meta?.seededAt
            ? `Item list: ${meta.itemCount} records`
            : 'Item list empty — sync before first use'}
        </span>
        <button
          onClick={() => void syncItemList()}
          disabled={syncing}
          style={{
            minHeight: 36,
            padding: '0 12px',
            borderRadius: 8,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            background: theme.colors.surface,
            color: theme.colors.primary,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {syncing ? 'Syncing…' : 'Sync item list'}
        </button>
      </div>

      {error ? <Message text={error} tone="error" onDismiss={() => setError(null)} /> : null}
      {notice ? <Message text={notice} tone="success" onDismiss={() => setNotice(null)} /> : null}

      {mode === 'status' ? (
        <section data-testid="status-arm" style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: theme.colors.ink }}>
            1 · Choose the status, then scan — commit writes it to every recognized tag
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
                    border: `2px solid ${isArmed ? theme.colors.success : theme.colors.primary}`,
                    background: isArmed ? theme.colors.success : theme.colors.surface,
                    color: isArmed ? theme.colors.surface : theme.colors.primary,
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {status}
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
      ) : null}

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
        scanDisabled={scanGated}
        disabledLabel="Choose a status first"
      />

      {mode === 'individual' ? (
        individualPull ? (
          <>
            <button
              onClick={pulls.clear}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: `1px solid ${theme.colors.surfaceMuted}`,
                background: theme.colors.surface,
                color: theme.colors.danger,
                fontWeight: 700,
              }}
            >
              Clear — pull again
            </button>
            <ItemDetailCard
              hit={individualPull}
              onSubmit={(change) => {
                if (individualPull.item) {
                  void submitWrite([individualPull.item.epc], change)
                  pulls.clear() // ready for the next pull
                }
              }}
              onLaunchMap={(lat, lng, label) => adapters.navigation.openMap({ lat, lng }, label)}
            />
          </>
        ) : (
          <Message
            text="Hold to scan — the first tag in range is captured and its details appear here instantly from the on-device item list; no signal needed."
            tone="muted"
          />
        )
      ) : null}

      {mode !== 'individual' ? (
        <>
          <section
            data-testid="accumulated-grid"
            style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${theme.colors.surfaceMuted}` }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 0.7fr 0.7fr 1.4fr',
                gap: 6,
                padding: '8px 12px',
                background: theme.colors.surfaceMuted,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: theme.colors.muted,
              }}
            >
              <span>Status</span>
              <span>Quality</span>
              <span>Bin</span>
              <span>Common name</span>
            </div>
            {pulls.pending.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: theme.colors.muted, background: theme.colors.surface }}>
                Hold to scan — tags accumulate here ({pulls.pending.length}).
              </div>
            ) : (
              pulls.pending.map((entry) => (
                <button
                  key={entry.identifier}
                  onClick={() => setRowDetail(entry)}
                  data-testid={`grid-row-${entry.identifier}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 0.7fr 0.7fr 1.4fr',
                    gap: 6,
                    padding: '10px 12px',
                    width: '100%',
                    textAlign: 'left',
                    background: theme.colors.surface,
                    border: 'none',
                    borderBottom: `1px solid ${theme.colors.surfaceMuted}`,
                    fontSize: 13,
                    color: theme.colors.ink,
                    fontFamily: theme.fonts.body,
                  }}
                >
                  <span>{entry.item?.currentStatus ?? '— unknown tag —'}</span>
                  <span>{entry.item?.quality ?? ''}</span>
                  <span>{entry.item?.binLocation ?? ''}</span>
                  <span>{entry.item?.commonName ?? entry.identifier}</span>
                </button>
              ))
            )}
          </section>

          {pulls.pending.length > 0 ? (
            <button
              onClick={() => {
                pulls.clear()
                setRowDetail(null)
              }}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: `1px solid ${theme.colors.surfaceMuted}`,
                background: theme.colors.surface,
                color: theme.colors.danger,
                fontWeight: 700,
              }}
            >
              Clear list
            </button>
          ) : null}

          {mode === 'status' && armed && pulls.pending.some((a) => a.item) ? (
            <button
              data-testid="commit-status"
              onClick={() => void commitArmedStatus()}
              style={{
                minHeight: theme.touchTargetPx,
                borderRadius: 12,
                border: 'none',
                background: theme.colors.primary,
                color: theme.colors.surface,
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              Commit {pulls.pending.filter((a) => a.item).length} as {armed.status}
            </button>
          ) : null}

          {detail ? (
            <ItemDetailCard
              hit={detail}
              onSubmit={(change) =>
                detail.item ? void submitWrite([detail.item.epc], change) : undefined
              }
              onLaunchMap={(lat, lng, label) => adapters.navigation.openMap({ lat, lng }, label)}
              onClose={() => setRowDetail(null)}
            />
          ) : null}
        </>
      ) : null}

      {reasonsFor ? (
        <DamageDetailForm
          status={reasonsFor}
          itemName={`everything scanned while ${reasonsFor} is armed`}
          onCancel={() => setReasonsFor(null)}
          onSubmit={(reasons, freeText) => arm(reasonsFor, reasons, freeText)}
        />
      ) : null}

      {onDone ? (
        <button
          onClick={onDone}
          style={{
            minHeight: 44,
            borderRadius: 10,
            border: 'none',
            background: theme.colors.surfaceMuted,
            color: theme.colors.muted,
            fontWeight: 600,
          }}
        >
          Close
        </button>
      ) : null}
    </div>
  )
}

// ─── Individual detail card ───────────────────────────────────────────────────

function ItemDetailCard({
  hit,
  onSubmit,
  onLaunchMap,
  onClose,
}: {
  hit: { identifier: string; item: ReplicaItem | null }
  onSubmit: (change: { status?: string; quality?: string }) => void
  onLaunchMap: (lat: number, lng: number, label?: string) => void
  onClose?: () => void
}) {
  const theme = useTheme()
  const [status, setStatus] = useState(hit.item?.currentStatus ?? '')
  const [quality, setQuality] = useState(hit.item?.quality ?? '')
  const [showMore, setShowMore] = useState(false)

  // Re-sync the editable fields when a new tag is scanned into the card.
  const lastId = useRef(hit.identifier)
  useEffect(() => {
    if (lastId.current !== hit.identifier) {
      lastId.current = hit.identifier
      setStatus(hit.item?.currentStatus ?? '')
      setQuality(hit.item?.quality ?? '')
      setShowMore(false)
    }
  }, [hit])

  if (!hit.item) {
    return (
      <Message
        text={`Tag ${hit.identifier} is not in the item list. Assign it first (Tag Assignment), or sync the item list.`}
        tone="error"
        onDismiss={onClose}
      />
    )
  }
  const item = hit.item
  const lat = Number(item.gpsLat)
  const lng = Number(item.gpsLng)
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng) && item.gpsLat !== '' && item.gpsLng !== ''
  // Quality option list is not a confirmed vocabulary (ASSUMPTIONS.md) —
  // offer the common grades plus whatever this record already carries.
  const qualityOptions = Array.from(new Set(['A', 'B', 'C', 'D', item.quality].filter(Boolean)))

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: theme.colors.muted }}>{label}</span>
      <span style={{ color: theme.colors.ink, fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  )

  return (
    <section
      data-testid="item-detail"
      style={{
        background: theme.colors.surface,
        borderRadius: 14,
        padding: 16,
        border: `1px solid ${theme.colors.surfaceMuted}`,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: theme.fonts.display, fontSize: 17, color: theme.colors.ink }}>
          {item.commonName}
        </div>
        {onClose ? (
          <button onClick={onClose} aria-label="Close details" style={{ border: 'none', background: 'none', color: theme.colors.muted, fontSize: 18 }}>
            ✕
          </button>
        ) : null}
      </div>
      {row('Rental Class ID', item.rentalClassId)}
      {row('Notes', item.notes)}

      <label style={{ fontSize: 13, color: theme.colors.muted }}>
        Current Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Current status"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: `1px solid ${theme.colors.surfaceMuted}`, fontSize: 15 }}
        >
          {Array.from(new Set([item.currentStatus, ...ITEM_STATUSES])).filter(Boolean).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label style={{ fontSize: 13, color: theme.colors.muted }}>
        Quality
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          aria-label="Quality"
          style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: `1px solid ${theme.colors.surfaceMuted}`, fontSize: 15 }}
        >
          {qualityOptions.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={() => setShowMore((v) => !v)}
        style={{ minHeight: 40, borderRadius: 8, border: `1px solid ${theme.colors.surfaceMuted}`, background: theme.colors.surface, color: theme.colors.muted, fontWeight: 600, fontSize: 13 }}
      >
        {showMore ? 'Hide additional details' : 'Additional details'}
      </button>
      {showMore ? (
        <div data-testid="additional-details">
          {row('Serial #', item.serialNum)}
          {row('Last Contract #', item.lastContractNum)}
          {row('Last Scan By', item.lastScanBy)}
          {row('Last Scan Date', item.lastScanDate)}
          {row('GPS Latitude', item.gpsLat)}
          {row('GPS Longitude', item.gpsLng)}
          <button
            disabled={!hasFix}
            onClick={() => hasFix && onLaunchMap(lat, lng, item.commonName)}
            style={{
              marginTop: 6,
              minHeight: 44,
              width: '100%',
              borderRadius: 10,
              border: 'none',
              background: hasFix ? theme.colors.primary : theme.colors.surfaceMuted,
              color: hasFix ? theme.colors.surface : theme.colors.muted,
              fontWeight: 700,
            }}
          >
            Launch Map
          </button>
        </div>
      ) : null}

      <button
        onClick={() => onSubmit({ status, quality })}
        style={{
          minHeight: theme.touchTargetPx,
          borderRadius: 12,
          border: 'none',
          background: theme.colors.success,
          color: theme.colors.surface,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        Submit update
      </button>
    </section>
  )
}
