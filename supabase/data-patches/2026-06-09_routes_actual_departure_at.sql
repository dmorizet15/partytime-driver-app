-- routes.actual_departure_at — warehouse-departure stamp (dashboard migration 095)
-- Applied from the DRIVER repo (2026-06-09) — the column the walk-away "IN TRANSIT
-- writer" session depends on was NOT yet live on the shared DB (verified via
-- information_schema.columns: routes had active_driver_id / dispatched_at /
-- transfer_pending_to but NOT actual_departure_at).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). Re-runnable after a fresh DB rebuild.
-- chat-Claude should reconcile the Notion migration ledger; the dashboard repo's
-- numbered mirror is supabase/migrations/20260609200000_095_routes_actual_departure_at.sql.
--
-- Why a new ROUTES column and not the existing dispatch_stops.actual_departure_at:
--   • dispatch_stops.actual_departure_at is the per-stop departure leg ("left
--     THIS stop"), a different grain from "left the warehouse".
--   • The warehouse Overview IN TRANSIT stage (warehouseOverviewServer.deriveStage)
--     and the warehouse board 'out' column both now read routes.actual_departure_at.
--
-- Writer: driver app POST /api/routes/[routeId]/depart, stamped once when the
-- driver starts the route (pre-trip complete). Idempotent — re-stamp is a no-op.
--
-- Schema (table: routes):
--   actual_departure_at  timestamptz NULL — set when the truck departs the yard.

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS actual_departure_at timestamptz;
