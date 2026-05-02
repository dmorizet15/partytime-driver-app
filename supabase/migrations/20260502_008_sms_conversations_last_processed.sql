-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: sms_conversations.last_inbound_processed_at
--
-- Idempotency tracking for the partytime-sms webhook. After processing
-- each inbound message, the webhook updates this column to the message's
-- creationTime. On subsequent webhook fires, any inbound message whose
-- creationTime is <= this value is dropped as already-processed.
--
-- Defends against markMessageRead silent failures (currently 403 from
-- RingCentral due to missing EditMessages OAuth scope) which leave
-- messages in the Unread queue and cause re-processing of state-changing
-- replies ("1", "2") in the wrong conversation state — corrupting
-- customer_instructions on the stops table.
--
-- Even after the RC scope issue is resolved, this guard remains correct:
-- it makes the webhook idempotent against any future at-least-once
-- delivery edge case (transient API failures, webhook retries, etc).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sms_conversations
  ADD COLUMN IF NOT EXISTS last_inbound_processed_at TIMESTAMPTZ;
