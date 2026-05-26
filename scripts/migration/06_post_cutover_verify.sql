-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 06: Post-Cutover Verification (run on NEW project after go-live)
--
-- Run these checks after both Vercel apps have been redeployed against the
-- new project. Paste actual expected counts where indicated.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Row count audit ───────────────────────────────────────────────────────
-- Compare these values against the counts recorded in 03_export_data.sql Step 1.
SELECT 'stops'             AS table_name, COUNT(*) AS row_count FROM public.stops
UNION ALL
SELECT 'sms_conversations' AS table_name, COUNT(*) AS row_count FROM public.sms_conversations;

-- ─── 2. Confirm no pod_photo_url still points to old domain ──────────────────
-- Should return 0.
SELECT COUNT(*) AS old_domain_refs
FROM public.stops
WHERE pod_photo_url LIKE '%OLD_PROJECT_REF%';  -- REPLACE with old ref

-- ─── 3. Confirm active SMS state is intact ────────────────────────────────────
-- Any stop mid-conversation (ETA sent, awaiting reply) should show here.
SELECT stop_id, sms_status, customer_ready, awaiting_instructions, opted_out
FROM public.stops
WHERE sms_status IS NOT NULL
ORDER BY eta_sent_at DESC
LIMIT 20;

-- ─── 4. Confirm new uploads are landing in the right project ─────────────────
-- After the first POD photo is taken post-cutover, run this.
-- pod_photo_url should start with the NEW project URL.
SELECT stop_id, pod_photo_url, last_message_at
FROM public.stops
WHERE pod_photo_url IS NOT NULL
ORDER BY last_message_at DESC NULLS LAST
LIMIT 5;

-- ─── 5. Storage bucket health check ─────────────────────────────────────────
SELECT id, name, public, created_at
FROM storage.buckets
WHERE id = 'pod-photos';

-- Count objects in bucket (should be >= old project count after migration)
SELECT COUNT(*) AS object_count
FROM storage.objects
WHERE bucket_id = 'pod-photos';
