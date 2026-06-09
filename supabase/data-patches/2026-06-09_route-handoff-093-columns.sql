-- Phase 2B — Route Handoff — dashboard-side schema (migration 093)
-- Applied from the DRIVER repo (2026-06-09) at Darren's direction because the
-- columns the Phase 2B spec depends on were NOT yet live on the shared DB.
--
-- Context / discrepancy reconciled here:
--   • The build prompt said these columns shipped with migration 092.
--   • The locked Notion spec ("Phase 2B Spec — Route Handoff, June 9 2026")
--     says 092 = the warehouse_return order_status sentinel fix, and that
--     Phase 2B was re-allocated to migration 093 — which had not been written.
--   • A live-DB check (information_schema.columns) confirmed neither column
--     existed on `routes` nor anywhere else. So this file IS dashboard mig 093.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). Re-runnable after a fresh DB rebuild.
-- chat-Claude should mirror this into the dashboard repo's numbered migration
-- 093 and reconcile the Notion migration ledger.
--
-- Schema (table: routes):
--   active_driver_id    uuid NULL  FK → profiles(id) — driver currently in
--                       active control. NULL ⇒ is_primary (route_crew) controls.
--   transfer_pending_to uuid NULL  FK → profiles(id) — driver awaiting
--                       accept/decline. NULL ⇒ no pending transfer.
-- State machine: Idle (both NULL) → Pending (transfer_pending_to set) →
--   Transferred (active_driver_id set, pending cleared) OR Declined (both NULL).

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS active_driver_id    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS transfer_pending_to uuid REFERENCES public.profiles(id);
