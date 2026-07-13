'use client'

// Pending-pull tray — the staging area between the trigger and the flow.
// Individual: exactly one captured tag, with Clear to discard and re-pull on
// the same screen. Mass: every tag accumulated while the trigger was held.
// Each row shows the item resolved from the LOCAL replica the instant the
// tag landed (name, current status, class) — a deliberate improvement over
// the legacy app, which resolved on commit. Commit hands the list to the
// flow; nothing is recorded until then.

import { useTheme } from '../provider/RfidModuleProvider'
import type { ScanHit } from '../flows/scanSession'

export interface ScanTrayProps {
  mode: 'individual' | 'mass'
  pending: ScanHit[]
  onClear: () => void
  onCommit: () => void
  commitLabel: string
}

export function ScanTray({ mode, pending, onClear, onCommit, commitLabel }: ScanTrayProps) {
  const theme = useTheme()
  if (pending.length === 0) return null

  return (
    <section
      data-testid="scan-tray"
      style={{
        background: theme.colors.surface,
        borderRadius: 14,
        border: `2px solid ${theme.colors.accent}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '8px 14px',
          background: theme.colors.accentSoft,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: theme.colors.ink,
          fontFamily: theme.fonts.body,
        }}
      >
        {mode === 'individual' ? 'Captured tag' : `Captured — ${pending.length} tag(s)`}
      </div>
      {pending.map((hit) => (
        <div
          key={`${hit.modality}:${hit.identifier}`}
          data-testid={`tray-${hit.identifier}`}
          style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${theme.colors.surfaceMuted}`,
            fontFamily: theme.fonts.body,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.colors.ink }}>
            {hit.item?.commonName ?? `Unknown tag ${hit.identifier}`}
          </div>
          <div style={{ fontSize: 12, color: hit.item ? theme.colors.muted : theme.colors.danger }}>
            {hit.item
              ? `${hit.item.rentalClassId} · currently ${hit.item.currentStatus}`
              : 'Not in the item list — commits as an unexpected scan'}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, padding: 12 }}>
        <button
          onClick={onClear}
          style={{
            flex: 1,
            minHeight: theme.touchTargetPx,
            borderRadius: 12,
            border: `1px solid ${theme.colors.surfaceMuted}`,
            background: theme.colors.surface,
            color: theme.colors.danger,
            fontWeight: 700,
            fontFamily: theme.fonts.body,
          }}
        >
          Clear
        </button>
        <button
          onClick={onCommit}
          style={{
            flex: 2,
            minHeight: theme.touchTargetPx,
            borderRadius: 12,
            border: 'none',
            background: theme.colors.primary,
            color: theme.colors.surface,
            fontWeight: 700,
            fontSize: 15,
            fontFamily: theme.fonts.body,
          }}
        >
          {commitLabel}
        </button>
      </div>
    </section>
  )
}
