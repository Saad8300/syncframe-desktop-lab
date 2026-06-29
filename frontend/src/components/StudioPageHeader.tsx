import React from 'react'

interface Props {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

/**
 * StudioPageHeader — shared premium page header for all Studio pages.
 * Provides consistent icon + title + subtitle layout.
 */
export default function StudioPageHeader({ icon, title, subtitle, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight leading-tight" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h1>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
