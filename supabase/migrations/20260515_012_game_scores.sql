-- Migration 053 — game_scores
-- Shared leaderboard table for PartyTime Arcade games.
-- Player insert is auth.uid()-scoped; read is open to authenticated users
-- so the leaderboard can render across all drivers.

CREATE TABLE IF NOT EXISTS public.game_scores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type   text NOT NULL CHECK (game_type IN ('route_rush', 'tent_tetris', 'party_kong')),
  score       integer NOT NULL CHECK (score >= 0),
  achieved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_type_score ON public.game_scores(game_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_type_date  ON public.game_scores(game_type, achieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_player     ON public.game_scores(player_id);

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'game_scores' AND policyname = 'game_scores_select'
  ) THEN
    CREATE POLICY "game_scores_select" ON public.game_scores
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'game_scores' AND policyname = 'game_scores_insert'
  ) THEN
    CREATE POLICY "game_scores_insert" ON public.game_scores
      FOR INSERT TO authenticated WITH CHECK (player_id = auth.uid());
  END IF;
END $$;
