import React from 'react'
import { IconZap, IconX } from '../icons'
import { WEBSITE_URLS } from '../../lib/websiteLinks'

interface AccessLimitModalProps {
  isOpen: boolean
  onClose: () => void
  reason?: string
  requiredPlan?: string
  requiredCredits?: number
  currentPlan?: string
  currentCredits?: number
  onFallbackAction?: () => void
  fallbackActionLabel?: string
}

export function AccessLimitModal({
  isOpen,
  onClose,
  reason,
  requiredPlan,
  requiredCredits,
  currentPlan,
  currentCredits,
  onFallbackAction,
  fallbackActionLabel
}: AccessLimitModalProps) {
  if (!isOpen) return null

  const isLoginRequired = reason?.toLowerCase().includes('sign in') || reason?.toLowerCase().includes('log in')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" style={{ WebkitAppRegion: 'no-drag' } as any}>
      <div 
        className="relative w-full max-w-md p-6 rounded-2xl shadow-2xl animate-slide-up"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
        >
          <IconX size={20} />
        </button>

        <div className="flex flex-col items-center text-center mt-2">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
            style={{
              background: 'var(--accent-subtle)',
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-border)'
            }}
          >
            <IconZap size={24} />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {isLoginRequired ? 'Sign in required' : 'Upgrade required'}
          </h2>
          
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            {reason || 'This feature is available on Pro and Agency plans.'}
          </p>

          {!isLoginRequired && (requiredPlan || currentPlan) && (
            <div className="w-full flex justify-between items-center px-4 py-3 rounded-xl mb-6"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="text-left">
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Your Plan</p>
                <p className="text-sm font-semibold mt-0.5 text-white">{currentPlan || 'Free Trial'}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Required</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--accent-primary)' }}>{requiredPlan === 'Ultra' ? 'Agency' : requiredPlan === 'Standard' ? 'Starter' : (requiredPlan || 'Pro')}</p>
              </div>
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            {!isLoginRequired && (
              <a
                href={WEBSITE_URLS.PRICING}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block py-2.5 rounded-xl font-semibold text-sm text-center transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), #8b5cf6)',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
                }}
                onClick={onClose}
              >
                View upgrade options
              </a>
            )}

            {onFallbackAction && fallbackActionLabel && (
              <button
                onClick={() => {
                  onFallbackAction()
                  onClose()
                }}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)'
                }}
              >
                {fallbackActionLabel}
              </button>
            )}

            {!isLoginRequired && !onFallbackAction && (
              <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Plan upgrades are managed securely on the SyncFrame Studio website.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
