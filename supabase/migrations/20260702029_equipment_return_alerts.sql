-- Migration 029 — Equipment Return Tracking: reservation-scoped ledger alerts
--
-- Once-per-reservation dedupe stamp for the final-pickup discrepancy email.
-- The pickup-completion POST recomputes the reservation's running balance
-- (SUM delivered − SUM retrieved per equipment_key) when the LAST pickup
-- completes; a nonzero balance emails dispatch. The email must fire at most
-- once per reservation even when the POST is replayed from the offline queue
-- — so the send is gated on INSERT ... ON CONFLICT DO NOTHING into this
-- table: only the caller whose insert lands sends the email.
--
-- payload keeps the computed breakdown (delivered/retrieved/balance per key
-- + involved stops) so dispatch tooling can re-read what was alerted without
-- re-deriving a since-changed ledger.
--
-- NOTE (checked live 2026-07-02): dispatch_stops.reservation_id is already
-- indexed (dispatch_stops_reservation_id_idx) — the ledger query needs no
-- new index.
--
-- RLS: no driver policies — rows are written only by the service-role route.
-- super_admin read for dashboard/debug visibility, matching house style
-- (`'super_admin' = ANY(p.roles)` — roles is an array on this shared DB).

CREATE TABLE IF NOT EXISTS public.equipment_return_alerts (
  reservation_id uuid PRIMARY KEY,
  emailed_at     timestamptz NOT NULL DEFAULT now(),
  payload        jsonb
);

ALTER TABLE public.equipment_return_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='equipment_return_alerts'
      AND policyname='equipment_return_alerts_super_admin_read'
  ) THEN
    CREATE POLICY "equipment_return_alerts_super_admin_read" ON public.equipment_return_alerts
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid() AND 'super_admin' = ANY(p.roles)
        )
      );
  END IF;
END $$;
