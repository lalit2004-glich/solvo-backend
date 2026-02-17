// =====================================================
// POST /api/aptitude/submit
// =====================================================
// Engine 2: Aptitude Test Submission Endpoint (CAT-style)
// SOLVO Specification Compliant - Production Grade
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

// =====================================================
// CONSTANTS
// =====================================================

const REQUIRED_QUESTION_COUNT = 30;
const CATEGORIES = ['numerical', 'verbal', 'creative'] as const;
type Category = typeof CATEGORIES[number];

const VALID_OPTIONS = ['A', 'B', 'C', 'D'] as const;
type ValidOption = typeof VALID_OPTIONS[number];

const IDEMPOTENCY_WINDOW_SECONDS = 60;

// =====================================================
// TYPES
// =====================================================

interface SubmitRequestBody {
  answers: Record<string, string>;
}

interface SubmitResponse {
  success: true;
  scoreTotal: number;
  breakdown: {
    numerical: number;
    verbal: number;
    creative: number;
  };
  percentage: number;
}

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: string;
}

interface DatabaseAptitudeQuestion {
  id: string;
  category: string;
  correct_answer: string;
  question_text: string;
}

interface ScoreBreakdown {
  numerical: number;
  verbal: number;
  creative: number;
}

// =====================================================
// MAIN HANDLER
// =====================================================

export async function POST(request: NextRequest) {
  let userId: string | undefined;

  try {
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

    const body = await parseRequestBody(request);
    if (!body.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: body.error,
          code: body.code,
          details: body.details,
        },
        { status: 400 }
      );
    }

    const { answers } = body.data;

    const authResult = await authenticateUser(supabase);
    if (!authResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: authResult.error,
          code: authResult.code,
        },
        { status: 401 }
      );
    }

    userId = authResult.userId;

    const idempotencyCheck = await checkIdempotency(supabase, userId);
    if (idempotencyCheck.isDuplicate) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Duplicate submission detected',
          code: 'DUPLICATE_SUBMISSION',
          details: `Please wait ${IDEMPOTENCY_WINDOW_SECONDS - (idempotencyCheck.recentSubmissionAge || 0)} seconds before resubmitting`,
        },
        { status: 409 }
      );
    }

    const questionsResult = await fetchQuestions(supabase);
    if (!questionsResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: questionsResult.error,
          code: questionsResult.code,
          details: questionsResult.details,
        },
        { status: questionsResult.status || 500 }
      );
    }

    const questions = questionsResult.questions;

    const validationResult = validateAnswers(answers, questions);
    if (!validationResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: validationResult.error,
          code: validationResult.code,
          details: validationResult.details,
        },
        { status: 400 }
      );
    }

    const scoreResult = calculateScore(answers, questions);

    const persistResult = await persistResults(
      supabase,
      userId,
      scoreResult.total,
      scoreResult.breakdown,
      answers
    );

    if (!persistResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: persistResult.error,
          code: persistResult.code,
        },
        { status: 500 }
      );
    }

    console.log('[APTITUDE_SUBMISSION_SUCCESS]', {
      timestamp: new Date().toISOString(),
      userId,
      resultId: persistResult.resultId,
      scoreTotal: scoreResult.total,
      breakdown: scoreResult.breakdown,
    });

    return NextResponse.json<SubmitResponse>({
      success: true,
      scoreTotal: scoreResult.total,
      breakdown: scoreResult.breakdown,
      percentage: Math.round((scoreResult.total / REQUIRED_QUESTION_COUNT) * 100),
    });

  } catch (error) {
    console.error('[APTITUDE_SUBMISSION_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json<ErrorResponse>(
      {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function parseRequestBody(request: NextRequest): Promise<
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
        details: 'Missing or invalid "answers" field',
      };
    }

    const answerCount = Object.keys(body.answers).length;
    if (answerCount !== REQUIRED_QUESTION_COUNT) {
      return {
        success: false,
        error: `Expected exactly ${REQUIRED_QUESTION_COUNT} answers`,
        code: 'INVALID_ANSWER_COUNT',
        details: `Received ${answerCount} answers`,
      };
    }

    return { success: true, data: body };
  } catch {
    return {
      success: false,
      error: 'Failed to parse request body',
      code: 'PARSE_ERROR',
    };
  }
}

async function authenticateUser(supabase: SupabaseClient): Promise<
  | { success: true; userId: string }
  | { success: false; error: string; code: string }
> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      success: false,
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    };
  }

  return { success: true, userId: user.id };
}

async function checkIdempotency(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  isDuplicate: boolean;
  recentSubmissionAge?: number;
}> {
  const windowStart = new Date(
    Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from('aptitude_submissions')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[IDEMPOTENCY_CHECK_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error.message,
    });
    return { isDuplicate: false };
  }

  if (data && data.length > 0) {
    const recentSubmission = new Date(data[0].created_at);
    const ageSeconds = Math.floor((Date.now() - recentSubmission.getTime()) / 1000);
    return {
      isDuplicate: true,
      recentSubmissionAge: ageSeconds,
    };
  }

  return { isDuplicate: false };
}

