-- Migration 032 — game_scores: allow the 'load_out' game type
-- Adds the 4th PartyTime Arcade game (Load Out) to the game_type CHECK.
-- Purely additive: widens the allowed set, existing rows are unaffected.
--
-- NOT YET APPLIED to the shared prod DB (fumprcyavpefyupurvsv) — held for
-- Darren's review of the Load Out branch. Until it is applied, 'load_out'
-- score INSERTs are rejected by the old CHECK and swallowed by the client's
-- .catch(() => {}) (same fire-and-forget pattern as the other three games), so
-- the UI is fully reviewable; only leaderboard writes wait on this.

ALTER TABLE public.game_scores
  DROP CONSTRAINT IF EXISTS game_scores_game_type_check;

ALTER TABLE public.game_scores
  ADD CONSTRAINT game_scores_game_type_check
  CHECK (game_type IN ('route_rush', 'tent_tetris', 'party_kong', 'load_out'));
