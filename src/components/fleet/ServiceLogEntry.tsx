// ─── Fleet Maintenance — service log entry card ─────────────────────────────
// One row of an asset's service history. Shared by Work Order Detail and
// Asset Detail so the service log reads identically on both surfaces.

import { FC } from '@/lib/fleet/theme'
import { formatDate, hours, mileage, prettyServiceType } from '@/lib/fleet/format'
import type { ServiceRecordView } from '@/lib/fleet/types'

export default function ServiceLogEntry({ record }: { record: ServiceRecordView }) {
  const meta: string[] = []
  if (record.mileage_at_service != null) meta.push(mileage(record.mileage_at_service))
  if (record.hours_at_service != null) meta.push(hours(record.hours_at_service))
  if (record.lineItems.length) meta.push(`${record.lineItems.length} part${record.lineItems.length === 1 ? '' : 's'}`)
  if (record.invoiceCount) meta.push(`${record.invoiceCount} invoice${record.invoiceCount === 1 ? '' : 's'}`)

  return (
    <div style={{
      background: FC.card, border: `0.5px solid ${FC.cardBorder}`,
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: FC.white }}>
          {prettyServiceType(record.service_type)}
        </div>
        <div style={{ fontSize: 12, color: FC.muted, flexShrink: 0 }}>
          {formatDate(record.service_date)}
        </div>
      </div>
      <div style={{ marginTop: 3, fontSize: 12.5, color: FC.muted }}>
        {record.performerDisplay}
        {record.performed_by_type === 'external' ? ' · external' : ''}
      </div>
      {meta.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: FC.faint }}>{meta.join('  ·  ')}</div>
      )}
      {record.notes?.trim() && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', lineHeight: 1.45 }}>
          {record.notes}
        </div>
      )}
    </div>
  )
}
