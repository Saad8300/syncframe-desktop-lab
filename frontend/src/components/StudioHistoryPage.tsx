import React, { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  IconHistory,
  IconTrash,
  IconDownload,
  IconAlertCircle,
  IconZap,
  IconFilm,
  IconGrid,
  IconMusic,
  IconFileText,
  IconSearch,
  IconFilter,
  IconCheck,
  IconX,
  IconLoader,
  IconCopy,
  IconLayers,
  IconArrowRight,
  IconArrowUp,
  IconArrowDown
} from './icons'
import { getHistory, deleteHistoryItem, clearHistory , resolveBackendUrl} from '../utils/api'
import { loadSettings } from '../utils/appSettings'
import StudioPageHeader from './StudioPageHeader'
import { dispatchToast } from '../utils/notifications'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

function formatDuration(seconds: number | undefined | null) {
  if (seconds == null || isNaN(seconds)) return '—'
  if (seconds === 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatCreditCost(cost: number | undefined | null) {
  if (cost == null || isNaN(cost)) return '—'
  return `${cost} cr`
}


function formatBytes(bytes: number | undefined | null) {
  if (bytes == null || isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(2)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
}

function getToolMeta(tool: string): { label: string; color: string; bg: string; border: string; icon: React.ReactNode } {
  switch (tool) {
    case 'image_timeline': case 'image':
      return { label: 'Image Timeline', color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)', border: 'rgba(14,165,233,0.25)', icon: <IconLayers size={13} /> }
    case 'video_timeline': case 'video':
      return { label: 'Video Timeline', color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.25)', icon: <IconFilm size={13} /> }
    case 'media_timeline': case 'media':
      return { label: 'Media Timeline', color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', icon: <IconGrid size={13} /> }
    case 'audio_merger':
      return { label: 'Audio Merger', color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', icon: <IconMusic size={13} /> }
    case 'script_timestamp':
      return { label: 'Script Timestamp', color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', icon: <IconFileText size={13} /> }
    default:
      return { label: tool || 'Unknown', color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.20)', icon: <IconZap size={13} /> }
  }
}

const FILTER_OPTIONS = [
  { key: 'all',              label: 'All Sources' },
  { key: 'image_timeline',   label: 'Image Timeline' },
  { key: 'video_timeline',   label: 'Video Timeline' },
  { key: 'media_timeline',   label: 'Media Timeline' },
  { key: 'audio_merger',     label: 'Audio Merger' },
  { key: 'script_timestamp', label: 'Script Timestamp' },
  { key: 'batch_queue',      label: 'Batch Queue' },
]

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest First' },
  { key: 'oldest', label: 'Oldest First' },
  { key: 'name_asc', label: 'File Name (A-Z)' },
  { key: 'tool_asc', label: 'Tool Source' },
]

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className="card p-4 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: color, opacity: 0.8 }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</span>
        <div className="opacity-70 group-hover:opacity-100 transition-opacity" style={{ color }}>{icon}</div>
      </div>
      <div className="text-2xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

export default function StudioHistoryPage({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const [history, setHistory]           = useState<any[]>([])
  const [loading, setLoading]           = useState(true)
  
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<{title: string, msg: string, action: () => void} | null>(null)
  
  const [filterTool, setFilterTool]     = useState('all')
  const [filterType, setFilterType]     = useState('all') // all, video, audio, text
  const [filterDate, setFilterDate]     = useState('all') // all, today, 7d, 30d
  const [sortBy, setSortBy]             = useState('newest')
  const [searchQuery, setSearchQuery]   = useState('')
  const [viewMode, setViewMode]         = useState<'table' | 'grid'>('table')
  
  const [detailsItem, setDetailsItem]   = useState<any | null>(null)

  const loadHistory = async () => {
    setLoading(true)
    try {
      const data = await getHistory()
      setHistory(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  const requireConfirm = (title: string, msg: string, action: () => void) => {
    setConfirmAction({ title, msg, action })
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteHistoryItem(id)
      setHistory(prev => prev.filter(item => item.id !== id))
      if (detailsItem?.id === id) setDetailsItem(null)
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch {
      dispatchToast('info', 'Notice', String('Failed to delete history item'))
    }
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    requireConfirm(
      "Delete Selected",
      `Are you sure you want to delete ${selectedIds.size} records? This only removes the history entry, not the generated file.`,
      async () => {
        try {
          for (const id of Array.from(selectedIds)) {
            await deleteHistoryItem(id)
          }
          setHistory(prev => prev.filter(item => !selectedIds.has(item.id)))
          setSelectedIds(new Set())
        } catch { dispatchToast('info', 'Notice', String('Failed to delete some items')) }
      }
    )
  }

  const handleClearAll = () => {
    const s = loadSettings()
    if (s.confirmBeforeClearHistory) {
      requireConfirm(
        "Clear All History",
        "This will permanently remove all history records. It does not delete generated files from your disk.",
        async () => {
          try { await clearHistory(); setHistory([]); setSelectedIds(new Set()) } 
          catch { dispatchToast('info', 'Notice', String('Failed to clear history')) }
        }
      )
    } else {
      clearHistory().then(() => { setHistory([]); setSelectedIds(new Set()) }).catch(() => dispatchToast('info', 'Notice', String('Failed to clear history')))
    }
  }

  const handleDownload = (item: any) => {
    if (!item.output_url) return
    const a = document.createElement('a')
    a.href = resolveBackendUrl(item.output_url)
    a.download = item.output_name || 'export'
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleCopyName = (name: string) => {
    if(navigator.clipboard) navigator.clipboard.writeText(name)
  }

  // ── Computing Stats ──
  const stats = useMemo(() => {
    let video = 0, audio = 0, text = 0, batch = 0
    let duration = 0
    let latest = "No data yet"
    
    for (const h of history) {
      if (h.output_type === 'video') video++
      else if (h.output_type === 'audio') audio++
      else if (['text', 'csv', 'srt'].includes(h.output_type)) text++
      
      if (h.metadata?.from_batch_queue || h.from_batch_queue) batch++
      
      if (h.duration_seconds && !isNaN(h.duration_seconds)) {
        duration += h.duration_seconds
      }
    }
    
    if (history.length > 0) {
      latest = history[0].output_name || 'Unnamed Export'
    }

    return { total: history.length, video, audio, text, batch, duration, latest }
  }, [history])

  // ── Filtering & Sorting ──
  const filtered = useMemo(() => {
    let list = history
    
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(item =>
        (item.output_name || '').toLowerCase().includes(q) ||
        (item.tool_label || item.tool || '').toLowerCase().includes(q)
      )
    }

    // Tool
    if (filterTool !== 'all') {
      if (filterTool === 'batch_queue') {
        list = list.filter(item => item.metadata?.from_batch_queue || item.from_batch_queue)
      } else {
        list = list.filter(item => {
          const t = (item.tool || '').toLowerCase()
          const key = filterTool.replace('_timeline', '').replace('_merger', '').replace('_timestamp', '')
          return t === filterTool || t === key
        })
      }
    }

    // Type
    if (filterType !== 'all') {
      list = list.filter(item => {
        if (filterType === 'video') return item.output_type === 'video'
        if (filterType === 'audio') return item.output_type === 'audio'
        if (filterType === 'text') return ['text', 'csv', 'srt'].includes(item.output_type)
        return true
      })
    }

    // Date
    if (filterDate !== 'all') {
      const now = new Date()
      list = list.filter(item => {
        const d = new Date(item.created_at)
        if (isNaN(d.getTime())) return true
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24)
        if (filterDate === 'today') return diffDays < 1
        if (filterDate === '7d') return diffDays <= 7
        if (filterDate === '30d') return diffDays <= 30
        return true
      })
    }

    // Sort
    list = [...list]
    list.sort((a, b) => {
      if (sortBy === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sortBy === 'oldest') return a.created_at.localeCompare(b.created_at)
      if (sortBy === 'name_asc') return (a.output_name || '').localeCompare(b.output_name || '')
      if (sortBy === 'tool_asc') return (a.tool_label || '').localeCompare(b.tool_label || '')
      return 0
    })

    return list
  }, [history, filterTool, filterType, filterDate, sortBy, searchQuery])

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelectedIds(s)
  }

  return (
    <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 pt-8 pb-12 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <StudioPageHeader
            icon={<IconHistory size={18} />}
            title="History"
          />
          <p className="mt-2 text-sm max-w-xl" style={{ color: 'var(--text-muted)' }}>
            Your local export library. Review, manage, and download all generated media assets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:bg-red-500/10 text-red-500"
              style={{ border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <IconTrash size={14} /> Clear History
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Stats ── */}
      {!loading && history.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard title="Total Exports" value={stats.total} icon={<IconHistory size={16}/>} color="var(--text-primary)" />
          <StatCard title="Videos" value={stats.video} icon={<IconFilm size={16}/>} color="#8b5cf6" />
          <StatCard title="Audio" value={stats.audio} icon={<IconMusic size={16}/>} color="#10b981" />
          <StatCard title="Text/Data" value={stats.text} icon={<IconFileText size={16}/>} color="#f59e0b" />
          <StatCard title="Batch Jobs" value={stats.batch} icon={<IconLayers size={16}/>} color="#3b82f6" />
          <StatCard title="Total Duration" value={formatDuration(stats.duration)} icon={<IconHistory size={16}/>} color="#0ea5e9" />
        </div>
      )}

      {/* ── Filters & Search Bar ── */}
      {!loading && history.length > 0 && (
        <div className="card p-3 flex flex-wrap lg:flex-nowrap items-center gap-3">
          
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <IconSearch size={14} />
            </span>
            <input
              type="text"
              placeholder="Search history by name or tool..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input w-full pl-9 py-2 text-sm"
            />
          </div>

          <div className="h-6 w-px hidden lg:block" style={{ background: 'var(--border-subtle)' }} />

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">
            <select className="form-select text-xs py-2 pr-8" value={filterTool} onChange={e => setFilterTool(e.target.value)}>
              {FILTER_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
            </select>
            <select className="form-select text-xs py-2 pr-8" value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Media Types</option>
              <option value="video">Video Only</option>
              <option value="audio">Audio Only</option>
              <option value="text">Text / CSV Only</option>
            </select>
            <select className="form-select text-xs py-2 pr-8" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <select className="form-select text-xs py-2 pr-8" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
            </select>
            
            <div className="h-6 w-px mx-1" style={{ background: 'var(--border-subtle)' }} />

            <div className="flex bg-black/10 dark:bg-white/10 rounded-lg p-0.5">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white dark:bg-[#2c2c2c] shadow-sm' : 'opacity-50 hover:opacity-100'}`}
                title="Table View"
              >
                <IconGrid size={14} />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-[#2c2c2c] shadow-sm' : 'opacity-50 hover:opacity-100'}`}
                title="Card View"
              >
                <IconLayers size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Actions Floating Bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 flex items-center gap-4 px-6 py-3 rounded-full shadow-2xl backdrop-blur-md"
             style={{ background: 'var(--bg-input)', border: '1px solid var(--border-default)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {selectedIds.size} selected
          </div>
          <div className="w-px h-4" style={{ background: 'var(--border-subtle)' }} />
          <button 
            onClick={handleDeleteSelected}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors hover:bg-red-500/20 text-red-500"
          >
            <IconTrash size={14} /> Delete Selected
          </button>
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            style={{ color: 'var(--text-muted)' }}
          >
            <IconX size={14} /> Cancel
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="card overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <IconLoader size={36} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Loading Export Library...</span>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-8">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ background: 'var(--bg-input)' }}>
              <IconHistory size={36} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h2 className="text-xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>No history yet</h2>
            <p className="text-sm max-w-md mx-auto mb-8" style={{ color: 'var(--text-muted)' }}>
              Your generated videos, merged audio files, and timestamp exports will appear here after you create them.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button type="button" onClick={() => onNavigate?.('tool:video')} className="btn-primary text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--accent-primary)', color: 'white', fontWeight: 700 }}>Open Video Timeline</button>
              <button type="button" onClick={() => onNavigate?.('batch_video')} className="btn-secondary text-xs px-4 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', fontWeight: 700 }}>Open Batch Generator</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <IconFilter size={32} className="mb-4" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>No results match your filters.</p>
            <button onClick={() => { setFilterTool('all'); setFilterType('all'); setFilterDate('all'); setSearchQuery('') }} className="mt-4 text-xs font-bold px-4 py-2 rounded-lg" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>Clear all filters</button>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto pb-16">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <th className="px-5 py-4 w-10">
                    <input type="checkbox" className="form-checkbox rounded text-indigo-500 w-4 h-4" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest">Date</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest">Asset Details</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest hidden md:table-cell">Tool Source</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest hidden lg:table-cell">Duration</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest hidden xl:table-cell">Size</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest hidden xl:table-cell">Cost</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const meta = getToolMeta(item.tool_label || item.tool || '')
                  const isBatch = item.metadata?.from_batch_queue || item.from_batch_queue
                  const isSelected = selectedIds.has(item.id)
                  return (
                    <tr
                      key={item.id}
                      className={`group transition-colors border-b hover:bg-black/5 dark:hover:bg-white/5 ${isSelected ? 'bg-indigo-500/10 dark:bg-indigo-500/10' : ''}`}
                      style={{ borderColor: 'var(--border-subtle)' }}
                    >
                      <td className="px-5 py-3">
                        <input type="checkbox" className="form-checkbox rounded text-indigo-500 w-4 h-4 transition-all" checked={isSelected} onChange={() => toggleSelect(item.id)} />
                      </td>
                      <td className="px-5 py-3 text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                        <div className="flex flex-col">
                          <span>{new Date(item.created_at).toLocaleDateString()}</span>
                          <span className="opacity-70">{new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                            {item.output_type === 'video' ? <IconFilm size={18}/> : item.output_type === 'audio' ? <IconMusic size={18}/> : <IconFileText size={18}/>}
                          </div>
                          <div>
                            <div className="font-bold text-sm max-w-[200px] lg:max-w-[300px] truncate cursor-pointer hover:underline" style={{ color: 'var(--text-primary)' }} onClick={() => setDetailsItem(item)} title={item.output_name}>
                              {item.output_name || 'Unnamed Export'}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                {item.output_type} {item.file_extension ? `· ${item.file_extension}` : ''}
                              </span>
                              {isBatch && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                                  Batch
                                </span>
                              )}
                              {item.metadata?.text_overlay_enabled && (
                                <span className="text-[9px] font-bold px-1.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--color-accent)', border: '1px solid var(--border-subtle)' }}>
                                  Text Overlay · {
                                    item.metadata.text_overlay_mode === 'timed_text' ? 'Timed Text' : 
                                    item.metadata.text_overlay_mode === 'csv_text' ? 'CSV Text' : 'Whole Video'
                                  }
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' }}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs font-medium hidden lg:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {formatDuration(item.duration_seconds)}
                      </td>
                      <td className="px-5 py-3 text-xs font-medium hidden xl:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {formatBytes(item.file_size_bytes)}
                      </td>
                      <td className="px-5 py-3 text-xs font-medium hidden xl:table-cell" style={{ color: 'var(--text-secondary)' }}>
                        {formatCreditCost(item.credit_cost)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity">
                          {item.output_url ? (
                            <>
                              <a href={resolveBackendUrl(item.output_url)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors" style={{ color: 'var(--text-primary)' }} title="Open / Preview">
                                <IconArrowRight size={16} className="-rotate-45" />
                              </a>
                              <button onClick={() => handleDownload(item)} className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors" style={{ color: 'var(--text-primary)' }} title="Download">
                                <IconDownload size={16} />
                              </button>
                            </>
                          ) : (
                            <div className="px-2" title="No file link available"><IconAlertCircle size={16} style={{ color: 'var(--color-error)' }} /></div>
                          )}
                          <button onClick={() => setDetailsItem(item)} className="px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-black/10 dark:hover:bg-white/10 transition-colors" style={{ color: 'var(--text-primary)' }}>
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-16">
            {filtered.map(item => {
              const meta = getToolMeta(item.tool_label || item.tool || '')
              const isBatch = item.metadata?.from_batch_queue || item.from_batch_queue
              const isSelected = selectedIds.has(item.id)
              return (
                <div key={item.id} className={`card hover-lift p-4 flex flex-col relative transition-all duration-300 ${isSelected ? 'ring-2 ring-indigo-500 bg-indigo-500/5' : ''}`}>
                  <div className="absolute top-4 right-4 z-10">
                    <input type="checkbox" className="form-checkbox rounded text-indigo-500 w-4 h-4 cursor-pointer" checked={isSelected} onChange={() => toggleSelect(item.id)} />
                  </div>
                  
                  <div className="flex items-center gap-3 mb-4 pr-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                      {item.output_type === 'video' ? <IconFilm size={18}/> : item.output_type === 'audio' ? <IconMusic size={18}/> : <IconFileText size={18}/>}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: meta.color }}>
                        {meta.label}
                      </div>
                      <div className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                  </div>

                  <h4 className="font-bold text-sm mb-2 truncate" style={{ color: 'var(--text-primary)' }} title={item.output_name}>
                    {item.output_name || 'Unnamed Export'}
                  </h4>

                  <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    <span>{item.output_type}</span>
                    <span>•</span>
                    <span>{formatDuration(item.duration_seconds)}</span>
                    <span>•</span>
                    <span>{formatCreditCost(item.credit_cost)}</span>
                    {isBatch && (
                      <>
                        <span>•</span>
                        <span className="px-1.5 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>Batch</span>
                      </>
                    )}
                    {item.metadata?.text_overlay_enabled && (
                      <>
                        <span>•</span>
                        <span className="px-1.5 rounded font-bold" style={{ background: 'var(--bg-elevated)', color: 'var(--color-accent)', border: '1px solid var(--border-subtle)' }}>
                          {item.metadata.text_overlay_mode === 'timed_text' ? 'Timed Text' : 
                           item.metadata.text_overlay_mode === 'csv_text' ? 'CSV Text' : 'Text Overlay'}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="mt-auto pt-4 flex items-center justify-between border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button onClick={() => setDetailsItem(item)} className="text-xs font-bold hover:underline" style={{ color: 'var(--text-primary)' }}>
                      View Details
                    </button>
                    <div className="flex items-center gap-1">
                      {item.output_url && (
                        <a href={resolveBackendUrl(item.output_url)} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-primary)' }} title="Open">
                          <IconArrowRight size={14} className="-rotate-45" />
                        </a>
                      )}
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500" title="Delete">
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Details Modal ── */}
      {detailsItem && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setDetailsItem(null)}>
          <div className="liquid-glass-elevated rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-modal-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 flex items-center justify-between border-b bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Asset Details</h3>
                <div className="text-[10px] uppercase font-bold tracking-wider mt-1" style={{ color: 'var(--text-muted)' }}>ID: {detailsItem.id}</div>
              </div>
              <button onClick={() => setDetailsItem(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-primary)' }}>
                <IconX size={20} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
                <ModalField label="File Name" value={detailsItem.output_name} />
                <ModalField label="Source Tool" value={detailsItem.tool_label || detailsItem.tool} />
                <ModalField label="Media Type" value={<span className="uppercase">{detailsItem.output_type}</span>} />
                <ModalField label="Date Created" value={formatDate(detailsItem.created_at)} />
                <ModalField label="Duration" value={formatDuration(detailsItem.duration_seconds)} />
                <ModalField label="Credit Cost" value={formatCreditCost(detailsItem.credit_cost)} />
                <ModalField label="File Size" value={formatBytes(detailsItem.file_size_bytes)} />
                {(detailsItem.resolution || detailsItem.metadata?.export_resolution) && <ModalField label="Resolution" value={detailsItem.resolution || detailsItem.metadata?.export_resolution} />}
                {(detailsItem.aspect_ratio || detailsItem.metadata?.aspect_ratio) && <ModalField label="Aspect Ratio" value={detailsItem.aspect_ratio || detailsItem.metadata?.aspect_ratio} />}
                {(detailsItem.metadata?.from_batch_queue || detailsItem.from_batch_queue) && <ModalField label="Generated Via" value="Batch Queue" />}
              </div>

              <div className="pt-6 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <details className="group cursor-pointer">
                  <summary className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 select-none" style={{ color: 'var(--text-muted)' }}>
                    Advanced Metadata <IconArrowRight size={12} className="group-open:rotate-90 transition-transform" />
                  </summary>
                  <div className="mt-3 bg-[#1e1e1e] p-4 rounded-xl text-[10px] font-mono text-gray-300 overflow-x-auto shadow-inner">
                    <pre>{JSON.stringify(detailsItem.metadata || detailsItem, null, 2)}</pre>
                  </div>
                </details>
              </div>
            </div>

            <div className="p-5 border-t flex flex-wrap items-center justify-between gap-4 bg-black/5 dark:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }}>
              <button onClick={() => handleDelete(detailsItem.id)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors hover:bg-red-500/10 text-red-500 border border-transparent hover:border-red-500/20">
                <IconTrash size={14} /> Delete Record
              </button>
              
              <div className="flex items-center gap-2">
                <button onClick={() => handleCopyName(detailsItem.output_name)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors hover:bg-black/10 dark:hover:bg-white/10 border" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}>
                  <IconCopy size={14} /> Copy Name
                </button>
                {detailsItem.output_url ? (
                  <>
                    <button onClick={() => handleDownload(detailsItem)} className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors hover:bg-black/10 dark:hover:bg-white/10 border" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-default)' }}>
                      <IconDownload size={14} /> Download
                    </button>
                    <a href={resolveBackendUrl(detailsItem.output_url)} target="_blank" rel="noopener noreferrer" className="px-5 py-2 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity flex items-center gap-2" style={{ background: 'var(--accent-primary)' }}>
                      Open / Preview <IconArrowRight size={14} className="-rotate-45" />
                    </a>
                  </>
                ) : (
                  <span className="text-xs font-bold px-3 py-2 opacity-50" style={{ color: 'var(--text-muted)' }}>No file link available</span>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Confirmation Modal ── */}
      {confirmAction && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="liquid-glass-elevated rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center animate-modal-in">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              <IconAlertCircle size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{confirmAction.title}</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{confirmAction.msg}</p>
            <div className="flex items-center gap-3 w-full">
              <button 
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => { confirmAction.action(); setConfirmAction(null) }}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all shadow hover:opacity-90 hover:-translate-y-0.5"
                style={{ background: 'var(--color-error)' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  )
}

function ModalField({ label, value }: { label: string, value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm font-semibold text-wrap break-all" style={{ color: 'var(--text-primary)' }}>{value || '—'}</div>
    </div>
  )
}
