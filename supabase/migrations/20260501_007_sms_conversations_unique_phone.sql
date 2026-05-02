-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: sms_conversations.customer_phone UNIQUE constraint
--
-- Restores the unique constraint that was lost during the partytime-east
-- Supabase project migration (~2026-04-26). The schema export script in
-- scripts/migration/01_schema.sql only queried PRIMARY KEYs and missed any
-- non-PK unique indexes — including this one, which the partytime-sms
-- service relies on for its `setConversation` upsert.
--
-- Without this constraint, partytime-sms's
--   .upsert({...}, { onConflict: 'customer_phone' })
-- fails with: "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" — breaking ETA reply rehydration, OTW status
-- sync, and stop-status polling in the driver app.
--
-- Pre-flight: run the duplicate check below before applying. If it returns
-- any rows, dedupe first (keep the most recent row per customer_phone).
--
--   SELECT customer_phone, COUNT(*) AS n
--   FROM public.sms_conversations
--   GROUP BY customer_phone
--   HAVING COUNT(*) > 1;
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sms_conversations
  ADD CONSTRAINT sms_conversations_customer_phone_key UNIQUE (customer_phone);
