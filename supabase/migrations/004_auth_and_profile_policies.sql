-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 004_auth_and_profile_policies.sql
-- IIITL FM — Strict campus domain check and profile upsert policies
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Refined is_iiitl_student() function ──────────────────────────────────
-- Enforces case-insensitive exact domain check: must end with '@iiitl.ac.in'
-- and not lookalike domains like 'fake-iiitl.ac.in' or 'iiitl.ac.in.attacker.com'.
CREATE OR REPLACE FUNCTION public.is_iiitl_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND lower(auth.jwt() ->> 'email') ~ '^[a-zA-Z0-9._%+-]+@iiitl\.ac\.in$';
$$;

-- ─── 2. Profiles INSERT policy ────────────────────────────────────────────────
-- Allows authenticated IIITL students to insert their own profile record
-- during client/server-side upsert in the OAuth callback.
DROP POLICY IF EXISTS "Profiles: users can insert their own profile" ON public.profiles;
CREATE POLICY "Profiles: users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND public.is_iiitl_student()
  );

-- ─── 3. Profiles UPDATE policy refinement ─────────────────────────────────────
-- Ensure update also verifies student status and prevents ID mutation.
DROP POLICY IF EXISTS "Profiles: users can update their own profile" ON public.profiles;
CREATE POLICY "Profiles: users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND public.is_iiitl_student())
  WITH CHECK (auth.uid() = id);
