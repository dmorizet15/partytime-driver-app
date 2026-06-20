-- Inflatable checklist rules: match on CATEGORY, not item NAME.
--
-- Bug (found 2026-06-20): the Hammer + Hand truck rules in dependency_map used
-- trigger_type='keyword' with trigger_value='inflatable', which dependencyHits.ts
-- matches against item.NAME (it.name.includes(tv)). Real inflatable products are
-- categorized 'INFLATABLES' but NEVER named "inflatable" (e.g. "BLOCK PARTY
-- BOUNCER", "TOXIC OBSTACLE 30'", "HOT AIR BALLOON COMBO"). Across 98 live
-- INFLATABLES line items, ZERO had "inflatable" in the name -- so the rule never
-- fired and drivers (e.g. Austin, Route 2, 2026-06-20) saw no Hammer.
-- A dashboard edit to trigger_value='inflatable; Inflatable' made it worse:
-- matching is a single literal .includes() (no ';' splitting) and case-insensitive
-- (both sides lowercased), so it searched names for the literal "inflatable; inflatable".
--
-- Fix: convert both inflatable rules to trigger_type='category',
-- trigger_value='INFLATABLES' -- mirroring the working TENTS -> Sledgehammer rule.
-- category rules compare it.category.toLowerCase() === trigger_value.toLowerCase(),
-- so 'INFLATABLES' (any case) matches the 'INFLATABLES' category exactly.
--
-- Re-runnable / idempotent. WHERE keys off required_item + trigger_value ILIKE
-- '%inflat%' so it re-corrects after a fresh DB rebuild restores the broken
-- Migration 016 keyword seed. Verify with dependencyHits.ts ruleFires().

-- Hammer: any inflatable on the manifest -> carry a hammer.
UPDATE dependency_map
SET trigger_type = 'category',
    trigger_value = 'INFLATABLES'
WHERE required_item ILIKE '%hammer%'
  AND required_item NOT ILIKE '%sledge%'
  AND trigger_value ILIKE '%inflat%';

-- Hand truck: any inflatable on the manifest -> carry a hand truck.
UPDATE dependency_map
SET trigger_type = 'category',
    trigger_value = 'INFLATABLES'
WHERE required_item ILIKE '%hand truck%'
  AND trigger_value ILIKE '%inflat%';
