'use client'

// Output-power slider. Present on every scan screen; the DEFAULT is
// per-screen and configurable (live-app defaults vary: 10 Assign, 15 Touch
// Scan individual, 25 Status Scan). Range labels mirror the legacy app.

import { useTheme } from '../provider/RfidModuleProvider'

export interface PowerSliderProps {
  value: number
  onChange: (level: number) => void
  min?: number
  max?: number
  disabled?: boolean
}

function rangeLabel(value: number, max: number): string {
  const ratio = value / max
  if (ratio <= 0.34) return 'Short'
  if (ratio <= 0.72) return 'Standard'
  return 'Long'
}

export function PowerSlider({ value, onChange, min = 0, max = 33, disabled }: PowerSliderProps) {
  const theme = useTheme()
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: theme.fonts.body,
        color: theme.colors.ink,
        minHeight: theme.touchTargetPx,
      }}
    >
      <span style={{ fontSize: 13, color: theme.colors.muted, whiteSpace: 'nowrap' }}>Power</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-label="RFID output power"
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: theme.colors.primary }}
      />
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 86, textAlign: 'right' }}>
        {value} · {rangeLabel(value, max)}
      </span>
    </label>
  )
}
