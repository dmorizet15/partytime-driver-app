// ─── Stop status ─────────────────────────────────────────────────────────────
export type StopStatus = 'pending' | 'on_the_way_sent' | 'completed'

// ─── Route ────────────────────────────────────────────────────────────────────
export interface Route {
  route_id: string
  route_name: string
  operating_date: string        // YYYY-MM-DD
  assigned_driver?: string
  stop_count: number
  route_status: 'active' | 'completed' | 'pending'
}

// ─── Stop ────────────────────────────────────────────────────────────────────
export interface Stop {
  stop_id: string
  route_id: string
  stop_sequence: number
  order_id: string
  customer_name: string
  destination_name?: string
  address_line_1: string
  address_line_2?: string
  city: string
  state: string
  postal_code: string
  latitude?: number
  longitude?: number
  customer_phone: string
  notes?: string
  current_status: StopStatus
  on_the_way_sent: boolean
  on_the_way_sent_at?: string   // ISO timestamp
  completed_at?: string         // ISO timestamp
}

// ─── Workflow event ───────────────────────────────────────────────────────────
export type WorkflowEventType =
  | 'STOP_VIEWED'
  | 'ON_THE_WAY_SENT'
  | 'ON_THE_WAY_FAILED'
  | 'NAVIGATION_STARTED'
  | 'NAVIGATION_FAILED'
  | 'STOP_COMPLETED'
  // V1.1 additions
  | 'TAPGOODS_ORDER_OPENED'
  | 'RFID_APP_OPENED_ATTEMPT'
  | 'RFID_APP_OPEN_FAILED'
  | 'RFID_APP_OPEN_SUCCESS'      // Android only — intent dispatched (not confirmed launched)
  | 'POD_PHOTO_UPLOADED'
  | 'POD_PHOTO_FAILED'

export interface WorkflowEvent {
  event_type: WorkflowEventType
  route_id: string
  stop_id: string
  order_id?: string
  actor: string
  timestamp: string             // ISO timestamp
  details?: Record<string, unknown>
}
