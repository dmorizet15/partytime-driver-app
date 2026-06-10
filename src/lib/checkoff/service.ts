// ─── TapGoods Item Check-Off — data layer ────────────────────────────────────
// Three responsibilities, one module:
//
//   1. AUDIT INSERT — stop_item_checkoffs rows via the supabase client under
//      RLS (crew insert own-route, confirmed_by = auth.uid(); append-only —
//      re-confirmation is a NEW row, latest confirmed_at wins for readers).
//   2. TAPGOODS WRITE-BACK — POST {dashboard}/api/tapgoods/dispatch/write-back
//      with the supabase bearer token (the /api/work-orders pattern). The
//      route never-500s: sync failures come back 200 {synced:false, reason}.
//      401/403 are auth/ownership BUGS — never retried, never queued.
//   3. OFFLINE QUEUE — OTW dedupe-by-stop pattern (StopStateService), own
//      localStorage key. Enqueued on network failure AND on 200
//      {synced:false} (TapGoods down, network up — the Will Call pattern
//      drops those and silently loses writes). Flushed from loadDay
//      (app-load / reconnect), same trigger as the OTW queue.
//
// The completion gate is satisfied by the driver's LOCAL confirmation —
// a TapGoods outage must never trap a driver at a stop. Worst case the
// write-back lags in the queue until the next app-load.

import { supabase } from '@/lib/supabase'
import type { Stop } from '@/types'
import type {
  CheckoffDraft,
  CheckoffInsertRow,
  CheckoffItem,
  CheckoffLineDraft,
  CheckoffQueueEntry,
  CheckoffStopType,
  CheckoffWoReturn,
  WriteBackLine,
} from './types'

const QUEUE_KEY = 'ptd_checkoff_queue'
const draftKey     = (stopId: string) => `ptd_checkoff_draft:${stopId}`
const committedKey = (stopId: string) => `ptd_checkoff_done:${stopId}`
const woReturnKey  = (stopId: string) => `ptd_checkoff_wo:${stopId}`

// ─── Draft persistence (sessionStorage) ──────────────────────────────────────
// The draft survives the round-trip into the Report-an-issue form (damage →
// work order) and an accidental back-out, but not a new browser session.

export function loadCheckoffDraft(stopId: string): CheckoffDraft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(stopId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CheckoffDraft
    return Array.isArray(parsed?.lines) ? parsed : null
  } catch {
    return null
  }
}

export function saveCheckoffDraft(stopId: string, lines: CheckoffLineDraft[]): void {
  try {
    sessionStorage.setItem(
      draftKey(stopId),
      JSON.stringify({ stopId, lines, savedAt: new Date().toISOString() } satisfies CheckoffDraft)
    )
  } catch {}
}

export function clearCheckoffDraft(stopId: string): void {
  try { sessionStorage.removeItem(draftKey(stopId)) } catch {}
}

// ─── Damage → work-order return stash ────────────────────────────────────────
// ReportIssueScreen writes this when a WO was created from the check-off
// damage flow; the sheet consumes it on remount to attach the WO to its line.

export function stashCheckoffWoReturn(stopId: string, payload: CheckoffWoReturn): void {
  try { sessionStorage.setItem(woReturnKey(stopId), JSON.stringify(payload)) } catch {}
}

export function consumeCheckoffWoReturn(stopId: string): CheckoffWoReturn | null {
  try {
    const raw = sessionStorage.getItem(woReturnKey(stopId))
    if (!raw) return null
    sessionStorage.removeItem(woReturnKey(stopId))
    const parsed = JSON.parse(raw) as CheckoffWoReturn
    return typeof parsed?.itemIndex === 'number' && typeof parsed?.workOrderId === 'string'
      ? parsed
      : null
  } catch {
    return null
  }
}

export function hasCheckoffWoReturn(stopId: string): boolean {
  try { return sessionStorage.getItem(woReturnKey(stopId)) !== null } catch { return false }
}

// ─── Committed state ─────────────────────────────────────────────────────────
// localStorage flag = instant local truth (set the moment the driver commits,
// even offline). The DB probe covers device loss / a second device: any
// existing audit row for the stop means a crew member already confirmed.

export function isCheckoffCommittedLocal(stopId: string): boolean {
  try { return localStorage.getItem(committedKey(stopId)) === '1' } catch { return false }
}

