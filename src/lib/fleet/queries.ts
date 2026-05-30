// ─── Fleet Maintenance — Supabase data access ───────────────────────────────
// All reads/writes go through the browser supabase client. Every fleet table
// and the `service-invoices` Storage bucket is RLS-gated on
// has_fleet_maintenance_access(), so the user JWT is the only authority needed —
// no API routes. UI still gates on profiles.fleet_maintenance_access so
// non-fleet users never reach these calls.

import { supabase } from '@/lib/supabase'
import { assetHealth, complianceStatus, mostSevere, pmLevelForSchedule } from './pmStatus'
import { equipmentSubtitle, prettyServiceType, truckSubtitle } from './format'
import type {
  AssetDetail,
  AssetScheduleView,
  AssetType,
  AssignableUser,
  ComplianceBadges,
  CrossRefView,
  FleetAssetInfo,
  FleetOverview,
  MaintenanceSchedule,
  MyServiceRecordView,
  NonTruckAssetRow,
  OpenWorkOrdersSummary,
  OverviewAsset,
  PartCrossRefRow,
  PartForAsset,
  PartInventoryRow,
  PartRow,
  ServiceEntryInput,
  ServiceLineItemRow,
  ServiceRecordRow,
  ServiceRecordView,
  ServiceTypeOption,
  TruckRow,
  VendorRow,
  WorkOrderDetail,
  WorkOrderListItem,
  WorkOrderRow,
} from './types'

// "Open" = anything not resolved (open + in_progress).
const OPEN_STATUSES = ['open', 'in_progress']

// ─── Asset name resolution ──────────────────────────────────────────────────

async function fetchAssetNameMap(): Promise<Map<string, string>> {
  const [trucks, equipment] = await Promise.all([
    supabase.from('trucks').select('id, name'),
    supabase.from('non_truck_assets').select('id, name'),
  ])
  const map = new Map<string, string>()
  for (const r of (trucks.data ?? []) as { id: string; name: string }[]) map.set(r.id, r.name)
  for (const r of (equipment.data ?? []) as { id: string; name: string }[]) map.set(r.id, r.name)
  return map
}

function vehicleSpecOf(parts: (string | number | null | undefined)[], fallback: string): string {
  const spec = parts.filter(Boolean).join(' ').trim()
  return spec || fallback
}

export async function fetchAssetInfo(type: AssetType, id: string): Promise<FleetAssetInfo | null> {
  if (type === 'truck') {
    const { data } = await supabase.from('trucks').select('*').eq('id', id).maybeSingle()
    if (!data) return null
    const t = data as TruckRow
    return {
      id: t.id, assetType: 'truck', name: t.name, subtitle: truckSubtitle(t),
      vehicleSpec: vehicleSpecOf([t.year, t.make, t.model], 'Truck'),
      identifier: t.plate?.trim() || null, identifierLabel: 'Plate',
      currentMileage: t.current_mileage, currentHours: null,
    }
  }
  const { data } = await supabase.from('non_truck_assets').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const e = data as NonTruckAssetRow
  return {
    id: e.id, assetType: 'equipment', name: e.name, subtitle: equipmentSubtitle(e),
    vehicleSpec: vehicleSpecOf([e.year, e.make, e.model], prettyServiceType(e.asset_type)),
    identifier: e.serial_number?.trim() || null, identifierLabel: 'Serial',
    currentMileage: null, currentHours: e.current_hours,
  }
}

// ─── Open work orders — home alert card + Tools Hub badge ───────────────────

export async function fetchOpenWorkOrdersSummary(): Promise<OpenWorkOrdersSummary> {
  const { data, error } = await supabase
    .from('fleet_work_orders')
    .select('id, asset_id')
    .in('status', OPEN_STATUSES)
  if (error || !data) {
    if (error) console.warn('[fleet] fetchOpenWorkOrdersSummary', error.message)
    return { count: 0, assets: [] }
  }
  const rows = data as { id: string; asset_id: string }[]
  if (rows.length === 0) return { count: 0, assets: [] }

  const nameMap = await fetchAssetNameMap()
  const seen = new Map<string, string>()
  for (const r of rows) {
    if (!seen.has(r.asset_id)) seen.set(r.asset_id, nameMap.get(r.asset_id) ?? 'Unknown asset')
  }
  return {
    count: rows.length,
    assets: Array.from(seen.entries()).map(([id, name]) => ({ id, name })),
  }
}

// ─── Fleet Overview (/tools/fleet) ──────────────────────────────────────────

