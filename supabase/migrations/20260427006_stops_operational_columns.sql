-- Phase 2: cross-device OTW state sync
-- Adds operational columns to stops so OTW status written by one device
-- is visible on any other device loading the same route.
-- All columns are nullable — existing rows are unaffected.

alter table stops
  add column if not exists otw_status    boolean,
  add column if not exists otw_timestamp timestamptz,
  add column if not exists otw_set_by    uuid references auth.users(id);
