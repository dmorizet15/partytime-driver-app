-- AVA Phase 2 — Session 2: lock down sop_entries.
-- Session 1 (migration 019) created the table with RLS OFF, which leaves the
-- SOP Library readable by anyone holding the public anon key (no login needed).
-- SOPs are internal procedures, so enable RLS and scope reads to authenticated
-- PartyTime employees. The driver-app SOP search (Training Hub) runs under the
-- driver's session, so it stays an `authenticated` read and keeps working.
--
-- Writes remain server-only: /api/sop/sync upserts via the admin (service-role)
-- client, which bypasses RLS — no INSERT/UPDATE policy needed for drivers.

ALTER TABLE public.sop_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'sop_entries'
      AND policyname = 'sop_entries_authenticated_select'
  ) THEN
    CREATE POLICY "sop_entries_authenticated_select" ON public.sop_entries
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;
