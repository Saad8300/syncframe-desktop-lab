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
      // Fallback local trial if completely disconnected / not logged in
      const getLocalCredits = (): UserCredits => {
        return {
          user_id: user?.id || 'local',
          balance: 0,
          monthly_allocation: 30,
          lifetime_used: 0,
          period_start: new Date().toISOString()
        };
      };

      if (!isAuthenticated || !user || !isConfigured || !supabase) {
        if (mounted) {
          setCredits(getLocalCredits());
          setLoading(false);
        }
        return;
      }

      setLoading(true)
      setError(null)
      try {
        const { data, error } = await supabase
          .from('credit_balances')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error && error.code !== 'PGRST116') {
          console.warn("Failed to fetch credit_balances", error)
          throw error
        }

        if (mounted) {
          if (data) {
            setCredits({
              user_id: data.user_id,
              balance: data.balance,
              monthly_allocation: data.monthly_allocation,
              lifetime_used: data.lifetime_used,
              period_start: data.period_start,
              next_credit_reset_at: data.next_reset_at,
              free_video_exports_used: 0 // Not relevant for server-enforced
            });
          } else {
            setCredits(getLocalCredits())
          }
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Credits load error:", err)
          setError(err.message)
          setCredits(getLocalCredits())
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadCredits()

    const handleUpdate = () => {
      loadCredits();
    };
    window.addEventListener('syncframe:credits-updated', handleUpdate);

    return () => { 
      mounted = false;
      window.removeEventListener('syncframe:credits-updated', handleUpdate);
    }
  }, [user, isAuthenticated, isConfigured])

  // Helpers
  const remaining = credits?.balance ?? 0

  return { credits, remaining, loading, error }
}
