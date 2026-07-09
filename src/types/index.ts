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
  // Rev 2 (2026-06-10): true when truck_* came from THIS user's own route_crew
  // row; false when inherited from the route's primary truck (the /api/routes
  // soft-fail display fallback). The pre-trip inspection STOP LOCK keys on
  // `truck_is_own === true` only — an inherited truck must never lock a
  // co-driver behind an inspection they can't perform. undefined = no truck.
  truck_is_own?: boolean
  truck_name?: string
  truck_plate?: string
  // DVIR routing fields — primary truck only. Drives the pre-trip inspection
  // flow's "always / when_towing / never" branching on Screen 1, plus the
  // OOS-truck hard-block surfaces.
  truck_dvir_requirement?:      'always' | 'when_towing' | 'never'
  truck_current_defect_status?: 'ok' | 'non_oos_defect' | 'oos_defect'
  truck_2_name?: string
  // ── Route-level truck roster (display-only) ───────────────────────────────
  // Every truck assigned to the ROUTE (routes.truck_id / truck_id_2 / truck_id_3),
  // independent of which — if any — is pinned to THIS user's crew row. Lets a
  // no-truck co-driver or a (view-only) helper see what trucks are running the
  // route, and surfaces the 2nd/3rd truck on multi-truck routes. Purely
  // informational: it NEVER feeds the pre-trip inspection gate (that keys on the
  // personal `truck_*` / `truck_is_own` fields above). Empty on the /api/routes
  // soft-fail path (no route row context).
  route_trucks?: { name: string; plate?: string }[]
  // Route-level dispatcher note (dashboard-owned). Surfaced in the AVA
  // morning brief "FROM DISPATCH" block. Read-only here.
  dispatcher_notes?: string
  // Route-level warehouse note (dashboard/warehouse-owned, Migration 078).
  // Surfaced at route start (FROM WAREHOUSE sheet, read aloud) + an awareness
  // line in the AVA morning brief. Read-only here.
  warehouse_notes?: string
  // ── Phase 2A — multi-crew ownership (dashboard route_crew) ────────────────
  // Visibility + ownership now flow from route_crew, not route_assignments.
  // The truck_* fields above are sourced from THIS user's own crew truck (a
  // secondary driver sees their own truck, not the route's primary truck);
  // truck_id is undefined for no-truck crew. The fields below describe the
  // signed-in user's crew membership for this route — they drive the pre-trip
  // gate (truck_id presence), the ETA/SMS ownership gate (is_primary), and the
  // Co-driver badge. All undefined in the /api/routes soft-fail fallback path
  // (no crew row resolved).
  route_number?: number
  // 'helper' added 2026-07-09: helpers now receive the route (view-only) so they
  // can see the day's trucks. crew_role is what distinguishes a helper from a
  // co-driver (both carry is_primary === false) — the "Helper" chip label and
  // the view-only completion gate key on it.
  crew_role?: 'primary_driver' | 'secondary_driver' | 'helper'
  is_primary?: boolean
  // Display name of this route's primary driver (the is_primary crew row),
  // resolved profiles.display_name ?? route_crew.wiw_user_name. Powers the
  // no-truck co-driver chip ("Route N with <name>").
  primary_driver_name?: string
  // ── Phase 2B — route handoff (dashboard migration 093) ────────────────────
  // active_driver_id: the profile (= auth uid) currently in active control.
  //   undefined ⇒ no transfer; is_primary determines ownership (existing gate).
  //   set       ⇒ that profile owns SMS/ETA/completion + can re-transfer.
  // transfer_pending_to: the profile awaiting accept/decline. undefined ⇒ none.
  //   When it equals the signed-in user, Home shows the pending-transfer card.
  // crew: every driver on this route's crew (excluding helpers/WIW-only rows)
  //   with a resolvable profile id — feeds the transfer picker (self filtered
  //   out at render). Use isActiveDriver(route, profileId) for all gates.
  active_driver_id?: string
  transfer_pending_to?: string
  crew?: RouteCrewMember[]
}

// A driver on a route's crew, with a resolvable profile id. Feeds the Phase 2B
// transfer picker. profileId = profiles.id = auth.uid = route_crew.user_id.
export interface RouteCrewMember {
  profileId: string
  name: string
  role: 'primary_driver' | 'secondary_driver'
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
  // TapGoods reservation id — groups every stop belonging to the same job (one
  // order can split across multiple trucks/routes). Read-only; feeds the
  // SameJobIndicator "N trucks on this job" chip. Never null on real
  // delivery/pickup rows in production.
  reservation_id?: string
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
  warehouse_notes?: string   // dashboard/warehouse-owned note (Migration 077); surfaces
                             //   as a "FROM WAREHOUSE" block on Stop Detail + in the
                             //   pre-launch notes sheet, same pattern as dispatcher_notes.
  // TapGoods-synced order notes (dashboard/TG-owned, read-only here). Surfaced
  // in the Stop Detail "Order Notes" section and the pre-launch notes sheet.
  notes_additional_delivery?: string  // TG additionalDeliveryInfo
  notes_employee_authored?:   string  // concatenated employee-authored TG notes
  notes_flip?:                string  // TG flipNotes (teardown)
  notes_set_by_time?:         string  // TG setByTimeNotes
  notes_strike_time?:         string  // TG strikeTimeNotes
  equipment: EquipmentSummary
  // tapgoods_pick_list_item_id: TapGoods pick-list line id, written into the
  // items JSONB by the dashboard sync. Addresses each line in the check-off
  // write-back; null/absent lines gate locally but never write to TapGoods.
  items?: Array<{
    category?: string | null
    name?: string | null
    qty?: number | null
    tapgoods_pick_list_item_id?: number | null
    // Parent bundle (e.g. FLOORING & STAGING deck items carry a bundle like
    // "STAGE 8'X12'"). Written into the items JSONB by the dashboard sync;
    // absent on items that aren't part of a bundle. Manifest rendering only.
    bundle_name?: string | null
  }>
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