export async function fetchFleetOverview(): Promise<FleetOverview> {
  const [trucksRes, equipRes, woRes, schedRes] = await Promise.all([
    supabase.from('trucks').select('*').order('name'),
    supabase.from('non_truck_assets').select('*').order('name'),
    supabase.from('fleet_work_orders').select('*').in('status', OPEN_STATUSES)
      .order('created_at', { ascending: false }),
    supabase.from('maintenance_schedules').select('*').eq('active', true),
  ])

  // Fetch trucks + equipment unfiltered: the active rows drive the visible
  // lists, while the full id sets decide whether a work order belongs to a
  // section or the "Other work orders" catch-all (asset still exists, even if
  // inactive → it stays in its section; gone entirely → catch-all).
  const allTrucks    = (trucksRes.data ?? []) as TruckRow[]
  const allEquipment = (equipRes.data ?? []) as NonTruckAssetRow[]
  const workOrders   = (woRes.data ?? []) as WorkOrderRow[]
  const schedules    = (schedRes.data ?? []) as MaintenanceSchedule[]

  const trucks    = allTrucks.filter((t) => t.active)
  const equipment = allEquipment.filter((e) => e.active)

  const truckById = new Map(trucks.map((t) => [t.id, t]))
  const equipById = new Map(equipment.map((e) => [e.id, e]))
  const woAssetIds = new Set(workOrders.map((w) => w.asset_id))

  const schedByAsset = new Map<string, MaintenanceSchedule[]>()
  for (const s of schedules) {
    const arr = schedByAsset.get(s.asset_id) ?? []
    arr.push(s)
    schedByAsset.set(s.asset_id, arr)
  }

  // PM-due count — every active schedule (truck or equipment) needing attention.
  let pmDueCount = 0
  for (const s of schedules) {
    const truck = truckById.get(s.asset_id)
    const equip = equipById.get(s.asset_id)
    if (!truck && !equip) continue
    const ctx = {
      currentMileage: truck?.current_mileage ?? null,
      currentHours:   equip?.current_hours ?? null,
    }
    if (pmLevelForSchedule(s, ctx) !== 'ok') pmDueCount++
  }

  const toOverviewTruck = (t: TruckRow): OverviewAsset => {
    const levels = (schedByAsset.get(t.id) ?? []).map((s) =>
      pmLevelForSchedule(s, { currentMileage: t.current_mileage, currentHours: null }))
    const compliance: ComplianceBadges = {
      registration: complianceStatus(t.registration_expiry),
      inspection:   complianceStatus(t.inspection_expiry),
      insurance:    complianceStatus(t.insurance_expiry),
    }
    return {
      id: t.id, assetType: 'truck', name: t.name, subtitle: truckSubtitle(t),
      health: assetHealth(woAssetIds.has(t.id), mostSevere(levels)),
      mileage: t.current_mileage,
      compliance,
    }
  }
  const toOverviewEquip = (e: NonTruckAssetRow): OverviewAsset => {
    const levels = (schedByAsset.get(e.id) ?? []).map((s) =>
      pmLevelForSchedule(s, { currentMileage: null, currentHours: e.current_hours }))
    return {
      id: e.id, assetType: 'equipment', name: e.name, subtitle: equipmentSubtitle(e),
      health: assetHealth(woAssetIds.has(e.id), mostSevere(levels)),
    }
  }

  // Partition open work orders into TRUCKS / EQUIPMENT / catch-all. A work
  // order is "Other" when its asset_type is null OR its asset_id resolves to
  // neither the trucks nor the non_truck_assets table.
  const truckIds = new Set(allTrucks.map((t) => t.id))
  const equipIds = new Set(allEquipment.map((e) => e.id))
  const nameMap  = new Map<string, string>()
  allTrucks.forEach((t) => nameMap.set(t.id, t.name))
  allEquipment.forEach((e) => nameMap.set(e.id, e.name))

  const truckWorkOrders:     WorkOrderListItem[] = []
  const equipmentWorkOrders: WorkOrderListItem[] = []
  const otherWorkOrders:     WorkOrderListItem[] = []
  for (const w of workOrders) {
    const item: WorkOrderListItem = { ...w, assetName: nameMap.get(w.asset_id) ?? 'Unknown asset' }
    const known = truckIds.has(w.asset_id) || equipIds.has(w.asset_id)
    if (!w.asset_type || !known)        otherWorkOrders.push(item)
    else if (w.asset_type === 'truck')  truckWorkOrders.push(item)
    else if (w.asset_type === 'equipment') equipmentWorkOrders.push(item)
    else                                otherWorkOrders.push(item)
  }

  return {
    openWorkOrderCount: workOrders.length,
    pmDueCount,
    trucks:    trucks.map(toOverviewTruck),
    equipment: equipment.map(toOverviewEquip),
    truckWorkOrders,
    equipmentWorkOrders,
    otherWorkOrders,
  }
}

