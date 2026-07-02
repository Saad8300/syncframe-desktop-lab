import React, { useState, useRef } from 'react'
import { useAuth } from '../auth/AuthProvider'
import StudioPageHeader from './StudioPageHeader'
import { API_BASE_URL, apiUrl } from '../utils/api'
import {
  IconMusic,
  IconUpload,
  IconX,
  IconLoader,
  IconCheck,
  IconAlertTriangle,
  IconDownload,
  IconPlayCircle
} from './icons'
import { loadSettings } from '../utils/appSettings'
import { consumePendingTemplate, saveTemplate } from '../utils/templateStore'

import { resolveBackendUrl } from '../utils/api'
import { estimateCredits, reserveCredits, finalizeJob } from '../lib/credits'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { canUseTool } from '../lib/plans'
import { dispatchToast } from '../utils/notifications'

interface AudioPart {
  id: string
  file: File
}

interface MergeResponse {
  url: string
  filename: string
  duration: number
  parts_merged: number
  output_format: string
}

export default function AudioMergerPage() {
  const { user, requireAuth } = useAuth()
  const { plan } = usePlan()
  const { remaining } = useCredits()
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)
  const [parts, setParts] = useState<AudioPart[]>([])
  const [outputFormat, setOutputFormat] = useState<'wav' | 'mp3'>('wav')
  const [outputName, setOutputName] = useState<string>(() => loadSettings().defaultAudioFilename)

  React.useEffect(() => {
    const pending = consumePendingTemplate('audio_merger')
    if (pending) {
      if (pending.outputFormat) setOutputFormat(pending.outputFormat as any)
      if (pending.outputName) setOutputName(pending.outputName as string)
    }
  }, [])
  
  const [status, setStatus] = useState<'idle' | 'merging' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [result, setResult] = useState<MergeResponse | null>(null)
  const [activeClientJobId, setActiveClientJobId] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    const newFiles = Array.from(e.target.files)
    
    const validParts: AudioPart[] = []
    let hasError = false
    
    newFiles.forEach(file => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      if (!['.mp3', '.wav', '.m4a', '.aac'].includes(ext)) {
        hasError = true
      } else {
        validParts.push({ id: crypto.randomUUID(), file })
      }
    })
    
    if (validParts.length > 0) {
      setParts(prev => [...prev, ...validParts])
    }
    
    if (hasError) {
      setErrorMsg(`Some files were ignored because they are not supported. Use mp3, wav, m4a, or aac.`)
    } else {
      setErrorMsg('')
    }
    
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    setParts(prev => {
      const newParts = [...prev]
      const temp = newParts[index - 1]
      newParts[index - 1] = newParts[index]
      newParts[index] = temp
      return newParts
    })
  }

  const moveDown = (index: number) => {
    if (index === parts.length - 1) return
    setParts(prev => {
      const newParts = [...prev]
      const temp = newParts[index + 1]
      newParts[index + 1] = newParts[index]
      newParts[index] = temp
      return newParts
    })
  }

  const removePart = (id: string) => {
    setParts(prev => prev.filter(p => p.id !== id))
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleMerge = async () => {
    if (!requireAuth()) return
    if (parts.length < 2) {
      setErrorMsg('Add at least 2 audio parts to merge.')
      return
    }
    const durationSeconds = 60
    const estimatedCredits = await estimateCredits('audio_merger', { duration_seconds: durationSeconds })
    const access = canUseTool(plan, remaining, 'audio_merger', { duration_seconds: durationSeconds }, estimatedCredits)
    if (!access.allowed) {
      setLimitModalReason(access.reason)
      setLimitModalRequiredPlan(access.requiredPlan)
      setLimitModalOpen(true)
      return
    }

    const cjid = crypto.randomUUID()
    setActiveClientJobId(cjid)

    if (user) {
      try {
        await reserveCredits('audio_merger', durationSeconds, estimatedCredits, cjid, { duration_seconds: durationSeconds })
      } catch (err: any) {
        setActiveClientJobId(null)
        setErrorMsg(err.message || 'Internet connection is required to verify credits before starting this export.')
        return
      }
    }
    setStatus('merging')
    setErrorMsg('')
    setResult(null)

    const formData = new FormData()
    parts.forEach(p => {
      formData.append('audio_parts', p.file)
    })
    formData.append('output_format', outputFormat)
    formData.append('output_filename', outputName.trim() || 'merged_audio')
    formData.append('credit_cost', String(estimatedCredits))

    try {
      const res = await fetch(`${API_BASE_URL}/api/tools/audio-merge`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.detail || 'Audio merge failed. Please check your audio files and try again.'
        if (outputFormat === 'mp3' && msg.toLowerCase().includes('libmp3lame')) {
            throw new Error('MP3 export failed. Please check FFmpeg and try WAV output.')
        }
        throw new Error(msg)
      }

      const data = await res.json()
      
      if (user) {
        await finalizeJob(cjid, 'success')
        setActiveClientJobId(null)
      }

      setResult({
        url: resolveBackendUrl(data.url || ''),
        filename: data.filename,
        duration: data.duration,
        parts_merged: data.parts_merged,
        output_format: data.output_format || outputFormat.toUpperCase()
      })
      setStatus('success')
    } catch (err: any) {
      if (user) {
        await finalizeJob(cjid, 'failed')
        setActiveClientJobId(null)
      }
      console.error(err)
      setErrorMsg(err.message || 'An unexpected error occurred.')
      setStatus('error')
    }
  }

  const handleDownload = async () => {
    if (!result) return
    try {
      const response = await fetch(result.url)
      const blob = await response.blob()
      const objectUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error("Download failed", err)
      dispatchToast('info', 'Notice', String("Failed to download the file directly. Please try saving it via the audio player."))
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 animate-fade-in">
      
      {/* ── Page Header ── */}
      <StudioPageHeader
        icon={<IconMusic size={17} />}
        title="Audio Merger"
        subtitle="Add audio parts in the order you want, then merge them into one clean file."
      />

      {/* ── Alerts ── */}
      {errorMsg && (
        <div className="alert-error animate-slide-down">
          <IconAlertTriangle size={18} className="shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ── Left Column: Audio Parts List ── */}
        <div className="lg:col-span-8 space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Merge Order</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Files will be merged from top to bottom.</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary py-1.5 px-3 text-xs flex items-center gap-2"
                disabled={status === 'merging'}
              >
                <IconUpload size={14} /> Add Audio Part
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".mp3,.wav,.m4a,.aac"
                className="hidden"
                onChange={handleAddFile}
              />
            </div>
            
            {parts.length === 0 ? (
              <div className="text-center py-16 rounded-xl border border-dashed animate-fade-in-up"
                   style={{ borderColor: 'var(--border-default)', background: 'var(--bg-elevated)' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 bg-[var(--bg-input)]">
                  <IconMusic size={24} style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No audio parts added yet</p>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Add at least 2 audio parts to start merging.</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-6 px-4 py-2 rounded-lg font-bold text-sm bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Browse Files
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {parts.map((p, index) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border group transition-all hover:-translate-y-px hover:shadow-md"
                       style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0"
                           style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{p.file.name}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatBytes(p.file.size)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveUp(index)} disabled={index === 0 || status === 'merging'}
                              className="w-7 h-7 rounded flex items-center justify-center hover:bg-black/10 disabled:opacity-30 transition-colors">
                        <span aria-hidden="true">&uarr;</span>
                      </button>
                      <button onClick={() => moveDown(index)} disabled={index === parts.length - 1 || status === 'merging'}
                              className="w-7 h-7 rounded flex items-center justify-center hover:bg-black/10 disabled:opacity-30 transition-colors">
                        <span aria-hidden="true">&darr;</span>
                      </button>
                      <button onClick={() => removePart(p.id)} disabled={status === 'merging'}
                              className="w-7 h-7 rounded flex items-center justify-center hover:bg-red-500/10 text-red-500 transition-colors">
                        <IconX size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {parts.length > 1 && (
                  <div className="flex justify-end mt-4 pt-2">
                    <button onClick={() => setParts([])} disabled={status === 'merging'}
                            className="text-xs font-medium text-red-500 hover:underline">
                      Clear All Parts
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* ── Right Column: Settings & Actions ── */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Output Settings</h2>
              <button 
                onClick={() => {
                  if (!requireAuth()) return
                  saveTemplate({ 
                    name: outputName.trim() || 'Saved Audio Merger Template', 
                    tool: 'audio_merger', 
                    description: 'Saved from Audio Merger', 
                    settings: { outputFormat, outputName } 
                  })
                  dispatchToast('success', 'Success', String('Template saved to your templates library!'))
                }} 
                className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-all duration-150"
              >
                Save as Template
              </button>
            </div>
            <div>
              <div className="flex items-center gap-2 mt-1 mb-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="form-label">Output Format</label>
              <select value={outputFormat} onChange={e => setOutputFormat(e.target.value as any)}
                      className="form-select" disabled={status === 'merging'}>
                <option value="wav">WAV (pcm_s16le - Best Quality)</option>
                <option value="mp3">MP3 (libmp3lame - Smaller File)</option>
              </select>
            </div>
            
            <div className="space-y-1">
              <label className="form-label">Output Filename</label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={outputName}
                  onChange={e => setOutputName(e.target.value)}
                  className="form-input pr-12"
                  disabled={status === 'merging'}
                  placeholder="merged_audio"
                />
                <span className="absolute right-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  .{outputFormat}
                </span>
              </div>
            </div>
          </div>
          
          <div className="card p-5">
            <button
              onClick={handleMerge}
              disabled={parts.length < 2 || status === 'merging'}
              className="w-full relative overflow-hidden transition-all duration-200 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                height: 52,
                background: parts.length >= 2 ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                boxShadow: parts.length >= 2 ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                color: parts.length >= 2 ? '#fff' : 'var(--text-muted)',
                border: parts.length >= 2 ? 'none' : '1px solid var(--border-default)',
              }}
              onMouseEnter={e => { if (parts.length >= 2) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(99,102,241,0.50)' }}
              onMouseLeave={e => { if (parts.length >= 2) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
            >
              {status === 'merging' ? (
                <><IconLoader size={18} className="animate-spin" /> Merging...</>
              ) : parts.length < 2 ? (
                'Add at least 2 parts'
              ) : (
                <><IconCheck size={18} /> Merge Audio</>
              )}
            </button>
            
            {parts.length >= 2 && status !== 'merging' && (
              <p className="text-center text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
                Ready to merge {parts.length} parts in the selected order.
              </p>
            )}
          </div>
        </div>
        
      </div>

      {/* ── Full-Width Result Card ── */}
      {status === 'success' && result && (
        <div className="card p-0 overflow-hidden animate-slide-up" style={{ borderColor: 'var(--color-success-border)', borderWidth: 1, borderStyle: 'solid' }}>
          {/* Green header strip */}
          <div className="flex items-center gap-3 px-6 py-4" style={{ background: 'var(--color-success-bg)', borderBottom: '1px solid var(--color-success-border)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid var(--color-success-border)' }}>
              <IconPlayCircle size={18} style={{ color: 'var(--color-success)' }} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Merge Complete!</h3>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-success)' }}>Your audio parts have been merged successfully.</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Metadata grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Format',      value: result.output_format },
                { label: 'Parts Merged',value: String(result.parts_merged) },
                { label: 'Duration',    value: formatDuration(result.duration) },
                { label: 'Merge Order', value: `${result.parts_merged} files (top → bottom)` },
                { label: 'Filename',    value: result.filename },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
                  <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={value}>{value}</p>
                </div>
              ))}
            </div>

            {/* Audio player */}
            <div className="rounded-xl overflow-hidden p-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <audio
                src={result.url}
                controls
                className="w-full"
                style={{ height: 48, minHeight: 48, display: 'block' }}
              />
            </div>

            {/* Download button */}
            <button
              onClick={handleDownload}
              className="w-full flex items-center justify-center gap-3 rounded-xl font-bold text-sm text-white transition-all duration-200 active:scale-[0.98]"
              style={{
                height: 52,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '0 4px 16px rgba(16,185,129,0.30)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 24px rgba(16,185,129,0.45)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(16,185,129,0.30)' }}
            >
              <IconDownload size={18} /> Download Merged Audio
            </button>
          </div>
        </div>
      )}
    
      {/* Access Limit Modal */}
      <AccessLimitModal
        isOpen={limitModalOpen}
        onClose={() => setLimitModalOpen(false)}
        reason={limitModalReason}
        requiredPlan={limitModalRequiredPlan}
        currentPlan={plan?.display_name || 'Free Trial'}
        currentCredits={remaining}
      />

      </main>
  )
}

