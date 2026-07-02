
export interface PlanLimits {
  max_video_exports?: number
  max_video_length: number
  max_audio_length: number
  max_timestamp_length: number
  max_resolution: string
  watermark: boolean
  batch_enabled: boolean
  premium_templates: boolean
}

export interface Plan {
  id: string
  display_name: string
  monthly_credits: number
  limits: PlanLimits
  features: string[]
  price_placeholder?: string
  active: boolean
  sort_order: number
}

export interface Subscription {
  id: string
  user_id: string
  plan_id: string
  status: string
  current_period_start: string
  current_period_end?: string
}

export interface ToolAccessResult {
  allowed: boolean
  reason: string
  requiredCredits: number
  upgradeRequired: boolean
  planLimitExceeded: boolean
  requiredPlan?: string
  limitType: "login" | "plan" | "credits" | "duration" | "resolution" | "tool" | "batch" | "free_exports" | "none"
  suggestedFix?: string
}

export const FALLBACK_FREE_PLAN: Plan = {
  id: 'free',
  display_name: 'Free Trial',
  monthly_credits: 30,
  limits: {
    max_video_exports: 3,
    max_video_length: 60,
    max_audio_length: 60,
    max_timestamp_length: 60,
    max_resolution: '720p',
    watermark: true,
    batch_enabled: false,
    premium_templates: false,
  },
  features: [
    '30 one-time credits',
    '3 video exports',
    'Max 60s duration',
    '720p export',
    'Watermark enabled'
  ],
  active: true,
  sort_order: 1
}

export function normalizePlanId(planId: string): string {
  const normalized = planId.toLowerCase().trim()
  if (normalized === 'standard') return 'starter'
  if (normalized === 'premium') return 'pro'
  if (normalized === 'ultra' || normalized === 'enterprise') return 'agency'
  return normalized
}

export function canUseTool(
  plan: Plan | null,
  credits: number,
  tool: string,
  requestedOptions: { duration_seconds?: number, resolution?: string, is_premium_template?: boolean, is_batch?: boolean } = {},
  estimatedCredits: number = 0,
  planLoading: boolean = false // Actually passed as !initialized now
): ToolAccessResult {
  if (planLoading) {
    return {
      allowed: false,
      reason: 'Checking plan...',
      requiredCredits: estimatedCredits,
      upgradeRequired: false,
      planLimitExceeded: false,
      limitType: 'plan',
      suggestedFix: 'Please wait while we verify your plan.'
    }
  }

  const currentPlan = plan || FALLBACK_FREE_PLAN
  const limits = currentPlan.limits
  
  // 1. Check Plan Limits
  if (requestedOptions.is_batch && !limits.batch_enabled) {
    return {
      allowed: false,
      reason: `Batch Video Generator is not available on the ${currentPlan.display_name} plan.`,
      requiredCredits: 0,
      upgradeRequired: true,
      planLimitExceeded: true,
      requiredPlan: 'Pro',
      limitType: 'batch',
      suggestedFix: 'Upgrade to Pro or Agency'
    }
  }



  if (requestedOptions.is_premium_template && !limits.premium_templates) {
    return {
      allowed: false,
      reason: `Premium templates are not available on the ${currentPlan.display_name} plan.`,
      requiredCredits: 0,
      upgradeRequired: true,
      planLimitExceeded: true,
      requiredPlan: 'Pro',
      limitType: 'tool',
      suggestedFix: 'Upgrade to Pro or Agency'
    }
  }


  
  const dur = requestedOptions.duration_seconds || 0
  if (tool === 'video_export' || tool === 'batch_video') {
    if (dur > limits.max_video_length) {
      return {
        allowed: false,
        reason: `Video length exceeds your plan limit (${limits.max_video_length}s).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true,
        requiredPlan: dur > 900 ? 'Agency' : (dur > 180 ? 'Pro' : 'Starter'),
        limitType: 'duration',
        suggestedFix: 'Shorten your video or upgrade your plan'
      }
    }
    const resMap: Record<string, number> = { "720p": 720, "1080p": 1080, "2K": 1440, "4K": 2160 }
    const reqRes = resMap[requestedOptions.resolution || '720p'] || 720
    const limitRes = resMap[limits.max_resolution || '720p'] || 720
    if (reqRes > limitRes) {
      return {
        allowed: false,
        reason: `Resolution ${requestedOptions.resolution} exceeds your plan limit (${limits.max_resolution}).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true,
        requiredPlan: reqRes >= 2160 ? 'Agency' : (reqRes >= 1080 ? 'Starter' : 'Pro'),
        limitType: 'resolution',
        suggestedFix: 'Select a lower resolution or upgrade your plan'
      }
    }
  } else if (tool === 'audio_merger') {
    if (dur > limits.max_audio_length) {
      return {
        allowed: false,
        reason: `Audio length exceeds your plan limit (${limits.max_audio_length}s).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true,
        requiredPlan: dur > 1800 ? 'Agency' : (dur > 300 ? 'Pro' : 'Starter'),
        limitType: 'duration',
        suggestedFix: 'Shorten your audio or upgrade your plan'
      }
    }
  } else if (tool === 'script_timestamp') {
    if (dur > limits.max_timestamp_length) {
      return {
        allowed: false,
        reason: `Script duration exceeds your plan limit (${limits.max_timestamp_length}s).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true,
        requiredPlan: dur > 1800 ? 'Agency' : (dur > 300 ? 'Pro' : 'Starter'),
        limitType: 'duration',
        suggestedFix: 'Shorten your script or upgrade your plan'
      }
    }
  }

  // 2. Check Credits
  if (estimatedCredits > 0 && credits < estimatedCredits) {
    return {
      allowed: false,
      reason: `Insufficient credits. You need ${estimatedCredits}, but only have ${credits}.`,
      requiredCredits: estimatedCredits,
      upgradeRequired: true,
      planLimitExceeded: false,
      limitType: 'credits',
      suggestedFix: 'Upgrade your plan to get more credits'
    }
  }

  return {
    allowed: true,
    reason: 'OK',
    requiredCredits: estimatedCredits,
    upgradeRequired: false,
    planLimitExceeded: false,
    limitType: 'none'
  }
}
