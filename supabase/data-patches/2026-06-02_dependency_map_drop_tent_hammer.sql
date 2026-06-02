-- Data patch (2026-06-02) — dependency_map: drop the tent-trigger Hammer row.
-- NOT a migration. Applied directly to the linked DB via
--   supabase db query --linked --file <this file>
-- Re-runnable: the DELETE is a safe no-op once the row is gone.
--
-- A sledgehammer covers both tent setup and driving stakes in practice, so the
-- tent route only needs Sledgehammer. This removes the redundant Hammer that was
-- triggered by tent items (category=TENTS). The Hammer row triggered by
-- keyword='inflatable' is left untouched.
--
-- Resulting checklist behavior:
--   * Tent route only        -> Sledgehammer
--   * Inflatable route only  -> Hammer + Hand truck
--   * Tent + inflatable      -> Hammer + Sledgehammer + Hand truck

DELETE FROM public.dependency_map
 WHERE required_item = 'Hammer' AND trigger_type = 'category' AND trigger_value = 'TENTS';
