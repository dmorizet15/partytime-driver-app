'use client'

// Expected-line row: name, progress count, visual state. States mirror the
// original component's five (unscanned / scanning / matched / conflict /
// damaged) collapsed to what the flow actually reports per line.

import { useTheme } from '../provider/RfidModuleProvider'
import type { ExpectedLine } from '../flows/checkoutFlow'

export type ItemRowState = 'unscanned' | 'partial' | 'matched' | 'manual'

export function lineState(line: ExpectedLine, confirmedQty: number): ItemRowState {
  if (line.manualQty !== null) return 'manual'
  if (confirmedQty === 0) return 'unscanned'
  return confirmedQty >= line.expectedQty ? 'matched' : 'partial'
}

export interface ItemRowRFIDProps {
  line: ExpectedLine
  confirmedQty: number
  onManualQty?: (qty: number) => void
  /** Extra row actions (pickup: flag-status button). */
  trailing?: React.ReactNode
  onSwipeLeft?: () => void
}

export function ItemRowRFID({ line, confirmedQty, onManualQty, trailing, onSwipeLeft }: ItemRowRFIDProps) {
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
      {onManualQty && line.scannedEpcs.length === 0 ? (
        <input
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={`Manual quantity for ${line.name}`}
          value={line.manualQty ?? ''}
          placeholder="qty"
          onChange={(e) => onManualQty(Number(e.target.value || 0))}
          style={{
            width: 64,
            padding: 8,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            borderRadius: 8,
            fontFamily: theme.fonts.body,
          }}
        />
      ) : null}
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
