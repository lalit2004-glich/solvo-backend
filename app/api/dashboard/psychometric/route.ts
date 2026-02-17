// =====================================================
// GET /api/dashboard/psychometric
// =====================================================
// Fetch latest psychometric test results
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// =====================================================
// TYPES
// =====================================================

interface PsychometricResponse {
  success: true;
  result: {
    id: string;
    scores: {
      openness: number;
      conscientiousness: number;
      extraversion: number;
      agreeableness: number;
      neuroticism: number;
    };
    created_at: string;
  } | null;
  message?: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

// =====================================================
// MAIN HANDLER
// =====================================================

export async function GET(request: NextRequest) {
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Authentication required',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }

    const { data: result, error: fetchError } = await supabase
      .from('psych_results')
      .select('id, scores, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json<PsychometricResponse>({
          success: true,
          result: null,
          message: 'No psychometric test results found',
        });
      }

      console.error('[PSYCHOMETRIC_FETCH_ERROR]', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        error: fetchError.message,
      });

      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Failed to fetch results',
          code: 'FETCH_ERROR',
        },
        { status: 500 }
      );
    }

    return NextResponse.json<PsychometricResponse>({
      success: true,
      result: result,
    });

  } catch (error) {
    console.error('[DASHBOARD_PSYCHOMETRIC_ERROR]', {
      timestamp: new Date().toISOString(),
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

export async function POST() {
  return NextResponse.json<ErrorResponse>(
    { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json<ErrorResponse>(
    { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json<ErrorResponse>(
    { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json<ErrorResponse>(
    { success: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}
