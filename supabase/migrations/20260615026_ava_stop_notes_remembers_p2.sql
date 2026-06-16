-- Migration 026 — AVA Remembers Phase 2: ava_stop_notes extension + freshness confirm
--
-- Adds the columns the freshness loop needs and a SECOND update policy so ANY
-- authenticated driver (not just the note author) can confirm a note is still
-- accurate when they revisit the site. RLS is row-level only, so the column
-- scope ("foreign drivers may touch ONLY freshness fields") is enforced by a
-- companion BEFORE UPDATE trigger.
--
-- Spec correction (flagged, same class as the roles[] fix in migs 022–025):
-- the locked spec added `created_by uuid REFERENCES profiles(id)`, but this
-- table ALREADY has `author_id uuid REFERENCES profiles(id)` carrying exactly
-- that fact (every existing read/write uses it). We reuse author_id and SKIP
-- created_by — no duplicate column, no backfill. The other four spec columns
-- are added as written.

-- ── Columns ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ava_stop_notes' AND column_name='created_by_role'
  ) THEN
    ALTER TABLE public.ava_stop_notes
      ADD COLUMN created_by_role text DEFAULT 'driver'
      CHECK (created_by_role IN ('driver','dispatcher'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ava_stop_notes' AND column_name='status'
  ) THEN
    ALTER TABLE public.ava_stop_notes
      ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ava_stop_notes' AND column_name='last_confirmed_at'
  ) THEN
    ALTER TABLE public.ava_stop_notes ADD COLUMN last_confirmed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ava_stop_notes' AND column_name='visit_count_since_added'
  ) THEN
    ALTER TABLE public.ava_stop_notes
      ADD COLUMN visit_count_since_added integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Partial index so the "active notes at this address" lookups stay cheap.
CREATE INDEX IF NOT EXISTS idx_ava_stop_notes_addr_active
  ON public.ava_stop_notes(address_key) WHERE status = 'active';

-- ── Column-guard trigger ─────────────────────────────────────────────────────
-- A non-author (auth.uid() <> author_id) may change ONLY last_confirmed_at and
-- visit_count_since_added (updated_at is allowed to ride along). The author may
-- change anything (covered by ava_stop_notes_update_own). The service role
-- (auth.uid() IS NULL — used by the archive route) bypasses the guard entirely.
CREATE OR REPLACE FUNCTION public.ava_stop_notes_guard_foreign_update()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM OLD.author_id THEN
    IF (NEW.note            IS DISTINCT FROM OLD.note)
    OR (NEW.address_key     IS DISTINCT FROM OLD.address_key)
    OR (NEW.raw_address     IS DISTINCT FROM OLD.raw_address)
    OR (NEW.author_id       IS DISTINCT FROM OLD.author_id)
    OR (NEW.photo_urls      IS DISTINCT FROM OLD.photo_urls)
    OR (NEW.status          IS DISTINCT FROM OLD.status)
    OR (NEW.created_by_role IS DISTINCT FROM OLD.created_by_role)
    OR (NEW.created_at      IS DISTINCT FROM OLD.created_at)
    THEN
      RAISE EXCEPTION 'Only the note author may edit fields other than freshness confirmation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ava_stop_notes_guard_foreign_update ON public.ava_stop_notes;
CREATE TRIGGER trg_ava_stop_notes_guard_foreign_update
  BEFORE UPDATE ON public.ava_stop_notes
  FOR EACH ROW EXECUTE FUNCTION public.ava_stop_notes_guard_foreign_update();

-- ── Freshness-confirm UPDATE policy ──────────────────────────────────────────
-- Permissive (OR'd with ava_stop_notes_update_own). Lets any authenticated user
-- UPDATE an active note row; the trigger above restricts WHICH columns they may
-- actually change. Authors keep full edit rights through update_own.
DROP POLICY IF EXISTS "ava_stop_notes_confirm_freshness" ON public.ava_stop_notes;
CREATE POLICY "ava_stop_notes_confirm_freshness" ON public.ava_stop_notes
  FOR UPDATE TO authenticated
  USING (status = 'active')
  WITH CHECK (true);
