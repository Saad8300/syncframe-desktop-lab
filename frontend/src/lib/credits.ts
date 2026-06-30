export interface UserCredits {
  user_id: string
  balance: number
  monthly_allocation: number
  lifetime_used: number
  period_start: string
  period_end?: string
  free_video_exports_used: number
}

export interface CreditEstimateResponse {
  required_credits: number
  breakdown: Array<{label: string, credits: number}>
  plan_notes: string
}

export async function estimateCredits(tool: string, options: any): Promise<number> {
  // Placeholder frontend credit estimation
  const dur = options.duration_seconds || 60
  const is_batch = options.is_batch || false
  const num_videos = options.num_videos || 1

  let baseCost = 0
  if (tool === 'script_timestamp') baseCost = Math.max(1, Math.ceil(dur / 60))
  else if (tool === 'audio_merger') baseCost = Math.max(1, Math.ceil(dur / 300))
  else if (tool === 'video_export' || tool === 'batch_video') {
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

export async function reserveCredits(userId: string, amount: number): Promise<boolean> {
  console.log(`[Credits] Reserving ${amount} credits for user ${userId}`)
  // TODO: Implement actual backend reservation
  return true
}

export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  console.log(`[Credits] Deducting ${amount} credits for user ${userId}`)
  // TODO: Implement actual backend deduction
  
  // Local Free Trial tracking
  const count = parseInt(localStorage.getItem('free_exports') || '0', 10)
  localStorage.setItem('free_exports', (count + 1).toString())
  
  return true
}

export async function refundCredits(userId: string, amount: number): Promise<boolean> {
  console.log(`[Credits] Refunding ${amount} credits for user ${userId}`)
  // TODO: Implement actual backend refund
  return true
}

export function getFreeExportCount(): number {
  return parseInt(localStorage.getItem('free_exports') || '0', 10)
}
