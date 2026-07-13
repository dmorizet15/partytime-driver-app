-- ─── Equipment returns — repair the 2026-07-13 false "left on site" alerts ───
-- First live pickup day for Equipment Return Tracking. The pickup crews DID
-- retrieve the equipment, but the confirm card sat below an item list they
-- never had to scroll (ItemCheckoffPanel's "Confirm all" is at its top, the
-- Complete CTA is pinned) — so zero pickup rows were written, the final-pickup
-- ledger read `retrieved 0`, and dispatch was emailed that the equipment was
-- left behind. Root cause fixed in-app the same day (completion now ASKS on any
-- positive expected balance; the card moved above the manifest).
--
-- This patch makes the ledger tell the truth for the two affected reservations:
-- Darren confirmed with the crews that everything came back.
--
--   fa3c1d15  AMY GOETZ   — pickup e8b03117 — 1 chair cart + 1 extension cord
--   3848dbfd  Tyler Cross — pickup 40c9cb4c — 2 chair carts
--
-- created_by is left NULL on purpose: these rows were entered by dispatch after
-- the fact, not captured by the crew in the app. Re-runnable.

-- 1. Write the retrieval rows the crews would have confirmed in-app.
insert into stop_equipment_returns (stop_id, equipment_key, quantity, created_by)
values
  ('e8b03117-f82f-41b6-8a5e-8813d5131abb', 'chair_carts',     1, null),
  ('e8b03117-f82f-41b6-8a5e-8813d5131abb', 'extension_cords', 1, null),
  ('40c9cb4c-1cb8-4344-9d6d-7a7f2999aca5', 'chair_carts',     2, null)
on conflict (stop_id, equipment_key) do update
  set quantity = excluded.quantity,
      updated_at = now();

-- 2. Clear the false alerts. This also releases the once-per-reservation insert
--    gate — harmless, since the ledger above now balances to zero and the
--    final-pickup check can no longer find a discrepancy to alert on.
delete from equipment_return_alerts
where reservation_id in (
  'fa3c1d15-089d-426a-9042-109c23682cd1',
  '3848dbfd-7994-4534-96b4-8a33f575ea18'
);
