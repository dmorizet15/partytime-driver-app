// ─── Generator Stop Actions — data layer ─────────────────────────────────────
// DELIVERY (action_type='delivery_out'): driver writes directly — same route,
// same crew, no side effects beyond the row itself. Mirrors
// equipmentReturns/service.ts's direct client-side upsert under RLS.
//
// PICKUP (action_type='pickup_in'): cross-app POST to the dashboard
// (mirrors willCall/api.ts + checkoff/service.ts's write-back auth
// convention). The dashboard owns this because pickup completion needs (a)
// the paired delivery_out row across a DIFFERENT route (RLS can't see it
// client-side), (b) a write to non_truck_assets.current_hours — gated by
// has_fleet_maintenance_access(), which drivers never hold — and (c) the
// billing-summary email, which the locked spec assigns to the dashboard.
//
// Both paths upload the capture photo to Supabase Storage FIRST (deterministic
// path keyed by stop+asset+action — NOT a random uuid — so a retry after a
// failed row write re-uploads to the SAME path with upsert:true rather than
// leaving an orphaned file behind).
//
// Offline: capture is optimistic exactly like stop completion (markComplete
// doctrine) — the driver's local "resolved" state flips the moment they
// finish the photo+meter+fuel flow or the skip flow, regardless of whether
// the network write has landed yet. A failed live submit queues the whole
// record (including the photo Blob) in IndexedDB (offlineQueue.ts) and is
// flushed from the same loadDay hook as every other queue.

import { supabase } from '@/lib/supabase'
import {
  enqueueGeneratorAction,
  listQueuedGeneratorActions,
  removeQueuedGeneratorAction,
  queueKey,
  type QueuedGeneratorAction,
  type GeneratorActionType,
  type FuelLevel,
  type SkipReason,
} from './offlineQueue'

const BUCKET = 'generator-action-photos'

export interface GeneratorActionEntry {
  stopId: string
  assetId: string
  actionType: GeneratorActionType
  itemName: string
  unitLabel: string
  photoBlob?: Blob
  photoExt?: string
  hourMeter?: number
  fuelLevel?: FuelLevel
  skipReason?: SkipReason
  skipNote?: string
  reservationId?: string | null
}

export type SubmitOutcome = 'ok' | 'queued' | 'permanent_error'

function dashboardOrigin(): string | null {
  const v = process.env.NEXT_PUBLIC_DASHBOARD_URL
  return v ? v.replace(/\/$/, '') : null
}

async function bearer(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}

function photoPath(stopId: string, actionType: GeneratorActionType, assetId: string, ext: string): string {
  return `${stopId}/${actionType}-${assetId}.${ext}`
}

async function uploadPhoto(entry: GeneratorActionEntry): Promise<string | null> {
  if (!entry.photoBlob) return null
  const ext = (entry.photoExt ?? 'jpg').toLowerCase()
  const path = photoPath(entry.stopId, entry.actionType, entry.assetId, ext)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, entry.photoBlob, {
      contentType: entry.photoBlob.type || 'image/jpeg',
      upsert: true,
    })
  if (error) throw error
  return path
}

async function submitDeliveryOut(entry: GeneratorActionEntry): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id
  if (!userId) throw new Error('Not signed in.')

  const photo_path = await uploadPhoto(entry)

  const { error } = await supabase
    .from('stop_generator_actions')
    .upsert(
      {
        stop_id:      entry.stopId,
        asset_id:     entry.assetId,
        item_name:    entry.itemName,
        action_type:  'delivery_out',
        hour_meter:   entry.hourMeter ?? null,
        fuel_level:   entry.fuelLevel ?? null,
        photo_path,
        skip_reason:  entry.skipReason ?? null,
        skip_note:    entry.skipNote ?? null,
        recorded_by:  userId,
      },
      { onConflict: 'stop_id,asset_id,action_type' },
    )
  if (error) throw error
}

type PickupPostOutcome = 'ok' | 'retry' | 'permanent'

