// ─── Fleet Maintenance — part card ──────────────────────────────────────────
// One part that fits an asset, with its cross-references + tap-to-call vendor.
// Shared by Work Order Detail and Asset Detail (Parts tab) so the parts list
// reads identically on both surfaces.

import { FC } from '@/lib/fleet/theme'
import { PhoneIcon } from '@/components/fleet/fleetIcons'
import type { CrossRefView, PartForAsset } from '@/lib/fleet/types'

const CROSS_REF_TIER: Record<number, string> = { 1: 'CarQuest', 2: 'NAPA', 3: 'Direct' }

export default function PartCard({ entry }: { entry: PartForAsset }) {
  const { part, inventory, crossRefs } = entry
  const lowStock =
    inventory != null && inventory.reorder_at != null && inventory.qty_on_hand <= inventory.reorder_at

  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 12, padding: '13px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: FC.white, lineHeight: 1.25 }}>
            {part.part_name}
          </div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: FC.muted, textTransform: 'capitalize' }}>
            {part.category}
          </div>
        </div>
        {inventory && (
          <span style={{
            flexShrink: 0,
            background: lowStock ? FC.redBg : 'rgba(255,255,255,0.06)',
            color: lowStock ? FC.red : FC.muted,
            border: `0.5px solid ${lowStock ? FC.redBorder : 'rgba(255,255,255,0.1)'}`,
            padding: '3px 9px', borderRadius: 999,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.03em',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {lowStock ? 'Low · ' : ''}{inventory.qty_on_hand} in stock
          </span>
        )}
      </div>

      {crossRefs.length > 0 && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: `0.5px solid ${FC.divider}`,
          display: 'flex', flexDirection: 'column', gap: 9,
        }}>
          {crossRefs.map((c) => <CrossRefRow key={c.id} cref={c} />)}
        </div>
      )}
    </div>
  )
}

function CrossRefRow({ cref }: { cref: CrossRefView }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: FC.faint, fontWeight: 700, letterSpacing: '0.04em' }}>
          {(CROSS_REF_TIER[cref.priority] ?? 'Ref').toUpperCase()} · {cref.brand}
        </div>
        <div style={{ marginTop: 1, fontSize: 13.5, fontWeight: 700, color: FC.white }}>
          {cref.part_number}
        </div>
        {cref.source_url && (
          <a
            href={cref.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11.5, color: '#7DA0FF', textDecoration: 'none' }}
          >
            Catalog ↗
          </a>
        )}
      </div>
      {cref.vendorPhone ? (
        <a
          href={`tel:${cref.vendorPhone.replace(/[^0-9+]/g, '')}`}
          aria-label={`Call ${cref.brand}`}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
            background: FC.greenBg, color: FC.green,
            border: `0.5px solid ${FC.greenBorder}`,
            borderRadius: 999, padding: '7px 12px',
            fontSize: 12, fontWeight: 800, textDecoration: 'none',
          }}
        >
          <PhoneIcon size={14} color={FC.green} />
          Call
        </a>
      ) : (
        <span style={{ flexShrink: 0, fontSize: 11, color: FC.faint }}>No phone</span>
      )}
    </div>
  )
}
