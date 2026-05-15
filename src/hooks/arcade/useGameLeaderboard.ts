'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ArcadeGameType } from './useGameScore'

export type LeaderboardEntry = {
  id:          string
  player_id:   string
  score:       number
  achieved_at: string
  display:     string  // first token of profiles.display_name, falls back to 'Driver'
}

export type LeaderboardView = 'today' | 'all_time'

type RawRow = {
  id:          string
  player_id:   string
  score:       number
  achieved_at: string
  profiles:    { display_name: string | null } | { display_name: string | null }[] | null
}

function pickFirstName(displayName: string | null | undefined): string {
  if (!displayName) return 'Driver'
  const trimmed = displayName.trim()
  if (!trimmed) return 'Driver'
  const first = trimmed.split(/\s+/)[0]
  return first || 'Driver'
}

function flattenProfile(p: RawRow['profiles']): { display_name: string | null } | null {
  if (!p) return null
  if (Array.isArray(p)) return p[0] ?? null
  return p
}

async function fetchView(gameType: ArcadeGameType, view: LeaderboardView): Promise<LeaderboardEntry[]> {
  let q = supabase
    .from('game_scores')
    .select('id, player_id, score, achieved_at, profiles(display_name)')
    .eq('game_type', gameType)
    .order('score', { ascending: false })
    .order('achieved_at', { ascending: true })
    .limit(10)

  if (view === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    q = q.gte('achieved_at', start.toISOString())
  }

  const { data, error } = await q
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[useGameLeaderboard] fetch failed', error)
    return []
  }
  return (data ?? []).map((raw: RawRow) => {
    const profile = flattenProfile(raw.profiles)
    return {
      id:          raw.id,
      player_id:   raw.player_id,
      score:       raw.score,
      achieved_at: raw.achieved_at,
      display:     pickFirstName(profile?.display_name),
    }
  })
}

export function useGameLeaderboard(gameType: ArcadeGameType) {
  const [today,   setToday]   = useState<LeaderboardEntry[]>([])
  const [allTime, setAllTime] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [userId,  setUserId]  = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [t, a] = await Promise.all([
      fetchView(gameType, 'today'),
      fetchView(gameType, 'all_time'),
    ])
    setToday(t)
    setAllTime(a)
    setLoading(false)
  }, [gameType])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user.id ?? null)
    })
    refresh()
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    const ch = supabase
      .channel(`game_scores:${gameType}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_scores', filter: `game_type=eq.${gameType}` },
        () => { refresh() },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [gameType, refresh])

  const personalBestAllTime = useMemo(() => {
    if (!userId) return null
    const mine = allTime.find((e) => e.player_id === userId)
    return mine?.score ?? null
  }, [allTime, userId])

  return { today, allTime, loading, refresh, currentUserId: userId, personalBestAllTime }
}
