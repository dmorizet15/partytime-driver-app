-- Data patch (2026-06-02) — dependency_map checklist cleanup. NOT a migration:
-- no schema change, applied directly to the linked DB via
--   supabase db query --linked --file <this file>
-- Re-runnable: every statement is keyed so a second apply is a safe no-op.
--
-- Context: dependency_map is the AVA morning-checklist source-of-truth (Migration
-- 016 seed + Migration 021 tent tools). `notes` renders to drivers in
-- AvaChecklistSheet, so dev/internal text must not live there.
--
-- ISSUE 1 — strip dev artifacts from `notes` (keep the real-world text):
--   * Hammer / Sledgehammer carried "… — added Migration 021 (Fix 3)".
--   * Wood blocks carried an internal "… — keyword match only" implementation note.
--   * Ladders carried a "… — Lucas confirmed" interview attribution.
-- ISSUE 2 — Sledgehammer "appears twice": investigated, NO change needed. Exactly
--   one correctly-spelled 'Sledgehammer' row exists (category/TENTS); no
--   "sledge hammer" variant. Dedup (AvaChecklistSheet + the morning-card count)
--   keys on required_item and works. The only item with two rows is Hammer
--   (category/TENTS + keyword/inflatable) and those dedupe to one by design.
-- ISSUE 3 — Pry bar fired for EVERY tent item (category=TENTS) and showed the
--   note "Any MQ or tent item" to drivers. Pry bar is only for MQ cross-cable
--   frame tents. Production item names use the contiguous substring "CROSS CABLE"
--   (space, no hyphen); bare "MQ" also tags walls/doors (MQSW/MQDW/MQCW), so
--   "cross cable" is the precise keyword. Cleared the note + retargeted.

BEGIN;

UPDATE public.dependency_map SET notes = 'Tent setup'
 WHERE required_item = 'Hammer'       AND trigger_type = 'category' AND trigger_value = 'TENTS';

UPDATE public.dependency_map SET notes = 'Drive tent stakes'
 WHERE required_item = 'Sledgehammer' AND trigger_type = 'category' AND trigger_value = 'TENTS';

UPDATE public.dependency_map SET notes = 'Not needed for frame tents'
 WHERE required_item = 'Wood blocks'  AND trigger_type = 'keyword'  AND trigger_value = 'pole tent';

UPDATE public.dependency_map SET notes = '5+ walls threshold'
 WHERE required_item = 'Ladders'      AND trigger_type = 'keyword'  AND trigger_value = 'sidewall';

UPDATE public.dependency_map
   SET notes         = NULL,
       trigger_type  = 'keyword',
       trigger_value = 'cross cable'
 WHERE required_item = 'Pry bar'      AND trigger_type = 'category' AND trigger_value = 'TENTS';

COMMIT;
