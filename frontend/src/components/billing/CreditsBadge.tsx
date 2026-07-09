import React from 'react'
import { useCredits } from '../../hooks/useCredits'
import { usePlan } from '../../hooks/usePlan'
import { IconZap } from '../icons'

export function CreditsBadge() {
  const { credits, remaining, loading: loadingCredits } = useCredits()
  const { plan, subscription, loading: loadingPlan } = usePlan()

  const isHydrated = (plan && plan.id !== 'free') || (!loadingPlan && !loadingCredits);
  
  if ((loadingCredits || loadingPlan) && !isHydrated) {
    return <div className="h-5 w-20 bg-[var(--bg-input)] rounded animate-pulse inline-flex items-center justify-center text-[10px] text-[var(--text-secondary)]">...</div>
  }

  const total = plan?.monthly_credits || credits?.monthly_allocation || 30
  const isFreeTrial = !plan || plan.id === 'free' || plan.id === 'free_trial';
  
  const percentage = Math.min(100, Math.max(0, (remaining / total) * 100))
  
  let resetDateStr = ''
  const isPaid = plan && plan.id !== 'free'
  const dStr = credits?.next_reset_at || subscription?.current_period_end
  if (dStr) {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dStr))
      resetDateStr = isPaid ? `Renews ${formatted}` : `Expires when used`
    } catch (e) {
      // Ignore
    }
  } else if (!isPaid) {
    resetDateStr = 'Does not renew'
  }

  return (
    <div className="flex flex-col gap-1.5 w-full" title={isFreeTrial ? "Remaining trial credits" : "Unused monthly credits expire at the end of each billing cycle."}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1">
          <IconZap size={12} className="text-cyan-400" />
          Credits
        </span>
        <span className="text-[11px] font-bold text-[var(--text-primary)]">
          {remaining.toLocaleString()} <span className="text-[10px] text-[var(--text-muted)] font-normal">/ {total.toLocaleString()}</span>
        </span>
      </div>
      <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      {resetDateStr && (
        <div className="text-[9px] text-[var(--text-muted)] mt-0.5 font-medium">
          {resetDateStr}
        </div>
      )}
    </div>
  )
}

