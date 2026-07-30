-- 05_add_tts_translation_surcharge.sql
-- Adds the Auto-Translate surcharge to estimate_credit_cost().
--
-- WHY THIS IS REQUIRED: reserve_credits() charges v_min_cost, the value
-- estimate_credit_cost() returns — NOT the client's declared cost. The client
-- check is only `IF p_client_estimated_cost < v_min_cost THEN RAISE`, so a
-- client that declares MORE (generation + translation) passes the check and
-- is then charged the server's LOWER number. Without this migration the
-- translation surcharge is silently never charged: generation still works,
-- but the extra credits are given away.
--
-- Pricing mirrors backend/plan_limits.py TTS_TRANSLATION_CHARS_PER_CREDIT:
-- 1 credit per 1,000 characters translated, minimum 1, added on top of the
-- generation cost. Implemented as an options_json addon, exactly like the
-- existing is_premium_template (+5) addon.
--
-- Only the translation addon is added; every other branch is preserved
-- verbatim from 04_add_text_to_speech_tool.sql.

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
  v_translate_chars INTEGER := COALESCE((p_options_json->>'translate_chars')::integer, 0);
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

  -- Auto-Translate surcharge (Text to Speech): 1 credit per 1,000 chars, min 1.
  IF v_translate_chars > 0 THEN
    v_base_cost := v_base_cost + GREATEST(1, CEIL(v_translate_chars::NUMERIC / 1000.0));
  END IF;

  IF v_is_premium THEN
    v_base_cost := v_base_cost + 5;
  END IF;

  RETURN v_base_cost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.estimate_credit_cost(TEXT, INTEGER, JSONB) TO authenticated;
