-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 04: Data Import (run on NEW project)
--
-- Run this AFTER 01_schema.sql and 02_storage.sql are complete
-- and after photos have been migrated via migrate-photos.sh.
--
-- METHOD: Use pg_dump/pg_restore (preferred) OR paste CSV via the Supabase
-- Table Editor. See runbook for exact steps.
--
-- These are the INSERT templates if doing manual row-by-row import.
-- For bulk import, use the pg_dump approach in the runbook.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── If using pg_dump (preferred) ────────────────────────────────────────────
-- This file is a reference only — pg_dump output replaces the INSERT blocks.
-- See runbook Step 4 for the exact pg_dump command.

-- ─── Verify row counts after import (run on NEW project) ─────────────────────
-- These should match the counts from 03_export_data.sql Step 1.
SELECT 'stops'             AS table_name, COUNT(*) AS row_count FROM public.stops
UNION ALL
SELECT 'sms_conversations' AS table_name, COUNT(*) AS row_count FROM public.sms_conversations;

-- ─── Spot-check stops data integrity ─────────────────────────────────────────
SELECT stop_id, sms_status, customer_ready, opted_out, pod_photo_url IS NOT NULL AS has_photo
FROM public.stops
ORDER BY stop_id
LIMIT 20;

-- ─── Spot-check sms_conversations (first 10 rows) ────────────────────────────
SELECT * FROM public.sms_conversations ORDER BY 1 LIMIT 10;
