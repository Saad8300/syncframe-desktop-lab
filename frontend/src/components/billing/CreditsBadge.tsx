import React from 'react'
import { useCredits } from '../../hooks/useCredits'
import { usePlan } from '../../hooks/usePlan'
import { IconZap } from '../icons'

export function CreditsBadge() {
  const { remaining, loading: loadingCredits } = useCredits()
  const { plan, loading: loadingPlan } = usePlan()

  if (loadingCredits || loadingPlan) {
    return <div className="h-5 w-20 bg-[var(--bg-input)] rounded animate-pulse" />
  }

  const total = plan?.monthly_credits || 30

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)'
      }}
      title="Remaining credits"
    >
      <IconZap size={12} className="text-cyan-500" />
      <span>{remaining.toLocaleString()} / {total.toLocaleString()}</span>
    </div>
  )
}
