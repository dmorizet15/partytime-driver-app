-- ============================================================
-- AVA Inflatable Specs Batch — June 2026
-- 1 UPDATE  (existing Pirate Battle partial-dupe row)
-- 56 INSERTs (all other inflatables)
-- category = 'inflatables' | source = 'inflatable_specs'
-- status omitted — defaults to 'published'
-- Source data: INFLATABLE_WORKSHEET.xlsx + Book_1.xlsx
-- Typos corrected: ISALND→ISLAND, MIDEVAL→MEDIEVAL, SEARGEANT→SERGEANT
-- ============================================================

-- ── Step 1: Update existing Pirate Battle entry ─────────────
UPDATE ava_knowledge
SET
  question       = 'What does the Pirate Battle need to set up?',
  answer         = 'Pirate Battle — Bin R1-9 — takes 3 blowers at 2 HP each. Stakes: 8 hook stakes and 2 large stakes. Accessories: colored ball pit balls and ball launcher cannons.',
  category       = 'inflatables',
  source         = 'inflatable_specs',
  last_edited_at = now()
WHERE question ILIKE '%pirate battle%';

SELECT COUNT(*) AS pirate_battle_rows_updated
FROM ava_knowledge
WHERE question ILIKE '%pirate battle%';

-- ── Step 2: Insert 56 remaining inflatables ─────────────────
INSERT INTO ava_knowledge (question, answer, category, source) VALUES

-- R1 Rack
('What does the Dream Castle 15x15 need to set up?', 'Dream Castle 15x15 — Bin R1-1 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Fire Truck need to set up?', 'Fire Truck — Bin R1-2 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 7 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Rocket Bounce need to set up?', 'Rocket Bounce — Bin R1-3 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Beagle Belly need to set up?', 'Beagle Belly — Bin R1-4 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Castle 13x13 need to set up?', 'Castle 13x13 — Bin R1-5 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Medieval Castle need to set up?', 'Medieval Castle — Bin R1-6 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Cliffhanger need to set up?', 'Cliffhanger — Bin R1-7 — takes 1 blower at 2.5 HP. Stakes: 6 hook stakes and 6 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Sergeant Combo need to set up?', 'Sergeant Combo — Bin R1-8 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Boulder Dash need to set up?', 'Boulder Dash — Bin R1-10 — takes 2 blowers at 2.5 HP each. Stakes: 8 hook stakes and 8 large stakes. Accessories: stems and boulders.', 'inflatables', 'inflatable_specs'),

-- R2 Rack
('What does the Birthday Cake Combo need to set up?', 'Birthday Cake Combo — Bin R2-1 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes and 1 large stake. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Xtreme Arena High Voltage need to set up?', 'Xtreme Arena High Voltage — Bin R2-2 — takes 1 blower at 1.5 HP. Stakes: 8 hook stakes. Accessories: tap lights and a speaker.', 'inflatables', 'inflatable_specs'),
('What does the Block Party Bouncer need to set up?', 'Block Party Bouncer — Bin R2-3 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the 15x15 Bouncer need to set up?', '15x15 Bouncer — Bin R2-4 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Joust need to set up?', 'Joust — Bin R2-5 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes. Accessories: red and blue stands, 2 helmets, and 2 jousting sticks.', 'inflatables', 'inflatable_specs'),
('What does the 40-Foot Challenge need to set up?', '40'' Challenge — Bin R2-6 — takes 1 blower at 1 HP. Stakes: 8 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Rock Climb Slide need to set up?', 'Rock Climb Slide — Bin R2-7 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the 40-Foot Rush need to set up?', '40'' Rush — Bin R2-8 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the High Voltage Warped Wall need to set up?', 'High Voltage Warped Wall — Bin R2-9 — takes 2 blowers at 1.5 HP each. Stakes: 6 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Hippo Showdown need to set up?', 'Hippo Showdown — Bin R2-10 — takes 1 blower at 1.5 HP. Stakes: 8 hook stakes. Accessories: hippo balls and 4 harnesses.', 'inflatables', 'inflatable_specs'),

