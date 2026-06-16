// AVA Remembers — read + write client.
//
// Read side powers the morning-card "I have notes on N of your stops today"
// nudge + the Tier 3 pill on Stop Detail. Write side powers the AvaNoteSheet
// entry form (text + optional photos uploaded to the `ava-stop-notes` bucket).
//
// Offline behavior: if the INSERT fails with a network error, the note is
// queued in localStorage under `ava_pending_notes` and flushed on the next
// app load via flushPendingStopNotes() (called from AuthContext).

import { supabase } from '../supabase'
import {
  normalizeAddressKey,
  addressKeyFromParts,
} from './addressKey'

// Re-export so existing imports from this module keep working.
export { normalizeAddressKey, addressKeyFromParts }

// Backwards-compat alias for the original signature used by AvaMorningCard.
type StopAddressInput = {
  address_line_1: string
  address_line_2?: string | null
  city?:          string | null
  state?:         string | null
  postal_code?:   string | null
}
export function addressKey(stop: StopAddressInput): string {
  return addressKeyFromParts(stop)
}

export interface StopNoteRow {
  id:          string
  address_key: string
  raw_address: string | null
  note:        string
  author_id:   string | null
  photo_urls:  string[]
  created_at:  string
  // AVA Remembers Phase 2 (mig 026). Optional so older callers still typecheck.
  status?:                  'active' | 'archived'
  last_confirmed_at?:       string | null
  visit_count_since_added?: number
  created_by_role?:         'driver' | 'dispatcher'
  // Hydrated client-side from a paired profiles fetch; kept optional so the
  // raw DB shape stays usable too.
  author_name?: string | null
}

// ---------------------------------------------------------------------------
// Reads

/**
 * Returns the number of distinct address_keys among today's stops that have
 * at least one ava_stop_notes row. Single supabase query gated by RLS;
 * authenticated users can read all rows.
 */
export async function fetchTodayNotesHitCount(addressKeys: string[]): Promise<number> {
  if (addressKeys.length === 0) return 0
  const { data, error } = await supabase
    .from('ava_stop_notes')
    .select('address_key')
    .in('address_key', addressKeys)
    .eq('status', 'active')
  if (error) {
    console.warn('[stopNotesClient] fetch failed:', error.message)
    return 0
  }
  const distinct = new Set((data ?? []).map((r) => r.address_key))
  return distinct.size
}

/**
 * For each address key, returns the most recent note (or null). Used by the
 * morning-card review sheet to show a one-line preview per stop without
 * loading the full history.
 */
export async function fetchLatestNotesByAddress(
  addressKeys: string[],
): Promise<Map<string, StopNoteRow>> {
  const out = new Map<string, StopNoteRow>()
  if (addressKeys.length === 0) return out
  const { data, error } = await supabase
    .from('ava_stop_notes')
    .select('*')
    .in('address_key', addressKeys)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error || !data) {
    if (error) console.warn('[stopNotesClient] fetchLatestNotesByAddress failed:', error.message)
    return out
  }
  for (const row of data as unknown as StopNoteRow[]) {
    if (!out.has(row.address_key)) out.set(row.address_key, row)
  }
  await hydrateAuthors(Array.from(out.values()))
  return out
}

/** Full ordered history for a single address — newest first. */
export async function listNotesForAddress(address_key: string): Promise<StopNoteRow[]> {
  if (!address_key) return []
  const { data, error } = await supabase
    .from('ava_stop_notes')
    .select('*')
    .eq('address_key', address_key)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error || !data) {
    if (error) console.warn('[stopNotesClient] listNotesForAddress failed:', error.message)
    return []
  }
  const rows = data as unknown as StopNoteRow[]
  await hydrateAuthors(rows)
  return rows
}

/**
 * The newest ACTIVE note for an address (or null). Drives the post-completion
 * freshness prompt — we only need the most recent note's age + freshness state.
 */
export async function getMostRecentActiveNote(address_key: string): Promise<StopNoteRow | null> {
  if (!address_key) return null
  const { data, error } = await supabase
    .from('ava_stop_notes')
    .select('*')
    .eq('address_key', address_key)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  return data[0] as unknown as StopNoteRow
}

async function hydrateAuthors(rows: StopNoteRow[]): Promise<void> {
  const ids = Array.from(new Set(rows.map((r) => r.author_id).filter((v): v is string => !!v)))
  if (ids.length === 0) return
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids)
  if (error || !data) return
  const nameById = new Map<string, string>()
  for (const p of data as unknown as Array<{ id: string; display_name: string | null }>) {
    if (p.display_name) nameById.set(p.id, p.display_name)
  }
  for (const row of rows) {
    if (row.author_id) row.author_name = nameById.get(row.author_id) ?? null
  }
}

// ---------------------------------------------------------------------------
// Writes

export interface SaveStopNoteInput {
  stop_id:     string
  address_key: string
  raw_address: string | null
  note:        string
  author_id:   string
  photo_urls:  string[]
}

export interface SaveStopNoteResult {
  ok:       boolean
  row?:     StopNoteRow
  queued?:  boolean   // true when the insert failed network-side and we queued for retry
  error?:   string
}

