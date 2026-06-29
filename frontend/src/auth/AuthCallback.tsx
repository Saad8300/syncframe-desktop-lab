// frontend/src/auth/AuthCallback.tsx
// Handles the OAuth redirect callback in browser/Electron-dev mode.
// Shown at /auth/callback — Supabase auto-processes the hash/query tokens
// via detectSessionInUrl:true in supabaseClient.ts.

import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setStatus('error')
      setErrorMsg('Supabase is not configured.')
      return
    }

    // Supabase detectSessionInUrl handles the token exchange automatically.
    // We just need to wait for onAuthStateChange to fire.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setStatus('success')
        // Small delay so user sees the success state, then navigate to app root
        setTimeout(() => {
          window.location.replace('/')
        }, 1200)
      } else if (event === 'INITIAL_SESSION') {
        // Check if there's already a session
        supabase!.auth.getSession().then(({ data, error }) => {
          if (error) {
            setStatus('error')
            setErrorMsg(error.message)
          } else if (data.session) {
            setStatus('success')
            setTimeout(() => window.location.replace('/'), 1200)
          } else {
            // No session found — user may have arrived here directly
            setStatus('error')
            setErrorMsg('No authentication session found. Please try signing in again.')
          }
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-app, #080c14)',
      color: 'var(--text-primary, #f1f5f9)',
      fontFamily: "'Inter', sans-serif",
      gap: '1.5rem',
    }}>
      {/* Lightning bolt icon */}
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.9 }}>
        <polygon
          points="13,2 4.5,13.5 11,13.5 11,22 19.5,10.5 13,10.5"
          fill="url(#cbGrad)"
          stroke="rgba(6,182,212,0.4)"
          strokeWidth="0.5"
        />
        <defs>
          <linearGradient id="cbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      </svg>

      {status === 'loading' && (
        <>
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>Signing you in…</div>
          <div style={{ width: 40, height: 40, border: '3px solid rgba(99,102,241,0.3)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}

      {status === 'success' && (
        <>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#10b981' }}>✓ Signed in successfully</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted, #64748b)' }}>Redirecting to SyncFrame Studio…</div>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f43f5e' }}>Sign-in failed</div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)', textAlign: 'center', maxWidth: 380 }}>
            {errorMsg || 'Something went wrong during authentication.'}
          </div>
          <button
            onClick={() => window.location.replace('/')}
            style={{
              marginTop: '0.5rem',
              padding: '0.6rem 1.5rem',
              borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Back to Login
          </button>
        </>
      )}
    </div>
  )
}
