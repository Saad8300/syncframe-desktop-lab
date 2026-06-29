// frontend/src/components/auth/LoginPage.tsx
// Premium SyncFrame Studio login page — dark, clean, professional.

import React, { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'

export default function LoginPage() {
  const { signInWithGoogle, authError, isConfigured } = useAuth()
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    if (!isConfigured) return
    setLoading(true)
    setLocalError(null)
    try {
      await signInWithGoogle()
    } catch (e: any) {
      setLocalError(e.message || 'Sign-in failed. Please try again.')
    } finally {
      // Keep loading until auth state change fires or error shown
      setTimeout(() => setLoading(false), 8000)
    }
  }

  const displayError = localError || authError

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .login-page-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #080c14;
          font-family: 'Inter', system-ui, sans-serif;
          position: relative;
          overflow: hidden;
        }

        .login-bg-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 60% 40% at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(6,182,212,0.07) 0%, transparent 60%);
        }

        .login-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          margin: 1.5rem;
          background: #0f1623;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 24px;
          padding: 2.5rem 2rem;
          box-shadow:
            0 0 0 1px rgba(99,102,241,0.06),
            0 24px 64px rgba(0,0,0,0.5),
            0 0 80px rgba(99,102,241,0.06);
        }

        .login-logo {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2rem;
        }

        .login-logo-inner {
          width: 72px;
          height: 72px;
          border-radius: 20px;
          background: linear-gradient(135deg, #0e1a2e, #0f1f3d);
          border: 1px solid rgba(6,182,212,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 0 24px rgba(6,182,212,0.15),
            0 8px 24px rgba(0,0,0,0.4);
        }

        .login-title {
          text-align: center;
          margin-bottom: 0.5rem;
          font-size: 1.5rem;
          font-weight: 800;
          background: linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.25;
        }

        .login-subtitle {
          text-align: center;
          color: #64748b;
          font-size: 0.875rem;
          line-height: 1.6;
          margin-bottom: 2rem;
          padding: 0 0.5rem;
        }

        .login-google-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          border-radius: 14px;
          background: #fff;
          color: #1e293b;
          font-weight: 600;
          font-size: 0.9375rem;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow: hidden;
        }

        .login-google-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }

        .login-google-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .login-google-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .login-divider {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 1.5rem 0;
          color: #334155;
          font-size: 0.75rem;
        }

        .login-divider::before,
        .login-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.06);
        }

        .login-privacy {
          display: flex;
          align-items: flex-start;
          gap: 0.625rem;
          padding: 0.875rem 1rem;
          background: rgba(6,182,212,0.06);
          border: 1px solid rgba(6,182,212,0.12);
          border-radius: 12px;
          margin-top: 1.5rem;
        }

        .login-privacy-icon {
          flex-shrink: 0;
          margin-top: 1px;
          color: #06b6d4;
        }

        .login-privacy-text {
          font-size: 0.8125rem;
          color: #64748b;
          line-height: 1.55;
        }

        .login-error-box {
          display: flex;
          align-items: flex-start;
          gap: 0.625rem;
          padding: 0.875rem 1rem;
          background: rgba(244,63,94,0.08);
          border: 1px solid rgba(244,63,94,0.2);
          border-radius: 12px;
          margin-top: 1rem;
        }

        .login-error-text {
          font-size: 0.8125rem;
          color: #fb7185;
          line-height: 1.55;
        }

        .login-config-warn {
          padding: 1rem;
          background: rgba(245,158,11,0.08);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 12px;
          margin-bottom: 1.25rem;
        }

        .login-config-warn-title {
          font-size: 0.875rem;
          font-weight: 700;
          color: #f59e0b;
          margin-bottom: 0.375rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .login-config-warn-body {
          font-size: 0.8125rem;
          color: #78716c;
          line-height: 1.6;
          font-family: monospace;
        }

        .login-spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(99,102,241,0.3);
          border-top: 2px solid #6366f1;
          border-radius: 50%;
          animation: loginSpin 0.7s linear infinite;
          flex-shrink: 0;
        }

        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }

        .login-footer {
          text-align: center;
          margin-top: 1.5rem;
          font-size: 0.75rem;
          color: #334155;
        }
      `}</style>

      <div className="login-page-bg">
        <div className="login-bg-glow" />

        <div className="login-card">
          {/* Logo */}
          <div className="login-logo">
            <div className="login-logo-inner">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <polygon
                  points="13,2 4.5,13.5 11,13.5 11,22 19.5,10.5 13,10.5"
                  fill="url(#loginGrad)"
                />
                <defs>
                  <linearGradient id="loginGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>

          {/* Headline */}
          <h1 className="login-title">Welcome to<br />SyncFrame Studio</h1>
          <p className="login-subtitle">
            Sign in to access your local video automation studio.
          </p>

          {/* Config warning if Supabase not set up */}
          {!isConfigured && (
            <div className="login-config-warn">
              <div className="login-config-warn-title">
                <span>⚠</span> Supabase auth is not configured
              </div>
              <div className="login-config-warn-body">
                Create <strong>frontend/.env.local</strong> and add:<br />
                <code>VITE_SUPABASE_URL</code><br />
                <code>VITE_SUPABASE_ANON_KEY</code><br /><br />
                See <strong>AUTH_SETUP.md</strong> for setup instructions.
              </div>
            </div>
          )}

          {/* Google login button */}
          <button
            id="login-google-btn"
            className="login-google-btn"
            onClick={handleGoogleLogin}
            disabled={loading || !isConfigured}
          >
            {loading ? (
              <div className="login-spinner" />
            ) : (
              /* Google "G" SVG */
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? 'Opening Google Sign-In…' : 'Continue with Google'}
          </button>

          {/* Error display */}
          {displayError && (
            <div className="login-error-box">
              <span style={{ flexShrink: 0 }}>⚠</span>
              <p className="login-error-text">{displayError}</p>
            </div>
          )}

          <div className="login-divider">Your local studio, secured by Google</div>

          {/* Privacy note */}
          <div className="login-privacy">
            <svg className="login-privacy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <p className="login-privacy-text">
              <strong style={{ color: '#94a3b8' }}>Your video files stay on your device.</strong><br />
              Login is used only for access control. All video rendering happens locally on your machine. No files are uploaded to any server during sign-in.
            </p>
          </div>

          {/* Footer */}
          <p className="login-footer">SyncFrame Studio · Local-first video automation</p>
        </div>
      </div>
    </>
  )
}
