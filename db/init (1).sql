-- =====================================================
-- RLS POLICIES: profiles
-- =====================================================

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Allow users to view their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ✅ CRITICAL: Allow users to INSERT their own profile
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- =====================================================
-- RLS POLICIES: psych_questions
-- =====================================================

DROP POLICY IF EXISTS "psych_questions_select_authenticated" ON public.psych_questions;

CREATE POLICY "psych_questions_select_authenticated"
  ON public.psych_questions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);


-- =====================================================
-- RLS POLICIES: psych_results
-- =====================================================

DROP POLICY IF EXISTS "psych_results_select_own" ON public.psych_results;
DROP POLICY IF EXISTS "psych_results_insert_own" ON public.psych_results;

CREATE POLICY "psych_results_select_own"
  ON public.psych_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "psych_results_insert_own"
  ON public.psych_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- =====================================================
-- RLS POLICIES: aptitude_questions
-- =====================================================

DROP POLICY IF EXISTS "aptitude_questions_select_authenticated" ON public.aptitude_questions;

CREATE POLICY "aptitude_questions_select_authenticated"
  ON public.aptitude_questions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);


-- =====================================================
-- RLS POLICIES: aptitude_submissions
-- =====================================================

DROP POLICY IF EXISTS "aptitude_submissions_select_own" ON public.aptitude_submissions;
DROP POLICY IF EXISTS "aptitude_submissions_insert_own" ON public.aptitude_submissions;

CREATE POLICY "aptitude_submissions_select_own"
  ON public.aptitude_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "aptitude_submissions_insert_own"
  ON public.aptitude_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);


-- =====================================================
-- RLS POLICIES: orders
-- =====================================================

DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;

CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "orders_insert_own"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);