/**
 * The function handles the submission of a psychometric test, including parsing and validating the
 * request, authenticating the user, rate limiting, idempotency protection, fetching and validating
 * questions, validating user answers, calculating scores, and persisting results to a database with
 * error handling.
 * @param {string} userId - userId is a string that represents the unique identifier of a user. It is
 * used to track and associate the psychometric test submissions with a specific user in the database.
 * @returns The code is returning a JSON response with specific error messages and codes based on
 * different scenarios. The response includes information about the success status, error message,
 * error code, and additional details if necessary. The response is tailored to handle various
 * situations such as invalid request bodies, authentication failures, rate limit exceeded, duplicate
 * submissions, database fetch errors, missing questions, invalid answers, failed score calculations,
 * invalid score outputs
 */
// =====================================================
// POST /api/psychometric/submit
// =====================================================
// Engine 1: Psychometric Test Submission Endpoint
// SOLVO Specification Compliant - Production Grade
// Hardened for Serverless/Production Environment
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateBigFiveScore } from '@/lib/calculateBigFiveScore';
import type { 
  BigFiveScoreResult, 
  BigFiveTrait,
  PsychQuestion, 
  UserAnswers 
} from '@/lib/calculateBigFiveScore';

// =====================================================
// CONSTANTS - SOLVO Specification
// =====================================================

/**
 * ARCHITECTURAL DECISION: 50-Question Standard
 * 
 * SOLVO uses exactly 50 psychometric questions (10 per Big Five trait).
 * This ensures:
 * - Reliable psychometric validity
 * - Consistent normalization (trait scores 0-100)
 * - Deterministic radar chart rendering
 * 
 * Enforcing strict count prevents:
 * - Incomplete test submissions
 * - Database corruption from partial imports
 * - Client-side manipulation
 */
const REQUIRED_QUESTION_COUNT = 50;
const REQUIRED_ANSWER_COUNT = 50;

const VALID_TRAITS: BigFiveTrait[] = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'neuroticism'
];

const VALID_POLARITIES = [1, -1] as const;

/**
 * Idempotency window: prevent duplicate submissions within 60 seconds
 */
const IDEMPOTENCY_WINDOW_SECONDS = 60;

// =====================================================
// TYPES
// =====================================================

interface SubmitRequestBody {
  answers: UserAnswers;
}

interface SubmitResponse {
  success: true;
  radarData: BigFiveScoreResult;
}

/**
 * Consistent error response format
 * All errors must include:
 * - success: false
 * - error: human-readable message
 * - code: machine-readable error code
 */
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: string;
}

interface DatabasePsychQuestion {
  id: string;
  trait: string;
  polarity: number;
  question_text: string;
}

// =====================================================
// RATE LIMITING ABSTRACTION
// =====================================================

/**
 * Production-safe rate limiter abstraction
 * 
 * TODO: Implement with Redis/Upstash for distributed rate limiting
 * 
 * Production implementation should:
 * - Use Redis for distributed state across serverless functions
 * - Implement sliding window algorithm
 * - Track by userId + IP address
 * - Configure different limits per tier (free vs premium)
 * - Add exponential backoff for repeated violations
 * 
 * Recommended: Upstash Redis with @upstash/ratelimit
 * 
 * Example production code:
 * ```
 * import { Ratelimit } from "@upstash/ratelimit";
 * import { Redis } from "@upstash/redis";
 * 
 * const redis = Redis.fromEnv();
 * const ratelimit = new Ratelimit({
 *   redis,
 *   limiter: Ratelimit.slidingWindow(5, "15 m"),
 * });
 * 
 * const { success, limit, reset, remaining } = await ratelimit.limit(userId);
 * ```
 */
async function rateLimiter(userId: string): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  // PLACEHOLDER: Currently allows all traffic
  // Replace this with Redis-based rate limiting in production
  
  return { allowed: true };
}

// =====================================================
// IDEMPOTENCY PROTECTION
// =====================================================

/**
 * Check for duplicate submission within idempotency window
 * Prevents accidental double-submissions from user double-clicks or network retries
 */
