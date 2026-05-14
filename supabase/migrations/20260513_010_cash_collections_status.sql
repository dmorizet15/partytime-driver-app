-- Cash Collection v2 — status + not_collected_reason
--
-- The cash_collections table exists in production but no migration file
-- ever landed in the repo. This file reconstructs the table shape AND
-- adds the two columns needed for the "Could Not Collect" flow.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS for the base shape, ALTER TABLE
-- ADD COLUMN IF NOT EXISTS for the new columns, and DO-block-wrapped
-- CHECK constraint so re-running is a no-op.
--
-- Apply path: Supabase Studio SQL Editor (two-repo migration coordination
-- blocks `supabase db push` — see tasks/lessons.md). After applying,
-- run `supabase migration repair --status applied 20260513010` to keep
-- the local CLI tracking honest.

-- ─── Base table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cash_collections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id          uuid NOT NULL,
  driver_id        uuid NOT NULL REFERENCES public.profiles(id),
  amount_collected numeric,
  collected_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ─── New columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.cash_collections
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'collected',
  ADD COLUMN IF NOT EXISTS not_collected_reason text;

-- Status enumeration via CHECK (kept as text for forward compatibility — easy
-- to add 'partial' or similar without an ALTER TYPE dance).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_collections_status_check'
      AND conrelid = 'public.cash_collections'::regclass
  ) THEN
    ALTER TABLE public.cash_collections
      ADD CONSTRAINT cash_collections_status_check
      CHECK (status IN ('collected', 'not_collected'));
  END IF;
END $$;

-- Reason is REQUIRED when status='not_collected' (non-empty after trim).
-- For status='collected' the reason column must be NULL (keep rows tidy).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cash_collections_reason_when_not_collected'
      AND conrelid = 'public.cash_collections'::regclass
  ) THEN
    ALTER TABLE public.cash_collections
      ADD CONSTRAINT cash_collections_reason_when_not_collected
      CHECK (
        (status = 'collected'     AND not_collected_reason IS NULL)
        OR
        (status = 'not_collected' AND length(btrim(coalesce(not_collected_reason, ''))) > 0)
      );
  END IF;
END $$;

-- ─── Lookup index for the dashboard's unresolved-COD flag ────────────────────
-- The dashboard queries `cash_collections` by stop_id to surface the flag.
-- Partial index keeps it tiny — only uncollected rows are interesting.
CREATE INDEX IF NOT EXISTS cash_collections_uncollected_by_stop_idx
  ON public.cash_collections (stop_id)
  WHERE status = 'not_collected';

-- ─── RLS — already enabled in production; re-assert for documentation ────────
ALTER TABLE public.cash_collections ENABLE ROW LEVEL SECURITY;

-- NOTE on existing RLS policies: production policies were created out of band
-- with the table. They allow `driver_id = auth.uid()` for SELECT and INSERT.
-- This migration does not re-declare them — re-running CREATE POLICY without
-- DROP first would error. If you ever need to recreate from scratch, see the
-- session summary for the policy bodies.
