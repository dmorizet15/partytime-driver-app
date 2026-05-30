-- AVA Phase 2 — Session 1: geocache columns on dispatch_stops.
-- Cached Nominatim coordinates so the weather feature geocodes each address
-- once, not on every morning-brief render. Null = not yet geocoded.

ALTER TABLE dispatch_stops
  ADD COLUMN IF NOT EXISTS delivery_lat FLOAT,
  ADD COLUMN IF NOT EXISTS delivery_lng FLOAT;

COMMENT ON COLUMN dispatch_stops.delivery_lat IS
  'Cached latitude from Nominatim geocode of address. Null = not yet geocoded.';
COMMENT ON COLUMN dispatch_stops.delivery_lng IS
  'Cached longitude from Nominatim geocode of address. Null = not yet geocoded.';
