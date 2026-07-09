// ─── Seeded fixture data — the harness's ground truth ────────────────────────
// Small item table covering every case the acceptance tests need:
//   • a normal rentable item
//   • an item in Wash (non-rentable → ConflictInterrupt)
//   • an item in Repair with reasons attached (non-rentable)
//   • an EPC never seen before (NOT in this table — see UNKNOWN_EPC)
//   • two units of the same rental class with different quality grades
// Status strings are the EXACT live-app vocabulary — do not invent values.

import type { ItemRecord } from '../ports/tagBackend'

// Status/reason vocabulary lives in flows/statusVocabulary.ts (domain data,
// not fixture data) — re-exported here so older test imports keep working.
export { ITEM_STATUSES, NON_RENTABLE_STATUSES, REPAIR_REASONS, WASH_REASONS } from '../flows/statusVocabulary'
export type { ItemStatus } from '../flows/statusVocabulary'

/** Scanned in the field but present in no replica — the "never seen before" case. */
export const UNKNOWN_EPC = 'E28011700000000000000099'

export const FIXTURE_CONTRACT = 'C-4021'
export const FIXTURE_PRIOR_CONTRACT = 'C-3877'

/** EPCs by test role, so tests read as prose. */
export const EPC = {
  rentable: 'E28011700000000000000001',
  inWash: 'E28011700000000000000002',
  inRepair: 'E28011700000000000000003',
  qualityA: 'E28011700000000000000004',
  qualityB: 'E28011700000000000000005',
  wetItem: 'E28011700000000000000006',
} as const

/** Barcode + NFC identifiers for the multi-modal cases. */
export const BARCODE = { rentable: 'PTR-100001', qualityA: 'PTR-200001' } as const
export const NFC_UID = { rentable: '04:A1:B2:C3:D4:E5:F6' } as const

function item(partial: Partial<ItemRecord> & Pick<ItemRecord, 'epc' | 'rentalClassId' | 'commonName' | 'currentStatus'>): ItemRecord {
  return {
    tid: null,
    barcode: null,
    nfcUid: null,
    quality: 'A',
    lastContractNum: '',
    lastScanBy: '',
    lastScanDate: '',
    serialNum: '',
    binLocation: '',
    notes: '',
    statusNotes: '',
    gpsLat: '',
    gpsLng: '',
    ...partial,
  }
}

export function fixtureItems(): ItemRecord[] {
  return [
    item({
      epc: EPC.rentable,
      rentalClassId: 'RC-TENT-20X20',
      commonName: 'TENT 20X20 FRAME',
      currentStatus: 'Ready to Rent',
      quality: 'A',
      barcode: BARCODE.rentable,
      nfcUid: NFC_UID.rentable,
      serialNum: 'SN-1001',
      binLocation: 'A-01',
      lastContractNum: FIXTURE_PRIOR_CONTRACT,
      lastScanBy: 'warehouse',
      lastScanDate: '2026-07-01 09:15:00',
      gpsLat: '35.0456',
      gpsLng: '-85.3097',
    }),
    item({
      epc: EPC.inWash,
      rentalClassId: 'RC-LINEN-90RND',
      commonName: 'LINEN 90IN ROUND WHITE',
      currentStatus: 'Wash',
      quality: 'B',
      binLocation: 'W-BIN',
      statusNotes: 'Wash: Dirty / Mud',
      lastContractNum: FIXTURE_PRIOR_CONTRACT,
    }),
    item({
      epc: EPC.inRepair,
      rentalClassId: 'RC-SIDEWALL-20',
      commonName: 'TENT SIDEWALL 20FT',
      currentStatus: 'Repair',
      quality: 'C',
      binLocation: 'R-BIN',
      statusNotes: 'Repair: Rip or Tear; Grommet — Location of Repair: NW corner',
      lastContractNum: FIXTURE_PRIOR_CONTRACT,
    }),
    // Two units, same rental class, different quality grades.
    item({
      epc: EPC.qualityA,
      rentalClassId: 'RC-CHAIR-GARDEN',
      commonName: 'CHAIR WHITE PADDED GARDEN',
      currentStatus: 'Ready to Rent',
      quality: 'A',
      barcode: BARCODE.qualityA,
      serialNum: 'SN-2001',
      binLocation: 'C-04',
    }),
    item({
      epc: EPC.qualityB,
      rentalClassId: 'RC-CHAIR-GARDEN',
      commonName: 'CHAIR WHITE PADDED GARDEN',
      currentStatus: 'Ready to Rent',
      quality: 'B',
      serialNum: 'SN-2002',
      binLocation: 'C-04',
    }),
    item({
      epc: EPC.wetItem,
      rentalClassId: 'RC-TENT-20X20',
      commonName: 'TENT 20X20 FRAME',
      currentStatus: 'Wet',
      quality: 'B',
      serialNum: 'SN-1002',
      binLocation: 'A-01',
    }),
  ]
}
