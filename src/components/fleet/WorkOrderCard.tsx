// ─── Fleet Maintenance — work order card ────────────────────────────────────
// Tappable work-order row used by Fleet Overview (truck / equipment / other
// sections) and Asset Detail. The status pill shows only for in_progress /
// resolved — plain "open" stays uncluttered since that is the common case.

import { FC } from '@/lib/fleet/theme'
import { PriorityPill, SourcePill, WorkOrderStatusPill } from './FleetPills'
import { ChevronRightIcon, ClipboardIcon } from './fleetIcons'
import type { WorkOrderRow } from '@/lib/fleet/types'

type WorkOrderCardInput = Pick<WorkOrderRow, 'title' | 'priority' | 'source' | 'status'>

export default function WorkOrderCard({
  wo, subtitle, onTap,
}: {
  wo: WorkOrderCardInput
  subtitle?: string | null
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      aria-label={`Work order: ${wo.title}`}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
        borderRadius: 14, padding: '14px 14px',
        display: 'flex', alignItems: 'center', gap: 12, color: FC.white,
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ClipboardIcon size={20} color={FC.muted} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 800, color: FC.white, lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {wo.title}
        </div>
        {subtitle && (
          <div style={{
            marginTop: 2, fontSize: 12, color: FC.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subtitle}
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {wo.status !== 'open' && <WorkOrderStatusPill status={wo.status} />}
          <PriorityPill priority={wo.priority} />
          <SourcePill source={wo.source} />
        </div>
      </div>
      <ChevronRightIcon size={20} color={FC.faint} />
    </button>
  )
}
