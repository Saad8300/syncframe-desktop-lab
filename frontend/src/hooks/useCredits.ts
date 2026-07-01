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
          monthly_allocation: 30,
          lifetime_used: used,
          period_start: new Date().toISOString(),
          free_video_exports_used: used,
          
          plan_id: 'free',
          subscription_status: 'active',
          monthly_credit_limit: 30,
          credits_used_this_period: used
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
            const localUsed = parseInt(localStorage.getItem('free_exports') || '0', 10);
            const userCredits = data as UserCredits;
            
            let available = 0;
            let monthlyLimit = 30;
            let finalUsedThisPeriod = localUsed;
            
            // Client-side expiry simulation (Backend MUST enforce this in production)
            let isExpired = false;
            let isInactive = false;
            if (userCredits.billing_period_end && Date.now() > new Date(userCredits.billing_period_end).getTime()) {
                isExpired = true;
                if (userCredits.subscription_status !== 'active') {
                    isInactive = true;
                }
            }

            // Check if backend supports new monthly fields
            const hasMonthlyFields = 'monthly_credit_limit' in userCredits || 'credits_used_this_period' in userCredits;

            if (hasMonthlyFields) {
              monthlyLimit = userCredits.monthly_credit_limit ?? userCredits.monthly_allocation ?? userCredits.balance ?? 30;
              let backendUsedThisPeriod = userCredits.credits_used_this_period ?? 0;
              
              if (isExpired) {
                  if (isInactive) {
                      monthlyLimit = 0;
                      backendUsedThisPeriod = 0;
                  } else {
                      // locally simulate reset until backend catches up
                      backendUsedThisPeriod = 0;
                  }
              }
              
              available = Math.max(0, monthlyLimit - backendUsedThisPeriod - localUsed);
              finalUsedThisPeriod = backendUsedThisPeriod + localUsed;
            } else {
              // Legacy fallback
              monthlyLimit = userCredits.monthly_allocation ?? userCredits.balance ?? 30;
              available = Math.max(0, (userCredits.balance ?? 30) - localUsed);
              
              if (isExpired && isInactive) {
                  available = 0;
              }
            }

            setCredits({
              ...userCredits,
              balance: available,
              monthly_credit_limit: monthlyLimit,
              credits_used_this_period: finalUsedThisPeriod,
              lifetime_used: userCredits.lifetime_used + localUsed,
              free_video_exports_used: userCredits.free_video_exports_used + localUsed
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