async function submitPickupIn(entry: GeneratorActionEntry): Promise<PickupPostOutcome> {
  const origin = dashboardOrigin()
  if (!origin) {
    console.error('[generator-actions] NEXT_PUBLIC_DASHBOARD_URL not configured — pickup POST queued')
    return 'retry'
  }
  const token = await bearer()
  if (!token) return 'retry'   // no session right now (mid-refresh) — retry later

  let photo_path: string | null
  try {
    photo_path = await uploadPhoto(entry)
  } catch (err) {
    console.warn('[generator-actions] photo upload failed — queued for retry', err)
    return 'retry'
  }

  try {
    const res = await fetch(`${origin}/api/generator-actions/pickup-complete`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({
        stop_id:       entry.stopId,
        asset_id:      entry.assetId,
        item_name:     entry.itemName,
        unit_label:    entry.unitLabel,
        hour_meter:    entry.hourMeter ?? null,
        fuel_level:    entry.fuelLevel ?? null,
        photo_path,
        skip_reason:   entry.skipReason ?? null,
        skip_note:     entry.skipNote ?? null,
        reservation_id: entry.reservationId ?? null,
      }),
    })
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const j = await res.json().catch(() => null)
      console.error('[generator-actions] pickup POST rejected permanently:', res.status, j)
      return 'permanent'
    }
    if (!res.ok) return 'retry'
    const j = await res.json().catch(() => null) as { saved?: boolean; retryAlert?: boolean } | null
    if (j?.retryAlert) {
      console.warn('[generator-actions] usage email not sent — queued for retry', entry.stopId)
      return 'retry'
    }
    return j?.saved ? 'ok' : 'retry'
  } catch (err) {
    console.warn('[generator-actions] pickup POST network failure — queued', err)
    return 'retry'
  }
}

// Top-level entry point called by the UI the moment a capture or skip is
// confirmed. Never throws — always resolves to an outcome so the driver can
// advance regardless of network state.
export async function commitGeneratorAction(entry: GeneratorActionEntry): Promise<SubmitOutcome> {
  if (entry.actionType === 'delivery_out') {
    try {
      await submitDeliveryOut(entry)
      return 'ok'
    } catch (err) {
      console.warn('[generator-actions] delivery submit failed — queued', err)
      await enqueueRecord(entry)
      return 'queued'
    }
  }

  const outcome = await submitPickupIn(entry)
  if (outcome === 'ok') return 'ok'
  if (outcome === 'permanent') return 'permanent_error'
  await enqueueRecord(entry)
  return 'queued'
}

async function enqueueRecord(entry: GeneratorActionEntry): Promise<void> {
  const record: QueuedGeneratorAction = {
    id: queueKey(entry.stopId, entry.assetId, entry.actionType),
    stopId: entry.stopId,
    assetId: entry.assetId,
    actionType: entry.actionType,
    itemName: entry.itemName,
    unitLabel: entry.unitLabel,
    photoBlob: entry.photoBlob,
    photoExt: entry.photoExt,
    hourMeter: entry.hourMeter,
    fuelLevel: entry.fuelLevel,
    skipReason: entry.skipReason,
    skipNote: entry.skipNote,
    reservationId: entry.reservationId,
    queuedAt: new Date().toISOString(),
  }
  await enqueueGeneratorAction(record)
}

// Flush queued captures. Call on app-load / reconnect (loadDay — same trigger
// as every other queue in this app).
export async function flushGeneratorActionQueue(): Promise<void> {
  const queue = await listQueuedGeneratorActions()
  if (!queue.length) return

  for (const record of queue) {
    const entry: GeneratorActionEntry = {
      stopId: record.stopId,
      assetId: record.assetId,
      actionType: record.actionType,
      itemName: record.itemName,
      unitLabel: record.unitLabel,
      photoBlob: record.photoBlob,
      photoExt: record.photoExt,
      hourMeter: record.hourMeter,
      fuelLevel: record.fuelLevel,
      skipReason: record.skipReason,
      skipNote: record.skipNote,
      reservationId: record.reservationId,
    }
    const outcome = await commitGeneratorAction(entry)
    // commitGeneratorAction re-queues on failure itself (enqueueGeneratorAction
    // is a put(), so re-queuing the same id is idempotent) — only remove the
    // original record on a clean success or a permanent rejection (retrying a
    // permanent error forever is pointless).
    if (outcome === 'ok' || outcome === 'permanent_error') {
      await removeQueuedGeneratorAction(record.id)
    }
  }
}
