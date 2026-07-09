'use client'

// Reason picker for the two statuses that REQUIRE one (Wash, Repair) —
// half-sheet with the exact live-app vocabulary + the free-text field
// (Other for Wash, Location of Repair for Repair). Submit is disabled until
// the requirement is satisfied; the flow re-validates anyway.

import { useState } from 'react'
import { useTheme } from '../provider/RfidModuleProvider'
import { REPAIR_REASONS, WASH_REASONS } from '../flows/statusVocabulary'

export interface DamageDetailFormProps {
  status: 'Wash' | 'Repair'
  itemName: string
  onSubmit: (reasons: string[], freeText: string | null) => void
  onCancel: () => void
}

export function DamageDetailForm({ status, itemName, onSubmit, onCancel }: DamageDetailFormProps) {
  const theme = useTheme()
  const [selected, setSelected] = useState<string[]>([])
  const [freeText, setFreeText] = useState('')
  const reasons = status === 'Wash' ? WASH_REASONS : REPAIR_REASONS
  const freeLabel = status === 'Wash' ? 'Other' : 'Location of Repair'
  const valid = selected.length > 0 || freeText.trim().length > 0

  const toggle = (r: string) =>
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))

  return (
    <div
      role="dialog"
      aria-label={`${status} reasons`}
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
        fontFamily: theme.fonts.body,
        maxHeight: '80vh',
        overflowY: 'auto',
      }}
    >
      <h3 style={{ fontFamily: theme.fonts.display, margin: '0 0 2px', color: theme.colors.ink }}>
        {status}: why?
      </h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: theme.colors.muted }}>
        {itemName} — pick at least one reason.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {reasons.map((r) => {
          const on = selected.includes(r)
          return (
            <button
              key={r}
              onClick={() => toggle(r)}
              aria-pressed={on}
              style={{
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 999,
                border: `2px solid ${on ? theme.colors.primary : theme.colors.surfaceMuted}`,
                background: on ? theme.colors.primary : theme.colors.surface,
                color: on ? theme.colors.surface : theme.colors.ink,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {r}
            </button>
          )
        })}
      </div>
      <label style={{ display: 'block', fontSize: 13, color: theme.colors.muted, marginBottom: 16 }}>
        {freeLabel}
        <input
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder={freeLabel}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: 12,
            borderRadius: 10,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            fontFamily: theme.fonts.body,
            fontSize: 15,
          }}
        />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onCancel}
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
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() => onSubmit(selected, freeText.trim() || null)}
          style={{
            flex: 2,
            minHeight: theme.touchTargetPx,
            borderRadius: 12,
            border: 'none',
            background: valid ? theme.colors.primary : theme.colors.surfaceMuted,
            color: valid ? theme.colors.surface : theme.colors.muted,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Apply {status}
        </button>
      </div>
    </div>
  )
}
