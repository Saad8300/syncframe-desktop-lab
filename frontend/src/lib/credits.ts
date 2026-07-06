import { supabase } from './supabaseClient'
import { apiUrl } from '../utils/api'

export interface UserCredits {
  user_id: string
  balance: number
  monthly_allocation: number
  lifetime_used: number
  period_start: string
  next_credit_reset_at?: string
  free_video_exports_used?: number
}

export function classifyReservationError(err: any): { type: 'plan_limit' | 'insufficient_credits' | 'pricing_mismatch' | 'network' | 'unknown', message: string } {
  const msg = err?.message || String(err);
  const lowerMsg = msg.toLowerCase();

  if (lowerMsg.includes('lower than server minimum') || lowerMsg.includes('client estimated cost')) {
    return { type: 'pricing_mismatch', message: 'Client and server pricing mismatch. Please try again or contact support.' };
  }
  if (lowerMsg.includes('insufficient credits') || lowerMsg.includes('not enough credits')) {
    return { type: 'insufficient_credits', message: msg };
  }
  if (lowerMsg.includes('premium template requires') || lowerMsg.includes('batch requires') || lowerMsg.includes('requires a higher plan') || lowerMsg.includes('watermark removal')) {
    return { type: 'plan_limit', message: msg };
  }
  if (lowerMsg.includes('fetch') || lowerMsg.includes('network') || lowerMsg.includes('invalid input syntax')) {
    return { type: 'network', message: 'Internet connection is required to verify credits before starting this export.' };
  }
  return { type: 'unknown', message: msg };
}

export async function estimateCredits(tool: string, options: any): Promise<number> {
  const dur = Math.max(1, Math.ceil(Number(options.duration_seconds) || 60))
  const num_videos = options.num_videos || 1

  try {
    const res = await fetch(apiUrl('/api/credits/estimate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: tool,
        duration_seconds: dur,
        resolution: options.resolution || '1080p',
        count: num_videos,
        premium_template: options.is_premium_template || false
      })
    })

    if (!res.ok) {
      console.warn('Backend estimation failed, falling back.')
      return Math.max(1, Math.ceil(dur / 60)) * 5 * num_videos
    }

    const data = await res.json()
    return data.required_credits
  } catch (err) {
    console.error('Failed to estimate credits:', err)
    return Math.max(1, Math.ceil(dur / 60)) * 5 * num_videos
  }
}

export async function reserveCredits(
  toolName: string,
  durationSeconds: number,
  clientEstimatedCost: number,
  clientJobId: string,
  optionsJson: any = {}
): Promise<string> {
  const safeDurationSeconds = Math.max(1, Math.ceil(Number(durationSeconds) || 60))
  const safeEstimatedCost = Math.max(1, Math.ceil(Number(clientEstimatedCost) || 1))

  console.log(`[Credits] Reserving ${safeEstimatedCost} credits for job ${clientJobId} (${toolName})`)

  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.rpc('reserve_credits', {
    p_client_job_id: clientJobId,
    p_tool_name: toolName,
    p_duration_seconds: safeDurationSeconds,
    p_client_estimated_cost: safeEstimatedCost,
    p_options_json: optionsJson
  });

  if (error) {
    console.error('[Credits] Reservation failed:', error);
    // Suppress raw database syntax/connection errors from UI
    if (error.message && (error.message.includes('invalid input syntax') || error.message.includes('fetch'))) {
      throw new Error('Internet connection is required to verify credits before starting this export.')
    }
    throw new Error(error.message || 'Unable to verify credits. Please try again.')
  }

  window.dispatchEvent(new Event('syncframe:credits-updated'))
  return data as string; // returns the UUID of the usage_job
}

export async function finalizeJob(
  clientJobId: string,
  status: 'success' | 'failed' | 'cancelled'
): Promise<boolean> {
  console.log(`[Credits] Finalizing job ${clientJobId} as ${status}`)

  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  const { data, error } = await supabase.rpc('finalize_job', {
    p_client_job_id: clientJobId,
    p_status: status
  });

  if (error) {
    console.error('[Credits] Finalization failed:', error);
    // Even if it fails (e.g. network issue), the backend handles the pending state, but it might tie up credits.
    return false;
  }

  window.dispatchEvent(new Event('syncframe:credits-updated'))
  return !!data;
}
