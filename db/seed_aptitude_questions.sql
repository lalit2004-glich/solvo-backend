-- =====================================================
-- SOLVO Seed Data: aptitude_questions
-- 30 MCQ Questions (10 per category)
-- Categories: numerical, verbal, creative
-- =====================================================
-- Run this in Supabase SQL Editor AFTER init.sql
-- =====================================================

-- DELETE existing questions first (idempotent seeding)
DELETE FROM aptitude_questions;

INSERT INTO public.aptitude_questions
  (id, question_text, option_a, option_b, option_c, option_d, correct_answer, category)
VALUES

-- =====================================================
-- NUMERICAL (10 questions)
-- =====================================================
(gen_random_uuid(), 'If a train travels 120 km in 2 hours, what is its speed in km/h?', '40', '60', '80', '100', 'B', 'numerical'),
(gen_random_uuid(), 'What is 15% of 200?', '20', '25', '30', '35', 'C', 'numerical'),
(gen_random_uuid(), 'A shopkeeper buys an item for Rs.400 and sells it for Rs.500. What is the profit percentage?', '20%', '25%', '30%', '15%', 'B', 'numerical'),
(gen_random_uuid(), 'If 6 workers can complete a job in 12 days, how many days will 9 workers take?', '6', '8', '10', '12', 'B', 'numerical'),
(gen_random_uuid(), 'What is the next number in the series: 2, 6, 12, 20, 30, ?', '40', '42', '44', '46', 'B', 'numerical'),
(gen_random_uuid(), 'A rectangle has a length of 10 cm and width of 6 cm. What is its area?', '32 cm²', '60 cm²', '48 cm²', '16 cm²', 'B', 'numerical'),
(gen_random_uuid(), 'If X + Y = 10 and X - Y = 4, what is the value of X?', '5', '6', '7', '8', 'C', 'numerical'),
(gen_random_uuid(), 'What is the simple interest on Rs.1000 at 5% per annum for 3 years?', 'Rs.100', 'Rs.150', 'Rs.200', 'Rs.250', 'B', 'numerical'),
(gen_random_uuid(), 'A car depreciates by 10% every year. If it costs Rs.100,000 today, what will it cost after 2 years?', 'Rs.80,000', 'Rs.81,000', 'Rs.82,000', 'Rs.85,000', 'B', 'numerical'),
(gen_random_uuid(), 'If the ratio of boys to girls in a class is 3:2 and there are 30 students total, how many boys are there?', '12', '15', '18', '20', 'C', 'numerical'),

-- =====================================================
-- VERBAL (10 questions)
-- =====================================================
(gen_random_uuid(), 'Choose the word most similar in meaning to ELOQUENT.', 'Silent', 'Fluent', 'Angry', 'Confused', 'B', 'verbal'),
(gen_random_uuid(), 'Choose the word opposite in meaning to BENEVOLENT.', 'Kind', 'Generous', 'Malicious', 'Helpful', 'C', 'verbal'),
(gen_random_uuid(), 'Fill in the blank: She was so tired that she could _____ keep her eyes open.', 'Barely', 'Easily', 'Often', 'Never', 'A', 'verbal'),
(gen_random_uuid(), 'Which sentence is grammatically correct?', 'He don t know the answer.', 'He doesn t knows the answer.', 'He doesn t know the answer.', 'He not know the answer.', 'C', 'verbal'),
(gen_random_uuid(), 'BIRD is to FLOCK as FISH is to:', 'Pack', 'School', 'Herd', 'Swarm', 'B', 'verbal'),
(gen_random_uuid(), 'Choose the correctly spelled word.', 'Accomodate', 'Accommodate', 'Acommodate', 'Acomodate', 'B', 'verbal'),
(gen_random_uuid(), 'What does the idiom "bite the bullet" mean?', 'To eat something hard', 'To endure a painful situation', 'To argue aggressively', 'To give up quickly', 'B', 'verbal'),
(gen_random_uuid(), 'HOT is to COLD as DAY is to:', 'Sun', 'Light', 'Night', 'Warm', 'C', 'verbal'),
(gen_random_uuid(), 'Identify the synonym of VERBOSE.', 'Brief', 'Wordy', 'Quiet', 'Sharp', 'B', 'verbal'),
(gen_random_uuid(), 'Which of the following is a compound sentence?', 'She ran fast.', 'Although she was tired, she kept running.', 'She was tired, but she kept running.', 'Running fast, she finished first.', 'C', 'verbal'),

-- =====================================================
-- CREATIVE (10 questions)
-- =====================================================
(gen_random_uuid(), 'A man has 3 daughters. Each daughter has a brother. How many children does the man have?', '4', '6', '7', '3', 'A', 'creative'),
(gen_random_uuid(), 'Which of the following does NOT belong with the others?', 'Square', 'Circle', 'Triangle', 'Red', 'D', 'creative'),
(gen_random_uuid(), 'If you rearrange the letters CIFAIPC, you get the name of a:', 'City', 'Animal', 'Ocean', 'Country', 'C', 'creative'),
(gen_random_uuid(), 'A clock shows 3:15. What is the angle between the hour and minute hands?', '0°', '7.5°', '15°', '30°', 'B', 'creative'),
(gen_random_uuid(), 'What comes next in the pattern: O, T, T, F, F, S, S, ?', 'E', 'N', 'O', 'T', 'A', 'creative'),
(gen_random_uuid(), 'You have two buckets: 5L and 3L. How do you measure exactly 4 litres?', 'Fill 3L pour into 5L, fill 3L again pour into 5L until full, 1L remains; empty 5L, pour 1L in, fill 3L and add.', 'Fill the 5L bucket halfway.', 'Use both buckets at the same time.', 'It is not possible.', 'A', 'creative'),
(gen_random_uuid(), 'If all Bloops are Razzles and all Razzles are Lazzles, then all Bloops are definitely:', 'Not Lazzles', 'Lazzles', 'Not Razzles', 'None of the above', 'B', 'creative'),
(gen_random_uuid(), 'Which shape can be folded into a cube?', 'A triangle with 4 sides', 'A cross-shaped net with 6 squares', 'A circle divided into 6 parts', 'A rectangle divided into 4 parts', 'B', 'creative'),
(gen_random_uuid(), 'A farmer has 17 sheep. All but 9 die. How many sheep are left?', '8', '9', '17', '0', 'B', 'creative'),
(gen_random_uuid(), 'How many months have 28 days?', 'Only February', 'Only leap year February', 'All 12 months', '6 months', 'C', 'creative');

-- =====================================================
-- VERIFY: Should return 30 total (10 per category)
-- =====================================================
SELECT COUNT(*) AS total_questions,
       category,
       COUNT(*) AS questions_per_category
FROM public.aptitude_questions
GROUP BY category
ORDER BY category;