// ─── Asset Detail (/tools/fleet/assets/[type]/[id]) ─────────────────────────

export async function fetchAssetDetail(type: AssetType, id: string): Promise<AssetDetail | null> {
  const asset = await fetchAssetInfo(type, id)
  if (!asset) return null

  const [schedRes, woRes, serviceRecords, parts] = await Promise.all([
    supabase.from('maintenance_schedules').select('*')
      .eq('asset_type', type).eq('asset_id', id).eq('active', true),
    supabase.from('fleet_work_orders').select('*')
      .eq('asset_type', type).eq('asset_id', id)
      .order('created_at', { ascending: false }),
    fetchServiceRecordsForAsset(type, id, 20),
    fetchPartsForAsset(type, id),
  ])

  const schedules  = (schedRes.data ?? []) as MaintenanceSchedule[]
  const workOrders = (woRes.data ?? []) as WorkOrderRow[]

  const ctx = { currentMileage: asset.currentMileage, currentHours: asset.currentHours }
  const scheduleViews: AssetScheduleView[] = schedules.map((s) => ({
    schedule: s,
    pmLevel:  pmLevelForSchedule(s, ctx),
  }))

  const hasOpenWO = workOrders.some((w) => OPEN_STATUSES.includes(w.status))
  const health = assetHealth(hasOpenWO, mostSevere(scheduleViews.map((v) => v.pmLevel)))

  return { asset, health, schedules: scheduleViews, serviceRecords, workOrders, parts }
}

// ─── My Log (Fleet Overview → My Log tab) ───────────────────────────────────

/**
 * Every service record the signed-in user logged, across all assets, newest
 * first. Reads service_records.performed_by_user_id = the caller — RLS already
 * scopes fleet reads, but we filter explicitly so the tab is the user's own log.
 */
export async function fetchMyServiceLog(userId: string, limit = 50): Promise<MyServiceRecordView[]> {
  const { data } = await supabase
    .from('service_records')
    .select('*')
    .eq('performed_by_user_id', userId)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const records = (data ?? []) as ServiceRecordRow[]
  if (records.length === 0) return []

  const [enriched, nameMap] = await Promise.all([
    enrichServiceRecords(records),
    fetchAssetNameMap(),
  ])
  return enriched.map((r) => ({
    ...r,
    assetName: nameMap.get(r.asset_id) ?? 'Unknown asset',
  }))
}

// ─── Work Order Detail (/tools/fleet/work-orders/[id]) ──────────────────────

async function fetchServiceRecordsForAsset(
  type: AssetType, assetId: string, limit = 10,
): Promise<ServiceRecordView[]> {
  const { data } = await supabase
    .from('service_records')
    .select('*')
    .eq('asset_type', type)
    .eq('asset_id', assetId)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  return enrichServiceRecords((data ?? []) as ServiceRecordRow[])
}

/**
 * Hydrate raw service_records with their line items, invoice counts, and a
 * resolved performer name. Shared by the per-asset history and the My Log tab.
 */
async function enrichServiceRecords(records: ServiceRecordRow[]): Promise<ServiceRecordView[]> {
  if (records.length === 0) return []

  const ids = records.map((r) => r.id)
  const [liRes, invRes] = await Promise.all([
    supabase.from('service_line_items').select('*').in('service_record_id', ids),
    supabase.from('service_invoices').select('id, service_record_id').in('service_record_id', ids),
  ])

  const liByRecord = new Map<string, ServiceLineItemRow[]>()
  for (const li of (liRes.data ?? []) as ServiceLineItemRow[]) {
    const arr = liByRecord.get(li.service_record_id) ?? []
    arr.push(li)
    liByRecord.set(li.service_record_id, arr)
  }
  const invCount = new Map<string, number>()
  for (const inv of (invRes.data ?? []) as { service_record_id: string }[]) {
    invCount.set(inv.service_record_id, (invCount.get(inv.service_record_id) ?? 0) + 1)
  }

  const internalIds = Array.from(new Set(
    records
      .filter((r) => r.performed_by_type === 'internal' && r.performed_by_user_id)
      .map((r) => r.performed_by_user_id as string),
  ))
  const nameById = new Map<string, string>()
  if (internalIds.length) {
    const { data: profs } = await supabase
      .from('profiles').select('id, display_name').in('id', internalIds)
    for (const p of (profs ?? []) as { id: string; display_name: string | null }[]) {
      nameById.set(p.id, p.display_name ?? 'Driver')
    }
  }

  return records.map((r) => {
    const internalName = r.performed_by_user_id
      ? nameById.get(r.performed_by_user_id) ?? r.performed_by_name ?? 'Driver'
      : r.performed_by_name ?? 'Driver'
    return {
      ...r,
      lineItems:        liByRecord.get(r.id) ?? [],
      invoiceCount:     invCount.get(r.id) ?? 0,
      performerDisplay: r.performed_by_type === 'internal'
        ? internalName
        : r.performed_by_name ?? 'External',
    }
  })
}