export async function saveStopNote(input: SaveStopNoteInput): Promise<SaveStopNoteResult> {
  const trimmed = input.note.trim()
  if (!trimmed) return { ok: false, error: 'Note text is empty.' }

  const payload = {
    address_key: input.address_key,
    raw_address: input.raw_address,
    note:        trimmed,
    author_id:   input.author_id,
    photo_urls:  input.photo_urls,
  }

  try {
    const { data, error } = await supabase
      .from('ava_stop_notes')
      .insert(payload)
      .select('*')
      .single()
    if (error || !data) {
      // Treat any error as a candidate for the offline queue — the most
      // common case is a transient network failure. If it's actually a
      // permission/constraint issue, the queued row will fail again on the
      // next flush and the user can retry from a fresh entry. We don't
      // bubble RLS errors to the UI this session (no inline retry surface).
      enqueuePendingNote(payload)
      return { ok: false, queued: true, error: error?.message }
    }
    return { ok: true, row: data as unknown as StopNoteRow }
  } catch (err) {
    enqueuePendingNote(payload)
    return {
      ok: false,
      queued: true,
      error: err instanceof Error ? err.message : 'Network error',
    }
  }
}

// ---------------------------------------------------------------------------
// Freshness confirm (AVA Remembers Phase 2)

/**
 * "Yes, still good" — stamps last_confirmed_at = now and bumps the visit
 * counter. Allowed for ANY authenticated driver (not just the author) via the
 * ava_stop_notes_confirm_freshness policy; the DB trigger guarantees a foreign
 * driver can change only these two columns. Best-effort — a failure is logged,
 * never surfaced (the prompt is a nicety, never a gate).
 */
export async function confirmNoteFreshness(
  noteId: string, currentVisitCount: number,
): Promise<boolean> {
  if (!noteId) return false
  try {
    const { error } = await supabase
      .from('ava_stop_notes')
      .update({
        last_confirmed_at:       new Date().toISOString(),
        visit_count_since_added: (currentVisitCount ?? 0) + 1,
      })
      .eq('id', noteId)
    if (error) {
      console.warn('[stopNotesClient] confirmNoteFreshness failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.warn('[stopNotesClient] confirmNoteFreshness threw:', err)
    return false
  }
}

/**
 * "Clear site notes" — archives every active note for the address via the
 * server route (service-role; archiving other drivers' notes is elevated).
 * Returns the number archived, or null on failure.
 */
export async function archiveAddressNotes(address_key: string): Promise<number | null> {
  if (!address_key) return null
  try {
    const res = await fetch('/api/ava/stop-notes/archive-address', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ address_key }),
    })
    if (!res.ok) {
      console.warn('[stopNotesClient] archiveAddressNotes HTTP', res.status)
      return null
    }
    const j = await res.json().catch(() => null) as { archived?: number } | null
    return j?.archived ?? 0
  } catch (err) {
    console.warn('[stopNotesClient] archiveAddressNotes threw:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// Visit notes (AVA Remembers Phase 2) — "just for this visit", non-durable

export type VisitNoteCategory =
  'customer_behavior' | 'tip' | 'access' | 'equipment' | 'general'

export interface SaveVisitNoteInput {
  stop_id:       string | null
  order_ref:     string | null
  address_key:   string
  note_text:     string
  note_category: VisitNoteCategory
  created_by:    string
}

/**
 * Inserts a single-visit note into stop_visit_notes (own-row RLS). No offline
 * queue — a visit note is ephemeral by nature; a failed save returns ok:false
 * and the caller surfaces a retry. Mirrors saveStopNote's result shape.
 */
export async function saveVisitNote(
  input: SaveVisitNoteInput,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = input.note_text.trim()
  if (!trimmed) return { ok: false, error: 'Note text is empty.' }
  try {
    const { error } = await supabase.from('stop_visit_notes').insert({
      stop_id:       input.stop_id,
      order_ref:     input.order_ref,
      address_key:   input.address_key,
      note_text:     trimmed,
      note_category: input.note_category,
      created_by:    input.created_by,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}

// ---------------------------------------------------------------------------
// Photo uploads

const NOTE_BUCKET = 'ava-stop-notes'

/**
 * Uploads a single image to the ava-stop-notes bucket under
 * `${stop_id}/${randomUUID}.${ext}`. Returns the public URL on success.
 * Caller is responsible for surfacing failure as a non-blocking toast — note
 * save itself remains possible without photos.
 */
export async function uploadStopNotePhoto(
  stop_id: string, file: File,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!stop_id) return { ok: false, error: 'Missing stop_id for upload path.' }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const id  = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${stop_id}/${id}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(NOTE_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })
  if (upErr) return { ok: false, error: upErr.message }

  const { data } = supabase.storage.from(NOTE_BUCKET).getPublicUrl(path)
  return { ok: true, url: data.publicUrl }
}

// ---------------------------------------------------------------------------
// Offline queue

const QUEUE_KEY = 'ava_pending_notes'

type QueuedNote = Omit<SaveStopNoteInput, 'stop_id'> & { stop_id?: string }

function readQueue(): QueuedNote[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedNote[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedNote[]): void {
  if (typeof window === 'undefined') return
  try {
    if (queue.length === 0) window.localStorage.removeItem(QUEUE_KEY)
    else                    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // localStorage quota or disabled — silently drop. The note text is still
    // visible in the UI (the sheet doesn't auto-close on queue), so the
    // driver can retry manually.
  }
}

function enqueuePendingNote(note: QueuedNote): void {
  const queue = readQueue()
  queue.push(note)
  writeQueue(queue)
}

/**
 * Best-effort flush of the offline queue. Called from AuthContext on
 * INITIAL_SESSION. Failures stay in the queue for the next pass.
 */
export async function flushPendingStopNotes(): Promise<void> {
  const queue = readQueue()
  if (queue.length === 0) return
  const remaining: QueuedNote[] = []
  for (const note of queue) {
    try {
      const { error } = await supabase.from('ava_stop_notes').insert({
        address_key: note.address_key,
        raw_address: note.raw_address,
        note:        note.note,
        author_id:   note.author_id,
        photo_urls:  note.photo_urls,
      })
      if (error) remaining.push(note)
    } catch {
      remaining.push(note)
    }
  }
  writeQueue(remaining)
}
