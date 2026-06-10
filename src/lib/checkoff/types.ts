// ─── TapGoods Item Check-Off — shared types ──────────────────────────────────
// Spec: Notion "Driver App — TapGoods Item Check-Off (Delivery + Pickup)"
// (37b0aa6451b881e39a1bcde70e6bd288), design-locked 2026-06-10.
//
// A line's state is TWO independent axes (locked decision #2):
//   QUANTITY — accepted at full qty, or corrected (short) via the Issue drawer.
//   DAMAGE   — never changes the quantity; opens a repair work order instead.

import type { Stop } from '@/types'

// One stop.items line — narrowed to the two stop types that check off.
export type CheckoffStopType = 'delivery' | 'pickup'

export type CheckoffItem = NonNullable<Stop['items']>[number]

// Per-line UI/draft state, keyed by index into stop.items (the items JSONB is
// the server-trusted manifest; index order is stable within a sync cycle —
// the draft dies with the session, never outliving a manifest rewrite).
export interface CheckoffLineDraft {
  index: number
  // accepted = resolved. Tap-accept resolves at full qty; the Issue drawer's
  // stepper resolves at the corrected qty (short when below ordered).
  accepted: boolean
  confirmedQty: number
  damaged: boolean
  // Set when the damage flag spawned a work order via ReportIssueForm.
  // Captured BEFORE commit — drivers are append-only on stop_item_checkoffs
  // (no UPDATE policy), so the WO id must ride the INSERT.
  workOrderId: string | null
  workOrderNumber: string | null
}

export interface CheckoffDraft {
  stopId: string
  lines: CheckoffLineDraft[]
  savedAt: string
}

// Wire shape for POST /api/tapgoods/dispatch/write-back. Lines without a
// numeric pick-list id are sent anyway — the server ignores them for the
// TapGoods write (same filter as Will Call) but they cost nothing.
export interface WriteBackLine {
  tapgoods_pick_list_item_id: number | null
  qty: number
}

// stop_item_checkoffs INSERT row (mirrors mig 096; append-only for drivers).
export interface CheckoffInsertRow {
  stop_id: string
  tapgoods_pick_list_item_id: number | null
  item_name: string
  ordered_qty: number
  confirmed_qty: number
  damaged: boolean
  confirmed_by: string
  confirmed_at: string
  stop_type: CheckoffStopType
  work_order_id: string | null
}

// Offline-queue entry — ONE per stop, last-write-wins (OTW dedupe pattern).
// `rows` is non-null while the supabase audit insert itself is still pending
// (committed offline); cleared once inserted so a flush never double-inserts.
export interface CheckoffQueueEntry {
  stopId: string
  rows: CheckoffInsertRow[] | null
  lines: WriteBackLine[]
  queuedAt: string
}

// Stash written by ReportIssueScreen when a check-off damage flag spawned a
// work order — consumed by the check-off sheet on return to attach the WO id
// to the damaged line before commit.
export interface CheckoffWoReturn {
  itemIndex: number
  workOrderId: string
  workOrderNumber: string
}
