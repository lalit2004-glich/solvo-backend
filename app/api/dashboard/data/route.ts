// =====================================================
// GET /api/dashboard/data
// =====================================================
// Combined Dashboard Endpoint
// Returns profile + psychometric + aptitude in one call
// Hides detailed roadmap data if user is not premium
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

// =====================================================
// TYPES
// =====================================================

interface DashboardResponse {
  success: true;
  data: {
    profile: {
      id: string;
      email: string | null;
      full_name: string | null;
      is_premium: boolean;
      role: string;
      created_at: string;
    };
    psychometric: {
      completed: boolean;
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
    };
    aptitude: {
      completed: boolean;
      result: {
        id: string;
        score_total: number;
        breakdown: {
          numerical: number;
          verbal: number;
          creative: number;
        };
        percentage: number;
        created_at: string;
      } | null;
    };
    roadmap: {
      available: boolean;
      locked: boolean;
      message?: string;
    };
  };
}

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: string;
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

    // Step 1: Authenticate user
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

    const userId = user.id;

    // Step 2: Fetch all data in parallel
    const [profileResult, psychResult, aptitudeResult] = await Promise.all([
      fetchProfile(supabase, userId),
      fetchPsychometric(supabase, userId),
      fetchAptitude(supabase, userId),
    ]);

    // Step 3: Handle profile error or auto-create
    if (!profileResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: profileResult.error,
          code: profileResult.code,
        },
        { status: 500 }
      );
    }

    const profile = profileResult.profile;
    const isPremium = profile.is_premium;

    // Step 4: Build roadmap availability status
    const psychCompleted  = psychResult.result !== null;
    const aptitudeCompleted = aptitudeResult.result !== null;
    const bothCompleted   = psychCompleted && aptitudeCompleted;

    const roadmap = buildRoadmapStatus(isPremium, bothCompleted);

    // Step 5: Log access
    console.log('[DASHBOARD_DATA_ACCESS]', {
      timestamp: new Date().toISOString(),
      userId,
      isPremium,
      psychCompleted,
      aptitudeCompleted,
    });

    return NextResponse.json<DashboardResponse>({
      success: true,
      data: {
        profile,
        psychometric: {
          completed: psychCompleted,
          result: psychResult.result,
        },
        aptitude: {
          completed: aptitudeCompleted,
          result: aptitudeResult.result,
        },
        roadmap,
      },
    });

  } catch (error) {
    console.error('[DASHBOARD_DATA_ERROR]', {
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

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { success: true; profile: DashboardResponse['data']['profile'] }
  | { success: false; error: string; code: string }
> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, is_premium, role, created_at')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[PROFILE_FETCH_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error.message,
    });
    return {
      success: false,
      error: 'Failed to fetch profile',
      code: 'PROFILE_FETCH_ERROR',
    };
  }

  // Auto-create profile if it doesn't exist
  if (!profile) {
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        is_premium: false,
        role: 'free',
      })
      .select('id, email, full_name, is_premium, role, created_at')
      .single();

    if (createError || !newProfile) {
      console.error('[PROFILE_CREATE_ERROR]', {
        timestamp: new Date().toISOString(),
        userId,
        error: createError?.message,
      });
      return {
        success: false,
        error: 'Failed to create profile',
        code: 'PROFILE_CREATE_ERROR',
      };
    }

    return { success: true, profile: newProfile };
  }

  return { success: true, profile };
}

async function fetchPsychometric(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  result: DashboardResponse['data']['psychometric']['result'];
}> {
  const { data, error } = await supabase
    .from('psych_results')
    .select('id, scores, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found — that's fine
    return { result: null };
  }

  return { result: data };
}

async function fetchAptitude(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  result: DashboardResponse['data']['aptitude']['result'];
}> {
  const { data, error } = await supabase
    .from('aptitude_submissions')
    .select('id, score_total, breakdown, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found — that's fine
    return { result: null };
  }

  return {
    result: data
      ? {
          ...data,
          percentage: Math.round((data.score_total / 30) * 100),
        }
      : null,
  };
}

function buildRoadmapStatus(
  isPremium: boolean,
  bothCompleted: boolean
): DashboardResponse['data']['roadmap'] {
  // Both tests not completed yet
  if (!bothCompleted) {
    return {
      available: false,
      locked: true,
      message: 'Complete both psychometric and aptitude tests to unlock your roadmap',
    };
  }

  // Tests done but not premium
  if (!isPremium) {
    return {
      available: false,
      locked: true,
      message: 'Upgrade to premium to access your personalized career roadmap',
    };
  }

  // Premium user with both tests done
  return {
    available: true,
    locked: false,
  };
}

// =====================================================
// METHOD GUARDS
// =====================================================

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
