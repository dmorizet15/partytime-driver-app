'use client'

// Scan mode controls. RFID is a PRESS-AND-HOLD trigger (mirrors the XR2's
// physical trigger): pointer down starts inventory, pointer up/leave stops
// it. Individual pulls capture the first tag only (the screen enforces
// that); mass pulls accumulate while held. Barcode and NFC stay armed
// toggles (hardware trigger / tap gesture do the per-read gating). Also
// shows the unsynced-writes badge so the driver always sees pending sync
// state at a glance.

import { useEffect, useState } from 'react'
import { useTheme } from '../provider/RfidModuleProvider'
import type { WriteQueue } from '../offline/writeQueue'
import { PowerSlider } from './PowerSlider'

export interface ScanControlsProps {
  active: { rfid: boolean; barcode: boolean; nfc: boolean }
  /** Pointer-down on the trigger. */
  onScanStart: () => void
  /** Pointer-up/leave/cancel on the trigger. */
  onScanEnd: () => void
  onToggleBarcode: () => void
  onToggleNfc: () => void
  power: number
  onPower: (level: number) => void
  maxPower?: number
  /** Disable the trigger (pickup: no status armed yet). */
  scanDisabled?: boolean
  /** Shown on the trigger while disabled (e.g. "Choose a status first"). */
  disabledLabel?: string
}

export function ScanControls(props: ScanControlsProps) {
  const theme = useTheme()
  const toggle = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      aria-pressed={on}
      style={{
        flex: 1,
        minHeight: theme.touchTargetPx,
        borderRadius: 12,
        border: `2px solid ${on ? theme.colors.primary : theme.colors.surfaceMuted}`,
        background: on ? theme.colors.primary : theme.colors.surface,
        color: on ? theme.colors.surface : theme.colors.ink,
        fontWeight: 700,
        fontSize: 14,
        fontFamily: theme.fonts.body,
      }}
    >
      {label}
    </button>
  )

  const disabled = props.scanDisabled === true
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <button
        data-testid="scan-trigger"
        disabled={disabled}
        onPointerDown={() => !disabled && props.onScanStart()}
        onPointerUp={props.onScanEnd}
        onPointerLeave={() => props.active.rfid && props.onScanEnd()}
        onPointerCancel={props.onScanEnd}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={props.active.rfid}
        style={{
          minHeight: theme.touchTargetPx * 1.4,
          borderRadius: 14,
          border: 'none',
          background: disabled
            ? theme.colors.surfaceMuted
            : props.active.rfid
              ? theme.colors.success
              : theme.colors.primary,
          color: disabled ? theme.colors.muted : theme.colors.surface,
          fontWeight: 800,
          fontSize: 16,
          letterSpacing: '0.04em',
          fontFamily: theme.fonts.body,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {disabled
          ? props.disabledLabel ?? 'Scanning unavailable'
          : props.active.rfid
            ? 'SCANNING… release to stop'
            : 'HOLD TO SCAN'}
      </button>
      <div style={{ display: 'flex', gap: 8 }}>
        {toggle(props.active.barcode ? 'Barcode · on' : 'Barcode', props.active.barcode, props.onToggleBarcode)}
        {toggle(props.active.nfc ? 'NFC · armed' : 'NFC tap', props.active.nfc, props.onToggleNfc)}
      </div>
      <PowerSlider value={props.power} onChange={props.onPower} max={props.maxPower ?? 33} />
    </div>
  )
}

/** "N unsynced" badge — subscribes to the queue; nothing hides from the driver. */
export function UnsyncedBadge({ queue }: { queue: WriteQueue }) {
  const theme = useTheme()
  const [counts, setCounts] = useState({ pending: 0, syncing: 0, failed: 0, unsynced: 0 })

  useEffect(() => {
    let live = true
    const refresh = () => void queue.counts().then((c) => live && setCounts(c))
    refresh()
    const off = queue.onChange(refresh)
    return () => {
      live = false
      off()
    }
  }, [queue])

  if (counts.unsynced === 0) return null
  const tone = counts.failed > 0 ? theme.colors.danger : theme.colors.accent
  return (
    <span
      data-testid="unsynced-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: tone,
        color: theme.colors.surface,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: theme.fonts.body,
      }}
    >
      {counts.failed > 0 ? `${counts.failed} failed · ` : ''}
      {counts.unsynced} unsynced
    </span>
  )
}
