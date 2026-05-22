// ─── Fleet Maintenance — domain types ───────────────────────────────────────
// Driver-app side of the Fleet Maintenance Module. All tables are owned by the
// dashboard repo (migrations 062–068); the driver app reads them and writes
// service_records / service_line_items / service_invoices / fleet_work_orders.

import type { Database } from '@/types/supabase'

type Tables = Database['public']['Tables']

export type WorkOrderRow         = Tables['fleet_work_orders']['Row']
export type ServiceRecordRow     = Tables['service_records']['Row']
export type ServiceLineItemRow   = Tables['service_line_items']['Row']
export type ServiceInvoiceRow    = Tables['service_invoices']['Row']
export type MaintenanceSchedule  = Tables['maintenance_schedules']['Row']
export type TruckRow             = Tables['trucks']['Row']
export type NonTruckAssetRow     = Tables['non_truck_assets']['Row']
export type PartRow              = Tables['parts']['Row']
export type PartCrossRefRow      = Tables['part_cross_references']['Row']
export type PartInventoryRow     = Tables['part_inventory']['Row']
export type VendorRow            = Tables['vendors']['Row']

// asset_type discriminator used across work orders / schedules / service records
export type AssetType         = 'truck' | 'equipment'
export type WorkOrderStatus   = 'open' | 'in_progress' | 'resolved'
export type WorkOrderPriority = 'routine' | 'urgent' | 'critical'
export type WorkOrderSource   = 'dvir_defect' | 'manual'
export type PerformedByType   = 'internal' | 'external'

/** Per-schedule PM derivation (date / mileage / hours, whichever fires first). */
export type PmLevel = 'ok' | 'due_soon' | 'overdue'

/** Per-asset rollup — work order beats PM-due beats OK (red / amber / green). */
export type AssetHealth = 'work_order' | 'pm_due' | 'ok'

// ─── Composite shapes assembled by queries.ts ───────────────────────────────

export interface OverviewAsset {
  id:        string
  assetType: AssetType
  name:      string
  subtitle:  string          // trucks: "2019 Isuzu NPR · ABC1234"; equipment: "2021 Avant 530"
  health:    AssetHealth
}

export interface WorkOrderListItem extends WorkOrderRow {
  assetName: string
}

export interface FleetOverview {
  openWorkOrderCount:  number
  pmDueCount:          number
  trucks:              OverviewAsset[]
  equipment:           OverviewAsset[]
  /** Open work orders whose asset is a known truck. */
  truckWorkOrders:     WorkOrderListItem[]
  /** Open work orders whose asset is a known equipment unit. */
  equipmentWorkOrders: WorkOrderListItem[]
  /** Open work orders with a null asset_type or an asset in neither table. */
  otherWorkOrders:     WorkOrderListItem[]
}

/** Lightweight asset reference for the home alert card + Tools badge. */
export interface OpenWorkOrdersSummary {
  count:  number
  assets: { id: string; name: string }[]   // distinct affected asset names
}

export interface FleetAssetInfo {
  id:             string
  assetType:      AssetType
  name:           string
  subtitle:       string           // compact one-liner — work order / log-service headers
  vehicleSpec:    string           // year/make/model only, no plate ("2019 Isuzu NPR")
  identifier:     string | null    // trucks: plate · equipment: serial number
  identifierLabel: string          // "Plate" | "Serial"
  currentMileage: number | null
  currentHours:   number | null
}

export interface CrossRefView extends PartCrossRefRow {
  /** vendor phone matched by brand → vendors.name; null when no vendor/phone. */
  vendorPhone: string | null
}

export interface PartForAsset {
  part:      PartRow
  inventory: PartInventoryRow | null
  crossRefs: CrossRefView[]
}

export interface ServiceRecordView extends ServiceRecordRow {
  lineItems:        ServiceLineItemRow[]
  invoiceCount:     number
  performerDisplay: string   // resolved name for the service-log row
}

export interface WorkOrderDetail {
  workOrder:      WorkOrderRow
  asset:          FleetAssetInfo | null
  assignedUser:   { id: string; display_name: string | null } | null
  serviceRecords: ServiceRecordView[]
  parts:          PartForAsset[]
}

/** A maintenance schedule paired with its derived PM tier — Asset Detail PM list. */
export interface AssetScheduleView {
  schedule: MaintenanceSchedule
  pmLevel:  PmLevel
}

/** Everything the Asset Detail screen renders for one truck / equipment unit. */
export interface AssetDetail {
  asset:          FleetAssetInfo
  health:         AssetHealth
  schedules:      AssetScheduleView[]
  serviceRecords: ServiceRecordView[]
  /** Every work order for the asset — open + resolved, newest first. */
  workOrders:     WorkOrderRow[]
}

/** Service-type option for the Log Service Entry dropdown. */
export interface ServiceTypeOption {
  value: string   // written to service_records.service_type (schedule enum value)
  label: string   // schedule.service_label or prettified service_type
}

export interface AssignableUser {
  id:           string
  display_name: string | null
}

export interface ServiceEntryInput {
  assetType:         AssetType
  assetId:           string
  serviceType:       string
  serviceDate:       string             // YYYY-MM-DD
  performedByType:   PerformedByType
  performedByUserId: string | null
  performedByName:   string | null
  vendorId:          string | null
  mileageAtService:  number | null
  hoursAtService:    number | null
  notes:             string | null
  lineItems:         { name: string; qty: number | null }[]
  invoice:           File | null
}
