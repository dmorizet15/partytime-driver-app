-- Migration 021 — dependency_map: clear stray note + add tent tools
--
-- FIX 2: the 'Zip ties' always-carry row (Migration 016 seed) carried a stray
--        note ("Dylan interview May 24") that has nothing to do with the item.
--        The item itself is a legit always-carry staple; only the note is wrong.
--        Clear the note, keep the row.
--
-- FIX 3: tent stops need a Hammer + Sledgehammer (driving stakes). Inflatable
--        stops already add Hammer + Hand truck (Migration 016 keyword rules), so
--        the only gap is the tent side. Add two category='TENTS' rules — the
--        same detection path the existing 'Pry bar' tent rule uses. The morning
--        checklist sheet dedupes triggered rows by required_item, so on a day
--        with BOTH tents and inflatables "Hammer" surfaces exactly once.
--
-- Idempotent: the UPDATE is naturally re-runnable; the INSERT is guarded by a
-- NOT EXISTS so re-applying this migration adds no duplicate rows.

-- FIX 2 — clear the stray zip-ties note.
UPDATE public.dependency_map
   SET notes = NULL
 WHERE required_item = 'Zip ties'
   AND trigger_type  = 'always';

-- FIX 3 — tent tooling (category 'TENTS', same trigger shape as the Pry bar rule).
INSERT INTO public.dependency_map
  (trigger_type, trigger_value, quantity_threshold, required_item, required_quantity, notes)
SELECT v.trigger_type, v.trigger_value, v.quantity_threshold, v.required_item, v.required_quantity, v.notes
FROM (VALUES
  ('category', 'TENTS', 1, 'Hammer',       1, 'Tent setup — added Migration 021 (Fix 3)'),
  ('category', 'TENTS', 1, 'Sledgehammer', 1, 'Drive tent stakes — added Migration 021 (Fix 3)')
) AS v(trigger_type, trigger_value, quantity_threshold, required_item, required_quantity, notes)
WHERE NOT EXISTS (
  SELECT 1
  FROM   public.dependency_map d
  WHERE  d.trigger_type  = v.trigger_type
    AND  d.trigger_value = v.trigger_value
    AND  d.required_item = v.required_item
);
