import { supabase } from './supabaseClient'

export interface UserCredits {
  user_id: string
  balance: number
  monthly_allocation: number
  lifetime_used: number
  period_start: string
  next_credit_reset_at?: string
  free_video_exports_used?: number
}

export async function estimateCredits(tool: string, options: any): Promise<number> {
  // Client-side estimation (Backend actually strictly enforces the final minimum)
  const dur = options.duration_seconds || 60
  const is_batch = options.is_batch || false
  const num_videos = options.num_videos || 1

  let baseCost = 0
  if (tool === 'script_timestamp') baseCost = Math.max(1, Math.ceil(dur / 60))
  else if (tool === 'audio_merger') baseCost = Math.max(1, Math.ceil(dur / 300))
  else if (tool === 'video_export' || tool === 'batch_video' || tool === 'media_timeline' || tool === 'video_timeline') {
    const res = options.resolution || '720p'
    let costPerMin = 5
    if (res === '1080p') costPerMin = 10
    else if (res === '2K') costPerMin = 15
    else if (res === '4K') costPerMin = 25
    baseCost = Math.max(costPerMin, Math.ceil(dur / 60) * costPerMin)
  }

  let totalCost = baseCost
  if (is_batch) totalCost *= num_videos

  if (options.is_premium_template) totalCost += 5

  return totalCost
}

export async function reserveCredits(
  toolName: string,
  durationSeconds: number,
  clientEstimatedCost: number,
  clientJobId: string,
  optionsJson: any = {}
): Promise<string> {
  console.log(`[Credits] Reserving ${clientEstimatedCost} credits for job ${clientJobId} (${toolName})`)
  
  if (!supabase) {
    throw new Error('Supabase client not initialized');
  }

  const { data, error } = await supabase.rpc('reserve_credits', {
    p_client_job_id: clientJobId,
    p_tool_name: toolName,
    p_duration_seconds: durationSeconds,
    p_client_estimated_cost: clientEstimatedCost,
    p_options_json: optionsJson
  });

  if (error) {
    console.error('[Credits] Reservation failed:', error);
    throw error;
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
