// ─── Stop status ─────────────────────────────────────────────────────────────
export type StopStatus = 'pending' | 'on_the_way_sent' | 'completed'

// Mirrors dashboard PaymentState (src/types/dispatch.ts).
export type PaymentState = 'paid_in_full' | 'cod' | 'ar_customer' | 'balance_due'

// ─── Route ────────────────────────────────────────────────────────────────────
export interface Route {
  route_id: string
  route_name: string
  operating_date: string
  assigned_driver?: string
  stop_count: number
  route_status: 'active' | 'completed' | 'pending'
  truck_id?: string
  truck_name?: string
  truck_plate?: string
  // DVIR routing fields — primary truck only. Drives the pre-trip inspection
  // flow's "always / when_towing / never" branching on Screen 1, plus the
  // OOS-truck hard-block surfaces.
  truck_dvir_requirement?:      'always' | 'when_towing' | 'never'
  truck_current_defect_status?: 'ok' | 'non_oos_defect' | 'oos_defect'
  truck_2_name?: string
}

// ─── Equipment summary ───────────────────────────────────────────────────────
// Two-tier shape produced by lib/equipmentSummary.ts. Tier 1 is the
// fixed-order text headline (tents, chairs, tables, linens, inflatables).
// Tier 2 is the deduped category names rendered downstream as pills.
export interface EquipmentSummary {
  tier1: string[]
  tier2: string[]
}

// ─── Stop ────────────────────────────────────────────────────────────────────
export interface Stop {
  stop_id: string
  route_id: string
  stop_sequence: number
  order_id: string
  stop_type: 'delivery' | 'pickup' | 'service' | 'warehouse'
  customer_name: string
  company_name?: string      // TapGoods rental.name (the order/rental identifier)
  client_company?: string    // primary contact's client.companies[0].name (the org)
  destination_name?: string
  address_line_1: string
  address_line_2?: string
  city: string
  state: string
  postal_code: string
  latitude?: number
  longitude?: number
  customer_phone: string     // legacy: whatever phoneNumbers[0].cell returned (often landline)
  customer_cell?: string     // explicit Mobile-typed phone — preferred for SMS
  notes?: string             // TapGoods-owned customer-facing notes (read-only here)
  dispatcher_notes?: string  // dashboard-owned internal dispatch note; surfaces as a
                             //   "Note from dispatch" modal on stop open + persistent
                             //   re-open card. Distinct from TapGoods notes above.
  equipment: EquipmentSummary
  items?: Array<{ category?: string | null; name?: string | null; qty?: number | null }>
  payment_state?: PaymentState
  balance_due_amount?: number | null  // dollars owed at delivery; null when nothing to collect
  calculated_eta?: string | null      // dispatcher cascade ETA written by dashboard; ISO timestamptz
  current_status: StopStatus
  on_the_way_sent: boolean
  on_the_way_sent_at?: string
  completed_at?: string
}

// ─── Workflow event ───────────────────────────────────────────────────────────
export type WorkflowEventType =
  | 'STOP_VIEWED'
  | 'ON_THE_WAY_SENT'
  | 'ON_THE_WAY_FAILED'
  | 'NAVIGATION_STARTED'
  | 'NAVIGATION_FAILED'
  | 'STOP_COMPLETED'
  | 'TAPGOODS_ORDER_OPENED'
  | 'RFID_APP_OPENED_ATTEMPT'
  | 'RFID_APP_OPEN_FAILED'
  | 'RFID_APP_OPEN_SUCCESS'
  | 'POD_PHOTO_UPLOADED'
  | 'POD_PHOTO_FAILED'
  | 'ETA_SMS_SENT'
  | 'ETA_SMS_FAILED'

export interface WorkflowEvent {
  event_type: WorkflowEventType
  route_id: string
  stop_id: string
  order_id?: string
  actor: string
  timestamp: string
  details?: Record<string, unknown>
}
