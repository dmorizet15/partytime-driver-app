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
  // Route-level dispatcher note (dashboard-owned). Surfaced in the AVA
  // morning brief "FROM DISPATCH" block. Read-only here.
  dispatcher_notes?: string
}

// ─── Equipment summary ───────────────────────────────────────────────────────
// Two-tier shape produced by lib/equipmentSummary.ts. Tier 1 is the
// fixed-order text headline (tents, chairs, tables, linens, inflatables).
// Tier 2 is the deduped category names rendered downstream as pills.
export interface EquipmentSummary {
  tier1: string[]
  tier2: string[]
}

// ─── Time-window constraint (Phase 4 — driver-app read-only) ────────────────
import type {
  ConstraintTier,
  NotesClassification,
  DispatcherTimeOverride,
} from '@/lib/stopConstraints'

// ─── Stop ────────────────────────────────────────────────────────────────────
export interface Stop {
  stop_id: string
  route_id: string
  stop_sequence: number
  order_id: string
  // 'warehouse_return' (dashboard Migration 070/071) — auto-injected
  // end-of-route depot stop. Real dispatch_stops row with the warehouse
  // address, geofenced auto-completion at 150m. Notion spec
  // 3690aa6451b881d6b00fcc9dc5c1890b.
  // 'warehouse' is the legacy break-block synthetic stop (BreakBlock
  // type='warehouse'), kept here for back-compat with supabaseTransform's
  // synthetic builder; the two coexist in the route list (legacy reload
  // stops in the middle, real warehouse_return at the tail).
  stop_type: 'delivery' | 'pickup' | 'service' | 'warehouse' | 'warehouse_return'
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
  // TapGoods-synced order notes (dashboard/TG-owned, read-only here). Surfaced
  // in the Stop Detail "Order Notes" section and the pre-launch notes sheet.
  notes_additional_delivery?: string  // TG additionalDeliveryInfo
  notes_employee_authored?:   string  // concatenated employee-authored TG notes
  notes_flip?:                string  // TG flipNotes (teardown)
  notes_set_by_time?:         string  // TG setByTimeNotes
  notes_strike_time?:         string  // TG strikeTimeNotes
  equipment: EquipmentSummary
  items?: Array<{ category?: string | null; name?: string | null; qty?: number | null }>
  payment_state?: PaymentState
  balance_due_amount?: number | null  // dollars owed at delivery; null when nothing to collect
  calculated_eta?: string | null      // dispatcher cascade ETA written by dashboard; ISO timestamptz
  current_status: StopStatus
  on_the_way_sent: boolean
  on_the_way_sent_at?: string
  completed_at?: string
  arrived_at?: string         // GPS auto-arrival timestamp; set once on first
                              //   150m-geofence trigger and never overwritten.
  // Time-window constraint (Phase 4). Read-only on the driver app — written
  // by the dashboard's Migration 058 trigger + the dispatcher's override
  // controls. `constraint_confidence` is the headline tier; the underlying
  // window bounds come from `*_window_start/end`, `notes_classification`, or
  // `dispatcher_time_override` per the source-priority tree in
  // src/lib/stopConstraints.ts.
  constraint_confidence?:           ConstraintTier | null
  has_any_constraint?:              boolean
  delivery_window_start?:           string | null
  delivery_window_end?:             string | null
  pickup_window_start?:             string | null
  pickup_window_end?:               string | null
  event_start?:                     string | null
  event_end?:                       string | null
  notes_classification?:            NotesClassification | null
  dispatcher_time_override?:        DispatcherTimeOverride | null
  dispatcher_constraint_dismissed?: boolean
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
