// ─── Fleet Maintenance — compliance badge trio ──────────────────────────────
// Trucks-only Reg / NYS / Ins badges for the asset list. Color encodes the
// expiry tier: green ok · amber expiring (≤30d) · red expired · gray unknown.
// "NYS" = NYS DMV inspection (inspection_expiry) — distinct from the federal
// Annual DOT / DVIR inspection, which is tracked separately.

import { FC } from '@/lib/fleet/theme'
import type { ComplianceBadges as Badges, ComplianceStatus } from '@/lib/fleet/types'

const TONE: Record<ComplianceStatus, { bg: string; text: string; border: string }> = {
  ok:       { bg: FC.greenBg, text: FC.green, border: FC.greenBorder },
  expiring: { bg: FC.amberBg, text: FC.amber, border: FC.amberBorder },
  expired:  { bg: FC.redBg,   text: FC.red,   border: FC.redBorder },
  unknown:  { bg: 'rgba(255,255,255,0.05)', text: FC.faint, border: 'rgba(255,255,255,0.1)' },
}

function Badge({ label, status }: { label: string; status: ComplianceStatus }) {
  const tone = TONE[status]
  return (
    <span style={{
      background: tone.bg, color: tone.text,
      border: `0.5px solid ${tone.border}`,
      padding: '2px 7px', borderRadius: 999,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1.3,
    }}>
      {label}
    </span>
  )
}

export default function ComplianceBadges({ compliance }: { compliance: Badges }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      <Badge label="Reg" status={compliance.registration} />
      <Badge label="NYS" status={compliance.inspection} />
      <Badge label="Ins" status={compliance.insurance} />
    </div>
  )
}
