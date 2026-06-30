import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabaseClient'
import { UserCredits } from '../lib/credits'

export function useCredits() {
  const { user, isAuthenticated, isConfigured } = useAuth()
  const [credits, setCredits] = useState<UserCredits | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    
    async function loadCredits() {
      if (!isAuthenticated || !user || !isConfigured || !supabase) {
        if (mounted) {
          setCredits(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const { data, error } = await supabase
          .from('user_credits')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.warn("Failed to fetch credits", error)
          throw error
        }

        if (mounted) {
          if (data) {
            setCredits(data as UserCredits)
          } else {
            // Safe fallback if row doesn't exist
            setCredits({
              user_id: user.id,
              balance: 30, // assume trial default
              monthly_allocation: 0,
              lifetime_used: 0,
              period_start: new Date().toISOString(),
              free_video_exports_used: 0
            })
          }
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Credits load error:", err)
          setError(err.message)
          setCredits(null)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadCredits()

    return () => { mounted = false }
  }, [user, isAuthenticated, isConfigured])

  // Helpers
  const remaining = credits?.balance ?? 0

  return { credits, remaining, loading, error }
}
