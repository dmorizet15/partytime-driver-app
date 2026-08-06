-- Migration 031 — Field media Phase 2: generic (non-stop) captures
--
-- Phase 1 (mig 030) only accepted media captured ON a stop, so every row could
-- be auto-tagged from dispatch_stops. Phase 2 adds a catch-all uploader on the
-- driver profile for footage that has no stop behind it — an older job, B-roll,
-- something shot off-route.
--
-- Marketing reads ONE table, so generic captures land in the same
-- marketing_media_intake. They differ only by:
--   • source = 'generic'
--   • stop_id NULL and every job-tag column NULL
--   • caption REQUIRED — with no stop, the driver's own description is the
--     only thing telling marketing what the clip is
--
-- `stop_id` is already nullable (verified live before drafting), so nothing has
-- to be relaxed. The table was empty at the time of writing; the DEFAULT still
-- backfills any existing row to 'stop', which is correct — every Phase 1 row
-- was stop-tagged by construction.

ALTER TABLE public.marketing_media_intake
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'stop';

-- Optional, driver-chosen. Only offered on the generic uploader (a stop-tagged
-- capture already carries the real job context, which beats a self-reported
-- bucket). Free-form rather than an enum so marketing can retune the picker
-- without a migration.
ALTER TABLE public.marketing_media_intake
  ADD COLUMN IF NOT EXISTS category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketing_media_intake'::regclass
      AND conname  = 'marketing_media_intake_source_check'
  ) THEN
    ALTER TABLE public.marketing_media_intake
      ADD CONSTRAINT marketing_media_intake_source_check
      CHECK (source IN ('stop','generic'));
  END IF;

  -- The generic contract, enforced structurally rather than only in the route.
  -- A generic row with no description is useless to marketing — it is an
  -- unlabelled file, which is the exact problem this whole feature exists to
  -- stop. Mirrors the capture-or-skip CHECK on stop_generator_actions.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketing_media_intake'::regclass
      AND conname  = 'marketing_media_intake_generic_shape_check'
  ) THEN
    ALTER TABLE public.marketing_media_intake
      ADD CONSTRAINT marketing_media_intake_generic_shape_check
      CHECK (
        source <> 'generic'
        OR (stop_id IS NULL AND caption IS NOT NULL AND btrim(caption) <> '')
      );
  END IF;
END $$;

-- ⚠ DELIBERATELY NOT ADDED: a mirror check that source='stop' implies
-- stop_id IS NOT NULL. `stop_id` carries ON DELETE SET NULL, and that fires as
-- an UPDATE on this row — which would re-evaluate the constraint and make
-- deleting a dispatch_stops row fail. The asymmetry is intentional; leave it.

CREATE INDEX IF NOT EXISTS idx_marketing_media_intake_source
  ON public.marketing_media_intake(source);