async function fetchPartsForAsset(type: AssetType, assetId: string): Promise<PartForAsset[]> {
  const { data: fitData } = await supabase
    .from('asset_part_fitments')
    .select('part_id')
    .eq('asset_type', type)
    .eq('asset_id', assetId)
  const partIds = Array.from(new Set(((fitData ?? []) as { part_id: string }[]).map((f) => f.part_id)))
  if (partIds.length === 0) return []

  const [partsRes, crossRes, invRes, vendorRes] = await Promise.all([
    supabase.from('parts').select('*').in('id', partIds),
    supabase.from('part_cross_references').select('*').in('part_id', partIds),
    supabase.from('part_inventory').select('*').in('part_id', partIds),
    supabase.from('vendors').select('*'),
  ])
  const parts   = (partsRes.data ?? []) as PartRow[]
  const crosses = (crossRes.data ?? []) as PartCrossRefRow[]
  const invs    = (invRes.data ?? []) as PartInventoryRow[]
  const vendors = (vendorRes.data ?? []) as VendorRow[]

  // vendors has no FK to cross-refs — match the cross-ref brand to vendor name.
  const vendorPhone = new Map<string, string>()
  for (const v of vendors) {
    if (v.phone) vendorPhone.set(v.name.trim().toLowerCase(), v.phone)
  }
  const crossByPart = new Map<string, CrossRefView[]>()
  for (const c of crosses) {
    const view: CrossRefView = {
      ...c,
      vendorPhone: vendorPhone.get(c.brand.trim().toLowerCase()) ?? null,
    }
    const arr = crossByPart.get(c.part_id) ?? []
    arr.push(view)
    crossByPart.set(c.part_id, arr)
  }
  const invByPart = new Map<string, PartInventoryRow>()
  for (const i of invs) invByPart.set(i.part_id, i)

  return parts
    .map((p) => ({
      part:      p,
      inventory: invByPart.get(p.id) ?? null,
      crossRefs: (crossByPart.get(p.id) ?? []).slice().sort((a, b) => a.priority - b.priority),
    }))
    .sort((a, b) => a.part.part_name.localeCompare(b.part.part_name))
}

export async function fetchWorkOrderDetail(id: string): Promise<WorkOrderDetail | null> {
  const { data, error } = await supabase
    .from('fleet_work_orders').select('*').eq('id', id).maybeSingle()
  if (error || !data) {
    if (error) console.warn('[fleet] fetchWorkOrderDetail', error.message)
    return null
  }
  const workOrder = data as WorkOrderRow
  const type = workOrder.asset_type as AssetType

  const asset = await fetchAssetInfo(type, workOrder.asset_id)

  let assignedUser: WorkOrderDetail['assignedUser'] = null
  if (workOrder.assigned_to_user_id) {
    const { data: prof } = await supabase
      .from('profiles').select('id, display_name')
      .eq('id', workOrder.assigned_to_user_id).maybeSingle()
    if (prof) assignedUser = prof as { id: string; display_name: string | null }
  }

  const [serviceRecords, parts] = await Promise.all([
    fetchServiceRecordsForAsset(type, workOrder.asset_id),
    fetchPartsForAsset(type, workOrder.asset_id),
  ])

  return { workOrder, asset, assignedUser, serviceRecords, parts }
}

// ─── Log Service Entry context ──────────────────────────────────────────────
// Built either from a work order (fetchLogServiceContext) or straight from an
// asset (fetchLogServiceContextForAsset, the standalone "Log service" path).
// Both reduce to the same shape — the entry happens against an asset.

export interface LogServiceContext {
  asset:              FleetAssetInfo | null
  serviceTypeOptions: ServiceTypeOption[]
  vendors:            VendorRow[]
}

