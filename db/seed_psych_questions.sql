-- =====================================================
-- SOLVO Seed Data: psych_questions
-- 50 Big Five Personality Questions
-- 10 per trait, mix of positive (+1) and negative (-1) polarity
-- =====================================================
-- Run this in Supabase SQL Editor AFTER init.sql
-- =====================================================

INSERT INTO public.psych_questions (question_text, trait, polarity) VALUES

-- =====================================================
-- OPENNESS (10 questions)
-- =====================================================
('I have a vivid imagination.',                                         'openness',  1),
('I am interested in abstract ideas.',                                  'openness',  1),
('I enjoy experiencing new and different things.',                      'openness',  1),
('I enjoy thinking about complex problems.',                            'openness',  1),
('I find beauty in things others might not notice.',                    'openness',  1),
('I enjoy reading challenging books and articles.',                     'openness',  1),
('I do not enjoy going to art museums.',                                'openness', -1),
('I tend to avoid philosophical discussions.',                          'openness', -1),
('I find it difficult to understand abstract ideas.',                   'openness', -1),
('I prefer routine over trying new experiences.',                       'openness', -1),

-- =====================================================
-- CONSCIENTIOUSNESS (10 questions)
-- =====================================================
('I am always prepared before starting a task.',                        'conscientiousness',  1),
('I pay attention to details.',                                         'conscientiousness',  1),
('I follow a schedule and stick to it.',                                'conscientiousness',  1),
('I get chores done right away.',                                       'conscientiousness',  1),
('I am careful to avoid making mistakes.',                              'conscientiousness',  1),
('I work hard to achieve my goals.',                                    'conscientiousness',  1),
('I often forget to put things back in their proper place.',            'conscientiousness', -1),
('I find it difficult to stay organized.',                              'conscientiousness', -1),
('I often leave tasks unfinished.',                                     'conscientiousness', -1),
('I waste a lot of time before settling down to work.',                 'conscientiousness', -1),

-- =====================================================
-- EXTRAVERSION (10 questions)
-- =====================================================
('I feel comfortable around people.',                                   'extraversion',  1),
('I start conversations easily.',                                       'extraversion',  1),
('I enjoy being the center of attention.',                              'extraversion',  1),
('I feel energized after spending time with a group of people.',        'extraversion',  1),
('I am talkative and expressive.',                                      'extraversion',  1),
('I enjoy going to social events and parties.',                         'extraversion',  1),
('I prefer to spend time alone rather than with others.',               'extraversion', -1),
('I find it hard to approach and talk to strangers.',                   'extraversion', -1),
('I keep in the background in social situations.',                      'extraversion', -1),
('I feel drained after social interactions.',                           'extraversion', -1),

-- =====================================================
-- AGREEABLENESS (10 questions)
-- =====================================================
('I am interested in people and their feelings.',                       'agreeableness',  1),
('I sympathize with others feelings.',                                  'agreeableness',  1),
('I take time out for others.',                                         'agreeableness',  1),
('I feel others emotions as if they were my own.',                      'agreeableness',  1),
('I make people feel at ease.',                                         'agreeableness',  1),
('I am always willing to help others.',                                 'agreeableness',  1),
('I am not really interested in others problems.',                      'agreeableness', -1),
('I insult people.',                                                    'agreeableness', -1),
('I am indifferent to the feelings of others.',                         'agreeableness', -1),
('I believe people should look after themselves.',                      'agreeableness', -1),

-- =====================================================
-- NEUROTICISM (10 questions)
-- =====================================================
('I get stressed out easily.',                                          'neuroticism',  1),
('I am easily disturbed by things around me.',                          'neuroticism',  1),
('I get upset easily when things do not go as planned.',                'neuroticism',  1),
('I worry about things more than I should.',                            'neuroticism',  1),
('I frequently feel sad or down.',                                      'neuroticism',  1),
('I experience mood swings regularly.',                                 'neuroticism',  1),
('I am relaxed and handle stress well.',                                'neuroticism', -1),
('I rarely feel anxious or nervous.',                                   'neuroticism', -1),
('I am emotionally stable and not easily upset.',                       'neuroticism', -1),
('I seldom feel blue or depressed.',                                    'neuroticism', -1)

-- Add ON CONFLICT clause to ignore duplicates
ON CONFLICT (question_text) DO NOTHING;

-- =====================================================
-- VERIFY: Should return 50
-- =====================================================
SELECT COUNT(*) AS total_questions,
       trait,
       COUNT(*) AS questions_per_trait
FROM public.psych_questions
GROUP BY trait
ORDER BY trait;