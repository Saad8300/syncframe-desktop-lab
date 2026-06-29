// frontend/src/lib/supabaseClient.ts
// Supabase client initialization — safe, non-crashing when env vars are missing.

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Returns true if both required Supabase env vars are present and look valid.
 */
export function isAuthConfigured(): boolean {
  return (
    typeof supabaseUrl === 'string' &&
    supabaseUrl.startsWith('https://') &&
    supabaseUrl.includes('.supabase.co') &&
    typeof supabaseAnonKey === 'string' &&
    supabaseAnonKey.length > 20
  )
}

/**
 * The Supabase client. Will be null if env vars are not configured — callers
 * must check `isAuthConfigured()` before using this.
 */
export let supabase: SupabaseClient | null = null

if (isAuthConfigured()) {
  supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      // Persist session in localStorage so it survives page reloads/restarts
      persistSession: true,
      // Automatically refresh the access token before it expires
      autoRefreshToken: true,
      // Detect the session from the URL after OAuth redirect
      detectSessionInUrl: true,
    },
  })
}
