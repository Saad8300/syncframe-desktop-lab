import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabaseClient'
import { Plan, Subscription, FALLBACK_FREE_PLAN } from '../lib/plans'

export function usePlan() {
  const { user, isAuthenticated, isConfigured } = useAuth()
  const [plan, setPlan] = useState<Plan>(FALLBACK_FREE_PLAN)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    
    async function loadPlan() {
      if (!isAuthenticated || !user || !isConfigured || !supabase) {
        if (mounted) {
          setPlan(FALLBACK_FREE_PLAN)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        // Fetch user subscription
        const { data: subData, error: subError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (subError && subError.code !== 'PGRST116') {
          console.warn("Failed to fetch subscription", subError)
          throw subError
        }

        const planId = subData?.plan_id || 'free'
        
        // Fetch plan details
        const { data: planData, error: planError } = await supabase
          .from('plans')
          .select('*')
          .eq('id', planId)
          .single()
          
        if (planError && planError.code !== 'PGRST116') {
          console.warn("Failed to fetch plan", planError)
          throw planError
        }

        if (mounted) {
          if (subData) setSubscription(subData)
          if (planData) setPlan(planData as Plan)
          else setPlan(FALLBACK_FREE_PLAN)
        }
      } catch (err: any) {
        if (mounted) {
          console.error("Plan load error:", err)
          setError(err.message)
          setPlan(FALLBACK_FREE_PLAN)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadPlan()

    return () => { mounted = false }
  }, [user, isAuthenticated, isConfigured])

  return { plan, subscription, loading, error }
}
