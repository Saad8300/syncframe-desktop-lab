-- 03_rpc_functions.sql
-- Server-side Credit Enforcement RPC Functions

-- ── 1. RESET MONTHLY CREDITS ──────────────────────────────────────────────────
-- Updates the user's monthly credits to their allocation if they are on an active paid plan.
-- Note: Free trial users do not get monthly resets.
CREATE OR REPLACE FUNCTION public.reset_monthly_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance RECORD;
  v_subscription RECORD;
BEGIN
  -- Security check: only admins or internal service role should execute this
  -- If we want to allow users to trigger it for themselves, we'd check auth.uid() = p_user_id.
  -- But here we enforce that it MUST be an admin calling it.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can manually trigger monthly resets';
  END IF;

  -- Fetch current subscription and balance
  SELECT * INTO v_subscription FROM public.subscriptions WHERE user_id = p_user_id;
  SELECT * INTO v_balance FROM public.credit_balances WHERE user_id = p_user_id FOR UPDATE;

  -- Verify it's not a free trial and is an active plan
  IF v_subscription.plan_id = 'free' OR v_subscription.status != 'active' THEN
    RETURN FALSE; -- No reset for free/failed users
  END IF;

  -- Verify billing period guard
  IF NOW() < v_balance.next_reset_at THEN
    RAISE EXCEPTION 'Too early to reset credits. Next reset is at %', v_balance.next_reset_at;
  END IF;

  -- Reset balance to monthly allocation (unused credits expire)
  UPDATE public.credit_balances 
  SET 
    balance = monthly_allocation,
    period_start = NOW(),
    next_reset_at = NOW() + INTERVAL '1 month'
  WHERE user_id = p_user_id;

  -- Log reset in ledger
  INSERT INTO public.credit_ledger (user_id, amount, transaction_type, description)
  VALUES (p_user_id, v_balance.monthly_allocation, 'reset', 'Monthly credit reset for active subscription');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 2. ESTIMATE CREDIT COST ───────────────────────────────────────────────────
