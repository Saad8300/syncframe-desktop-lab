export interface PlanLimits {
  max_video_exports?: number
  max_video_length: number
  max_audio_length: number
  max_timestamp_length: number
  max_resolution: string
  watermark: boolean
  batch_enabled: boolean
  n8n_enabled: boolean
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
    n8n_enabled: false,
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

export function canUseTool(
  plan: Plan | null,
  credits: number,
  tool: string,
  requestedOptions: { duration_seconds?: number, resolution?: string, is_premium_template?: boolean, is_n8n?: boolean, is_batch?: boolean } = {},
  estimatedCredits: number = 0
): ToolAccessResult {
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
      requiredPlan: 'Pro' // Or whatever
    }
  }

  if (requestedOptions.is_n8n && !limits.n8n_enabled) {
    return {
      allowed: false,
      reason: `n8n Webhook Automations are not available on the ${currentPlan.display_name} plan.`,
      requiredCredits: 0,
      upgradeRequired: true,
      planLimitExceeded: true
    }
  }

  if (requestedOptions.is_premium_template && !limits.premium_templates) {
    return {
      allowed: false,
      reason: `Premium templates are not available on the ${currentPlan.display_name} plan.`,
      requiredCredits: 0,
      upgradeRequired: true,
      planLimitExceeded: true
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
        planLimitExceeded: true
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
        requiredPlan: reqRes >= 2160 ? 'Ultra' : (reqRes >= 1080 ? 'Standard' : 'Pro')
      }
    }
  } else if (tool === 'audio_merger') {
    if (dur > limits.max_audio_length) {
      return {
        allowed: false,
        reason: `Audio length exceeds your plan limit (${limits.max_audio_length}s).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true
      }
    }
  } else if (tool === 'script_timestamp') {
    if (dur > limits.max_timestamp_length) {
      return {
        allowed: false,
        reason: `Script duration exceeds your plan limit (${limits.max_timestamp_length}s).`,
        requiredCredits: 0,
        upgradeRequired: true,
        planLimitExceeded: true
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
      planLimitExceeded: false
    }
  }

  return {
    allowed: true,
    reason: 'OK',
    requiredCredits: estimatedCredits,
    upgradeRequired: false,
    planLimitExceeded: false
  }
}
