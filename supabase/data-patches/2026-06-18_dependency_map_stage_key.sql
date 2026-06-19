-- Data patch (2026-06-18) — dependency_map: add the Stage key flag.
-- NOT a migration. Applied directly to the linked DB via
--   supabase db query --linked --file <this file>
-- Re-runnable: guarded by NOT EXISTS so a second run is a safe no-op and never
-- creates a duplicate row. Must be re-applied after a fresh DB rebuild (the
-- Migration 016 seed does not contain this row).
--
-- A stage deck order needs a stage key (the tool that locks adjacent 4'x4'
-- deck sections together). The morning checklist had no stage-deck trigger —
-- only stage stair / stage railing rows (Crescent wrench). This adds a keyword
-- rule on the deck item name.
--
-- Keyword 'STAGE 4'' substring-matches deck line items like "STAGE 4'X4'".
-- ruleFires() lowercases both sides (dependencyHits.ts), so case is irrelevant.
-- Touches ONLY this row.

INSERT INTO public.dependency_map
  (trigger_type, trigger_value, quantity_threshold, required_item, required_quantity, notes)
SELECT 'keyword', 'STAGE 4''', 1, 'Stage key', 1, 'Locks stage deck sections together'
WHERE NOT EXISTS (
  SELECT 1 FROM public.dependency_map
   WHERE trigger_type  = 'keyword'
     AND trigger_value = 'STAGE 4'''
     AND required_item = 'Stage key'
);
