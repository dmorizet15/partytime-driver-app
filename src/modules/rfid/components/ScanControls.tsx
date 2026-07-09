'use client'

// Scan mode controls: RFID (individual = single-unit confirm behavior lives in
// the flow; mass = continuous inventory), barcode, NFC tap, plus the power
// slider. Also shows the unsynced-writes badge so the driver always sees
// pending sync state at a glance.

import { useEffect, useState } from 'react'
import { useTheme } from '../provider/RfidModuleProvider'
import type { WriteQueue } from '../offline/writeQueue'
import { PowerSlider } from './PowerSlider'

export interface ScanControlsProps {
  active: { rfid: boolean; barcode: boolean; nfc: boolean }
  onToggleRfid: () => void
  onToggleBarcode: () => void
  onToggleNfc: () => void
  power: number
  onPower: (level: number) => void
  maxPower?: number
}

export function ScanControls(props: ScanControlsProps) {
  const theme = useTheme()
  const button = (label: string, on: boolean, onClick: () => void) => (
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

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {button(props.active.rfid ? 'RFID · scanning' : 'RFID scan', props.active.rfid, props.onToggleRfid)}
        {button(props.active.barcode ? 'Barcode · on' : 'Barcode', props.active.barcode, props.onToggleBarcode)}
        {button(props.active.nfc ? 'NFC · armed' : 'NFC tap', props.active.nfc, props.onToggleNfc)}
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
