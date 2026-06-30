import React from 'react'

export function UpgradeModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="w-full max-w-sm rounded-xl overflow-hidden shadow-2xl relative"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="p-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-500 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            </svg>
          </div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Payments Coming Soon
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Plan upgrade system will be connected in the next payment batch. Please contact your admin to manually activate this plan.
          </p>
          <button
            onClick={onClose}
            className="w-full mt-6 py-2.5 rounded-lg font-bold transition-colors"
            style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
