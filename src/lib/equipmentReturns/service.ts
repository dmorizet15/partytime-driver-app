// ─── Equipment Return Tracking — data layer ──────────────────────────────────
// Writes stop_equipment_returns at delivery completion: one row per stepper
// the driver actually TOUCHED (untouched/inapplicable rules produce no row),
// upserted ON CONFLICT (stop_id, equipment_key) so a re-capture corrects the
// count instead of duplicating. Client-side under RLS (crew insert/update on
// the stop's own route — the stop_item_checkoffs pattern, mig 028).
//
// Completion must NEVER block on this paperwork (the checkoff doctrine): the
// commit is best-effort and a failure rides a localStorage queue
// (ptd_equipreturn_queue, dedupe-by-stop last-write-wins) flushed from
// loadDay alongside the checkoff/completion queues.
//
// Draft persistence mirrors the checkoff sessionStorage draft: counts survive
// a back-out or the app backgrounding mid-stop, but not a new session.

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
  // Counts keyed by equipment_key — ONLY keys the driver touched are present.
  counts: Record<string, number>
  savedAt: string
}

interface EquipmentReturnQueueEntry {
  stopId: string
  entries: EquipmentReturnEntry[]
  queuedAt: string
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

export function saveEquipmentReturnDraft(stopId: string, counts: Record<string, number>): void {
  try {
    sessionStorage.setItem(
      draftKey(stopId),
      JSON.stringify({ stopId, counts, savedAt: new Date().toISOString() } satisfies EquipmentReturnDraft)
    )
  } catch {}
}

export function clearEquipmentReturnDraft(stopId: string): void {
  try { sessionStorage.removeItem(draftKey(stopId)) } catch {}
}

// ─── Commit (upsert, best-effort, queue-backed — never throws) ───────────────

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

export async function commitEquipmentReturns(
  stopId: string,
  entries: EquipmentReturnEntry[],
  userId: string,
): Promise<void> {
  if (entries.length === 0) {
    clearEquipmentReturnDraft(stopId)
    return
  }
  try {
    await upsertRows(stopId, entries, userId)
  } catch (err) {
    console.warn('[equipment-returns] upsert failed — queued', err)
    enqueue({ stopId, entries, queuedAt: new Date().toISOString() })
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

// Flush queued upserts. Call on app-load / reconnect (loadDay — same trigger
// as the checkoff + completion queues). created_by is stamped with the
// CURRENT session's uid at flush time: the RLS insert policy requires
// created_by = auth.uid(), and on a shared device the flushing session may
// not be the capturing one — any crew member on the route is a valid author.
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
    try {
      await upsertRows(entry.stopId, entry.entries, userId)
    } catch {
      remaining.push(entry)
    }
  }
  setQueue(remaining)
}
