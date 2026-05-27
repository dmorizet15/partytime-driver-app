-- Migration 014 — AVA conversation log
-- Append-only history of every AVA Q&A across all surfaces. Drivers read &
-- insert their own rows. super_admin reads all (admin review queue lives in
-- the dashboard eventually). No update/delete: this is an audit trail.

CREATE TABLE IF NOT EXISTS public.ava_conversations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  surface      text NOT NULL
               CHECK (surface IN ('driver_home','dispatch','will_call','fleet','warehouse')),
  context_id   uuid,
  question     text NOT NULL,
  answer       text,
  confidence   text CHECK (confidence IN ('high','low','unanswered')),
  needs_review boolean NOT NULL DEFAULT false,
  helpful      boolean,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ava_conversations_driver_created
  ON public.ava_conversations(driver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ava_conversations_needs_review
  ON public.ava_conversations(needs_review, created_at DESC)
  WHERE needs_review = true;

ALTER TABLE public.ava_conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_conversations'
      AND policyname = 'ava_conversations_driver_select'
  ) THEN
    CREATE POLICY "ava_conversations_driver_select" ON public.ava_conversations
      FOR SELECT TO authenticated
      USING (driver_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_conversations'
      AND policyname = 'ava_conversations_super_admin_select'
  ) THEN
    CREATE POLICY "ava_conversations_super_admin_select" ON public.ava_conversations
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM   public.profiles p
          WHERE  p.id = auth.uid()
            AND  'super_admin' = ANY(p.roles)
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_conversations'
      AND policyname = 'ava_conversations_driver_insert'
  ) THEN
    CREATE POLICY "ava_conversations_driver_insert" ON public.ava_conversations
      FOR INSERT TO authenticated
      WITH CHECK (driver_id = auth.uid());
  END IF;
END $$;
