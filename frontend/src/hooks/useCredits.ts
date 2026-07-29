import { useBilling } from '../components/billing/BillingProvider'

export function useCredits() {
  const { credits, remaining, initialLoading, refreshing, error, refresh, refreshCredits } = useBilling()
  return { credits, remaining, loading: initialLoading, refreshing, error, refresh, refreshCredits }
}
