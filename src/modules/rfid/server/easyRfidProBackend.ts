// ─── EasyRfidProBackend — TagBackendPort over the sandbox-guarded client ────
// SERVER-side implementation (lives behind the module's API route handlers).
// Maps the module's canonical field names ↔ the Item Master wire names
// (confirmed schema: tag_id, serial_number, rental_class_num, client_name,
// common_name, quality, bin_location, status, last_contract_num,
// last_scanned_by, notes, status_notes, long, lat, date_last_scanned).
//
// barcode/nfcUid: the Item Master does not store these. The identifier
// mapping (PTR: Supabase tag_assignments) is joined in by a later merge-time
// enrichment — this session they come back null (docs/ASSUMPTIONS.md).

import type {
  ItemRecord,
  ItemStatusWrite,
  TagBackendPort,
  TagBackendWriteResult,
} from '../ports/tagBackend'
import { EzrfidClient } from './ezrfidClient'

type WireRow = Record<string, string>

export function wireToItemRecord(row: WireRow): ItemRecord {
  return {
    epc: (row.tag_id ?? '').toUpperCase(),
    tid: null,
    barcode: null, // assignments join pending — ASSUMPTIONS.md
    nfcUid: null, // assignments join pending — ASSUMPTIONS.md
    rentalClassId: row.rental_class_num ?? '',
    commonName: row.common_name ?? '',
    quality: row.quality ?? '',
    currentStatus: row.status ?? '',
    lastContractNum: row.last_contract_num ?? '',
    lastScanBy: row.last_scanned_by ?? '',
    lastScanDate: row.date_last_scanned ?? '',
    serialNum: row.serial_number ?? '',
    binLocation: row.bin_location ?? '',
    notes: row.notes ?? '',
    statusNotes: row.status_notes ?? '',
    gpsLat: row.lat ?? '',
    gpsLng: row.long ?? '',
  }
}

export function statusWriteToWireRow(write: ItemStatusWrite): WireRow {
  const row: WireRow = {
    tag_id: write.epc,
    last_scanned_by: write.scannedBy,
    date_last_scanned: write.scannedAt,
  }
  if (write.status !== undefined) row.status = write.status
  if (write.quality !== undefined) row.quality = write.quality
  if (write.statusNotes !== undefined) row.status_notes = write.statusNotes
  if (write.notes !== undefined) row.notes = write.notes
  if (write.contractNumber !== undefined) row.last_contract_num = write.contractNumber
  if (write.lat !== undefined) row.lat = write.lat
  if (write.lng !== undefined) row.long = write.lng
  return row
}

export class EasyRfidProBackend implements TagBackendPort {
  constructor(private readonly client: EzrfidClient = new EzrfidClient()) {}

  async fetchAllItems(): Promise<ItemRecord[]> {
    const rows = await this.client.fetchItemMasterRows()
    return rows.map(wireToItemRecord)
  }

  async writeItemStatuses(writes: ItemStatusWrite[]): Promise<TagBackendWriteResult> {
    // ONE upsert call, N rows (docs/ASSUMPTIONS.md — batch shape).
    const { ok, raw } = await this.client.upsertItemMasterRows(writes.map(statusWriteToWireRow))
    const body = raw as { success_count?: number; failed_count?: number } | null
    return {
      ok,
      successCount: body?.success_count ?? (ok ? writes.length : 0),
      failedCount: body?.failed_count ?? (ok ? 0 : writes.length),
      raw,
    }
  }
}
