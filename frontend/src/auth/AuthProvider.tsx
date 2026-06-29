// frontend/src/auth/AuthProvider.tsx
// Auth context providing Google login, logout, and session management via Supabase.

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
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDesktopPackaged(): boolean {
  // Injected by Electron when running as a packaged app
  return !!(window as any).syncframeDesktop?.isPackaged
}

function isElectron(): boolean {
  return !!(window as any).syncframeDesktop
}

function getOAuthRedirectUrl(): string {
  // Packaged desktop → use custom protocol so OS routes the callback back into the app
  if (isDesktopPackaged()) {
    return (
      import.meta.env.VITE_AUTH_REDIRECT_DESKTOP || 'syncframe://auth/callback'
    )
  }
  // Electron dev mode or browser → use localhost callback
  return (
    import.meta.env.VITE_AUTH_REDIRECT_DEV || 'http://localhost:5173/auth/callback'
  )
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
  signInWithGoogle: async () => {},
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

  // ── Bootstrap: load existing session ────────────────────────────────────────
  useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false)
      return
    }

    // Get the current session from localStorage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ? mapSupabaseUser(session.user) : null)
      setLoading(false)
    })

    // Subscribe to auth state changes (login, logout, token refresh)
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
          // Extract the fragment or query params from the deep link URL
          // e.g. syncframe://auth/callback#access_token=...
          const url = new URL(callbackUrl)
          const hashParams = new URLSearchParams(url.hash.replace('#', ''))
          const queryParams = new URLSearchParams(url.search)

          const accessToken =
            hashParams.get('access_token') || queryParams.get('access_token')
          const refreshToken =
            hashParams.get('refresh_token') || queryParams.get('refresh_token')

          if (accessToken && refreshToken) {
            const { error } = await supabase!.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (error) setAuthError(error.message)
          }
        } catch (e: any) {
          setAuthError('Failed to process auth callback: ' + e.message)
        }
      })
    }
  }, [configured])

  // ── Actions ──────────────────────────────────────────────────────────────────

  const signInWithGoogle = useCallback(async () => {
    if (!configured || !supabase) {
      setAuthError('Supabase auth is not configured. Add frontend/.env.local first.')
      return
    }
    setAuthError(null)
    try {
      const redirectTo = getOAuthRedirectUrl()

      if (isDesktopPackaged()) {
        // Packaged desktop: generate the OAuth URL, then open it in the system browser
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo, skipBrowserRedirect: true },
        })
        if (error) throw error
        if (data?.url) {
          // Use Electron's shell.openExternal bridge exposed from preload
          const desktop = (window as any).syncframeDesktop
          if (typeof desktop?.openExternalUrl === 'function') {
            desktop.openExternalUrl(data.url)
          } else {
            window.open(data.url, '_blank')
          }
        }
      } else {
        // Browser / Electron dev mode: let Supabase handle the redirect normally
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        })
        if (error) throw error
      }
    } catch (e: any) {
      setAuthError(e.message || 'Google sign-in failed. Please try again.')
    }
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

  // ── Dev bypass (local dev only, never shipped) ─────────────────────────────
  const isAuthenticated = devBypass || (session !== null && user !== null)

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthenticated,
        authError,
        isConfigured: configured,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
