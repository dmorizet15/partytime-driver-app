-- 30-Wide Frame Tent Spreader Q&As + 30x45 answer update
-- June 21, 2026 — spreader count for 30x45 confirmed by Darren (was 6 in Notion, correct is 11)

-- Add spreader Q&As for both sizes
INSERT INTO ava_knowledge (question, answer, category, status) VALUES

('How many spreaders does the 30 by 30 frame tent have?',
 '8 spreaders — 14-foot 4-inch spreaders.',
 'tents', 'published'),

('How many spreaders does the 30 by 45 frame tent have?',
 '11 spreaders — 14-foot 4-inch spreaders.',
 'tents', 'published');

-- Update the 30x45 comprehensive answer to include spreader count now that it's confirmed
UPDATE ava_knowledge
SET answer = '30 by 45 traditional frame — two end sections and one 15-foot mid. Two 6-Way Crowns. 4 hip rafters and 6 rafters. 11 spreaders. 10 legs with offset foot pads. 14 double-head stakes and 14 ropes. 599 pounds complete. 1,350 square feet. Fred''s item 11500.'
WHERE question = 'What goes on the 30 by 45 frame tent?';

-- Verify
SELECT COUNT(*) AS total_tent_entries FROM ava_knowledge WHERE category = 'tents';
SELECT question, answer FROM ava_knowledge WHERE question ILIKE '%spreader%';
SELECT question, LEFT(answer, 100) FROM ava_knowledge WHERE question = 'What goes on the 30 by 45 frame tent?';
