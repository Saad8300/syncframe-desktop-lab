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

  const loadData = async (isManualRefresh = false) => {
    if (!isAuthenticated || !user || !isConfigured || !supabase) {
      setPlan(FALLBACK_FREE_PLAN)
      setSubscription(null)
      setCredits(null)
      setRemaining(30)
      setInitialLoading(false)
      setRefreshing(false)
      return
    }

    const planCacheKey = `syncframe:lastPlan:${user.id}`
    const creditsCacheKey = `syncframe:lastCredits:${user.id}`
    
    let hasValidCache = false

    // Only hydrate from cache if it's the initial load, not a manual refresh
    if (!isManualRefresh && initialLoading) {
      try {
        const cachedPlan = localStorage.getItem(planCacheKey)
        const cachedCredits = localStorage.getItem(creditsCacheKey)
        
        if (cachedPlan) {
          setPlan(JSON.parse(cachedPlan))
          hasValidCache = true
        }
        if (cachedCredits) {
          const parsed = JSON.parse(cachedCredits)
          setCredits(parsed)
          setRemaining(parsed.remaining_credits ?? parsed.monthly_allocation ?? 30)
        }
      } catch (e) {
        // ignore cache parse errors
      }
    }

    if (!hasValidCache) {
      setInitialLoading(true)
    } else {
      setInitialLoading(false)
      setInitialized(true)  // we have cached data — mark as initialized immediately
    }
    setRefreshing(true)
    setError(null)

    try {
      // Parallel fetch
      const [subResult, planIdResult, creditsResult] = await Promise.all([
        supabase.from('subscriptions').select('*').eq('user_id', user.id).single(),
        supabase.from('subscriptions').select('plan_id').eq('user_id', user.id).single(),
        supabase.from('credit_balances').select('balance, monthly_allocation, lifetime_used, next_reset_at').eq('user_id', user.id).single()
      ])

      // Plan logic
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

      // Credits logic
      if (!creditsResult.error && creditsResult.data) {
        const cData = creditsResult.data
        setCredits(cData)
        setRemaining(cData.balance ?? cData.monthly_allocation ?? 30)
        localStorage.setItem(creditsCacheKey, JSON.stringify({
          ...cData,
          remaining_credits: cData.balance
        }))
      }

    } catch (err: any) {
      console.error("Billing load error:", err)
      setError(err.message)
    } finally {
      setInitialLoading(false)
      setInitialized(true)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user, isAuthenticated, isConfigured])

  useEffect(() => {
    const handleUpdate = () => loadData()
    window.addEventListener('syncframe:plan-updated', handleUpdate)
    window.addEventListener('syncframe:credits-updated', handleUpdate)
    return () => {
      window.removeEventListener('syncframe:plan-updated', handleUpdate)
      window.removeEventListener('syncframe:credits-updated', handleUpdate)
    }
  }, [user])

  const refresh = async () => {
    await loadData(true)
  }

  return (
    <BillingContext.Provider value={{ plan, subscription, credits, remaining, initialLoading, initialized, refreshing, error, refresh }}>
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
