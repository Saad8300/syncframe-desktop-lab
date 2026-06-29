import React, { useState, useEffect, useCallback } from 'react'
import type { ToastEventPayload } from '../utils/notifications'

interface ToastItem extends ToastEventPayload {
  id: string
}

export default function NotificationToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    const handleToast = (e: Event) => {
      const customEvent = e as CustomEvent<ToastEventPayload>
      const newToast: ToastItem = { ...customEvent.detail, id: Math.random().toString(36).substring(2, 9) }
      
      setToasts(prev => [...prev, newToast])
      
      // Auto dismiss after 5 seconds
      setTimeout(() => {
        removeToast(newToast.id)
      }, 5000)
    }

    window.addEventListener('syncframe-toast', handleToast)
    return () => window.removeEventListener('syncframe-toast', handleToast)
  }, [removeToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-full max-w-xs sm:max-w-sm">
      {toasts.map(toast => {
        const isSuccess = toast.type === 'success'
        const isError = toast.type === 'error'
        const isWarning = toast.type === 'warning'
        
        const bgColor = isSuccess ? 'bg-green-500/10 dark:bg-green-500/20' :
                        isError ? 'bg-red-500/10 dark:bg-red-500/20' :
                        isWarning ? 'bg-orange-500/10 dark:bg-orange-500/20' :
                        'bg-[var(--bg-elevated)]'
                        
        const borderColor = isSuccess ? 'border-green-500/30' :
                            isError ? 'border-red-500/30' :
                            isWarning ? 'border-orange-500/30' :
                            'border-[var(--border-subtle)]'
                            
        const iconColor = isSuccess ? 'text-green-600 dark:text-green-400' :
                          isError ? 'text-red-600 dark:text-red-400' :
                          isWarning ? 'text-orange-600 dark:text-orange-400' :
                          'text-blue-600 dark:text-blue-400'
                          
        const icon = isSuccess ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          ) : isError ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          ) : isWarning ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          )

        return (
          <div 
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-xl border ${bgColor} ${borderColor} shadow-lg backdrop-blur-md animate-fade-in flex p-4`}
          >
            <div className={`shrink-0 mr-3 mt-0.5 ${iconColor}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{toast.title}</h4>
              {toast.message && (
                <p className="text-xs mt-1 leading-snug truncate" style={{ color: 'var(--text-muted)' }}>
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 ml-3 p-1 rounded-lg opacity-50 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors self-start"
              style={{ color: 'var(--text-primary)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
