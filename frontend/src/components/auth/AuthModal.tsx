import React, { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { IconX, IconBrandGoogle, IconAlertCircle } from '../icons'

export function AuthModal() {
  const {
    authModalOpen,
    setAuthModalOpen,
    signInWithGoogle,
    signInWithPassword,
    signUp,
    isConfigured,
    authError
  } = useAuth()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!authModalOpen) return null

  const handleClose = () => {
    setAuthModalOpen(false)
    setLocalError(null)
    setSuccessMsg(null)
    setEmail('')
    setPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isConfigured) return

    setLoading(true)
    setLocalError(null)
    setSuccessMsg(null)

    try {
      if (mode === 'login') {
        await signInWithPassword(email, password)
        // If successful, Provider sets authModalOpen(false)
      } else {
        await signUp(email, password)
        setSuccessMsg('Account created! Please check your email to confirm if required, then sign in.')
        setMode('login')
      }
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLocalError(null)
    try {
      await signInWithGoogle()
    } catch (err: any) {
      setLocalError(err.message || 'Google sign-in failed.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md p-8 rounded-2xl bg-[#0b101a] border border-[#1e293b] shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button */}
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
        >
          <IconX size={20} />
        </button>

        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'Sign in to SyncFrame Studio' : 'Create your account'}
          </h2>
          <p className="text-sm text-slate-400">
            {mode === 'login' ? 'Welcome back! Please enter your details.' : 'Start creating automated faceless videos.'}
          </p>
        </div>

        {/* Configuration Warning */}
        {!isConfigured && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
            <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
            <p>Supabase auth is not configured. Add <code>frontend/.env.local</code> first to enable login.</p>
          </div>
        )}

        {/* Global or Local Error */}
        {(authError || localError) && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {localError || authError}
          </div>
        )}

        {/* Success Message */}
        {successMsg && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            {successMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!isConfigured || loading}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isConfigured || loading}
              className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#1e293b] rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit"
            disabled={!isConfigured || loading}
            className="w-full mt-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : (mode === 'login' ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-px flex-1 bg-[#1e293b]"></div>
          <span>or continue with</span>
          <div className="h-px flex-1 bg-[#1e293b]"></div>
        </div>

        {/* Google Login */}
        <button 
          onClick={handleGoogleSignIn}
          disabled={!isConfigured || loading}
          className="w-full py-2.5 px-4 flex items-center justify-center gap-3 bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <IconBrandGoogle size={20} />
          Continue with Google
        </button>

        {/* Toggle Mode */}
        <div className="text-center text-sm text-slate-400 mt-2">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button 
                onClick={() => { setMode('signup'); setLocalError(null); setSuccessMsg(null); }}
                className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button 
                onClick={() => { setMode('login'); setLocalError(null); setSuccessMsg(null); }}
                className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Sign in
              </button>
            </>
          )}
        </div>

        {/* Privacy Note */}
        <p className="text-xs text-center text-slate-500 mt-4 px-4">
          Your media files stay on your device. Login is only used for account access and settings.
        </p>

      </div>
    </div>
  )
}