-- Server-side deterministic cost calculation to prevent client spoofing.
CREATE OR REPLACE FUNCTION public.estimate_credit_cost(
  p_tool_name TEXT,
  p_duration_seconds INTEGER,
  p_options_json JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_base_cost INTEGER := 0;
  v_resolution TEXT;
  v_cost_per_min INTEGER := 5;
  v_is_batch BOOLEAN := COALESCE((p_options_json->>'is_batch')::boolean, FALSE);
  v_num_videos INTEGER := COALESCE((p_options_json->>'num_videos')::integer, 1);
  v_is_premium BOOLEAN := COALESCE((p_options_json->>'is_premium_template')::boolean, FALSE);
BEGIN
  IF p_tool_name NOT IN ('video_export', 'batch_video', 'audio_merger', 'script_timestamp', 'media_timeline', 'video_timeline') THEN
    RAISE EXCEPTION 'Unknown or unsupported tool: %', p_tool_name;
  END IF;

  IF p_tool_name = 'script_timestamp' THEN
    v_base_cost := GREATEST(1, CEIL(p_duration_seconds::NUMERIC / 60.0));
  ELSIF p_tool_name = 'audio_merger' THEN
    v_base_cost := GREATEST(1, CEIL(p_duration_seconds::NUMERIC / 300.0));
  ELSIF p_tool_name IN ('video_export', 'batch_video', 'media_timeline', 'video_timeline') THEN
    v_resolution := COALESCE(p_options_json->>'resolution', '720p');
    IF v_resolution = '1080p' THEN
      v_cost_per_min := 10;
    ELSIF v_resolution = '2K' THEN
      v_cost_per_min := 15;
    ELSIF v_resolution = '4K' THEN
      v_cost_per_min := 25;
    END IF;
    v_base_cost := GREATEST(v_cost_per_min, CEIL(p_duration_seconds::NUMERIC / 60.0) * v_cost_per_min);
  END IF;

  IF v_is_batch THEN
    v_base_cost := v_base_cost * v_num_videos;
  END IF;

  IF v_is_premium THEN
    v_base_cost := v_base_cost + 5;
  END IF;

  RETURN v_base_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 3. RESERVE CREDITS ────────────────────────────────────────────────────────
-- Deducts credits atomically and creates a pending usage job. Returns the Job ID.
-- Idempotent: If client_job_id already exists, returns the existing job ID.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_client_job_id TEXT,
  p_tool_name TEXT,
  p_duration_seconds INTEGER,
  p_client_estimated_cost INTEGER,
  p_options_json JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_current_balance INTEGER;
  v_min_cost INTEGER;
  v_subscription RECORD;
  v_existing_job_id UUID;
  v_new_job_id UUID;
  v_num_videos INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 0. Input Validation
  IF p_client_job_id IS NULL OR TRIM(p_client_job_id) = '' THEN
    RAISE EXCEPTION 'client_job_id must not be null or empty';
  END IF;

  IF p_tool_name NOT IN ('video_export', 'batch_video', 'audio_merger', 'script_timestamp', 'media_timeline', 'video_timeline') THEN
    RAISE EXCEPTION 'Unknown or unsupported tool: %', p_tool_name;
  END IF;

  IF p_duration_seconds < 0 THEN
    RAISE EXCEPTION 'duration_seconds must be >= 0';
  END IF;

  IF p_client_estimated_cost <= 0 THEN
    RAISE EXCEPTION 'client_estimated_cost must be > 0';
  END IF;
  
  v_num_videos := COALESCE((p_options_json->>'num_videos')::integer, 1);
  IF v_num_videos < 1 OR v_num_videos > 100 THEN
    RAISE EXCEPTION 'num_videos must be between 1 and 100';
  END IF;

  -- 1. Subscription Check
  SELECT * INTO v_subscription 
  FROM public.subscriptions 
  WHERE user_id = v_user_id;

  IF v_subscription IS NULL THEN
    RAISE EXCEPTION 'Subscription is not active';
  END IF;

  IF (v_subscription.plan_id = 'free' AND v_subscription.status != 'trialing') OR
     (v_subscription.plan_id != 'free' AND v_subscription.status != 'active') THEN
    RAISE EXCEPTION 'Subscription is not active';
  END IF;

  -- 2. Idempotency Check (Check before locking)
  SELECT id INTO v_existing_job_id 
  FROM public.usage_jobs 
  WHERE user_id = v_user_id AND client_job_id = p_client_job_id;

  IF v_existing_job_id IS NOT NULL THEN
    RETURN v_existing_job_id; -- Job already reserved and/or finished.
  END IF;

  -- 3. Check and lock credit balance
  SELECT balance INTO v_current_balance 
  FROM public.credit_balances 
  WHERE user_id = v_user_id
  FOR UPDATE; 

  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'Credit account not found for user';
  END IF;

  -- 4. Server-side cost validation
  v_min_cost := public.estimate_credit_cost(p_tool_name, p_duration_seconds, COALESCE(p_options_json, '{}'::jsonb));
  
  IF p_client_estimated_cost < v_min_cost THEN
    RAISE EXCEPTION 'Client estimated cost (%) is lower than server minimum (%)', p_client_estimated_cost, v_min_cost;
  END IF;

  IF v_current_balance < v_min_cost THEN
    RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %', v_min_cost, v_current_balance;
  END IF;

  -- 5. Create Pending Job with ON CONFLICT for safety
  INSERT INTO public.usage_jobs (user_id, client_job_id, tool_name, duration_seconds, cost, status, options_json)
  VALUES (v_user_id, p_client_job_id, p_tool_name, p_duration_seconds, v_min_cost, 'pending', COALESCE(p_options_json, '{}'::jsonb))
  ON CONFLICT (user_id, client_job_id) DO NOTHING
  RETURNING id INTO v_new_job_id;
  
  IF v_new_job_id IS NULL THEN
     -- Race condition: another transaction just inserted it. Return the existing one.
     SELECT id INTO v_new_job_id 
     FROM public.usage_jobs 
     WHERE user_id = v_user_id AND client_job_id = p_client_job_id;
     RETURN v_new_job_id;
  END IF;

  -- 6. Deduct credits
  UPDATE public.credit_balances 
  SET 
    balance = balance - v_min_cost,
    lifetime_used = lifetime_used + v_min_cost
  WHERE user_id = v_user_id;

  -- 7. Log Deduction to Ledger
  INSERT INTO public.credit_ledger (user_id, amount, transaction_type, job_id, description)
  VALUES (v_user_id, -v_min_cost, 'deduction', v_new_job_id::TEXT, 'Credit reservation for ' || p_tool_name);

  RETURN v_new_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 4. FINALIZE JOB ───────────────────────────────────────────────────────────
-- Marks a job as success, or refunds the credits if failed/cancelled.
CREATE OR REPLACE FUNCTION public.finalize_job(
  p_client_job_id TEXT,
  p_status TEXT -- 'success', 'failed', or 'cancelled'
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_job RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch Job
  SELECT * INTO v_job 
  FROM public.usage_jobs 
  WHERE client_job_id = p_client_job_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found or does not belong to user', p_client_job_id;
  END IF;

  IF v_job.status != 'pending' THEN
    RAISE EXCEPTION 'Job is already finalized (status: %)', v_job.status;
  END IF;

  IF p_status NOT IN ('success', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status. Must be "success", "failed", or "cancelled"';
  END IF;

  -- Update Job Status
  UPDATE public.usage_jobs 
  SET status = p_status 
  WHERE id = v_job.id;

  -- If failed or cancelled, refund credits
  IF p_status IN ('failed', 'cancelled') THEN
    -- Refund balance and revert lifetime_used
    UPDATE public.credit_balances 
    SET 
      balance = balance + v_job.cost,
      lifetime_used = GREATEST(0, lifetime_used - v_job.cost)
    WHERE user_id = v_user_id;

    -- Log Refund to Ledger
    INSERT INTO public.credit_ledger (user_id, amount, transaction_type, job_id, description)
    VALUES (v_user_id, v_job.cost, 'refund', v_job.id::TEXT, 'Refund for ' || p_status || ' ' || v_job.tool_name);
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 5. FUNCTION EXECUTE PERMISSIONS ───────────────────────────────────────────

-- Revoke default public execution
REVOKE EXECUTE ON FUNCTION public.reset_monthly_credits(UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.estimate_credit_cost(TEXT, INTEGER, JSONB) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(TEXT, TEXT, INTEGER, INTEGER, JSONB) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_job(TEXT, TEXT) FROM public, anon, authenticated;

-- Grant execution to authenticated users for client-facing functions
GRANT EXECUTE ON FUNCTION public.estimate_credit_cost(TEXT, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(TEXT, TEXT, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_job(TEXT, TEXT) TO authenticated;

-- Allow reset_monthly_credits for authenticated users (since the admin guard is securely inside it)
GRANT EXECUTE ON FUNCTION public.reset_monthly_credits(UUID) TO authenticated;
-- Allow reset_monthly_credits for the service role (cron jobs)
GRANT EXECUTE ON FUNCTION public.reset_monthly_credits(UUID) TO service_role;