async function checkIdempotency(
  supabase: SupabaseClient,
  userId: string
)
: Promise<{
  isDuplicate: boolean;
  recentSubmissionAge?: number;
}> {
  const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from('psych_results')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    // Log error but don't block submission on idempotency check failure
    console.error('[IDEMPOTENCY_CHECK_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error.message
    });
    return { isDuplicate: false };
  }

  if (data && data.length > 0) {
    const recentSubmission = new Date(data[0].created_at);
    const ageSeconds = Math.floor((Date.now() - recentSubmission.getTime()) / 1000);
    
    return {
      isDuplicate: true,
      recentSubmissionAge: ageSeconds
    };
  }

  return { isDuplicate: false };
}

// =====================================================
// MAIN HANDLER
// =====================================================

export async function POST(request: NextRequest) {
  let userId: string | undefined;

  try {
    // CREATE SUPABASE CLIENT INSIDE HANDLER
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      }
    );

    // 1. PARSE AND VALIDATE REQUEST BODY
    const body = await parseRequestBody(request);
    if (!body.success) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: body.error, 
          code: body.code,
          details: body.details 
        },
        { status: 400 }
      );
    }

    const { answers } = body.data;

    // 2. AUTHENTICATE USER
    const authResult = await authenticateUser(supabase);
    
    if (!authResult.success) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: authResult.error,
          code: authResult.code
        },
        { status: 401 }
      );
    }

    userId = authResult.userId;

    // 3. RATE LIMITING CHECK
    if (!userId) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: 'Authentication validation failed',
          code: 'AUTH_VALIDATION_FAILED'
        },
        { status: 401 }
      );
    }

    const rateLimitResult = await rateLimiter(userId);
    if (!rateLimitResult.allowed) {
      console.log('[RATE_LIMIT_EXCEEDED]', {
        timestamp: new Date().toISOString(),
        userId,
        retryAfter: rateLimitResult.retryAfter
      });

      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: 'Too many submissions',
          code: 'RATE_LIMIT_EXCEEDED',
          details: rateLimitResult.retryAfter 
            ? `Please try again in ${rateLimitResult.retryAfter} seconds`
            : undefined
        },
        { 
          status: 429,
          headers: rateLimitResult.retryAfter 
            ? { 'Retry-After': String(rateLimitResult.retryAfter) }
            : undefined
        }
      );
    }

    // 4. IDEMPOTENCY CHECK
    const idempotencyResult = await checkIdempotency(supabase, userId);
    if (idempotencyResult.isDuplicate) {
      console.log('[DUPLICATE_SUBMISSION_BLOCKED]', {
        timestamp: new Date().toISOString(),
        userId,
        recentSubmissionAge: idempotencyResult.recentSubmissionAge
      });

      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Duplicate submission detected',
          code: 'DUPLICATE_SUBMISSION',
          details: `Please wait ${IDEMPOTENCY_WINDOW_SECONDS - (idempotencyResult.recentSubmissionAge || 0)} seconds before resubmitting`
        },
        { status: 409 }
      );
    }

    // 5. FETCH AND VALIDATE PSYCHOMETRIC QUESTIONS
    const questionsResult = await fetchPsychQuestions(supabase);
    
    if (!questionsResult.success) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: questionsResult.error,
          code: questionsResult.code,
          details: questionsResult.details 
        },
        { status: questionsResult.status }
      );
    }

    const questions = questionsResult.questions;

    // 6. VALIDATE ANSWER COUNT (SPEC: exactly 50)
    const answerCount = Object.keys(answers).length;
    if (answerCount !== REQUIRED_ANSWER_COUNT) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: 'Invalid answer count',
          code: 'INVALID_ANSWER_COUNT',
          details: `Expected exactly ${REQUIRED_ANSWER_COUNT} answers, received ${answerCount}`
        },
        { status: 400 }
      );
    }

    // 7. VALIDATE ANSWERS AGAINST QUESTIONS
    const validationResult = validateAnswers(answers, questions);
    
    if (!validationResult.success) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: validationResult.error,
          code: validationResult.code,
          details: validationResult.details 
        },
        { status: 400 }
      );
    }

    // 8. CALCULATE BIG FIVE SCORES
    let radarData: BigFiveScoreResult;
    
    try {
      radarData = calculateBigFiveScore(answers, questions);
    } catch (error) {
      console.error('[SCORE_CALCULATION_ERROR]', {
        timestamp: new Date().toISOString(),
        userId,
        error: error instanceof Error ? error.message : String(error)
      });

      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: 'Failed to calculate scores',
          code: 'CALCULATION_FAILED'
        },
        { status: 500 }
      );
    }

    // 9. VALIDATE OUTPUT DETERMINISM
    const outputValidation = validateScoreOutput(radarData);
    if (!outputValidation.success) {
      console.error('[OUTPUT_VALIDATION_ERROR]', {
        timestamp: new Date().toISOString(),
        userId,
        validationError: outputValidation.error
      });

      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: 'Invalid score output',
          code: 'INVALID_OUTPUT'
        },
        { status: 500 }
      );
    }

    // 10. PERSIST RESULTS TO DATABASE
    /**
     * ARCHITECTURAL DECISION: Multiple Submissions Allowed
     * 
     * Users can retake the test to track personality changes over time.
     * Each submission creates a new record (no overwrite).
     * Enables longitudinal analysis and progress tracking.
     */
    const persistResult = await persistResults(supabase, userId, radarData);
    
    if (!persistResult.success) {
      return NextResponse.json<ErrorResponse>(
        { 
          success: false,
          error: persistResult.error,
          code: persistResult.code
        },
        { status: 500 }
      );
    }

    // 11. SUCCESS LOGGING
    console.log('[SUBMISSION_SUCCESS]', {
      timestamp: new Date().toISOString(),
      userId,
      resultId: persistResult.resultId
    });

    // 12. RETURN SUCCESS RESPONSE
    return NextResponse.json<SubmitResponse>(
      {
        success: true,
        radarData
      },
      { status: 200 }
    );

  } catch (error) {
    // Catch-all for unexpected errors - log internally, return generic message
    console.error('[UNEXPECTED_ERROR]', {
      timestamp: new Date().toISOString(),
      userId: userId || 'unknown',
      error: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json<ErrorResponse>(
      { 
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Parse and validate request body structure
 */
async function parseRequestBody(
  request: NextRequest
): Promise<
  | { success: true; data: SubmitRequestBody }
  | { success: false; error: string; code: string; details?: string }
> {

  try {
    const body = await request.json();

    if (!body.answers || typeof body.answers !== 'object') {
      return {
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
        details: 'answers field is required and must be an object'
      };
    }

    if (Array.isArray(body.answers)) {
      return {
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
        details: 'answers must be an object, not an array'
      };
    }

    if (Object.keys(body.answers).length === 0) {
      return {
        success: false,
        error: 'Invalid request body',
        code: 'INVALID_BODY',
        details: 'answers object cannot be empty'
      };
    }

    return {
      success: true,
      data: { answers: body.answers }
    };

  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON payload',
      code: 'INVALID_JSON',
      details: 'Unable to parse request body'
    };
  }
}

/**
 * Authenticate user via Supabase JWT
 */
async function authenticateUser(
  supabase: SupabaseClient
): Promise<
  | { success: true; userId: string }
  | { success: false; error: string; code: string }
> {
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      success: false,
      error: 'Unauthorized: Valid session required',
      code: 'UNAUTHORIZED'
    };
  }

  return {
    success: true,
    userId: user.id
  };
}

/**
 * Fetch and validate psychometric questions from database
 * 
 * STRICT VALIDATION:
 * - Enforces exactly 50 questions (SOLVO spec)
 * - Validates each question's integrity (id, trait, polarity)
 * - Filters soft-deleted questions (schema has deleted_at column)
 */
async function fetchPsychQuestions(
  supabase: SupabaseClient
): Promise<
  | { success: true; questions: PsychQuestion[] }
  | { success: false; error: string; code: string; details?: string; status: number }
> {
  const { data, error } = await supabase
    .from('psych_questions')
    .select('id, trait, polarity, question_text')
    .is('deleted_at', null); // Filter soft-deleted (schema compliance)

  if (error) {
    console.error('[DB_FETCH_ERROR]', {
      timestamp: new Date().toISOString(),
      table: 'psych_questions',
      error: error.message
    });

    return {
      success: false,
      error: 'Failed to fetch questions',
      code: 'DB_FETCH_FAILED',
      status: 500
    };
  }

  if (!data || data.length === 0) {
    console.error('[NO_QUESTIONS_AVAILABLE]', {
      timestamp: new Date().toISOString()
    });

    return {
      success: false,
      error: 'Service temporarily unavailable',
      code: 'NO_QUESTIONS',
      details: 'Database contains no active psychometric questions',
      status: 503
    };
  }

  // SPEC ENFORCEMENT: Exactly 50 questions required
  if (data.length !== REQUIRED_QUESTION_COUNT) {
    console.error('[QUESTION_COUNT_MISMATCH]', {
      timestamp: new Date().toISOString(),
      expected: REQUIRED_QUESTION_COUNT,
      actual: data.length
    });

    return {
      success: false,
      error: 'Service temporarily unavailable',
      code: 'INVALID_QUESTION_COUNT',
      details: `Expected ${REQUIRED_QUESTION_COUNT} questions, found ${data.length}`,
      status: 503
    };
  }

  // STRICT INTEGRITY CHECK: Validate each question
  const questions: PsychQuestion[] = [];
  
  for (const q of data as DatabasePsychQuestion[]) {
    // Validate ID exists
    if (!q.id || typeof q.id !== 'string') {
      console.error('[QUESTION_INTEGRITY_ERROR]', {
        timestamp: new Date().toISOString(),
        issue: 'missing_id',
        questionId: q.id
      });

      return {
        success: false,
        error: 'Service temporarily unavailable',
        code: 'DB_INTEGRITY_ERROR',
        details: 'Question found with invalid or missing id',
        status: 503
      };
    }

    // Validate trait is valid Big Five trait
    if (!VALID_TRAITS.includes(q.trait as BigFiveTrait)) {
      console.error('[QUESTION_INTEGRITY_ERROR]', {
        timestamp: new Date().toISOString(),
        issue: 'invalid_trait',
        questionId: q.id,
        trait: q.trait
      });

      return {
        success: false,
        error: 'Service temporarily unavailable',
        code: 'DB_INTEGRITY_ERROR',
        details: 'Invalid trait found in question database',
        status: 503
      };
    }

    // Validate polarity is +1 or -1
    if (!VALID_POLARITIES.includes(q.polarity as 1 | -1)) {
      console.error('[QUESTION_INTEGRITY_ERROR]', {
        timestamp: new Date().toISOString(),
        issue: 'invalid_polarity',
        questionId: q.id,
        polarity: q.polarity
      });

      return {
        success: false,
        error: 'Service temporarily unavailable',
        code: 'DB_INTEGRITY_ERROR',
        details: 'Invalid polarity found in question database',
        status: 503
      };
    }

    // Validate question_text exists
    if (!q.question_text || typeof q.question_text !== 'string') {
      console.error('[QUESTION_INTEGRITY_ERROR]', {
        timestamp: new Date().toISOString(),
        issue: 'missing_question_text',
        questionId: q.id
      });

      return {
        success: false,
        error: 'Service temporarily unavailable',
        code: 'DB_INTEGRITY_ERROR',
        details: 'Question missing text content',
        status: 503
      };
    }

    questions.push({
      id: q.id,
      trait: q.trait as BigFiveTrait,
      polarity: q.polarity as 1 | -1,
      question_text: q.question_text
    });
  }

  return {
    success: true,
    questions
  };
}

/**
 * Validate user answers
 * 
 * STRICT VALIDATION:
 * - All answer values must be integers 1-5
 * - Answer IDs must exactly match question IDs (no extra, no missing)
 * - Rejects unknown question IDs (prevents client manipulation)
 */
function validateAnswers(
  answers: UserAnswers,
  questions: PsychQuestion[]
): 
  | { success: true }
  | { success: false; error: string; code: string; details?: string }
{
  const questionIds = new Set(questions.map(q => q.id));
  const answerIds = new Set(Object.keys(answers));

  // CHECK 1: Validate all answer values are valid (1-5 integers)
  for (const [questionId, answer] of Object.entries(answers)) {
    if (!Number.isInteger(answer)) {
      return {
        success: false,
        error: 'Invalid answer value',
        code: 'INVALID_ANSWER_VALUE',
        details: `Answer for question ${questionId} must be an integer`
      };
    }

    if (answer < 1 || answer > 5) {
      return {
        success: false,
        error: 'Invalid answer value',
        code: 'INVALID_ANSWER_RANGE',
        details: `Answer for question ${questionId} must be between 1 and 5`
      };
    }
  }

  // CHECK 2: Detect unknown question IDs (client manipulation attempt)
  const unknownIds = [...answerIds].filter(id => !questionIds.has(id));
  if (unknownIds.length > 0) {
    return {
      success: false,
      error: 'Unknown question IDs detected',
      code: 'UNKNOWN_QUESTION_IDS',
      details: `Found ${unknownIds.length} answer(s) for non-existent questions`
    };
  }

  // CHECK 3: Detect missing answers
  const missingIds = [...questionIds].filter(id => !answerIds.has(id));
  if (missingIds.length > 0) {
    return {
      success: false,
      error: 'Incomplete answers',
      code: 'INCOMPLETE_ANSWERS',
      details: `Missing answers for ${missingIds.length} question(s)`
    };
  }

  // CHECK 4: Ensure exact match (no extra, no missing)
  if (answerIds.size !== questionIds.size) {
    return {
      success: false,
      error: 'Answer count mismatch',
      code: 'ANSWER_COUNT_MISMATCH',
      details: `Expected ${questionIds.size} answers, received ${answerIds.size}`
    };
  }

  return { success: true };
}

/**
 * Validate score output determinism
 * 
 * DETERMINISTIC GUARANTEES:
 * - Output always contains exactly 5 traits
 * - All values are numbers between 0-100 (inclusive)
 * - Prevents corrupted output from reaching database
 */
function validateScoreOutput(
  scores: BigFiveScoreResult
): 
  | { success: true }
  | { success: false; error: string }
{
  if (!scores || typeof scores !== 'object') {
    return { success: false, error: 'Score output is not an object' };
  }

  // Validate all 5 traits are present
  for (const trait of VALID_TRAITS) {
    if (!(trait in scores)) {
      return { success: false, error: `Missing trait: ${trait}` };
    }

    const value = scores[trait];

    // Validate value is a number
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { success: false, error: `Invalid value for ${trait}` };
    }

    // Validate range 0-100
    if (value < 0 || value > 100) {
      return { success: false, error: `Value for ${trait} out of range` };
    }
  }

  // Validate no extra properties
  const scoreKeys = Object.keys(scores);
  if (scoreKeys.length !== 5) {
    return { success: false, error: `Expected 5 traits, found ${scoreKeys.length}` };
  }

  return { success: true };
}

/**
 * Persist psychometric results to database with hardened error handling
 * 
 * TRANSACTION SAFETY:
 * - Uses .select('id').single() to verify insert succeeded
 * - Returns result ID for audit trail
 * - Fails explicitly if record not created
 */
async function persistResults(
  supabase: SupabaseClient,
  userId: string,
  scores: BigFiveScoreResult
): Promise<
  | { success: true; resultId: string }
  | { success: false; error: string; code: string }
> {
  try {
    const { data, error } = await supabase
      .from('psych_results')
      .insert({
        user_id: userId,
        scores: scores
      })
      .select('id')
      .single();

    if (error) {
      console.error('[DB_INSERT_ERROR]', {
        timestamp: new Date().toISOString(),
        userId,
        table: 'psych_results',
        error: error.message
      });

      return {
        success: false,
        error: 'Failed to save results',
        code: 'DB_INSERT_FAILED'
      };
    }

    // Verify record was created
    if (!data || !data.id) {
      console.error('[DB_INSERT_VERIFICATION_FAILED]', {
        timestamp: new Date().toISOString(),
        userId,
        table: 'psych_results',
        returnedData: data
      });

      return {
        success: false,
        error: 'Failed to verify saved results',
        code: 'DB_VERIFICATION_FAILED'
      };
    }

    return {
      success: true,
      resultId: data.id
    };

  } catch (error) {
    console.error('[DB_TRANSACTION_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      error: 'Failed to save results',
      code: 'DB_TRANSACTION_FAILED'
    };
  }
}

// =====================================================
// METHOD GUARDS
// =====================================================

export async function GET() {
  return NextResponse.json<ErrorResponse>(
    { 
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json<ErrorResponse>(
    { 
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json<ErrorResponse>(
    { 
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json<ErrorResponse>(
    { 
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED'
    },
    { status: 405 }
  );
}