-- R3 Rack
('What does the Vertical Rush need to set up?', 'Vertical Rush — Bins R3-1 and R3-2 — we''ve got two units, both with the same setup. Each takes 2 blowers at 2 HP each. Stakes: 6 hook stakes and 6 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Heart Pumper Slide need to set up?', 'Heart Pumper Slide — Bin R3-3 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Heart Pumper Obstacle need to set up?', 'Heart Pumper Obstacle — Bin R3-4 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Boombox need to set up?', 'Boombox — Bin R3-5 — takes 1 blower at 1.5 HP. Stakes: 8 hook stakes. Accessories: 2 Bluetooth speakers and lights — but only if the customer purchased that package.', 'inflatables', 'inflatable_specs'),
('What does the Island Paradise Dual Lane need to set up?', 'Island Paradise Dual Lane — Bin R3-6 — takes 1 blower at 2 HP. Stakes: 16 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Toxic Rock Climb need to set up?', 'Toxic Rock Climb — Bin R3-7 — takes 1 blower at 1.5 HP. Stakes: 8 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Toxic 30-Foot Obstacle Course need to set up?', 'Toxic 30'' Obstacle Course — Bin R3-8 — takes 1 blower at 1 HP. Stakes: 6 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Toxic Radical Run need to set up?', 'Toxic Radical Run — Bin R3-9 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the High Voltage Obstacle Grinder need to set up?', 'High Voltage Obstacle Grinder — Bin R3-10 — takes 2 blowers at 1.5 HP each. Stakes: 8 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),

-- R4 Rack
('What does the Roaring Falls Dry Slide need to set up?', 'Roaring Falls Dry Slide — Bin R4-1 — takes 1 blower at 2.5 HP. Stakes: 12 hook stakes and 6 large stakes. Note: pair this with the Running River if the customer ordered the wet slide setup.', 'inflatables', 'inflatable_specs'),
('What does the Running River need to set up?', 'Running River — Bin R4-2 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes. No accessories needed. Pairs with the Roaring Falls Dry Slide for a full wet slide setup.', 'inflatables', 'inflatable_specs'),
('What does the Wild Rapids need to set up?', 'Wild Rapids — Bin R4-3 — takes 1 blower at 2 HP. Stakes: 4 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Jump and Splash Under the Sea need to set up?', 'Jump and Splash Under the Sea — Bin R4-4 — takes 1 blower at 2 HP. Stakes: 7 hook stakes and 1 large stake. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Jump and Splash Red and Blue need to set up?', 'Jump and Splash Red and Blue — Bin R4-5 — takes 1 blower at 2 HP. Stakes: 7 hook stakes and 1 large stake. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Jump and Splash Balloon Combo need to set up?', 'Jump and Splash Balloon Combo — Bin R4-6 — takes 1 blower at 2 HP. Stakes: 5 hook stakes and 1 large stake. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Jump and Splash Tropical Combo need to set up?', 'Jump and Splash Tropical Combo — Bin R4-7 — takes 1 blower at 2 HP. Stakes: 7 hook stakes and 1 large stake. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Running River Dual Lane need to set up?', 'Running River Dual Lane — Bin R4-8 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Emerald Ice need to set up?', 'Emerald Ice — Bin R4-9 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 3 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Fire N Ice need to set up?', 'Fire N Ice — Bin R4-10 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 3 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),

-- R5 Rack
('What does the Rip N Dip need to set up?', 'Rip N Dip — Bin R5-5 — takes 1 blower at 1.5 HP. Stakes: 6 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Tropical Splash Water Slide need to set up?', 'Tropical Splash Water Slide — Bin R5-6 — takes 1 blower at 2 HP. Stakes: 6 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Slip N Dip need to set up?', 'Slip N Dip — Bin R5-7 — takes 1 blower at 1 HP. Stakes: 6 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the 18-Foot Splash Mountain need to set up?', '18'' Splash Mountain — Bin R5-8 — takes 1 blower at 2 HP. Stakes: 8 hook stakes and 6 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Caustic Drop need to set up?', 'Caustic Drop — Bin R5-9 — takes 2 blowers at 1.5 HP each. Stakes: 6 hook stakes and 4 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),

-- S Rack
('What does the Leaps and Bounds need to set up?', 'Leaps and Bounds — Bins S7-9 and S7-10 — we''ve got two units, both with the same setup. Each takes 2 blowers at 1.5 HP each. Stakes: 8 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Big Plunge need to set up?', 'Big Plunge — Bin S1-2 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Tsunami need to set up?', 'Tsunami — Bin S1-4 — takes 1 blower at 2 HP. Stakes: 6 hook stakes and 2 large stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),

-- U Bins (Book_1.xlsx)
('What does the Water Balloon Battle need to set up?', 'Water Balloon Battle — Bin U1 — takes 1 blower at 1 HP. Stakes: 6 hook stakes and 2 large stakes. Accessories: water balloon filling station.', 'inflatables', 'inflatable_specs'),
('What does the Soccer Darts need to set up?', 'Soccer Darts — Bin U2 — takes 1 blower at 1 HP. Stakes: 4 hook stakes and 4 large stakes. Accessories: soccer balls.', 'inflatables', 'inflatable_specs'),
('What does the Crayon Playland need to set up?', 'Crayon Playland — Bin U3 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the UFO need to set up?', 'UFO — Bin U4 — takes 1 carpet blower at 1 HP — make sure it''s the carpet blower, not a standard one. Stakes: 8 hook stakes. Accessories: 8 laser tag guns, 1 fog machine, and 1 light.', 'inflatables', 'inflatable_specs'),
('What does the Barnyard Bounce need to set up?', 'Barnyard Bounce — Bin U5 — takes 1 blower at 1.5 HP. Stakes: 11 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Viking Axe Throw need to set up?', 'Viking Axe Throw — Bin U6 — takes 1 blower at 1.5 HP. Stakes: 4 hook stakes. Accessories: 3 blue axes and 3 red axes.', 'inflatables', 'inflatable_specs'),
('What does the Dance Dome need to set up?', 'Dance Dome — Bin U7 — takes 2 blowers at 1.5 HP each. Stakes: 8 hook stakes. Accessories: 1 dance dome light and 1 speaker.', 'inflatables', 'inflatable_specs'),
('What does the Beyond the Sea Mini need to set up?', 'Beyond the Sea Mini — Bin U8 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. No accessories needed.', 'inflatables', 'inflatable_specs'),
('What does the Whack a Mole need to set up?', 'Whack a Mole — Bin U9 — takes 1 blower at 1 HP. Stakes: 8 hook stakes. Accessories: hammer and balls.', 'inflatables', 'inflatable_specs'),
('What does the Sports Cage need to set up?', 'Sports Cage — Bin U10 — takes 1 blower at 1 HP. Stakes: 4 hook stakes. Accessories: radar gun and 3 baseballs.', 'inflatables', 'inflatable_specs');

-- ── Verification ─────────────────────────────────────────────
SELECT COUNT(*) AS total_inflatable_entries FROM ava_knowledge WHERE category = 'inflatables';

SELECT question, answer FROM ava_knowledge WHERE question ILIKE '%wild rapids%';

SELECT question, LEFT(answer, 60) AS answer_preview FROM ava_knowledge WHERE category = 'inflatables' ORDER BY question;
