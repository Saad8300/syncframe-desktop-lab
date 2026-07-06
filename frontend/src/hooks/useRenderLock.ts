import { useState, useEffect } from 'react'

export interface RenderLockState {
  locked: boolean
  source: string | null
  tool_name: string | null
  job_id: string | null
  started_at: string | null
}

export function useRenderLock() {
  const [lockState, setLockState] = useState<RenderLockState>({
    locked: false,
    source: null,
    tool_name: null,
    job_id: null,
    started_at: null
  })

  const fetchLock = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/render-lock/status')
      if (res.ok) {
        const data = await res.json()
        setLockState(data)
      }
    } catch (err) {
      console.warn('Failed to fetch render lock status:', err)
    }
  }

  const forceRelease = async () => {
    try {
      await fetch('http://localhost:8000/api/render-lock/release', { method: 'POST' })
      await fetchLock()
    } catch (err) {
      console.error('Failed to force release render lock:', err)
    }
  }

  useEffect(() => {
    fetchLock()
    const interval = setInterval(fetchLock, 3000)
    return () => clearInterval(interval)
  }, [])

  return { lockState, forceRelease, refreshLock: fetchLock }
}
