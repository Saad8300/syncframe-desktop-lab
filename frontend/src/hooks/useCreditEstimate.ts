import { useState, useEffect } from 'react'
import { estimateCredits } from '../lib/credits'

export function useCreditEstimate(
  tool: string,
  options: { duration_seconds?: number; resolution?: string; num_videos?: number; is_premium_template?: boolean }
) {
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  useEffect(() => {
    // If no duration is provided yet, don't show a valid estimate
    if (!options.duration_seconds || options.duration_seconds <= 0) {
      setEstimatedCredits(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsEstimating(true)
      try {
        const cost = await estimateCredits(tool, options)
        setEstimatedCredits(cost)
      } catch (err) {
        console.error('Failed to estimate credits:', err)
      } finally {
        setIsEstimating(false)
      }
    }, 500) // Debounce for 500ms

    return () => clearTimeout(timer)
  }, [tool, options.duration_seconds, options.resolution, options.num_videos, options.is_premium_template])

  return { estimatedCredits, isEstimating }
}
