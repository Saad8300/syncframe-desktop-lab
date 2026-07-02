import { useBilling } from '../components/billing/BillingProvider'

export function usePlan() {
  const { plan, subscription, initialLoading, refreshing, error } = useBilling()
  return { plan, subscription, loading: initialLoading, refreshing, error }
}
