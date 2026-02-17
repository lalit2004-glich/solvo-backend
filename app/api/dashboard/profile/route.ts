/**
 * This TypeScript function handles fetching user profile and premium status from a server using
 * Supabase.
 * @param {NextRequest} request - The `request` parameter in the code refers to the incoming HTTP
 * request made to the server. It contains information such as the request method (GET, POST, PUT,
 * DELETE, PATCH), headers, cookies, query parameters, and other relevant data needed to process the
 * request. In this specific code snippet
 * @returns The code is a Next.js API route handler for fetching a user's profile and premium status.
 * It returns a JSON response with the user's profile information if the profile exists, or creates a
 * new profile if it doesn't. If there are any errors during the process, appropriate error responses
 * are returned. The handler only allows GET requests and responds with a "Method not allowed" error
 * for other HTTP methods
 */
// =====================================================
// GET /api/dashboard/profile
// =====================================================
// Fetch user profile and premium status
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// =====================================================
// TYPES
// =====================================================

interface ProfileResponse {
  success: true;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    is_premium: boolean;
    role: string;
    created_at: string;
  };
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_premium, role, created_at')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[PROFILE_FETCH_ERROR]', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        error: profileError.message,
      });

      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: 'Failed to fetch profile',
          code: 'PROFILE_FETCH_ERROR',
        },
        { status: 500 }
      );
    }

    if (!profile) {
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
          is_premium: false,
          role: 'free',
        })
        .select('id, email, full_name, is_premium, role, created_at')
        .single();

      if (createError || !newProfile) {
        console.error('[PROFILE_CREATE_ERROR]', {
          timestamp: new Date().toISOString(),
          userId: user.id,
          error: createError?.message,
        });

        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: 'Failed to create profile',
            code: 'PROFILE_CREATE_ERROR',
          },
          { status: 500 }
        );
      }

      return NextResponse.json<ProfileResponse>({
        success: true,
        profile: newProfile,
      });
    }

    return NextResponse.json<ProfileResponse>({
      success: true,
      profile: profile,
    });

  } catch (error) {
    console.error('[DASHBOARD_PROFILE_ERROR]', {
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
