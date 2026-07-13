'use client'

// Expected-line row: name, progress count, visual state. States mirror the
// original component's five (unscanned / scanning / matched / conflict /
// damaged) collapsed to what the flow actually reports per line.
// ManualItemRow is the non-RFID counterpart: those lines never enter the
// scan path and are completed by bulk quantity or by selecting individual
// serialized assets.

import { useState } from 'react'
import { useTheme } from '../provider/RfidModuleProvider'
import type { ExpectedLine } from '../flows/checkoutFlow'

export type ItemRowState = 'unscanned' | 'partial' | 'matched' | 'manual'

export function lineState(line: ExpectedLine, confirmedQty: number): ItemRowState {
  if (line.manualQty !== null || line.manualUnits.length > 0) return 'manual'
  if (confirmedQty === 0) return 'unscanned'
  return confirmedQty >= line.expectedQty ? 'matched' : 'partial'
}

export interface ItemRowRFIDProps {
  line: ExpectedLine
  confirmedQty: number
  /** Extra row actions. */
  trailing?: React.ReactNode
  onSwipeLeft?: () => void
}

export function ItemRowRFID({ line, confirmedQty, trailing, onSwipeLeft }: ItemRowRFIDProps) {
  const theme = useTheme()
  const state = lineState(line, confirmedQty)
  const stateColor: Record<ItemRowState, string> = {
    unscanned: theme.colors.muted,
    partial: theme.colors.accent,
    matched: theme.colors.success,
    manual: theme.colors.primary,
  }

  let touchStartX = 0
  return (
    <div
      data-testid={`item-row-${line.key}`}
      onTouchStart={(e) => {
        touchStartX = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (onSwipeLeft && touchStartX - e.changedTouches[0].clientX > 60) onSwipeLeft()
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        minHeight: theme.touchTargetPx,
        background: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.surfaceMuted}`,
        fontFamily: theme.fonts.body,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: stateColor[state],
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: theme.colors.ink, fontSize: 14 }}>{line.name}</div>
        <div style={{ fontSize: 12, color: theme.colors.muted }}>
          {line.rentalClassId ?? 'No rental class'}
        </div>
      </div>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
          color: stateColor[state],
          fontSize: 15,
          whiteSpace: 'nowrap',
        }}
      >
        {confirmedQty}/{line.expectedQty}
      </span>
      {trailing}
    </div>
  )
}

// ─── ManualItemRow — non-RFID line ───────────────────────────────────────────
// These lines never enter the scan path. The crew completes them either as a
// bulk quantity or by adding individual serialized assets (serial # optional).

export interface ManualItemRowProps {
  line: ExpectedLine
  confirmedQty: number
  onBulkQty: (qty: number) => void
  onAddUnit: (unitLabel: string) => void
  onRemoveUnit: (index: number) => void
}

export function ManualItemRow({ line, confirmedQty, onBulkQty, onAddUnit, onRemoveUnit }: ManualItemRowProps) {
  const theme = useTheme()
  const [serial, setSerial] = useState('')
  const state = lineState(line, confirmedQty)
  const countColor = state === 'manual' ? theme.colors.primary : theme.colors.muted

  const addUnit = () => {
    onAddUnit(serial.trim() || `Unit ${line.manualUnits.length + 1}`)
    setSerial('')
  }

  return (
    <div
      data-testid={`manual-row-${line.key}`}
      style={{
        padding: '10px 14px',
        background: theme.colors.surface,
        borderBottom: `1px solid ${theme.colors.surfaceMuted}`,
        fontFamily: theme.fonts.body,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: theme.colors.ink, fontSize: 14 }}>{line.name}</div>
          <div style={{ fontSize: 12, color: theme.colors.muted }}>No RFID tag — record manually</div>
        </div>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: countColor, fontSize: 15 }}>
          {confirmedQty}/{line.expectedQty}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={`Bulk quantity for ${line.name}`}
          value={line.manualQty ?? ''}
          placeholder="Bulk qty"
          onChange={(e) => onBulkQty(Number(e.target.value || 0))}
          style={{
            width: 84,
            padding: 8,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            borderRadius: 8,
            fontFamily: theme.fonts.body,
          }}
        />
        <span style={{ fontSize: 12, color: theme.colors.muted }}>or</span>
        <input
          value={serial}
          aria-label={`Serial number for ${line.name}`}
          placeholder="Serial # (optional)"
          onChange={(e) => setSerial(e.target.value)}
          style={{
            flex: 1,
            minWidth: 120,
            padding: 8,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            borderRadius: 8,
            fontFamily: theme.fonts.body,
          }}
        />
        <button
          onClick={addUnit}
          style={{
            minHeight: 40,
            padding: '0 14px',
            borderRadius: 8,
            border: `1px solid ${theme.colors.primary}`,
            background: theme.colors.surface,
            color: theme.colors.primary,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          + Add unit
        </button>
      </div>
      {line.manualUnits.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {line.manualUnits.map((unit, i) => (
            <span
              key={`${unit}-${i}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: theme.colors.surfaceMuted,
                fontSize: 12,
                fontWeight: 600,
                color: theme.colors.ink,
              }}
            >
              {unit}
              <button
                onClick={() => onRemoveUnit(i)}
                aria-label={`Remove ${unit} from ${line.name}`}
                style={{ border: 'none', background: 'none', color: theme.colors.danger, fontWeight: 700 }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
