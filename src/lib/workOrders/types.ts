import type { Database } from '@/types/supabase'

// Row alias — exactly what the dashboard returns from GET /api/work-orders.
// Driver app reads these as opaque records; no writes go through the
// supabase client (everything funnels through the dashboard's REST API
// so the assignee-email notification fires).
export type FieldWorkOrder = Database['public']['Tables']['field_work_orders']['Row']

export type WorkOrderStatus   = 'open' | 'in_progress' | 'done'
export type WorkOrderPriority = 'low'  | 'medium'      | 'high'
export type WorkOrderBilling  = 'undecided' | 'bill_customer' | 'no_charge'
export type WorkOrderAssetType =
  | 'truck'
  | 'equipment'    // non_truck_assets row
  | 'field_item'   // rented asset on a job site (an order's item)
  | 'other'        // catch-all free-text

// POST body — matches the dashboard's /api/work-orders Insert schema.
// work_order_number is server-generated; the driver app never sends it.
export interface CreateWorkOrderPayload {
  // Asset
  asset_type:    WorkOrderAssetType
  asset_name:    string
  asset_id?:     string | null       // FK into trucks / non_truck_assets when known
  serial_number?: string | null

  // Issue
  issue_description: string
  priority:          WorkOrderPriority
  billing_status:    WorkOrderBilling

  // Assignment
  assigned_to_user_id: string

  // Optional stop / order context (Screen 2A and the "related order" search
  // on 2B both populate these). Dashboard route reads them as nullable.
  stop_id?:               string | null
  tapgoods_order_id?:     string | null
  tapgoods_order_number?: string | null
  customer_name?:         string | null

  // Free-form notes — currently unused by the form, reserved for future use.
  notes?: string | null
}

// PATCH body — Screen 4 actions.
export interface UpdateWorkOrderPayload {
  status?:      WorkOrderStatus
  notes?:       string
  /** Internal-only: dashboard route stamps resolved_at / resolved_by when
   *  status flips to 'done'. Driver doesn't send these. */
}

// Lightweight assignee shape — picker rows + post-submit confirmation banner.
export interface TechnicianOption {
  id:           string
  display_name: string | null
  is_self:      boolean
}
