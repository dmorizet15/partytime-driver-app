-- Wall/Ladder dependency_map fix — 2026-06-06
-- Broadened keyword 'sidewall' → 'wall', threshold 5→1, required_qty 2→1
-- Fixes: walls named 'MQSW 8'X10' SOLID WHITE WALL' were not triggering ladder checklist item
-- Safe to re-run: UPDATE is idempotent against the same row
--
-- WHERE matches by trigger_type + required_item (NOT trigger_value) so it also
-- re-applies cleanly after a fresh DB rebuild, where the Migration 016 seed
-- recreates this row with the old 'sidewall'/threshold-5 values.

UPDATE dependency_map
SET
  trigger_value = 'wall',
  quantity_threshold = 1,
  required_quantity = 1,
  notes = 'Any wall item on route requires a ladder. Keyword covers wall, sidewall, solid white wall, etc.'
WHERE trigger_type = 'keyword'
  AND required_item ILIKE '%ladder%';
