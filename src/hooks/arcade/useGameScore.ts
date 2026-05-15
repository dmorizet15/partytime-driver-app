'use client'

import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type ArcadeGameType = 'route_rush' | 'tent_tetris' | 'party_kong'

export function useGameScore() {
  const submitScore = useCallback(async (gameType: ArcadeGameType, score: number) => {
    if (!Number.isFinite(score) || score <= 0) return { ok: false, reason: 'zero-score' as const }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) return { ok: false, reason: 'no-session' as const }

    const { error } = await supabase
      .from('game_scores')
      .insert({ player_id: userId, game_type: gameType, score: Math.floor(score) })

    if (error) return { ok: false, reason: 'insert-failed' as const, error }
    return { ok: true as const }
  }, [])

  return { submitScore }
}
