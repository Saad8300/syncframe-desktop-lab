-- 04_add_text_to_speech_tool.sql
-- Adds 'text_to_speech' to the tool allowlists in the credit RPCs.
--
-- WHY THIS IS REQUIRED: estimate_credit_cost() and reserve_credits() both
-- validate p_tool_name against a hardcoded list and RAISE EXCEPTION
-- 'Unknown or unsupported tool' for anything else. Without this migration
-- applied to the live database, every Text to Speech generation fails at
-- the credit-reservation step before any audio is produced.
--
-- Pricing mirrors backend/plan_limits.py CREDIT_COSTS["text_to_speech"]:
-- 1 credit per minute of generated audio, minimum 1 — same rate as
-- script_timestamp. Callers pass an estimated duration derived from the
-- character count (see TTS_CHARS_PER_SECOND).
--
-- Only the two tool-name checks and the TTS cost branch change; all other
-- logic in these functions is preserved verbatim from 03_rpc_functions.sql.

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
  IF p_tool_name NOT IN ('video_export', 'batch_video', 'audio_merger', 'script_timestamp', 'media_timeline', 'video_timeline', 'text_to_speech') THEN
    RAISE EXCEPTION 'Unknown or unsupported tool: %', p_tool_name;
  END IF;

  IF p_tool_name = 'script_timestamp' THEN
    v_base_cost := GREATEST(1, CEIL(p_duration_seconds::NUMERIC / 60.0));
  ELSIF p_tool_name = 'text_to_speech' THEN
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

  IF p_tool_name NOT IN ('video_export', 'batch_video', 'audio_merger', 'script_timestamp', 'media_timeline', 'video_timeline', 'text_to_speech') THEN
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

-- Re-grant execute permissions (CREATE OR REPLACE preserves them, but this
-- is idempotent and keeps the migration self-contained).
GRANT EXECUTE ON FUNCTION public.estimate_credit_cost(TEXT, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(TEXT, TEXT, INTEGER, INTEGER, JSONB) TO authenticated;
