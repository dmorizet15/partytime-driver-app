-- Migration 013 — AVA Phase 1 driver profile columns
-- Three opt-in / preference columns that the morning brief card reads in a
-- later session. Per-driver preferences (May 24, 2026 strategy session):
--   • checklist_enabled       — default ON, can disable (Joey turns his off).
--   • personality_preference  — default 'direct'; 'personality' opts in
--                                (only Dylan opted in so far).
--   • stats_enabled           — default OFF, opt-in (Joey enables his).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS checklist_enabled       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS personality_preference  text    NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS stats_enabled           boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'profiles_personality_preference_check'
      AND  conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_personality_preference_check
      CHECK (personality_preference IN ('direct', 'personality'));
  END IF;
END $$;
