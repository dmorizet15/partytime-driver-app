-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 05: pod_photo_url Domain Rewrite (run on NEW project)
--
-- Run this AFTER 04_import_data.sql completes.
-- After data is imported, pod_photo_url values still point to the OLD
-- Supabase project URL. This script rewrites them to the new domain.
--
-- BEFORE RUNNING: Replace the two placeholder URLs below with real values.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── EDIT THESE TWO VALUES BEFORE RUNNING ────────────────────────────────────
-- OLD_PROJECT_URL: e.g. https://abcdefghijkl.supabase.co
-- NEW_PROJECT_URL: e.g. https://mnopqrstuvwx.supabase.co

-- ─── Step 1: Preview rows that will be updated (dry run — no changes) ─────────
SELECT
  stop_id,
  pod_photo_url AS old_url,
  REPLACE(
    pod_photo_url,
    'https://OLD_PROJECT_REF.supabase.co',   -- REPLACE THIS
    'https://NEW_PROJECT_REF.supabase.co'    -- REPLACE THIS
  ) AS new_url
FROM public.stops
WHERE pod_photo_url IS NOT NULL
ORDER BY stop_id;

-- ─── Step 2: Apply the rewrite ────────────────────────────────────────────────
-- Only run after confirming Step 1 output looks correct.
UPDATE public.stops
SET pod_photo_url = REPLACE(
  pod_photo_url,
  'https://OLD_PROJECT_REF.supabase.co',    -- REPLACE THIS
  'https://NEW_PROJECT_REF.supabase.co'     -- REPLACE THIS
)
WHERE pod_photo_url IS NOT NULL;

-- ─── Step 3: Verify — should return 0 rows ────────────────────────────────────
SELECT COUNT(*) AS remaining_old_domain_refs
FROM public.stops
WHERE pod_photo_url LIKE '%OLD_PROJECT_REF%';  -- REPLACE THIS

-- ─── Step 4: Final spot check ─────────────────────────────────────────────────
SELECT stop_id, pod_photo_url
FROM public.stops
WHERE pod_photo_url IS NOT NULL
ORDER BY stop_id;
