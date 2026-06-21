-- Traditional 30-Wide CPB Frame Tent Specs
-- Fred's Tents & Canopies | Migrated from Notion Equipment Knowledge June 21, 2026
-- 30x30: All parts verified (weight cross-check: 480.7 lbs ≈ 481 lbs Notion ✓)
-- 30x45: Stakes/legs/ropes/weight confirmed. Spreader qty flagged VERIFY in Notion — omitted from answers.

-- Duplicate check
SELECT id, question FROM ava_knowledge
WHERE question ILIKE '%30%frame%' OR question ILIKE '%30 by 30%' OR question ILIKE '%30 by 45%';

-- ── Traditional Frame 30x30 ───────────────────────────────────────────────
INSERT INTO ava_knowledge (question, answer, category, status) VALUES

('What goes on the 30 by 30 frame tent?',
 '30 by 30 traditional frame — two end sections. One 8-Way Crown. 4 hip rafters and 4 rafters. 8 spreaders. 8 legs with offset foot pads. 12 double-head stakes and 12 ropes. 481 pounds complete. 900 square feet. Fred''s item 11498.',
 'tents', 'published'),

('How many stakes does the 30 by 30 frame tent get?',
 '12 double-head stakes and 12 ropes.',
 'tents', 'published'),

('How many legs does the 30 by 30 frame tent have?',
 '8 legs — 7-foot 8-inch legs with offset foot pads.',
 'tents', 'published'),

('How much does the 30 by 30 frame tent weigh?',
 '30 by 30 traditional frame — 481 pounds complete. 900 square feet.',
 'tents', 'published'),

-- ── Traditional Frame 30x45 ───────────────────────────────────────────────
('What goes on the 30 by 45 frame tent?',
 '30 by 45 traditional frame — two end sections and one 15-foot mid. Two 6-Way Crowns. 4 hip rafters and 6 rafters. 10 legs with offset foot pads. 14 double-head stakes and 14 ropes. 599 pounds complete. 1,350 square feet. Fred''s item 11500.',
 'tents', 'published'),

('How many stakes does the 30 by 45 frame tent get?',
 '14 double-head stakes and 14 ropes.',
 'tents', 'published'),

('How many legs does the 30 by 45 frame tent have?',
 '10 legs — 7-foot 8-inch legs with offset foot pads.',
 'tents', 'published'),

('How much does the 30 by 45 frame tent weigh?',
 '30 by 45 traditional frame — 599 pounds complete. 1,350 square feet.',
 'tents', 'published');

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS total_tent_entries FROM ava_knowledge WHERE category = 'tents';

SELECT question, LEFT(answer, 80) AS answer_preview
FROM ava_knowledge
WHERE category = 'tents' AND (question ILIKE '%30%' OR question ILIKE '%frame%')
ORDER BY question;
