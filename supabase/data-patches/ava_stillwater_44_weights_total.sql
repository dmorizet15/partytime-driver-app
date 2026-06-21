-- Stillwater 44-Wide Total Weight Q&As (base entries — missed in prior patch)
-- June 21, 2026

INSERT INTO ava_knowledge (question, answer, category, status) VALUES

('How much does the Stillwater 44 by 43 sailcloth weigh?',
 'Stillwater 44 by 43 — approximately 985 pounds complete. Tent top fabric sections alone: approximately 310 pounds — two end sections at 155 pounds each.',
 'tents', 'published'),

('How much does the Stillwater 44 by 63 sailcloth weigh?',
 'Stillwater 44 by 63 — approximately 1,345 pounds complete. Tent top fabric sections alone: approximately 436 pounds — two end sections at 155 pounds each and one mid section at 126 pounds.',
 'tents', 'published'),

('How much does the Stillwater 44 by 83 sailcloth weigh?',
 'Stillwater 44 by 83 — approximately 1,705 pounds complete. Tent top fabric sections alone: approximately 562 pounds — two end sections at 155 pounds each and two mid sections at 126 pounds each.',
 'tents', 'published'),

('How much does the Stillwater 44 by 103 sailcloth weigh?',
 'Stillwater 44 by 103 — approximately 2,065 pounds complete. Tent top fabric sections alone: approximately 688 pounds — two end sections at 155 pounds each and three mid sections at 126 pounds each.',
 'tents', 'published'),

('How much does the Stillwater 44 by 123 sailcloth weigh?',
 'Stillwater 44 by 123 — approximately 2,452 pounds complete. Tent top fabric sections alone: approximately 814 pounds — two end sections at 155 pounds each and four mid sections at 126 pounds each.',
 'tents', 'published');

-- Verify
SELECT COUNT(*) AS total_tent_entries FROM ava_knowledge WHERE category = 'tents';

SELECT question, LEFT(answer, 90) AS answer_preview
FROM ava_knowledge
WHERE category = 'tents' AND question ILIKE '%weigh%'
ORDER BY question;
