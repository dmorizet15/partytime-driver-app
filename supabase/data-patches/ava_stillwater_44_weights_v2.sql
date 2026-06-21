-- Stillwater 44-Wide Weights Update + Tent Top Q&As
-- Updates existing total-weight answers to include tent top breakdown
-- Adds 5 new tent-top-only Q&As
-- June 21, 2026

-- ── UPDATE existing weight entries to include tent top ─────────────────────
UPDATE ava_knowledge SET answer =
 'Stillwater 44 by 43 — approximately 985 pounds complete. Tent top fabric sections alone: approximately 310 pounds — two end sections at 155 pounds each.'
WHERE question = 'How much does the Stillwater 44 by 43 sailcloth weigh?';

UPDATE ava_knowledge SET answer =
 'Stillwater 44 by 63 — approximately 1,345 pounds complete. Tent top fabric sections alone: approximately 436 pounds — two end sections at 155 pounds each and one mid section at 126 pounds.'
WHERE question = 'How much does the Stillwater 44 by 63 sailcloth weigh?';

UPDATE ava_knowledge SET answer =
 'Stillwater 44 by 83 — approximately 1,705 pounds complete. Tent top fabric sections alone: approximately 562 pounds — two end sections at 155 pounds each and two mid sections at 126 pounds each.'
WHERE question = 'How much does the Stillwater 44 by 83 sailcloth weigh?';

UPDATE ava_knowledge SET answer =
 'Stillwater 44 by 103 — approximately 2,065 pounds complete. Tent top fabric sections alone: approximately 688 pounds — two end sections at 155 pounds each and three mid sections at 126 pounds each.'
WHERE question = 'How much does the Stillwater 44 by 103 sailcloth weigh?';

UPDATE ava_knowledge SET answer =
 'Stillwater 44 by 123 — approximately 2,452 pounds complete. Tent top fabric sections alone: approximately 814 pounds — two end sections at 155 pounds each and four mid sections at 126 pounds each.'
WHERE question = 'How much does the Stillwater 44 by 123 sailcloth weigh?';

-- ── INSERT tent-top-only Q&As ──────────────────────────────────────────────
INSERT INTO ava_knowledge (question, answer, category, status) VALUES

('How much does just the 44 by 43 Stillwater tent top weigh?',
 '44 by 43 Stillwater tent top — approximately 310 pounds. Two end sections at 155 pounds each.',
 'tents', 'published'),

('How much does just the 44 by 63 Stillwater tent top weigh?',
 '44 by 63 Stillwater tent top — approximately 436 pounds. Two end sections at 155 pounds each and one mid section at 126 pounds.',
 'tents', 'published'),

('How much does just the 44 by 83 Stillwater tent top weigh?',
 '44 by 83 Stillwater tent top — approximately 562 pounds. Two end sections at 155 pounds each and two mid sections at 126 pounds each.',
 'tents', 'published'),

('How much does just the 44 by 103 Stillwater tent top weigh?',
 '44 by 103 Stillwater tent top — approximately 688 pounds. Two end sections at 155 pounds each and three mid sections at 126 pounds each.',
 'tents', 'published'),

('How much does just the 44 by 123 Stillwater tent top weigh?',
 '44 by 123 Stillwater tent top — approximately 814 pounds. Two end sections at 155 pounds each and four mid sections at 126 pounds each.',
 'tents', 'published');

-- ── Verify ────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS total_tent_entries FROM ava_knowledge WHERE category = 'tents';

SELECT question, LEFT(answer, 90) AS answer_preview
FROM ava_knowledge
WHERE category = 'tents' AND question ILIKE '%weigh%'
ORDER BY question;
