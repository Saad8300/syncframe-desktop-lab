-- ==========================================
-- SyncFrame Studio Plans & Credits Schema
-- ==========================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. PLANS TABLE
CREATE TABLE IF NOT EXISTS public.plans (
  id text primary key,
  display_name text not null,
  monthly_credits integer not null default 0,
  limits jsonb default '{}'::jsonb not null,
  features jsonb default '[]'::jsonb not null,
  price_placeholder text,
  active boolean default true not null,
  sort_order integer default 0 not null
);

-- 3. USER SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  plan_id text references public.plans(id) not null,
  status text not null default 'trialing', -- active, trialing, expired, blocked, cancelled
  current_period_start timestamp with time zone default now() not null,
  current_period_end timestamp with time zone,
  provider_placeholder text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique (user_id)
);

-- 4. USER CREDITS TABLE
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  balance integer default 0 not null,
  monthly_allocation integer default 0 not null,
  lifetime_used integer default 0 not null,
  period_start timestamp with time zone default now() not null,
  period_end timestamp with time zone,
  free_video_exports_used integer default 0 not null,
  updated_at timestamp with time zone default now() not null
);

-- 5. CREDIT TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null, -- grant, reserve, deduct, refund, adjustment
  amount integer not null,
  balance_after integer not null,
  reason text,
  tool text,
  reference_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null
);

-- 6. USAGE EVENTS TABLE
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tool text not null,
  status text not null default 'estimated', -- estimated, started, completed, failed, refunded
  credits_estimated integer default 0 not null,
  credits_charged integer default 0 not null,
  duration_seconds numeric,
  resolution text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Plans are public read-only
CREATE POLICY "Plans are publicly viewable" ON public.plans FOR SELECT USING (true);

-- Users can read their own data
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can read own subscription" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own credits" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can read own usage events" ON public.usage_events FOR SELECT USING (auth.uid() = user_id);

-- ==========================================
-- SEED DATA: PLANS
-- ==========================================

INSERT INTO public.plans (id, display_name, monthly_credits, limits, features, sort_order)
VALUES 
  ('free', 'Free Trial', 30, 
   '{"max_video_exports": 3, "max_video_length": 60, "max_audio_length": 60, "max_timestamp_length": 60, "max_resolution": "720p", "watermark": true, "batch_enabled": false, "n8n_enabled": false, "premium_templates": false}', 
   '["30 one-time credits", "3 video exports", "Max 60s duration", "720p export", "Watermark enabled"]',
   1),
  ('standard', 'Standard', 500, 
   '{"max_video_length": 180, "max_audio_length": 300, "max_timestamp_length": 300, "max_resolution": "1080p", "watermark": true, "batch_enabled": false, "n8n_enabled": false, "premium_templates": false}', 
   '["500 credits / month", "Up to 3-min videos", "1080p export", "Basic timeline tools", "Save templates"]',
   2),
  ('pro', 'Pro', 2000, 
   '{"max_video_length": 900, "max_audio_length": 1800, "max_timestamp_length": 1800, "max_resolution": "1080p", "watermark": false, "batch_enabled": true, "n8n_enabled": true, "premium_templates": true}', 
   '["2,000 credits / month", "Up to 15-min videos", "No watermark", "Batch Video Generator", "Premium templates", "n8n automations"]',
   3),
  ('ultra', 'Ultra', 10000, 
   '{"max_video_length": 3600, "max_audio_length": 7200, "max_timestamp_length": 7200, "max_resolution": "4K", "watermark": false, "batch_enabled": true, "n8n_enabled": true, "premium_templates": true}', 
   '["10,000 credits / month", "High-volume fair use", "4K export", "Large batch generation", "Commercial usage"]',
   4)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  monthly_credits = EXCLUDED.monthly_credits,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order;

-- ==========================================
-- TRIGGERS (Automate Profile & Free Trial Creation)
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  
  -- Create free subscription
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
  VALUES (new.id, 'free', 'trialing');

  -- Grant 30 initial free credits
  INSERT INTO public.user_credits (user_id, balance, monthly_allocation, lifetime_used)
  VALUES (new.id, 30, 0, 0);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run handle_new_user on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
