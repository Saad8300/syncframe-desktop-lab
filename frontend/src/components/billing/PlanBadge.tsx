import React from 'react'
import { usePlan } from '../../hooks/usePlan'

export function PlanBadge() {
  const { plan, loading } = usePlan()

  if (loading) {
    return <div className="h-5 w-16 bg-[var(--bg-input)] rounded animate-pulse" />
  }

  return (
    <div className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold"
      style={{
        background: 'var(--accent-subtle)',
        color: 'var(--accent-primary)',
        border: '1px solid var(--accent-border)'
      }}
    >
      {plan?.display_name || 'Free Trial'}
    </div>
  )
}
