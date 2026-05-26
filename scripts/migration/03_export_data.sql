-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 03: Data Export (run on OLD project)
--
-- Run these queries in the OLD project's SQL Editor.
-- Copy the CSV output from each and save locally before cutover.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Row count audit (run before export to record expected counts) ─────────
SELECT 'stops'             AS table_name, COUNT(*) AS row_count FROM public.stops
UNION ALL
SELECT 'sms_conversations' AS table_name, COUNT(*) AS row_count FROM public.sms_conversations;

-- ─── 2. Export stops ─────────────────────────────────────────────────────────
-- In Supabase SQL Editor: run this query, then click "Download CSV"
SELECT
  stop_id,
  stop_type,
  customer_phone,
  sms_status,
  eta_range,
  eta_sent_at,
  customer_ready,
  customer_ready_at,
  awaiting_instructions,
  not_there_at,
  customer_instructions,
  instructions_received_at,
  latest_inbound_message,
  last_message_at,
  opted_out,
  opted_out_at,
  customer_name,
  order_id,
  pod_photo_url
FROM public.stops
ORDER BY stop_id;

-- ─── 3. Export sms_conversations ─────────────────────────────────────────────
-- In Supabase SQL Editor: run this query, then click "Download CSV"
SELECT
  customer_phone,
  stop_id,
  stop_type,
  state,
  eta_sent_at
FROM public.sms_conversations
ORDER BY customer_phone, stop_id;

-- ─── 4. Identify photo URLs (save this list for post-migration URL verification)
SELECT stop_id, pod_photo_url
FROM public.stops
WHERE pod_photo_url IS NOT NULL
ORDER BY stop_id;
