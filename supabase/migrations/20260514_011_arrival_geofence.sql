-- Phase 2.5C — GPS Auto-Arrival
--
-- Adds dispatch_stops.arrived_at. The driver app's /api/stops/arrived
-- endpoint stamps this once when the driver crosses the 150m geofence
-- around a stop's address_lat/address_lng (column shipped via dashboard
-- Migration 034). The dashboard consumes the column to render an
-- "Arrived" badge on StopCard via the existing dispatch_stops realtime
-- channel — no polling. Server-side write only; the value is never
-- overwritten on subsequent geofence triggers (idempotency enforced in
-- the endpoint, not the schema, so dispatch / admin tooling can still
-- correct a bad value with a direct UPDATE).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
--
-- Apply path: `supabase db query --linked --file <path>` (Management API —
-- bypasses the two-repo migration-history block; see tasks/lessons.md).
-- After applying, `supabase migration repair --status applied 20260514011`
-- to keep the local CLI tracking honest.

ALTER TABLE public.dispatch_stops
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
