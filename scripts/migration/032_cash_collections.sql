-- Migration 032 — cash_collections
-- Driver-app cash-on-delivery acknowledgments.
-- Each row records that a driver formally confirmed cash collection at a stop.

CREATE TABLE cash_collections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id          text NOT NULL,
  driver_id        uuid NOT NULL REFERENCES profiles(id),
  amount_collected numeric(10,2),
  collected_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cash_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert their own collections"
  ON cash_collections FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Drivers can read their own collections"
  ON cash_collections FOR SELECT
  USING (driver_id = auth.uid());
