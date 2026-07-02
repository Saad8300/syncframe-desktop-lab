import { useBilling } from '../components/billing/BillingProvider'

export function usePlan() {
  const { plan, subscription, initialLoading, initialized, refreshing, error } = useBilling()
  return { plan, subscription, loading: initialLoading, initialized, refreshing, error }
}
