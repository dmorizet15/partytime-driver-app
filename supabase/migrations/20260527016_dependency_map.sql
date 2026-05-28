-- Migration 016 — Dependency map (AVA checklist source-of-truth)
-- Drives AVA's morning checklist: always-carry items + manifest-triggered
-- rules (category exact / keyword substring). Seed rows are driver-confirmed
-- from Lucas (May 21), Austin (May 22), Joey + Dylan (May 24) interviews.

CREATE TABLE IF NOT EXISTS public.dependency_map (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type        text NOT NULL
                      CHECK (trigger_type IN ('category','keyword','always')),
  trigger_value       text,
  quantity_threshold  integer NOT NULL DEFAULT 1,
  required_item       text NOT NULL,
  required_quantity   integer NOT NULL DEFAULT 1,
  notes               text,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dependency_map_trigger_active
  ON public.dependency_map(trigger_type, active);

ALTER TABLE public.dependency_map ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dependency_map'
      AND policyname = 'dependency_map_authenticated_select'
  ) THEN
    CREATE POLICY "dependency_map_authenticated_select" ON public.dependency_map
      FOR SELECT TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'dependency_map'
      AND policyname = 'dependency_map_super_admin_insert'
  ) THEN
    CREATE POLICY "dependency_map_super_admin_insert" ON public.dependency_map
      FOR INSERT TO authenticated
      WITH CHECK (
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
      AND tablename  = 'dependency_map'
      AND policyname = 'dependency_map_super_admin_update'
  ) THEN
    CREATE POLICY "dependency_map_super_admin_update" ON public.dependency_map
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM   public.profiles p
          WHERE  p.id = auth.uid()
            AND  'super_admin' = ANY(p.roles)
        )
      )
      WITH CHECK (
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
      AND tablename  = 'dependency_map'
      AND policyname = 'dependency_map_super_admin_delete'
  ) THEN
    CREATE POLICY "dependency_map_super_admin_delete" ON public.dependency_map
      FOR DELETE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM   public.profiles p
          WHERE  p.id = auth.uid()
            AND  'super_admin' = ANY(p.roles)
        )
      );
  END IF;
END $$;

-- Seed — driver-confirmed dependency rules. Only fires on an empty table so
-- re-running the migration is a no-op (and future Darren-side curation in the
-- DB doesn't get overwritten).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.dependency_map) = 0 THEN
    INSERT INTO public.dependency_map
      (trigger_type, trigger_value, quantity_threshold, required_item, required_quantity, notes)
    VALUES
      -- ALWAYS-CARRY — fire every route regardless of manifest
      ('always',  NULL,                1, 'Cleaner bottles',       2, 'Cleaner bag standard build'),
      ('always',  NULL,                1, 'Towels',                6, 'Cleaner bag standard build'),
      ('always',  NULL,                1, 'Magic erasers',         4, 'Cleaner bag standard build'),
      ('always',  NULL,                1, 'White caulk',           1, 'Cleaner bag standard build'),
      ('always',  NULL,                1, 'Repair tape + scissors',1, 'Cleaner bag'),
      ('always',  NULL,                1, 'Spare guy ropes',       2, 'Cleaner bag standard build'),
      ('always',  NULL,                1, 'Zip ties',              1, 'Dylan interview May 24'),

      -- MANIFEST-TRIGGERED
      ('category','TENTS',             1, 'Pry bar',               1, 'Any MQ or tent item'),
      ('keyword', 'pole tent',         1, 'Wood blocks',           1, 'NOT needed for frame tents — keyword match only'),
      ('keyword', 'sidewall',          5, 'Ladders',               2, '5+ walls threshold — Lucas confirmed'),
      ('category','SEATING',           1, 'Hand truck',            1, 'Any chairs'),
      ('keyword', 'inflatable',        1, 'Hand truck',            1, NULL),
      ('keyword', 'inflatable',        1, 'Hammer',                1, NULL),
      ('keyword', 'propane',           1, 'Crescent wrenches',     2, NULL),
      ('keyword', 'stage stair',       1, 'Crescent wrench',       1, 'Any manufacturer'),
      ('keyword', 'stage railing',     1, 'Crescent wrench',       1, NULL),
      ('keyword', 'restroom trailer',  1, 'Yellow extension cord', 1, NULL),
      ('keyword', 'restroom trailer',  1, 'Wheel chocks',          1, NULL),
      ('keyword', 'restroom trailer',  1, 'Hitch wood block',      1, NULL),
      ('keyword', 'restroom trailer',  1, 'Tank treatment',        1, NULL),
      ('keyword', 'generator',         1, 'Wheel chocks',          1, 'Towable generator'),
      ('keyword', 'generator',         1, 'Verify gas level',      1, 'Towable generator'),
      ('keyword', 'generator',         1, 'Log hour meter out',    1, 'Towable generator');
  END IF;
END $$;
