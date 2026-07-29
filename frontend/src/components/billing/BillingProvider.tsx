import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabaseClient'
import { Plan, Subscription, FALLBACK_FREE_PLAN } from '../../lib/plans'

interface BillingContextValue {
  plan: Plan
  subscription: Subscription | null
  credits: any | null
  remaining: number
  initialLoading: boolean
  initialized: boolean
  refreshing: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Re-fetches only credit_balances (never touches plan/subscription) and
   *  returns the fresh balance directly, so callers that need an
   *  up-to-date number before gating an action don't have to race React's
   *  async state updates. Throws if the fetch fails. */
  refreshCredits: () => Promise<number>
}

const BillingContext = createContext<BillingContextValue | null>(null)

export function BillingProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isConfigured } = useAuth()
  
  const [plan, setPlan] = useState<Plan>(FALLBACK_FREE_PLAN)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  
  const [credits, setCredits] = useState<any | null>(null)
  const [remaining, setRemaining] = useState<number>(30)
  
  const [initialLoading, setInitialLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Plan/subscription resolution. Behavior is unchanged from before — this
  // is only pulled out of the old combined loadData so that a failure here
  // can never discard an already-successful credits fetch (see loadCredits).
  const loadPlan = async (isManualRefresh = false) => {
    if (!isAuthenticated || !user || !isConfigured || !supabase) {
      setPlan(FALLBACK_FREE_PLAN)
      setSubscription(null)
      return
    }

    const planCacheKey = `syncframe:lastPlan:${user.id}`

    // Only hydrate from cache if it's the initial load, not a manual refresh
    if (!isManualRefresh && initialLoading) {
      try {
        const cachedPlan = localStorage.getItem(planCacheKey)
        if (cachedPlan) {
          setPlan(JSON.parse(cachedPlan))
        }
      } catch (e) {
        // ignore cache parse errors
      }
    }

    try {
      const subResult = await supabase.from('subscriptions').select('*').eq('user_id', user.id).single()

      let planId = 'free'
      let subData = null
      if (!subResult.error || subResult.error.code === 'PGRST116') {
        subData = subResult.data
        planId = subData?.plan_id || 'free'
      } else {
        throw subResult.error
      }

      const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single()

      if (planError && planError.code !== 'PGRST116') throw planError

      if (subData) setSubscription(subData)
      if (planData) {
        const mappedPlan: Plan = {
          id: planData.id,
          display_name: planData.display_name,
          monthly_credits: planData.monthly_credits,
          limits: planData.limits_json || {},
          features: planData.features || [],
          price_placeholder: planData.price_placeholder,
          active: planData.active,
          sort_order: planData.sort_order
        }
        setPlan(mappedPlan)
        localStorage.setItem(planCacheKey, JSON.stringify(mappedPlan))
      } else {
        setPlan(FALLBACK_FREE_PLAN)
        localStorage.setItem(planCacheKey, JSON.stringify(FALLBACK_FREE_PLAN))
      }
    } catch (err: any) {
      console.error("Plan load error:", err)
      setError(err.message)
    }
  }

  // Credits resolution, fully independent of loadPlan above. Returns the
  // freshly-resolved balance directly (not just via state) and throws on
  // failure instead of silently leaving a stale number in place, so a
  // caller that needs a live number before gating an action (see
  // refreshCredits) can tell the difference between "current" and "unknown".
  const loadCredits = async (isManualRefresh = false): Promise<number> => {
    if (!isAuthenticated || !user || !isConfigured || !supabase) {
      setCredits(null)
      setRemaining(30)
      return 30
    }

    const creditsCacheKey = `syncframe:lastCredits:${user.id}`
    let cachedRemaining: number | null = null

    if (!isManualRefresh && initialLoading) {
      try {
        const cachedCredits = localStorage.getItem(creditsCacheKey)
        if (cachedCredits) {
          const parsed = JSON.parse(cachedCredits)
          cachedRemaining = Number(parsed.remaining_credits ?? parsed.monthly_allocation ?? 30)
          setCredits(parsed)
          setRemaining(cachedRemaining)
        }
      } catch (e) {
        // ignore cache parse errors
      }
    }

    try {
      const creditsResult = await supabase
        .from('credit_balances')
        .select('balance, monthly_allocation, lifetime_used, next_reset_at')
        .eq('user_id', user.id)
        .single()

      if (creditsResult.error && creditsResult.error.code !== 'PGRST116') {
        throw creditsResult.error
      }

      if (creditsResult.data) {
        const cData = creditsResult.data
        const freshRemaining = cData.balance ?? cData.monthly_allocation ?? 30
        setCredits(cData)
        setRemaining(freshRemaining)
        localStorage.setItem(creditsCacheKey, JSON.stringify({
          ...cData,
          remaining_credits: freshRemaining
        }))
        return freshRemaining
      }

      return cachedRemaining ?? remaining
    } catch (err: any) {
      console.error("Credits load error:", err)
      setError(err.message)
      throw err
    }
  }

  useEffect(() => {
    setRefreshing(true)
    setError(null)
    Promise.allSettled([loadPlan(), loadCredits()]).finally(() => {
      setInitialLoading(false)
      setInitialized(true)
      setRefreshing(false)
    })
  }, [user, isAuthenticated, isConfigured])

  useEffect(() => {
    const handlePlanUpdate = () => loadPlan(true)
    const handleCreditsUpdate = () => loadCredits(true).catch(() => {})
    window.addEventListener('syncframe:plan-updated', handlePlanUpdate)
    window.addEventListener('syncframe:credits-updated', handleCreditsUpdate)
    return () => {
      window.removeEventListener('syncframe:plan-updated', handlePlanUpdate)
      window.removeEventListener('syncframe:credits-updated', handleCreditsUpdate)
    }
  }, [user])

  const refresh = async () => {
    await Promise.allSettled([loadPlan(true), loadCredits(true)])
  }

  const refreshCredits = async (): Promise<number> => {
    return loadCredits(true)
  }

  return (
    <BillingContext.Provider value={{ plan, subscription, credits, remaining, initialLoading, initialized, refreshing, error, refresh, refreshCredits }}>
      {children}
    </BillingContext.Provider>
  )
}

export function useBilling() {
  const context = useContext(BillingContext)
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider')
  }
  return context
}