function markCheckoffCommittedLocal(stopId: string): void {
  try { localStorage.setItem(committedKey(stopId), '1') } catch {}
}

export async function hasCheckoffRows(stopId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('stop_item_checkoffs')
      .select('id')
      .eq('stop_id', stopId)
      .limit(1)
    if (error) throw error
    return (data ?? []).length > 0
  } catch {
    // Offline / RLS miss — fall back to the local flag alone.
    return false
  }
}

// ─── Commit ──────────────────────────────────────────────────────────────────

export interface CheckoffCommitSummary {
  shortUnits: number
  shortLines: number
  damagedCount: number
  workOrderCount: number
  syncedLineCount: number   // lines with a numeric pick-list id (TapGoods-addressable)
  auditQueued: boolean      // audit insert deferred to the offline queue
}

function buildInsertRows(
  stop: Stop,
  stopType: CheckoffStopType,
  items: CheckoffItem[],
  lines: CheckoffLineDraft[],
  userId: string,
  confirmedAt: string,
): CheckoffInsertRow[] {
  return lines.map((l) => {
    const item = items[l.index]
    return {
      stop_id:                    stop.stop_id,
      tapgoods_pick_list_item_id: typeof item?.tapgoods_pick_list_item_id === 'number'
        ? item.tapgoods_pick_list_item_id
        : null,
      item_name:     item?.name?.trim() || 'Unnamed item',
      ordered_qty:   typeof item?.qty === 'number' && item.qty >= 0 ? Math.floor(item.qty) : 0,
      confirmed_qty: Math.max(0, Math.floor(l.confirmedQty)),
      damaged:       l.damaged,
      confirmed_by:  userId,
      confirmed_at:  confirmedAt,
      stop_type:     stopType,
      work_order_id: l.workOrderId,
    }
  })
}

function buildWriteBackLines(items: CheckoffItem[], lines: CheckoffLineDraft[]): WriteBackLine[] {
  return lines.map((l) => {
    const item = items[l.index]
    return {
      tapgoods_pick_list_item_id: typeof item?.tapgoods_pick_list_item_id === 'number'
        ? item.tapgoods_pick_list_item_id
        : null,
      qty: Math.max(0, Math.floor(l.confirmedQty)),
    }
  })
}

// Commit the check-off: insert the audit rows, stamp the local committed
// flag, then fire the TapGoods write-back (best-effort, queue-backed).
// NEVER throws — the gate is local; failures degrade to the queue.
export async function commitCheckoff(
  stop: Stop,
  lines: CheckoffLineDraft[],
  userId: string,
): Promise<CheckoffCommitSummary> {
  const stopType: CheckoffStopType = stop.stop_type === 'pickup' ? 'pickup' : 'delivery'
  const items = stop.items ?? []
  const confirmedAt = new Date().toISOString()

  const rows  = buildInsertRows(stop, stopType, items, lines, userId, confirmedAt)
  const wires = buildWriteBackLines(items, lines)

  let shortUnits = 0
  let shortLines = 0
  for (const r of rows) {
    if (r.confirmed_qty < r.ordered_qty) {
      shortLines += 1
      shortUnits += r.ordered_qty - r.confirmed_qty
    }
  }
  const damagedCount    = rows.filter((r) => r.damaged).length
  const workOrderCount  = rows.filter((r) => r.work_order_id).length
  const syncedLineCount = wires.filter((w) => w.tapgoods_pick_list_item_id != null).length

  // 1) Audit insert. On failure (offline / transient) the rows ride the queue
  //    — the driver is never trapped behind their own paperwork.
  let auditQueued = false
  try {
    const { error } = await supabase.from('stop_item_checkoffs').insert(rows)
    if (error) throw error
  } catch (err) {
    console.warn('[checkoff] audit insert failed — queued', err)
    auditQueued = true
  }

  // 2) Local commit is the gate — stamp before any network outcome.
  markCheckoffCommittedLocal(stop.stop_id)
  clearCheckoffDraft(stop.stop_id)

  // 3) TapGoods write-back. Skip the POST when no line is addressable
  //    (server would answer no_tapgoods_ids — permanent, nothing to retry).
  if (auditQueued) {
    enqueue({ stopId: stop.stop_id, rows, lines: wires, queuedAt: confirmedAt })
  } else if (syncedLineCount > 0) {
    const outcome = await postWriteBack(stop.stop_id, wires)
    if (outcome === 'retry') {
      enqueue({ stopId: stop.stop_id, rows: null, lines: wires, queuedAt: confirmedAt })
    }
  }

  return { shortUnits, shortLines, damagedCount, workOrderCount, syncedLineCount, auditQueued }
}

