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
  const { requireAuth } = useAuth()
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
    
    setStatus('merging')
    setErrorMsg('')
    setResult(null)

    const formData = new FormData()
    parts.forEach(p => {
      formData.append('audio_parts', p.file)
    })
    formData.append('output_format', outputFormat)
    formData.append('output_filename', outputName.trim() || 'merged_audio')

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
      setResult({
        url: `${API_BASE_URL}${data.url}`,
        filename: data.filename,
        duration: data.duration,
        parts_merged: data.parts_merged,
        output_format: data.output_format || outputFormat.toUpperCase()
      })
      setStatus('success')
    } catch (err: any) {
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
      alert("Failed to download the file directly. Please try saving it via the audio player.")
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
        <div className="alert-error">
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
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border group transition-all"
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
                              className="w-7 h-7 rounded flex items-center justify-center hover:bg-black/10 disabled:opacity-30">
                        <span aria-hidden="true">&uarr;</span>
                      </button>
                      <button onClick={() => moveDown(index)} disabled={index === parts.length - 1 || status === 'merging'}
                              className="w-7 h-7 rounded flex items-center justify-center hover:bg-black/10 disabled:opacity-30">
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
                  alert('Template saved to your templates library!')
                }} 
                className="text-[10px] font-bold px-2 py-1 bg-[var(--bg-input)] hover:bg-[var(--accent-primary)] hover:text-white rounded border border-[var(--border-subtle)] transition-colors"
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
              className="btn-primary w-full py-3.5 flex justify-center items-center gap-2"
              style={{
                background: parts.length >= 2 ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-input)',
                boxShadow: parts.length >= 2 ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                opacity: parts.length < 2 || status === 'merging' ? 0.6 : 1,
              }}
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
          
          {/* Results Area */}
          {status === 'success' && result && (
            <div className="card p-5 space-y-4 border animate-fade-in" style={{ borderColor: 'var(--color-success-border)' }}>
              <div className="flex items-center gap-2">
                <IconPlayCircle size={18} style={{ color: 'var(--color-success-text)' }} />
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Merge Complete!</h3>
              </div>
              
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Output Format:</span>
                  <span className="font-medium">{result.output_format}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Parts Merged:</span>
                  <span className="font-medium">{result.parts_merged}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Duration:</span>
                  <span className="font-medium">{formatDuration(result.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Merge Order:</span>
                  <span className="font-medium">{result.parts_merged} files</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Filename:</span>
                  <span className="font-mono font-medium truncate ml-2" title={result.filename}>{result.filename}</span>
                </div>
              </div>
              
              <audio src={result.url} controls className="w-full h-10 mt-2" />
              
              <button
                onClick={handleDownload}
                className="btn-primary w-full py-2.5 mt-2 flex justify-center items-center gap-2 text-sm"
              >
                <IconDownload size={16} /> Download Merged Audio
              </button>
            </div>
          )}
        </div>
        
      </div>
    </main>
  )
}
