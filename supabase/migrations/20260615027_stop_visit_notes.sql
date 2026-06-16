-- Migration 027 — AVA Remembers Phase 2: stop_visit_notes
--
-- Single-visit notes ("just for this visit") that do NOT persist as durable
-- site memory. address_key uses the SAME normalizer as ava_stop_notes so the
-- two stay aligned. created_by is the author here (this is a fresh table — no
-- pre-existing author column to reuse, unlike ava_stop_notes).
--
-- RLS: any authenticated user may INSERT their own rows; super_admin reads all,
-- everyone else reads only their own. super_admin gate is
-- `'super_admin' = ANY(p.roles)` (this shared DB has roles text[], NOT a role
-- column — verified against the live DB; see migs 022–025 + tasks/lessons.md).

CREATE TABLE IF NOT EXISTS public.stop_visit_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id       uuid REFERENCES public.dispatch_stops(id) ON DELETE SET NULL,
  order_ref     text,
  address_key   text NOT NULL,
  note_text     text NOT NULL,
  note_category text NOT NULL
    CHECK (note_category IN ('customer_behavior','tip','access','equipment','general')),
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stop_visit_notes_address_key
  ON public.stop_visit_notes(address_key);
CREATE INDEX IF NOT EXISTS idx_stop_visit_notes_created_by
  ON public.stop_visit_notes(created_by);

ALTER TABLE public.stop_visit_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_visit_notes'
      AND policyname='stop_visit_notes_insert_own'
  ) THEN
    CREATE POLICY "stop_visit_notes_insert_own" ON public.stop_visit_notes
      FOR INSERT TO authenticated
      WITH CHECK (created_by = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_visit_notes'
      AND policyname='stop_visit_notes_select_scoped'
  ) THEN
    CREATE POLICY "stop_visit_notes_select_scoped" ON public.stop_visit_notes
      FOR SELECT TO authenticated
      USING (
        created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      );
  END IF;
END $$;
