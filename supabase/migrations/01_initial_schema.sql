-- 01_initial_schema.sql
-- SyncFrame Studio Database Schema Initialization

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';


-- ── 1. PROFILES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 2. PLANS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monthly_credits INTEGER NOT NULL,
  limits_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  price_placeholder TEXT,
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3. SUBSCRIPTIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) NOT NULL UNIQUE,
  plan_id TEXT REFERENCES public.plans(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','trialing','past_due','cancelled','expired','inactive')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 4. CREDIT BALANCES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_balances (
  user_id UUID REFERENCES public.profiles(id) PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  monthly_allocation INTEGER NOT NULL DEFAULT 30 CHECK (monthly_allocation >= 0),
  lifetime_used INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_used >= 0),
  period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
DROP TRIGGER IF EXISTS update_credit_balances_updated_at ON public.credit_balances;
CREATE TRIGGER update_credit_balances_updated_at BEFORE UPDATE ON public.credit_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 5. CREDIT LEDGER ──────────────────────────────────────────────────────────
-- Transaction types: grant, deduction, refund, reset, admin_adjustment
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('grant','deduction','refund','reset','admin_adjustment')),
  job_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 6. USAGE JOBS ─────────────────────────────────────────────────────────────
-- Statuses: pending, success, failed, cancelled
CREATE TABLE IF NOT EXISTS public.usage_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  client_job_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0 CHECK (duration_seconds >= 0),
  cost INTEGER NOT NULL CHECK (cost > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  options_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, client_job_id)
);
DROP TRIGGER IF EXISTS update_usage_jobs_updated_at ON public.usage_jobs;
CREATE TRIGGER update_usage_jobs_updated_at BEFORE UPDATE ON public.usage_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ── 7. ADMIN USERS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── INITIAL SEED DATA ─────────────────────────────────────────────────────────

-- Free Plan
INSERT INTO public.plans (id, display_name, monthly_credits, limits_json, active, sort_order)
VALUES (
  'free',
  'Free Trial',
  30,
  '{"max_video_exports": 3, "max_video_length": 60, "max_audio_length": 60, "max_timestamp_length": 60, "max_resolution": "720p", "watermark": true, "batch_enabled": false, "premium_templates": false}'::jsonb,
  true,
  1
)
ON CONFLICT (id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  monthly_credits = EXCLUDED.monthly_credits,
  limits_json = EXCLUDED.limits_json,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  price_placeholder = EXCLUDED.price_placeholder;

-- Starter Plan
INSERT INTO public.plans (id, display_name, monthly_credits, limits_json, active, sort_order)
VALUES (
  'starter',
  'Starter',
  1500,
  '{"max_video_exports": 9999, "max_video_length": 300, "max_audio_length": 300, "max_timestamp_length": 300, "max_resolution": "1080p", "watermark": false, "batch_enabled": true, "premium_templates": false}'::jsonb,
  true,
  2
)
ON CONFLICT (id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  monthly_credits = EXCLUDED.monthly_credits,
  limits_json = EXCLUDED.limits_json,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  price_placeholder = EXCLUDED.price_placeholder;

-- Pro Plan
INSERT INTO public.plans (id, display_name, monthly_credits, limits_json, active, sort_order)
VALUES (
  'pro',
  'Pro',
  6000,
  '{"max_video_exports": 9999, "max_video_length": 1800, "max_audio_length": 1800, "max_timestamp_length": 1800, "max_resolution": "4K", "watermark": false, "batch_enabled": true, "premium_templates": true}'::jsonb,
  true,
  3
)
ON CONFLICT (id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  monthly_credits = EXCLUDED.monthly_credits,
  limits_json = EXCLUDED.limits_json,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  price_placeholder = EXCLUDED.price_placeholder;

-- Agency Plan
INSERT INTO public.plans (id, display_name, monthly_credits, limits_json, active, sort_order)
VALUES (
  'agency',
  'Agency',
  10000,
  '{"max_video_exports": 9999, "max_video_length": 3600, "max_audio_length": 3600, "max_timestamp_length": 3600, "max_resolution": "4K", "watermark": false, "batch_enabled": true, "premium_templates": true}'::jsonb,
  true,
  4
)
ON CONFLICT (id) DO UPDATE SET 
  display_name = EXCLUDED.display_name,
  monthly_credits = EXCLUDED.monthly_credits,
  limits_json = EXCLUDED.limits_json,
  active = EXCLUDED.active,
  sort_order = EXCLUDED.sort_order,
  price_placeholder = EXCLUDED.price_placeholder;


-- ── NEW USER TRIGGER ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Create Profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Free Subscription
  INSERT INTO public.subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'trialing')
  ON CONFLICT (user_id) DO NOTHING;

  -- 3. Create Initial Credit Balance (30 credits)
  INSERT INTO public.credit_balances (user_id, balance, monthly_allocation)
  VALUES (NEW.id, 30, 30)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── EXISTING USER BACKFILL ────────────────────────────────────────────────────
-- Safe function to generate profiles, subscriptions, and credit_balances for old accounts
CREATE OR REPLACE FUNCTION public.backfill_existing_users()
RETURNS VOID AS $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN SELECT * FROM auth.users LOOP
    -- Profile
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
      v_user.id,
      v_user.email,
      v_user.raw_user_meta_data->>'full_name',
      v_user.raw_user_meta_data->>'avatar_url'
    ) ON CONFLICT (id) DO NOTHING;
    
    -- Subscription
    INSERT INTO public.subscriptions (user_id, plan_id, status)
    VALUES (v_user.id, 'free', 'trialing')
    ON CONFLICT (user_id) DO NOTHING;
    
    -- Credit Balance
    INSERT INTO public.credit_balances (user_id, balance, monthly_allocation)
    VALUES (v_user.id, 30, 30)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Execute backfill immediately upon migration
SELECT public.backfill_existing_users();

-- Drop function so it cannot be abused or exposed
DROP FUNCTION IF EXISTS public.backfill_existing_users();
