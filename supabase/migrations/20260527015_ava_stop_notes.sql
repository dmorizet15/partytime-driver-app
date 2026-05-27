-- Migration 015 — AVA Remembers: address-keyed stop notes
-- Notes are tagged to a normalized address (lowercase, punctuation stripped),
-- NOT to a stop or order, so the same site's history persists across seasons,
-- years, and drivers. Any authenticated driver can read all notes; insert
-- their own; and update or delete only rows they authored.

CREATE TABLE IF NOT EXISTS public.ava_stop_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_key text NOT NULL,
  raw_address text,
  note        text NOT NULL,
  author_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  photo_urls  text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ava_stop_notes_address_key
  ON public.ava_stop_notes(address_key);

ALTER TABLE public.ava_stop_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_stop_notes'
      AND policyname = 'ava_stop_notes_select'
  ) THEN
    CREATE POLICY "ava_stop_notes_select" ON public.ava_stop_notes
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_stop_notes'
      AND policyname = 'ava_stop_notes_insert'
  ) THEN
    CREATE POLICY "ava_stop_notes_insert" ON public.ava_stop_notes
      FOR INSERT TO authenticated
      WITH CHECK (author_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_stop_notes'
      AND policyname = 'ava_stop_notes_update_own'
  ) THEN
    CREATE POLICY "ava_stop_notes_update_own" ON public.ava_stop_notes
      FOR UPDATE TO authenticated
      USING (author_id = auth.uid())
      WITH CHECK (author_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'ava_stop_notes'
      AND policyname = 'ava_stop_notes_delete_own'
  ) THEN
    CREATE POLICY "ava_stop_notes_delete_own" ON public.ava_stop_notes
      FOR DELETE TO authenticated
      USING (author_id = auth.uid());
  END IF;
END $$;
