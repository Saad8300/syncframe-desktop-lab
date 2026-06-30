import React from 'react'
import { usePlan } from '../../hooks/usePlan'

interface PlanBadgeProps {
  planId?: string
  size?: 'sm' | 'md'
}

export function PlanBadge({ planId, size = 'md' }: PlanBadgeProps) {
  const { plan, loading } = usePlan()

  if (loading && !planId) {
    return <div className="h-5 w-16 bg-[var(--bg-input)] rounded animate-pulse" />
  }

  const displayName = planId ? (planId.charAt(0).toUpperCase() + planId.slice(1)) : (plan?.display_name || 'Free Trial')

  return (
    <div className={`inline-flex items-center justify-center rounded font-bold ${size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}
      style={{
        background: 'var(--accent-subtle)',
        color: 'var(--accent-primary)',
        border: '1px solid var(--accent-border)'
      }}
    >
      {displayName}
    </div>
  )
}

