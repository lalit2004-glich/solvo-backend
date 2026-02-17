// =====================================================
// GET /api/roadmap
// =====================================================
// Premium Access Gate
// Returns career roadmap for premium users only
// Free users receive 403 Forbidden
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

// =====================================================
// TYPES
// =====================================================

interface RoadmapResponse {
  success: true;
  roadmap: {
    career_paths: CareerPath[];
    recommended_skills: string[];
    short_term_goals: string[];
    long_term_goals: string[];
    generated_at: string;
  };
}

interface CareerPath {
  title: string;
  match_percentage: number;
  description: string;
  required_skills: string[];
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

    const userId = authResult.userId;

    // Step 2: Check premium status
    const premiumResult = await checkPremiumStatus(supabase, userId);
    if (!premiumResult.success) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: premiumResult.error,
          code: premiumResult.code,
        },
        { status: premiumResult.status || 500 }
      );
    }

    // Step 3: Block free users with 403
    if (!premiumResult.isPremium) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Premium subscription required',
          code: 'PREMIUM_REQUIRED',
          details: 'Upgrade to premium to access your personalized career roadmap',
        },
        { status: 403 }
      );
    }

    // Step 4: Fetch user scores to build roadmap
    const scoresResult = await fetchUserScores(supabase, userId);

    // Step 5: Generate roadmap based on scores
    const roadmap = generateRoadmap(scoresResult);

    console.log('[ROADMAP_ACCESS]', {
      timestamp: new Date().toISOString(),
      userId,
    });

    return NextResponse.json<RoadmapResponse>({
      success: true,
      roadmap,
    });

  } catch (error) {
    console.error('[ROADMAP_ERROR]', {
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

async function checkPremiumStatus(
  supabase: SupabaseClient,
  userId: string
): Promise<
  | { success: true; isPremium: boolean }
  | { success: false; error: string; code: string; status?: number }
> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('is_premium')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[PREMIUM_CHECK_ERROR]', {
      timestamp: new Date().toISOString(),
      userId,
      error: error.message,
    });

    return {
      success: false,
      error: 'Failed to verify premium status',
      code: 'PREMIUM_CHECK_FAILED',
      status: 500,
    };
  }

  if (!profile) {
    return {
      success: false,
      error: 'User profile not found',
      code: 'PROFILE_NOT_FOUND',
      status: 404,
    };
  }

  return { success: true, isPremium: profile.is_premium };
}

async function fetchUserScores(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  psychScores: Record<string, number> | null;
  aptitudeBreakdown: Record<string, number> | null;
}> {
  // Fetch latest psychometric result
  const { data: psychResult } = await supabase
    .from('psych_results')
    .select('scores')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch latest aptitude result
  const { data: aptitudeResult } = await supabase
    .from('aptitude_submissions')
    .select('breakdown')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    psychScores: psychResult?.scores || null,
    aptitudeBreakdown: aptitudeResult?.breakdown || null,
  };
}

function generateRoadmap(scores: {
  psychScores: Record<string, number> | null;
  aptitudeBreakdown: Record<string, number> | null;
}) {
  const { psychScores, aptitudeBreakdown } = scores;

  // Default career paths — will be personalized based on scores
  let careerPaths: CareerPath[] = [
    {
      title: 'Software Engineer',
      match_percentage: 85,
      description: 'Build and maintain software systems and applications',
      required_skills: ['Programming', 'Problem Solving', 'System Design', 'Teamwork'],
    },
    {
      title: 'Data Analyst',
      match_percentage: 78,
      description: 'Analyse data to help organisations make better decisions',
      required_skills: ['SQL', 'Excel', 'Statistics', 'Data Visualisation'],
    },
    {
      title: 'Product Manager',
      match_percentage: 72,
      description: 'Lead product strategy and work across teams to build great products',
      required_skills: ['Communication', 'Strategic Thinking', 'Leadership', 'Analytics'],
    },
  ];

  // Personalise based on psychometric scores
  if (psychScores) {
    const openness         = psychScores.openness         || 0;
    const conscientiousness = psychScores.conscientiousness || 0;
    const extraversion     = psychScores.extraversion      || 0;
    const agreeableness    = psychScores.agreeableness     || 0;

    // High openness + high numerical → Data Science
    if (openness > 70 && (aptitudeBreakdown?.numerical || 0) > 7) {
      careerPaths[1].title = 'Data Scientist';
      careerPaths[1].match_percentage = Math.min(95, 70 + Math.round(openness / 10));
      careerPaths[1].description = 'Use advanced analytics and ML to solve complex problems';
    }

    // High extraversion + high agreeableness → Management
    if (extraversion > 70 && agreeableness > 65) {
      careerPaths[2].match_percentage = Math.min(95, 65 + Math.round(extraversion / 10));
    }

    // High conscientiousness → Engineering
    if (conscientiousness > 70) {
      careerPaths[0].match_percentage = Math.min(98, 80 + Math.round(conscientiousness / 10));
    }
  }

  // Sort by match percentage
  careerPaths = careerPaths.sort((a, b) => b.match_percentage - a.match_percentage);

  // Build recommended skills based on aptitude
  const recommendedSkills: string[] = [];
  if (aptitudeBreakdown) {
    if ((aptitudeBreakdown.numerical || 0) < 6) {
      recommendedSkills.push('Quantitative Reasoning', 'Mathematics', 'Statistics');
    }
    if ((aptitudeBreakdown.verbal || 0) < 6) {
      recommendedSkills.push('Communication Skills', 'Business Writing', 'Presentation Skills');
    }
    if ((aptitudeBreakdown.creative || 0) < 6) {
      recommendedSkills.push('Creative Thinking', 'Problem Solving', 'Design Thinking');
    }
  }

  if (recommendedSkills.length === 0) {
    recommendedSkills.push('Leadership', 'Advanced Domain Expertise', 'Mentoring');
  }

  return {
    career_paths: careerPaths,
    recommended_skills: recommendedSkills,
    short_term_goals: [
      'Complete an online certification in your top career path',
      'Build 2-3 portfolio projects showcasing your skills',
      'Connect with 5 professionals in your target industry',
    ],
    long_term_goals: [
      'Secure a role in your top matched career path within 12 months',
      'Build a professional network of 50+ industry contacts',
      'Achieve a senior-level position within 3-5 years',
    ],
    generated_at: new Date().toISOString(),
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
