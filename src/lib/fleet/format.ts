// ─── Fleet Maintenance — display formatters ─────────────────────────────────

import type {
  NonTruckAssetRow,
  TruckRow,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
} from './types'

const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change:        'Oil Change',
  brake_inspection:  'Brake Inspection',
  air_filter:        'Air Filter',
  tire_rotation:     'Tire Rotation',
  annual_inspection: 'Annual Inspection',
  custom:            'Custom',
}

/** Prettify a service_type slug; falls back to Title Case for freeform values. */
export function prettyServiceType(raw: string | null | undefined): string {
  if (!raw) return '—'
  const known = SERVICE_TYPE_LABELS[raw]
  if (known) return known
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Short, human date. Accepts a `date` ("YYYY-MM-DD") or full ISO timestamp. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Relative-ish opened label, e.g. "Opened May 22, 2026". */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function truckSubtitle(t: Pick<TruckRow, 'year' | 'make' | 'model' | 'plate'>): string {
  const vehicle = [t.year, t.make, t.model].filter(Boolean).join(' ').trim()
  const plate   = t.plate?.trim()
  if (vehicle && plate) return `${vehicle} · ${plate}`
  return vehicle || plate || 'Truck'
}

export function equipmentSubtitle(
  e: Pick<NonTruckAssetRow, 'year' | 'make' | 'model' | 'asset_type'>,
): string {
  const spec = [e.year, e.make, e.model].filter(Boolean).join(' ').trim()
  if (spec) return spec
  return prettyServiceType(e.asset_type)
}

export function mileage(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('en-US')} mi`
}

export function hours(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${n.toLocaleString('en-US')} hrs`
}

// ─── Work-order pill copy ───────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  routine:  'Routine',
  urgent:   'Urgent',
  critical: 'Critical',
}

export const SOURCE_LABEL: Record<WorkOrderSource, string> = {
  dvir_defect: 'DVIR',
  manual:      'Manual',
}

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
}
