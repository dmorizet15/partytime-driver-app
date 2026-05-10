-- ─── Migration 009: post-trip defect reporting ──────────────────────────────
-- Adds the `reported_context` column to `vehicle_defects` so a single table
-- can carry both pre-trip (DVIR-attached) defects and post-trip standalone
-- reports. Existing rows backfill to 'pre_trip' via the column DEFAULT.
--
-- Post-trip rows have no parent inspection — they are written from the Home
-- post-trip card after route completion and are not part of a DVIR. The
-- `inspection_id` NOT NULL constraint is dropped so post-trip rows can
-- carry NULL there. Pre-trip inserts continue to populate `inspection_id`.
--
-- See: tasks/todo.md "Post-trip defect report — feature spec" (2026-05-09)
-- and the DOT Pre-Trip & DVIR System spec in Notion.

ALTER TABLE vehicle_defects
  ADD COLUMN reported_context text
  CHECK (reported_context IN ('pre_trip', 'post_trip'))
  DEFAULT 'pre_trip';

ALTER TABLE vehicle_defects
  ALTER COLUMN inspection_id DROP NOT NULL;
