// =====================================================
// Big Five Personality Score Calculator
// =====================================================
// Production-Grade Refactored Version
// Pure mathematical utility with dynamic trait handling
// =====================================================

/**
 * Big Five personality traits
 */
export type BigFiveTrait = 
  | 'openness' 
  | 'conscientiousness' 
  | 'extraversion' 
  | 'agreeableness' 
  | 'neuroticism';

/**
 * Question polarity for scoring
 */
export type Polarity = 1 | -1;

/**
 * Psychology question structure
 */
export interface PsychQuestion {
  id: string;
  trait: BigFiveTrait;
  polarity: Polarity;
  question_text: string;
}

/**
 * User's answers to questions (question_id -> answer value 1-5)
 */
export type UserAnswers = Record<string, number>;

/**
 * Normalized Big Five scores (0-100 scale)
 */
export interface BigFiveScoreResult {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

/**
 * Internal trait score accumulator
 * IMPROVEMENT: Tracks both raw score and count dynamically
 */
interface TraitScores {
  openness: { raw: number; count: number };
  conscientiousness: { raw: number; count: number };
  extraversion: { raw: number; count: number };
  agreeableness: { raw: number; count: number };
  neuroticism: { raw: number; count: number };
}

/**
 * Likert scale constants
 * IMPROVEMENT: Removed hardcoded question counts
 */
const LIKERT_SCALE = {
  MIN: 1,
  MAX: 5,
  REVERSE_BASE: 6
} as const;

// =====================================================
// CORE CALCULATION FUNCTION
// =====================================================

/**
 * Calculate Big Five personality scores from user answers
 * 
 * IMPROVEMENTS:
 * - Dynamically handles any question distribution per trait
 * - No hardcoded question counts (removed 10/trait assumption)
 * - Flexible normalization based on actual distribution
 * - Pure mathematical logic only
 * 
 * @param userAnswers - Map of question IDs to answers (1-5 Likert scale)
 * @param questions - Array of questions with trait and polarity
 * @returns Normalized Big Five scores (0-100 scale)
 * @throws {Error} Validation or calculation errors
 */
export function calculateBigFiveScore(
  userAnswers: UserAnswers,
  questions: PsychQuestion[]
): BigFiveScoreResult {
  validateInputs(userAnswers, questions);
  const traitScores = accumulateTraitScores(userAnswers, questions);
  validateTraitDistribution(traitScores);
  return normalizeTraitScores(traitScores);
}

// =====================================================
// INTERNAL CALCULATION FUNCTIONS
// =====================================================

/**
 * Accumulate raw scores and question counts per trait
 * IMPROVEMENT: Counts questions dynamically instead of hardcoded validation
 */
function accumulateTraitScores(
  userAnswers: UserAnswers,
  questions: PsychQuestion[]
): TraitScores {
  const scores: TraitScores = {
    openness: { raw: 0, count: 0 },
    conscientiousness: { raw: 0, count: 0 },
    extraversion: { raw: 0, count: 0 },
    agreeableness: { raw: 0, count: 0 },
    neuroticism: { raw: 0, count: 0 }
  };

  for (const question of questions) {
    const answer = userAnswers[question.id];

    if (answer === undefined || answer === null) {
      throw new Error(`Missing answer for question: ${question.id}`);
    }

    if (!isValidLikertAnswer(answer)) {
      throw new Error(
        `Invalid answer ${answer} for question ${question.id}. Must be 1-5.`
      );
    }

    // Apply reverse scoring: 6 - answer for polarity -1
    const score = question.polarity === -1 
      ? LIKERT_SCALE.REVERSE_BASE - answer
      : answer;

    scores[question.trait].raw += score;
    scores[question.trait].count += 1;
  }

  return scores;
}

/**
 * Normalize trait scores to 0-100 scale
 * IMPROVEMENT: Delegates to per-trait normalization with dynamic ranges
 */
function normalizeTraitScores(traitScores: TraitScores): BigFiveScoreResult {
  return {
    openness: normalizeTraitScore(
      traitScores.openness.raw,
      traitScores.openness.count
    ),
    conscientiousness: normalizeTraitScore(
      traitScores.conscientiousness.raw,
      traitScores.conscientiousness.count
    ),
    extraversion: normalizeTraitScore(
      traitScores.extraversion.raw,
      traitScores.extraversion.count
    ),
    agreeableness: normalizeTraitScore(
      traitScores.agreeableness.raw,
      traitScores.agreeableness.count
    ),
    neuroticism: normalizeTraitScore(
      traitScores.neuroticism.raw,
      traitScores.neuroticism.count
    )
  };
}

/**
 * Normalize single trait score to 0-100 scale
 * IMPROVEMENT: Dynamic min/max calculation per trait
 * Formula: ((raw - minRaw) / (maxRaw - minRaw)) * 100
 * 
 * @param rawScore - Accumulated raw score
 * @param questionCount - Number of questions for this trait
 * @returns Normalized score 0-100
 */
function normalizeTraitScore(rawScore: number, questionCount: number): number {
  const minRaw = questionCount * LIKERT_SCALE.MIN;
  const maxRaw = questionCount * LIKERT_SCALE.MAX;
  const range = maxRaw - minRaw;

  if (range === 0) {
    throw new Error('Cannot normalize: question count resulted in zero range');
  }

  const normalized = ((rawScore - minRaw) / range) * 100;

  // Clamp to 0-100 and round to 2 decimals
  return Math.round(Math.max(0, Math.min(100, normalized)) * 100) / 100;
}

// =====================================================
// VALIDATION FUNCTIONS
// =====================================================

/**
 * Validate Likert scale answer
 * IMPROVEMENT: Explicit integer check
 */
function isValidLikertAnswer(answer: number): boolean {
  return (
    Number.isInteger(answer) &&
    answer >= LIKERT_SCALE.MIN &&
    answer <= LIKERT_SCALE.MAX
  );
}

/**
 * Validate basic input requirements
 * IMPROVEMENT: Removed hardcoded total question count validation
 */
function validateInputs(
  userAnswers: UserAnswers,
  questions: PsychQuestion[]
): void {
  if (!userAnswers || typeof userAnswers !== 'object') {
    throw new Error('userAnswers must be a valid object');
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('questions must be a non-empty array');
  }

  // Validate question structure
  for (const question of questions) {
    if (!question.id || !question.trait) {
      throw new Error('Invalid question: missing id or trait');
    }

    if (question.polarity !== 1 && question.polarity !== -1) {
      throw new Error(
        `Invalid polarity for question ${question.id}. Must be 1 or -1.`
      );
    }
  }
}

/**
 * Validate trait distribution
 * IMPROVEMENT: Only checks that each trait has at least one question
 */
function validateTraitDistribution(traitScores: TraitScores): void {
  const traits: BigFiveTrait[] = [
    'openness',
    'conscientiousness',
    'extraversion',
    'agreeableness',
    'neuroticism'
  ];

  for (const trait of traits) {
    if (traitScores[trait].count === 0) {
      throw new Error(`No questions found for trait: ${trait}`);
    }
  }
}

// =====================================================
// OPTIONAL DEBUGGING UTILITY
// =====================================================

/**
 * Calculate raw scores without normalization
 * Useful for debugging or psychometric analysis
 */
export function calculateRawScores(
  userAnswers: UserAnswers,
  questions: PsychQuestion[]
): Record<BigFiveTrait, { raw: number; count: number }> {
  validateInputs(userAnswers, questions);
  const traitScores = accumulateTraitScores(userAnswers, questions);
  
  return {
    openness: traitScores.openness,
    conscientiousness: traitScores.conscientiousness,
    extraversion: traitScores.extraversion,
    agreeableness: traitScores.agreeableness,
    neuroticism: traitScores.neuroticism
  };
}