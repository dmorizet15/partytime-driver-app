// ─── Equipment Return Tracking — data layer ──────────────────────────────────
// DELIVERY side: writes stop_equipment_returns at completion — one row per
// stepper the driver actually TOUCHED, upserted ON CONFLICT (stop_id,
// equipment_key), client-side under RLS (crew of the stop's route, mig 028).
//
// PICKUP side (reservation-scoped ledger): completion POSTs
// /api/stops/equipment-returns — the server upserts the entries, then checks
// live whether this was the reservation's FINAL pickup and fires the
// discrepancy alert on any nonzero balance. The POST happens even with zero
// touched entries so the final-pickup check always runs. It must be
// server-side: sibling stops live on other routes (RLS) and the alert needs
// the once-per-reservation stamp.
//
// Completion must NEVER block on this paperwork (the checkoff doctrine):
// both paths are best-effort and failures ride a localStorage queue
// (ptd_equipreturn_queue, dedupe-by-stop last-write-wins, entries tagged by
// kind) flushed from loadDay alongside the checkoff/completion queues. A
// final-pickup POST whose alert email could not be sent comes back
// `retryAlert: true` and is deliberately KEPT in the queue — otherwise a
// transient Resend failure (or an unset RESEND_API_KEY) would silently lose
// the discrepancy alert.
//
// Draft persistence mirrors the checkoff sessionStorage draft: counts (and,
// pickup-side, which rows the crew confirmed) survive a back-out, but not a
// new session.

import { supabase } from '@/lib/supabase'

const QUEUE_KEY = 'ptd_equipreturn_queue'
const draftKey = (stopId: string) => `ptd_equipreturn_draft:${stopId}`

// One touched stepper → one row.
export interface EquipmentReturnEntry {
  equipment_key: string
  quantity: number
}

export interface EquipmentReturnDraft {
  stopId: string
  // Counts keyed by equipment_key. Delivery: ONLY touched keys are present.
  // Pickup: current stepper values (prefill-adjusted).
  counts: Record<string, number>
  // Pickup only — keys the crew explicitly confirmed (accept circle / stepper).
  accepted?: string[]
  savedAt: string
}

type EquipmentStopType = 'delivery' | 'pickup'

interface EquipmentReturnQueueEntry {
  stopId: string
  entries: EquipmentReturnEntry[]
  queuedAt: string
  // absent = 'delivery' (entries queued before the ledger update).
  kind?: EquipmentStopType
}

// ─── Draft persistence (sessionStorage) ──────────────────────────────────────

export function loadEquipmentReturnDraft(stopId: string): EquipmentReturnDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(stopId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as EquipmentReturnDraft
    return parsed && typeof parsed.counts === 'object' && parsed.counts !== null ? parsed : null
  } catch {
    return null
  }
}

export function saveEquipmentReturnDraft(
  stopId: string,
  counts: Record<string, number>,
  accepted?: string[],
): void {
  try {
    sessionStorage.setItem(
      draftKey(stopId),
      JSON.stringify({
        stopId, counts, accepted, savedAt: new Date().toISOString(),
      } satisfies EquipmentReturnDraft)
    )
  } catch {}
}

export function clearEquipmentReturnDraft(stopId: string): void {
  try { sessionStorage.removeItem(draftKey(stopId)) } catch {}
}

// ─── Writes ──────────────────────────────────────────────────────────────────

async function upsertRows(stopId: string, entries: EquipmentReturnEntry[], userId: string): Promise<void> {
  const rows = entries.map((e) => ({
    stop_id:       stopId,
    equipment_key: e.equipment_key,
    quantity:      Math.max(0, Math.floor(e.quantity)),
    created_by:    userId,
  }))
  const { error } = await supabase
    .from('stop_equipment_returns')
    .upsert(rows, { onConflict: 'stop_id,equipment_key' })
  if (error) throw error
}

type PickupPostOutcome = 'ok' | 'retry' | 'permanent'

async function postPickupReturns(stopId: string, entries: EquipmentReturnEntry[]): Promise<PickupPostOutcome> {
  try {
    const res = await fetch('/api/stops/equipment-returns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stop_id: stopId, entries }),
    })
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // Validation/auth/crew bug — an identical retry can never succeed.
      const j = await res.json().catch(() => null)
      console.error('[equipment-returns] pickup POST rejected permanently:', res.status, j)
      return 'permanent'
    }
    if (!res.ok) return 'retry'
    const j = await res.json().catch(() => null) as { saved?: boolean; retryAlert?: boolean } | null
    if (j?.retryAlert) {
      // Saved, final pickup, discrepancy found — but the alert email did not
      // go out. Keep the POST queued so the alert eventually fires.
      console.warn('[equipment-returns] final-pickup alert not sent — queued for retry', stopId)
      return 'retry'
    }
    return j?.saved ? 'ok' : 'retry'
  } catch (err) {
    console.warn('[equipment-returns] pickup POST network failure — queued', err)
    return 'retry'
  }
}

export async function commitEquipmentReturns(
  stopId: string,
  entries: EquipmentReturnEntry[],
  userId: string,
  stopType: EquipmentStopType = 'delivery',
): Promise<void> {
  if (stopType === 'delivery') {
    if (entries.length === 0) {
      clearEquipmentReturnDraft(stopId)
      return
    }
    try {
      await upsertRows(stopId, entries, userId)
    } catch (err) {
      console.warn('[equipment-returns] upsert failed — queued', err)
      enqueue({ stopId, entries, queuedAt: new Date().toISOString(), kind: 'delivery' })
    }
    clearEquipmentReturnDraft(stopId)
    return
  }

  // Pickup — POST even with zero entries: the server's final-pickup check
  // (and the discrepancy alert) must run regardless of what was touched.
  const outcome = await postPickupReturns(stopId, entries)
  if (outcome === 'retry') {
    enqueue({ stopId, entries, queuedAt: new Date().toISOString(), kind: 'pickup' })
  }
  clearEquipmentReturnDraft(stopId)
}

// ─── Offline queue (OTW dedupe-by-stop pattern, own key) ─────────────────────

function getQueue(): EquipmentReturnQueueEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}

function setQueue(q: EquipmentReturnQueueEntry[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}

function enqueue(entry: EquipmentReturnQueueEntry): void {
  const q = getQueue().filter((e) => e.stopId !== entry.stopId)
  q.push(entry)
  setQueue(q)
}

// Flush queued writes. Call on app-load / reconnect (loadDay — same trigger
// as the checkoff + completion queues). Delivery entries re-upsert with
// created_by stamped from the CURRENT session (RLS requires created_by =
// auth.uid(); on a shared device the flushing session may not be the
// capturing one — any crew member on the route is a valid author). Pickup
// entries replay the POST (cookie-authed; the server re-runs the
// final-pickup check, and the alert stamp keeps replays from double-mailing).
export async function flushEquipmentReturnQueue(): Promise<void> {
  const queue = getQueue()
  if (!queue.length) return

  let userId: string | undefined
  try {
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id
  } catch {}
  if (!userId) return // no session — retry on a later flush

  const remaining: EquipmentReturnQueueEntry[] = []
  for (const entry of queue) {
    if (entry.kind === 'pickup') {
      const outcome = await postPickupReturns(entry.stopId, entry.entries)
      if (outcome === 'retry') remaining.push(entry)
      // 'ok' and 'permanent' both leave the queue.
      continue
    }
    try {
      await upsertRows(entry.stopId, entry.entries, userId)
    } catch {
      remaining.push(entry)
    }
  }
  setQueue(remaining)
}
