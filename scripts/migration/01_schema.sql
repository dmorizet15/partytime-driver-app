-- ─────────────────────────────────────────────────────────────────────────────
-- PartyTime Driver App — New East-Region Supabase Migration
-- Script 01: Schema DDL
--
-- Run this FIRST in the new project's SQL Editor.
-- No RLS is enabled on either table (confirmed from old project audit).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── stops ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stops (
  stop_id                  TEXT        NOT NULL,
  stop_type                TEXT        NOT NULL,
  customer_phone           TEXT,
  sms_status               TEXT,
  eta_range                TEXT,
  eta_sent_at              TIMESTAMPTZ,
  customer_ready           BOOLEAN     DEFAULT false,
  customer_ready_at        TIMESTAMPTZ,
  awaiting_instructions    BOOLEAN     DEFAULT false,
  not_there_at             TIMESTAMPTZ,
  customer_instructions    TEXT,
  instructions_received_at TIMESTAMPTZ,
  latest_inbound_message   TEXT,
  last_message_at          TIMESTAMPTZ,
  opted_out                BOOLEAN     DEFAULT false,
  opted_out_at             TIMESTAMPTZ,
  customer_name            TEXT,
  order_id                 TEXT,
  pod_photo_url            TEXT,
  CONSTRAINT stops_pkey PRIMARY KEY (stop_id)
);

-- ─── sms_conversations ───────────────────────────────────────────────────────
-- Schema confirmed from old project information_schema query.
-- No primary key was returned — table was created without one.
-- No RLS. Column order matches old project ordinal_position.
CREATE TABLE IF NOT EXISTS public.sms_conversations (
  customer_phone TEXT        NOT NULL,
  stop_id        TEXT        NOT NULL,
  stop_type      TEXT,
  state          TEXT,
  eta_sent_at    TIMESTAMPTZ
);

-- ─── Verify both tables exist ────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('stops', 'sms_conversations')
ORDER BY table_name;