async function fetchQuestions(supabase: SupabaseClient): Promise<
  | { success: true; questions: DatabaseAptitudeQuestion[] }
  | { success: false; error: string; code: string; details?: string; status?: number }
> {
  const { data, error } = await supabase
    .from('aptitude_questions')
    .select('id, category, correct_answer, question_text')
    .order('id');

  if (error) {
    console.error('[DB_FETCH_ERROR]', {
      timestamp: new Date().toISOString(),
      table: 'aptitude_questions',
      error: error.message,
    });

    return {
      success: false,
      error: 'Failed to fetch questions',
      code: 'DB_FETCH_ERROR',
      status: 500,
    };
  }

  if (!data || data.length !== REQUIRED_QUESTION_COUNT) {
    console.error('[QUESTION_COUNT_MISMATCH]', {
      timestamp: new Date().toISOString(),
      expected: REQUIRED_QUESTION_COUNT,
      actual: data?.length || 0,
    });

    return {
      success: false,
      error: 'Question database integrity error',
      code: 'INVALID_QUESTION_COUNT',
      details: `Expected ${REQUIRED_QUESTION_COUNT} questions, found ${data?.length || 0}`,
      status: 503,
    };
  }

  return { success: true, questions: data };
}

function validateAnswers(
  answers: Record<string, string>,
  questions: DatabaseAptitudeQuestion[]
): { success: true } | { success: false; error: string; code: string; details?: string } {
  const questionIds = new Set(questions.map((q) => q.id));
  const answerIds = new Set(Object.keys(answers));

  for (const [questionId, answer] of Object.entries(answers)) {
    if (!VALID_OPTIONS.includes(answer as ValidOption)) {
      return {
        success: false,
        error: 'Invalid answer value',
        code: 'INVALID_ANSWER_VALUE',
        details: `Answer for question ${questionId} must be A, B, C, or D`,
      };
    }
  }

  const unknownIds = [...answerIds].filter((id) => !questionIds.has(id));
  if (unknownIds.length > 0) {
    return {
      success: false,
      error: 'Unknown question IDs detected',
      code: 'UNKNOWN_QUESTION_IDS',
      details: `Found ${unknownIds.length} answer(s) for non-existent questions`,
    };
  }

  const missingIds = [...questionIds].filter((id) => !answerIds.has(id));
  if (missingIds.length > 0) {
    return {
      success: false,
      error: 'Incomplete answers',
      code: 'INCOMPLETE_ANSWERS',
      details: `Missing answers for ${missingIds.length} question(s)`,
    };
  }

  return { success: true };
}

function calculateScore(
  answers: Record<string, string>,
  questions: DatabaseAptitudeQuestion[]
): {
  total: number;
  breakdown: ScoreBreakdown;
} {
  const breakdown: ScoreBreakdown = {
    numerical: 0,
    verbal: 0,
    creative: 0,
  };

  let total = 0;

  for (const question of questions) {
    const userAnswer = answers[question.id];
    const isCorrect = userAnswer === question.correct_answer;

    if (isCorrect) {
      total++;
      const category = question.category as Category;
      breakdown[category]++;
    }
  }

  return { total, breakdown };
}

async function persistResults(
  supabase: SupabaseClient,
  userId: string,
  scoreTotal: number,
  breakdown: ScoreBreakdown,
  answers: Record<string, string>
): Promise<
  | { success: true; resultId: string }
  | { success: false; error: string; code: string }
> {
  try {
    const { data, error } = await supabase
      .from('aptitude_submissions')
      .insert({
        user_id: userId,
        score_total: scoreTotal,
        breakdown: breakdown,
        answers: answers,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[DB_INSERT_ERROR]', {
        timestamp: new Date().toISOString(),
        userId,
        table: 'aptitude_submissions',
        error: error.message,
      });

      return {
        success: false,
        error: 'Failed to save results',
        code: 'DB_INSERT_FAILED',
      };
    }

    if (!data || !data.id) {
      console.error('[DB_INSERT_VERIFICATION_FAILED]', {
        timestamp: new Date().toISOString(),
        userId,
        table: 'aptitude_submissions',
        returnedData: data,
      });

      return {
        success: false,
        error: 'Failed to verify saved results',
        code: 'DB_VERIFICATION_FAILED',
      };
    }

    return {
      success: true,
      resultId: data.id,
    };
  } catch (error) {
    console.error('[DB_TRANSACTION_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: 'Failed to save results',
      code: 'DB_TRANSACTION_FAILED',
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
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json<ErrorResponse>(
    {
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json<ErrorResponse>(
    {
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json<ErrorResponse>(
    {
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    },
    { status: 405 }
  );
}
