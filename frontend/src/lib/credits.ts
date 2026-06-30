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
