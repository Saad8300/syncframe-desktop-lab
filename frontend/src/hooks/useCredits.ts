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
      // Local Trial Fallback
      const getLocalCredits = () => {
        const used = parseInt(localStorage.getItem('free_exports') || '0', 10);
        return {
          user_id: user?.id || 'local',
          balance: Math.max(0, 30 - used),
          monthly_allocation: 0,
          lifetime_used: used,
          period_start: new Date().toISOString(),
          free_video_exports_used: used
        };
      }

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
            const used = parseInt(localStorage.getItem('free_exports') || '0', 10);
            const userCredits = data as UserCredits;
            setCredits({
              ...userCredits,
              balance: Math.max(0, userCredits.balance - used),
              lifetime_used: userCredits.lifetime_used + used,
              free_video_exports_used: userCredits.free_video_exports_used + used
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