// ─── TapGoods write-back POST ────────────────────────────────────────────────

type WriteBackOutcome = 'synced' | 'retry' | 'permanent' | 'auth_error'

// synced:false reasons where an identical retry can never succeed — dropping
// them keeps the queue from grinding on dead entries forever. no_rental_id is
// deliberately RETRYABLE (a later sync cycle can backfill reservations.tapgoods_id).
const PERMANENT_REASONS = new Set([
  'bad_request',
  'stop_not_found',
  'unsupported_stop_type',
  'no_tapgoods_ids',
])

function dashboardOrigin(): string | null {
  const v = process.env.NEXT_PUBLIC_DASHBOARD_URL
  return v ? v.replace(/\/$/, '') : null
}

async function postWriteBack(stopId: string, lines: WriteBackLine[]): Promise<WriteBackOutcome> {
  const origin = dashboardOrigin()
  if (!origin) {
    console.error('[checkoff] NEXT_PUBLIC_DASHBOARD_URL not configured — write-back queued')
    return 'retry'
  }

  let token: string | undefined
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token
  } catch {}
  if (!token) {
    // No session right now (mid-refresh) — retry later under a live session.
    return 'retry'
  }

  try {
    const res = await fetch(`${origin}/api/tapgoods/dispatch/write-back`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({ stop_id: stopId, lines }),
    })

    if (res.status === 401 || res.status === 403) {
      // Auth/ownership bug — NEVER retried (per contract). Surface loudly.
      const j = await res.json().catch(() => null)
      console.error('[checkoff] write-back auth/ownership rejection', res.status, j)
      return 'auth_error'
    }
    if (!res.ok) {
      console.warn('[checkoff] write-back unexpected status', res.status)
      return 'retry'
    }

    const j = await res.json().catch(() => null) as
      | { synced?: boolean; reason?: string; tapgoods_errors?: string[] }
      | null
    if (j?.synced === true) return 'synced'

    if (j?.reason && PERMANENT_REASONS.has(j.reason)) {
      console.warn('[checkoff] write-back permanent miss', stopId, j.reason)
      return 'permanent'
    }
    // network_error / tapgoods_errors / no_rental_id / unknown → retry later.
    console.warn('[checkoff] write-back not synced — queued', stopId, j?.reason ?? j?.tapgoods_errors)
    return 'retry'
  } catch (err) {
    console.warn('[checkoff] write-back network failure — queued', err)
    return 'retry'
  }
}

// ─── Offline queue (OTW dedupe-by-stop pattern, own key) ─────────────────────

function getQueue(): CheckoffQueueEntry[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}

function setQueue(q: CheckoffQueueEntry[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
}

function enqueue(entry: CheckoffQueueEntry): void {
  // One entry per stop, last-write-wins — a stale queued write must never
  // flush after (and clobber) a newer correction.
  const q = getQueue().filter((e) => e.stopId !== entry.stopId)
  q.push(entry)
  setQueue(q)
}

// Flush queued audit inserts + write-backs. Call on app-load / reconnect
// (loadDay — the same trigger as stopStateService.syncOnReconnect).
export async function flushCheckoffQueue(): Promise<void> {
  const queue = getQueue()
  if (!queue.length) return

  const remaining: CheckoffQueueEntry[] = []
  for (const entry of queue) {
    let rows = entry.rows

    // Pending audit insert first — append-only, so a replay after a partial
    // failure inserts a fresh row set (latest confirmed_at wins for readers).
    if (rows) {
      try {
        const { error } = await supabase.from('stop_item_checkoffs').insert(rows)
        if (error) throw error
        rows = null
      } catch {
        remaining.push({ ...entry, rows })
        continue
      }
    }

    const hasSyncableLine = entry.lines.some((l) => l.tapgoods_pick_list_item_id != null)
    if (!hasSyncableLine) continue // audit landed; nothing TapGoods-addressable

    const outcome = await postWriteBack(entry.stopId, entry.lines)
    if (outcome === 'retry') {
      remaining.push({ ...entry, rows: null })
    }
    // synced / permanent / auth_error all leave the queue (auth_error is a
    // bug to fix in code, not a state a retry can clear).
  }
  setQueue(remaining)
}
