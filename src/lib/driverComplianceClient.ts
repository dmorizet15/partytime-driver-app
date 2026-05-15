// Driver compliance — driver-app copy of the shared shape.
// Mirrors partytime-dashboard/src/lib/driverComplianceClient.ts so the
// expiry math, status enum, and document labels stay identical across
// both surfaces.

import { supabase } from './supabase'

export type DocumentType = 'drivers_license' | 'dot_medical_card' | 'west_point_id'

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'drivers_license',
  'dot_medical_card',
  'west_point_id',
] as const

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  drivers_license:  "Driver's License",
  dot_medical_card: 'DOT Medical Card',
  west_point_id:    'West Point ID',
}

export type ExpiryStatus = 'ok' | 'expiring' | 'expired' | 'missing'

export interface DriverDocSummary {
  id:                string | null
  document_type:     DocumentType
  expiry_date:       string | null
  storage_path:      string | null
  extraction_method: 'vision' | 'manual' | null
  status:            ExpiryStatus
  daysUntilExpiry:   number | null
}

function todayLocalDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null
  const target = new Date(isoDate + 'T00:00:00')
  const today  = new Date(todayLocalDate() + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function expiryStatusFor(isoDate: string | null): { status: ExpiryStatus; days: number | null } {
  if (!isoDate) return { status: 'missing', days: null }
  const days = daysUntil(isoDate)
  if (days == null) return { status: 'missing', days: null }
  if (days < 0)  return { status: 'expired',  days }
  if (days <= 30) return { status: 'expiring', days }
  return { status: 'ok', days }
}

interface DriverDocumentRow {
  id:                string
  document_type:     string
  expiry_date:       string
  storage_path:      string
  extraction_method: string | null
}

export async function fetchMyComplianceDocs(driverId: string): Promise<DriverDocSummary[]> {
  const { data, error } = await supabase
    .from('driver_documents')
    .select('id, document_type, expiry_date, storage_path, extraction_method')
    .eq('driver_id', driverId)
  if (error) throw error

  const rowByType = new Map<DocumentType, DriverDocumentRow>()
  for (const r of (data ?? []) as DriverDocumentRow[]) {
    if ((DOCUMENT_TYPES as readonly string[]).includes(r.document_type)) {
      rowByType.set(r.document_type as DocumentType, r)
    }
  }

  return DOCUMENT_TYPES.map((type) => {
    const row = rowByType.get(type)
    if (!row) {
      return {
        id:                null,
        document_type:     type,
        expiry_date:       null,
        storage_path:      null,
        extraction_method: null,
        status:            'missing' as const,
        daysUntilExpiry:   null,
      }
    }
    const { status, days } = expiryStatusFor(row.expiry_date)
    return {
      id:                row.id,
      document_type:     row.document_type as DocumentType,
      expiry_date:       row.expiry_date,
      storage_path:      row.storage_path,
      extraction_method: (row.extraction_method as 'vision' | 'manual' | null) ?? null,
      status,
      daysUntilExpiry:   days,
    }
  })
}

// Returns the operator-facing copy for an expiring doc. West Point ID has a
// distinct treatment per spec — its renewal window is exactly 30 days before
// expiry, so the amber state is opportunity, not just warning.
export function expiringDocCopy(doc: DriverDocSummary): string {
  if (doc.document_type === 'west_point_id') {
    return 'Renewal window open — renew now'
  }
  const days = doc.daysUntilExpiry ?? 0
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}
