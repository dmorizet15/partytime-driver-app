// ─── Fleet Maintenance — pill tab bar ───────────────────────────────────────
// Segmented pill control shared by the Fleet Overview (Trucks / Equipment /
// My Log) and Asset Detail (History / PM Schedule / Parts). Active pill is gold
// on ink; inactive is transparent on muted — matches the dark hub palette.

import { FC } from '@/lib/fleet/theme'

export interface PillTab {
  key:   string
  label: string
  count?: number | null   // optional count chip on the right of the label
}

export default function PillTabs({
  tabs, active, onChange,
}: {
  tabs:     PillTab[]
  active:   string
  onChange: (key: string) => void
}) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex', gap: 6,
        background: FC.card,
        border: `0.5px solid ${FC.cardBorder}`,
        borderRadius: 999, padding: 4,
      }}
    >
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1, cursor: 'pointer', fontFamily: 'inherit',
              background: on ? FC.amber : 'transparent',
              color: on ? FC.ink : FC.muted,
              border: 0, borderRadius: 999, padding: '9px 8px',
              fontSize: 12.5, fontWeight: 800, letterSpacing: '0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              whiteSpace: 'nowrap', minWidth: 0,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
            {t.count != null && t.count > 0 && (
              <span style={{
                flexShrink: 0,
                background: on ? 'rgba(10,11,20,0.18)' : 'rgba(255,255,255,0.1)',
                color: on ? FC.ink : FC.muted,
                borderRadius: 999, padding: '0 6px',
                fontSize: 11, fontWeight: 800, lineHeight: '17px', minWidth: 17, textAlign: 'center',
              }}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
