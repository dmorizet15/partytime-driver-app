-- Migration 028 — Equipment Return Tracking: stop_equipment_returns
--
-- Captures equipment PTR leaves behind at a DELIVERY that the pickup crew
-- must retrieve (extension cords, china/glassware racks, flatware crates,
-- chair carts). One row per (stop, equipment type); written by the delivery
-- crew at stop completion, read by the pickup crew via a service-role API
-- route that resolves the pickup's linked delivery stop.
--
-- Deliberately NO CHECK constraint enumerating equipment_key values —
-- integrity comes from the single shared rules config
-- (src/lib/equipmentReturns/rules.ts), so new equipment types are a code
-- change, not a migration.
--
-- RLS mirrors the stop_item_checkoffs crew pattern (verified live 2026-07-02:
-- crew-of-the-stop's-route via dispatch_stops JOIN route_crew, author check
-- on INSERT, super_admin full access). UPDATE is crew-scoped (not author-
-- only) because the upsert path lets any crew member on the delivery route
-- correct a count. The PICKUP crew is on a different route, so their reads
-- go through the service-role API — no cross-route RLS door is opened here.
-- super_admin gate is `'super_admin' = ANY(p.roles)` (roles is an array on
-- this shared DB — see migs 022–027 + tasks/lessons.md).

CREATE TABLE IF NOT EXISTS public.stop_equipment_returns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id       uuid NOT NULL REFERENCES public.dispatch_stops(id) ON DELETE CASCADE,
  equipment_key text NOT NULL,
  quantity      integer NOT NULL CHECK (quantity >= 0),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stop_id, equipment_key)
);

CREATE INDEX IF NOT EXISTS idx_stop_equipment_returns_stop_id
  ON public.stop_equipment_returns(stop_id);

-- Keep updated_at honest on the upsert's DO UPDATE path.
CREATE OR REPLACE FUNCTION public.stop_equipment_returns_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS stop_equipment_returns_touch_updated_at
  ON public.stop_equipment_returns;
CREATE TRIGGER stop_equipment_returns_touch_updated_at
  BEFORE UPDATE ON public.stop_equipment_returns
  FOR EACH ROW EXECUTE FUNCTION public.stop_equipment_returns_touch_updated_at();

ALTER TABLE public.stop_equipment_returns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_equipment_returns'
      AND policyname='stop_equipment_returns_crew_insert'
  ) THEN
    CREATE POLICY "stop_equipment_returns_crew_insert" ON public.stop_equipment_returns
      FOR INSERT TO authenticated
      WITH CHECK (
        created_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.dispatch_stops ds
          JOIN public.route_crew rc ON rc.route_id = ds.route_id
          WHERE ds.id = stop_equipment_returns.stop_id
            AND rc.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_equipment_returns'
      AND policyname='stop_equipment_returns_crew_update'
  ) THEN
    CREATE POLICY "stop_equipment_returns_crew_update" ON public.stop_equipment_returns
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.dispatch_stops ds
          JOIN public.route_crew rc ON rc.route_id = ds.route_id
          WHERE ds.id = stop_equipment_returns.stop_id
            AND rc.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.dispatch_stops ds
          JOIN public.route_crew rc ON rc.route_id = ds.route_id
          WHERE ds.id = stop_equipment_returns.stop_id
            AND rc.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_equipment_returns'
      AND policyname='stop_equipment_returns_crew_read'
  ) THEN
    CREATE POLICY "stop_equipment_returns_crew_read" ON public.stop_equipment_returns
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.dispatch_stops ds
          JOIN public.route_crew rc ON rc.route_id = ds.route_id
          WHERE ds.id = stop_equipment_returns.stop_id
            AND rc.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='stop_equipment_returns'
      AND policyname='stop_equipment_returns_super_admin_all'
  ) THEN
    CREATE POLICY "stop_equipment_returns_super_admin_all" ON public.stop_equipment_returns
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      );
  END IF;
END $$;
