import { supabase } from '@/lib/supabase'
import type { StopStatus } from '@/types'

const LS_KEY   = (id: string) => `ptd_stop_${id}`
const QUEUE_KEY = 'ptd_otw_queue'

interface OfflineWrite {
  stopId:    string
  userId:    string
  timestamp: string
}

export interface OtwRecord {
  current_status:     StopStatus
  on_the_way_sent:    boolean
  on_the_way_sent_at: string
}

class StopStateService {
  // Write OTW state: localStorage first (immediate UI), then Supabase.
  // On Supabase failure the write is queued for syncOnReconnect().
  async writeOtw(stopId: string, userId: string, timestamp: string): Promise<void> {
    this.mergeLocal(stopId, {
      current_status:     'on_the_way_sent',
      on_the_way_sent:    true,
      on_the_way_sent_at: timestamp,
    })

    try {
      const { error } = await supabase
        .from('stops')
        .update({ otw_status: true, otw_timestamp: timestamp, otw_set_by: userId })
        .eq('stop_id', stopId)
      if (error) throw error
      this.dequeue(stopId)
    } catch {
      this.enqueue({ stopId, userId, timestamp })
    }
  }

  // Fetch OTW records for a batch of stops from Supabase.
  // Returns an empty map on failure — caller falls back to localStorage.
  async readOtwStatus(stopIds: string[]): Promise<Map<string, OtwRecord>> {
    const map = new Map<string, OtwRecord>()
    if (!stopIds.length) return map

    try {
      const { data, error } = await supabase
        .from('stops')
        .select('stop_id, otw_timestamp')
        .in('stop_id', stopIds)
        .eq('otw_status', true)
      if (error) throw error

      for (const row of data ?? []) {
        map.set(row.stop_id, {
          current_status:     'on_the_way_sent',
          on_the_way_sent:    true,
          on_the_way_sent_at: row.otw_timestamp ?? '',
        })
      }
    } catch {
      // Offline or unauthenticated — caller falls back to localStorage
    }

    return map
  }

  // Flush queued offline OTW writes to Supabase.
  // Call this whenever connectivity is restored (e.g. on successful loadDay).
  async syncOnReconnect(userId: string): Promise<void> {
    const queue = this.getQueue()
    if (!queue.length) return

    const remaining: OfflineWrite[] = []
    for (const item of queue) {
      try {
        const { error } = await supabase
          .from('stops')
          .update({ otw_status: true, otw_timestamp: item.timestamp, otw_set_by: userId })
          .eq('stop_id', item.stopId)
        if (error) throw error
      } catch {
        remaining.push(item)
      }
    }
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining)) } catch {}
  }

  private mergeLocal(stopId: string, patch: object): void {
    try {
      const prev = JSON.parse(localStorage.getItem(LS_KEY(stopId)) ?? '{}')
      localStorage.setItem(LS_KEY(stopId), JSON.stringify({ ...prev, ...patch }))
    } catch {}
  }

  private enqueue(write: OfflineWrite): void {
    const q = this.getQueue().filter((w) => w.stopId !== write.stopId)
    q.push(write)
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
  }

  private dequeue(stopId: string): void {
    const q = this.getQueue().filter((w) => w.stopId !== stopId)
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch {}
  }

  private getQueue(): OfflineWrite[] {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
  }
}

export const stopStateService = new StopStateService()
