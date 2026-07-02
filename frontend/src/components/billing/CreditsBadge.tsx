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
  
  let resetDateStr = ''
  const isPaid = plan && plan.id !== 'free'
  const dStr = credits?.next_reset_at || subscription?.current_period_end
  if (dStr) {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dStr))
      resetDateStr = isPaid ? `Credits renew: ${formatted}` : `Trial credits expire when used`
    } catch (e) {
      // Ignore
    }
  } else if (!isPaid) {
    resetDateStr = 'Trial credits do not renew'
  }

  return (
    <div className="flex flex-col gap-1 w-full" title={isFreeTrial ? "Remaining trial credits" : "Unused monthly credits expire at the end of each billing cycle."}>
      <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium w-full"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)'
        }}
      >
        <IconZap size={12} className="text-cyan-500 flex-shrink-0" />
        <span className="truncate">{remaining.toLocaleString()} / {total.toLocaleString()} {isFreeTrial ? 'trial credits' : 'monthly credits'}</span>
      </div>
      {resetDateStr && (
        <div className="text-[9px] text-[var(--text-muted)] text-center px-1 font-medium">
          {resetDateStr}
        </div>
      )}
    </div>
  )
}

