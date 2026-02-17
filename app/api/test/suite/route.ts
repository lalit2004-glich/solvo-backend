// =====================================================
// GET /api/test/suite
// =====================================================
// Comprehensive Test Suite for SOLVO APIs
// Tests all backend endpoints and returns results
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  data?: any;
  error?: string;
}

export async function GET(request: NextRequest) {
  const results: TestResult[] = [];
  
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

    // TEST 1: Check Authentication
    results.push(await testAuthentication(supabase));

    // TEST 2: Check Database Tables Exist
    results.push(await testDatabaseTables(supabase));

    // TEST 3: Check Psychometric Questions
    results.push(await testPsychometricQuestions(supabase));

    // TEST 4: Check Aptitude Questions
    results.push(await testAptitudeQuestions(supabase));

    // TEST 5: Check Profile
    results.push(await testProfile(supabase));

    // Generate HTML Report
    return new NextResponse(generateHTMLReport(results), {
      headers: { 'Content-Type': 'text/html' },
    });

  } catch (error) {
    return new NextResponse(
      `<html><body><h1>Test Suite Error</h1><pre>${error instanceof Error ? error.message : String(error)}</pre></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// =====================================================
// TEST FUNCTIONS
// =====================================================

async function testAuthentication(supabase: any): Promise<TestResult> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return {
        test: 'Authentication',
        status: 'FAIL',
        message: 'User not authenticated. Please log in first.',
        error: error?.message,
      };
    }

    return {
      test: 'Authentication',
      status: 'PASS',
      message: `Logged in as: ${user.email}`,
      data: { userId: user.id, email: user.email },
    };
  } catch (error) {
    return {
      test: 'Authentication',
      status: 'FAIL',
      message: 'Authentication check failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testDatabaseTables(supabase: any): Promise<TestResult> {
  try {
    const tables = [
      'profiles',
      'psych_questions',
      'psych_results',
      'aptitude_questions',
      'aptitude_submissions',
    ];

    const tableStatus: Record<string, boolean> = {};

    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      tableStatus[table] = !error;
    }

    const allExist = Object.values(tableStatus).every((exists) => exists);

    return {
      test: 'Database Tables',
      status: allExist ? 'PASS' : 'FAIL',
      message: allExist
        ? 'All required tables exist'
        : 'Some tables are missing',
      data: tableStatus,
    };
  } catch (error) {
    return {
      test: 'Database Tables',
      status: 'FAIL',
      message: 'Failed to check tables',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testPsychometricQuestions(supabase: any): Promise<TestResult> {
  try {
    const { data, error } = await supabase
      .from('psych_questions')
      .select('id, trait, polarity')
      .order('id');

    if (error) {
      return {
        test: 'Psychometric Questions',
        status: 'FAIL',
        message: 'Failed to fetch psychometric questions',
        error: error.message,
      };
    }

    const count = data?.length || 0;
    const expected = 50;

    // Count questions per trait
    const traitCounts: Record<string, number> = {};
    data?.forEach((q: any) => {
      traitCounts[q.trait] = (traitCounts[q.trait] || 0) + 1;
    });

    return {
      test: 'Psychometric Questions',
      status: count === expected ? 'PASS' : 'FAIL',
      message: `Found ${count}/${expected} questions`,
      data: { total: count, byTrait: traitCounts },
    };
  } catch (error) {
    return {
      test: 'Psychometric Questions',
      status: 'FAIL',
      message: 'Error checking psychometric questions',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testAptitudeQuestions(supabase: any): Promise<TestResult> {
  try {
    const { data, error } = await supabase
      .from('aptitude_questions')
      .select('id, category')
      .order('id');

    if (error) {
      return {
        test: 'Aptitude Questions',
        status: 'FAIL',
        message: 'Failed to fetch aptitude questions',
        error: error.message,
      };
    }

    const count = data?.length || 0;
    const expected = 30;

    // Count questions per category
    const categoryCounts: Record<string, number> = {};
    data?.forEach((q: any) => {
      categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
    });

    return {
      test: 'Aptitude Questions',
      status: count === expected ? 'PASS' : 'FAIL',
      message: `Found ${count}/${expected} questions`,
      data: { total: count, byCategory: categoryCounts },
    };
  } catch (error) {
    return {
      test: 'Aptitude Questions',
      status: 'FAIL',
      message: 'Error checking aptitude questions',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProfile(supabase: any): Promise<TestResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        test: 'User Profile',
        status: 'SKIP',
        message: 'No authenticated user',
      };
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return {
        test: 'User Profile',
        status: 'FAIL',
        message: 'Error fetching profile',
        error: error.message,
      };
    }

    if (!profile) {
      return {
        test: 'User Profile',
        status: 'FAIL',
        message: 'Profile not found. Dashboard API will auto-create on first call.',
      };
    }

    return {
      test: 'User Profile',
      status: 'PASS',
      message: `Profile exists for ${profile.email}`,
      data: {
        email: profile.email,
        is_premium: profile.is_premium,
        role: profile.role,
      },
    };
  } catch (error) {
    return {
      test: 'User Profile',
      status: 'FAIL',
      message: 'Error checking profile',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =====================================================
// HTML REPORT GENERATOR
// =====================================================

function generateHTMLReport(results: TestResult[]): string {
  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;

  const overallStatus = failCount === 0 ? 'HEALTHY' : 'NEEDS ATTENTION';
  const statusColor = failCount === 0 ? '#10b981' : '#ef4444';

  return `
<!DOCTYPE html>
<html>
<head>
  <title>SOLVO Test Suite</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      background: white;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }
    .header h1 {
      font-size: 32px;
      color: #1a202c;
      margin-bottom: 10px;
    }
    .status {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-weight: 600;
      font-size: 14px;
      background: ${statusColor};
      color: white;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-top: 20px;
    }
    .stat {
      text-align: center;
      padding: 15px;
      background: #f7fafc;
      border-radius: 8px;
    }
    .stat-number {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-label {
      font-size: 12px;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .pass { color: #10b981; }
    .fail { color: #ef4444; }
    .skip { color: #f59e0b; }
    .test-card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .test-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    .test-name {
      font-size: 18px;
      font-weight: 600;
      color: #1a202c;
    }
    .test-status {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-pass { background: #d1fae5; color: #065f46; }
    .status-fail { background: #fee2e2; color: #991b1b; }
    .status-skip { background: #fef3c7; color: #92400e; }
    .test-message {
      color: #4a5568;
      margin-bottom: 10px;
    }
    .test-data {
      background: #f7fafc;
      border-radius: 6px;
      padding: 15px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
    }
    .test-error {
      background: #fee2e2;
      border-left: 4px solid #dc2626;
      padding: 12px;
      margin-top: 10px;
      border-radius: 4px;
      color: #991b1b;
      font-size: 14px;
    }
    .next-steps {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-top: 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .next-steps h2 {
      font-size: 20px;
      color: #1a202c;
      margin-bottom: 15px;
    }
    .next-steps ul {
      list-style: none;
      padding-left: 0;
    }
    .next-steps li {
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
      color: #4a5568;
    }
    .next-steps li:last-child {
      border-bottom: none;
    }
    .link {
      color: #667eea;
      text-decoration: none;
      font-weight: 500;
    }
    .link:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧪 SOLVO Backend Test Suite</h1>
      <span class="status">${overallStatus}</span>
      
      <div class="stats">
        <div class="stat">
          <div class="stat-number pass">${passCount}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat">
          <div class="stat-number fail">${failCount}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat">
          <div class="stat-number skip">${skipCount}</div>
          <div class="stat-label">Skipped</div>
        </div>
      </div>
    </div>

    ${results.map((result) => `
      <div class="test-card">
        <div class="test-header">
          <div class="test-name">${result.test}</div>
          <div class="test-status status-${result.status.toLowerCase()}">
            ${result.status}
          </div>
        </div>
        <div class="test-message">${result.message}</div>
        ${result.data ? `
          <div class="test-data">
            ${JSON.stringify(result.data, null, 2)}
          </div>
        ` : ''}
        ${result.error ? `
          <div class="test-error">
            <strong>Error:</strong> ${result.error}
          </div>
        ` : ''}
      </div>
    `).join('')}

    <div class="next-steps">
      <h2>📍 Next Steps</h2>
      <ul>
        ${failCount === 0 ? `
          <li>✅ All tests passed! Your backend is ready.</li>
          <li>🔗 <a href="/api/dashboard/profile" class="link">Test Dashboard Profile API</a></li>
          <li>🔗 <a href="/api/dashboard/psychometric" class="link">Test Psychometric Results API</a></li>
          <li>🔗 <a href="/api/dashboard/aptitude" class="link">Test Aptitude Results API</a></li>
          <li>💳 Next: Build Razorpay Webhook for payments</li>
        ` : `
          <li>⚠️ Fix failing tests before proceeding</li>
          <li>Check Supabase dashboard for missing tables/data</li>
          <li>Verify environment variables are set correctly</li>
        `}
      </ul>
    </div>
  </div>
</body>
</html>
  `;
}
