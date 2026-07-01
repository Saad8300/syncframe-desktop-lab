-- 02_rls_policies.sql
-- Row Level Security (RLS) Policies for SyncFrame Studio

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;


-- ── HELPER: IS_ADMIN ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 1. PROFILES ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);


-- ── 2. PLANS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.plans;
CREATE POLICY "Anyone can view active plans" 
ON public.plans FOR SELECT 
USING (active = true);


-- ── 3. SUBSCRIPTIONS ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" 
ON public.subscriptions FOR SELECT 
USING (auth.uid() = user_id);


-- ── 4. CREDIT BALANCES ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own credit balances" ON public.credit_balances;
CREATE POLICY "Users can view own credit balances" 
ON public.credit_balances FOR SELECT 
USING (auth.uid() = user_id);

-- Note: No UPDATE/INSERT policies for regular users. 
-- Credits are modified exclusively via secure RPC functions using SECURITY DEFINER.


-- ── 5. CREDIT LEDGER ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own credit ledger" ON public.credit_ledger;
CREATE POLICY "Users can view own credit ledger" 
ON public.credit_ledger FOR SELECT 
USING (auth.uid() = user_id);


-- ── 6. USAGE JOBS ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own usage jobs" ON public.usage_jobs;
CREATE POLICY "Users can view own usage jobs" 
ON public.usage_jobs FOR SELECT 
USING (auth.uid() = user_id);

-- ── 7. ADMIN BYPASS (All Tables) ──────────────────────────────────────────────
-- Admins have full SELECT/INSERT/UPDATE/DELETE access to all tables.

DROP POLICY IF EXISTS "Admins have full access to profiles" ON public.profiles;
CREATE POLICY "Admins have full access to profiles" ON public.profiles FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to plans" ON public.plans;
CREATE POLICY "Admins have full access to plans" ON public.plans FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to subscriptions" ON public.subscriptions;
CREATE POLICY "Admins have full access to subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to credit_balances" ON public.credit_balances;
CREATE POLICY "Admins have full access to credit_balances" ON public.credit_balances FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to credit_ledger" ON public.credit_ledger;
CREATE POLICY "Admins have full access to credit_ledger" ON public.credit_ledger FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to usage_jobs" ON public.usage_jobs;
CREATE POLICY "Admins have full access to usage_jobs" ON public.usage_jobs FOR ALL USING (public.is_admin());

DROP POLICY IF EXISTS "Admins have full access to admin_users" ON public.admin_users;
CREATE POLICY "Admins have full access to admin_users" ON public.admin_users FOR ALL USING (public.is_admin());
