// frontend/src/auth/AuthProvider.tsx
// Auth context providing Google login, email/password login, logout, and session management via Supabase.

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isAuthConfigured } from '../lib/supabaseClient'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string | null
  name: string | null
  avatarUrl: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  isAuthenticated: boolean
  authError: string | null
  isConfigured: boolean
  
  // Modal state
  authModalOpen: boolean
  setAuthModalOpen: (open: boolean) => void
  
  // Helpers
  requireAuth: () => boolean

  // Auth Methods
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, pass: string) => Promise<void>
  signUp: (email: string, pass: string) => Promise<void>
  signOut: () => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDesktopPackaged(): boolean {
  return !!(window as any).syncframeDesktop?.isPackaged
}

function isElectron(): boolean {
  return !!(window as any).syncframeDesktop
}

function getOAuthRedirectUrl(): string {
  if (isDesktopPackaged()) {
    return import.meta.env.VITE_AUTH_REDIRECT_DESKTOP || 'syncframe://auth/callback'
  }
  return import.meta.env.VITE_AUTH_REDIRECT_DEV || 'http://localhost:5173/auth/callback'
}

function mapSupabaseUser(user: User): AuthUser {
  const meta = user.user_metadata || {}
  return {
    id: user.id,
    email: user.email ?? null,
    name: meta.full_name || meta.name || meta.user_name || null,
    avatarUrl: meta.avatar_url || meta.picture || null,
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  isAuthenticated: false,
  authError: null,
  isConfigured: false,
  authModalOpen: false,
  setAuthModalOpen: () => {},
  requireAuth: () => false,
  signInWithGoogle: async () => {},
  signInWithPassword: async () => {},
  signUp: async () => {},
  signOut: async () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured()
  const devBypass = import.meta.env.VITE_AUTH_DISABLED_FOR_DEV === 'true'

  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false)

  // ── Bootstrap: load existing session ────────────────────────────────────────
  useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ? mapSupabaseUser(session.user) : null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ? mapSupabaseUser(session.user) : null)
        setLoading(false)
        setAuthError(null)
      }
    )

    return () => subscription.unsubscribe()
  }, [configured])

  // ── Desktop deep-link callback handling ─────────────────────────────────────
  useEffect(() => {
    if (!configured || !supabase || !isElectron()) return

    const desktop = (window as any).syncframeDesktop
    if (typeof desktop?.onAuthCallback === 'function') {
      desktop.onAuthCallback(async (callbackUrl: string) => {
        try {
          const url = new URL(callbackUrl)
          const hashParams = new URLSearchParams(url.hash.replace('#', ''))
          const queryParams = new URLSearchParams(url.search)

          const accessToken = hashParams.get('access_token') || queryParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token')

          if (accessToken && refreshToken) {
            const { error } = await supabase!.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) setAuthError(error.message)
            else setAuthModalOpen(false) // Close modal on successful deep-link login
          }
        } catch (e: any) {
          setAuthError('Failed to process auth callback: ' + e.message)
        }
      })
    }
  }, [configured])

  // ── Actions ──────────────────────────────────────────────────────────────────

  const isAuthenticated = devBypass || (session !== null && user !== null)

  const requireAuth = useCallback(() => {
    if (isAuthenticated) return true
    setAuthModalOpen(true)
    return false
  }, [isAuthenticated])

  const signInWithGoogle = useCallback(async () => {
    if (!configured || !supabase) {
      setAuthError('Supabase auth is not configured. Add frontend/.env.local first.')
      return
    }
    setAuthError(null)
    try {
      const redirectTo = getOAuthRedirectUrl()

      if (isDesktopPackaged()) {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        })
        if (error) throw error
        if (data?.url) {
          const desktop = (window as any).syncframeDesktop
          if (typeof desktop?.openExternalUrl === 'function') {
            desktop.openExternalUrl(data.url)
          } else {
            window.open(data.url, '_blank')
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })
        if (error) throw error
      }
    } catch (e: any) {
      setAuthError(e.message || 'Google sign-in failed. Please try again.')
      throw e
    }
  }, [configured])

  const signInWithPassword = useCallback(async (email: string, pass: string) => {
    if (!configured || !supabase) {
      throw new Error('Supabase auth is not configured.')
    }
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    setAuthModalOpen(false) // Close modal on success
  }, [configured])

  const signUp = useCallback(async (email: string, pass: string) => {
    if (!configured || !supabase) {
      throw new Error('Supabase auth is not configured.')
    }
    setAuthError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password: pass,
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
    // Typically signup might require email confirmation, 
    // the UI component should check if session is null after signup to show a message.
  }, [configured])

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null)
      setUser(null)
      return
    }
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError(error.message)
    else {
      setSession(null)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthenticated,
        authError,
        isConfigured: configured,
        authModalOpen,
        setAuthModalOpen,
        requireAuth,
        signInWithGoogle,
        signInWithPassword,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