export async function fetchServiceTypeOptions(
  type: AssetType, assetId: string,
): Promise<ServiceTypeOption[]> {
  const { data } = await supabase
    .from('maintenance_schedules')
    .select('service_type, service_label')
    .eq('asset_type', type)
    .eq('asset_id', assetId)
    .eq('active', true)
  const rows = (data ?? []) as { service_type: string; service_label: string | null }[]
  const seen = new Set<string>()
  const out: ServiceTypeOption[] = []
  for (const r of rows) {
    if (seen.has(r.service_type)) continue
    seen.add(r.service_type)
    out.push({ value: r.service_type, label: r.service_label || prettyServiceType(r.service_type) })
  }
  return out
}

export async function fetchVendors(): Promise<VendorRow[]> {
  const { data } = await supabase.from('vendors').select('*').order('name')
  return (data ?? []) as VendorRow[]
}

/** Log-service context for an asset directly — the standalone entry point. */
export async function fetchLogServiceContextForAsset(
  type: AssetType, assetId: string,
): Promise<LogServiceContext> {
  const [asset, serviceTypeOptions, vendors] = await Promise.all([
    fetchAssetInfo(type, assetId),
    fetchServiceTypeOptions(type, assetId),
    fetchVendors(),
  ])
  return { asset, serviceTypeOptions, vendors }
}

/** Log-service context resolved from a work order. Null when the WO is gone. */
export async function fetchLogServiceContext(workOrderId: string): Promise<LogServiceContext | null> {
  const { data } = await supabase
    .from('fleet_work_orders')
    .select('asset_type, asset_id')
    .eq('id', workOrderId)
    .maybeSingle()
  if (!data) return null
  const wo = data as { asset_type: string; asset_id: string }
  return fetchLogServiceContextForAsset(wo.asset_type as AssetType, wo.asset_id)
}

export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('fleet_maintenance_access', true)
    .is('archived_at', null)
    .order('display_name')
  return (data ?? []) as AssignableUser[]
}

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Upload an invoice file to Storage + record it against a service record. */
export async function uploadInvoice(
  serviceRecordId: string, file: File, uploadedByUserId: string | null,
): Promise<void> {
  const ext = (file.name.split('.').pop() || 'dat').toLowerCase().replace(/[^a-z0-9]/g, '') || 'dat'
  const path = `${serviceRecordId}/${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from('service-invoices')
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) throw new Error(upErr.message)

  const { error: insErr } = await supabase.from('service_invoices').insert({
    service_record_id:   serviceRecordId,
    file_name:           file.name,
    file_path:           path,
    mime_type:           file.type || null,
    uploaded_by_user_id: uploadedByUserId,
  })
  if (insErr) throw new Error(insErr.message)
}

/**
 * Create a service_records row (+ optional line items + optional invoice).
 * The work order is intentionally left untouched — resolving it is a separate,
 * deliberate action.
 */
export async function createServiceEntry(input: ServiceEntryInput): Promise<string> {
  const { data, error } = await supabase
    .from('service_records')
    .insert({
      asset_type:           input.assetType,
      asset_id:             input.assetId,
      service_date:         input.serviceDate,
      service_type:         input.serviceType,
      performed_by_type:    input.performedByType,
      performed_by_user_id: input.performedByUserId,
      performed_by_name:    input.performedByName,
      vendor_id:            input.vendorId,
      mileage_at_service:   input.mileageAtService,
      hours_at_service:     input.hoursAtService,
      notes:                input.notes,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save the service record.')
  const recordId = (data as { id: string }).id

  const items = input.lineItems
    .filter((li) => li.name.trim().length > 0)
    .map((li) => ({
      service_record_id: recordId,
      description:       li.name.trim(),
      qty_used:          li.qty,
    }))
  if (items.length) {
    const { error: liErr } = await supabase.from('service_line_items').insert(items)
    if (liErr) throw new Error(liErr.message)
  }

  if (input.invoice) {
    await uploadInvoice(recordId, input.invoice, input.performedByUserId)
  }
  return recordId
}

/** Close a work order. Does NOT create a service record — that is independent. */
export async function resolveWorkOrder(
  id: string, resolvedByUserId: string | null, notes: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('fleet_work_orders')
    .update({
      status:              'resolved',
      resolved_at:         new Date().toISOString(),
      resolved_by_user_id: resolvedByUserId,
      resolution_notes:    notes && notes.trim() ? notes.trim() : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Assign (or unassign, with null) a work order to a fleet user. */
export async function assignWorkOrder(id: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .from('fleet_work_orders')
    .update({ assigned_to_user_id: userId })
    .eq('id', id)
  if (error) throw new Error(error.message)
}
