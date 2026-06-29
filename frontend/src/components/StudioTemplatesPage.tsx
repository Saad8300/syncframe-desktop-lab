import React, { useState, useEffect, useMemo } from 'react'
import StudioPageHeader from './StudioPageHeader'
import {
  IconVideo,
  IconMusic,
  IconFileText,
  IconArrowRight,
  IconLayers,
  IconSearch,
  IconFilter
} from './icons'

function IconPlus({ size = 24, className = '' }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  )
}

function IconTrash2({ size = 24, className = '' }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  )
}

function IconEdit({ size = 24, className = '' }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  )
}

function IconCopy({ size = 24, className = '' }: { size?: number, className?: string }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  )
}

function IconHeart({ size = 24, className = '', filled = false }: { size?: number, className?: string, filled?: boolean }) {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
  )
}

import {
  BUILT_IN_TEMPLATES,
  getSavedTemplates,
  deleteTemplate,
  saveTemplate,
  updateTemplate,
  duplicateTemplate,
  toggleFavorite,
  setPendingTemplate,
  StudioTemplate,
  ToolKey
} from '../utils/templateStore'
import TemplateEditorModal from './TemplateEditorModal'

interface StudioTemplatesPageProps {
  onUseTemplate: (tool: ToolKey) => void
}

export default function StudioTemplatesPage({ onUseTemplate }: StudioTemplatesPageProps) {
  const [savedTemplates, setSavedTemplates] = useState<StudioTemplate[]>([])
  
  // Editor Modal State
  const [editingTemplate, setEditingTemplate] = useState<StudioTemplate | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [toolFilter, setToolFilter] = useState<ToolKey | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'built-in' | 'saved' | 'favorites'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'name' | 'tool' | 'category'>('newest')

  // Load Data
  const refreshTemplates = () => setSavedTemplates(getSavedTemplates())
  useEffect(() => { refreshTemplates() }, [])

  // Derived Data
  const allTemplates = useMemo(() => [...BUILT_IN_TEMPLATES, ...savedTemplates], [savedTemplates])
  const categories = useMemo(() => {
    const cats = new Set(allTemplates.map(t => t.category).filter(Boolean))
    return Array.from(cats) as string[]
  }, [allTemplates])

  const stats = useMemo(() => {
    return {
      total: allTemplates.length,
      builtIn: BUILT_IN_TEMPLATES.length,
      saved: savedTemplates.length,
      favorites: allTemplates.filter(t => t.favorite).length,
      video: allTemplates.filter(t => ['image', 'video', 'media', 'batch_video'].includes(t.tool)).length,
      audioScript: allTemplates.filter(t => ['audio_merger', 'script_timestamp'].includes(t.tool)).length
    }
  }, [allTemplates, savedTemplates])

  // Filtering Logic
  const filteredTemplates = useMemo(() => {
    let result = [...allTemplates]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t => 
        t.name.toLowerCase().includes(q) || 
        t.description.toLowerCase().includes(q) ||
        t.tags?.some(tag => tag.toLowerCase().includes(q))
      )
    }

    // Tool
    if (toolFilter !== 'all') {
      result = result.filter(t => t.tool === toolFilter)
    }

    // Category
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category === categoryFilter)
    }

    // Type
    if (typeFilter === 'built-in') result = result.filter(t => t.isBuiltIn)
    else if (typeFilter === 'saved') result = result.filter(t => !t.isBuiltIn)
    else if (typeFilter === 'favorites') result = result.filter(t => t.favorite)

    // Sort
    result.sort((a, b) => {
      switch (sortOrder) {
        case 'name': return a.name.localeCompare(b.name)
        case 'tool': return a.tool.localeCompare(b.tool)
        case 'category': return (a.category || '').localeCompare(b.category || '')
        case 'oldest': return (a.createdAt || 0) - (b.createdAt || 0)
        case 'newest': default: return (b.createdAt || 0) - (a.createdAt || 0)
      }
    })

    return result
  }, [allTemplates, searchQuery, toolFilter, categoryFilter, typeFilter, sortOrder])

  // Actions
  const handleUseTemplate = (template: StudioTemplate) => {
    setPendingTemplate(template)
    onUseTemplate(template.tool)
  }

  const handleDeleteTemplate = (id: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplate(id)
      refreshTemplates()
    }
  }

  const handleDuplicateTemplate = (id: string) => {
    duplicateTemplate(id)
    refreshTemplates()
  }

  const handleToggleFavorite = (id: string, isBuiltIn: boolean) => {
    toggleFavorite(id, isBuiltIn)
    refreshTemplates()
  }

  const handleSaveModal = (data: Partial<StudioTemplate>) => {
    if (isCreating) {
      saveTemplate(data as Omit<StudioTemplate, 'id' | 'createdAt' | 'isBuiltIn' | 'type' | 'updatedAt'>)
    } else if (editingTemplate) {
      updateTemplate(editingTemplate.id, data)
    }
    refreshTemplates()
    setIsCreating(false)
    setEditingTemplate(null)
  }

  // Card Render
  const renderCard = (template: StudioTemplate) => {
    const isSaved = !template.isBuiltIn
    const badgeColor = 
      ['image', 'video', 'media', 'batch_video'].includes(template.tool) ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' :
      template.tool === 'audio_merger' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
      'bg-amber-500/10 text-amber-500 border-amber-500/20'

    const Icon = 
      ['image', 'video', 'media', 'batch_video'].includes(template.tool) ? IconVideo :
      template.tool === 'audio_merger' ? IconMusic : IconFileText
      
    const toolName = 
      template.tool === 'image' ? 'Image Timeline' :
      template.tool === 'video' ? 'Video Timeline' :
      template.tool === 'media' ? 'Media Timeline' :
      template.tool === 'batch_video' ? 'Batch Video' :
      template.tool === 'audio_merger' ? 'Audio Merger' : 'Script Timestamp'

    return (
      <div key={template.id} className="card p-5 flex flex-col hover:border-[var(--accent-primary)] transition-all group relative">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-[var(--text-primary)] truncate" title={template.name}>{template.name}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                <Icon size={12} />
                {toolName}
              </span>
              {template.category && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  {template.category}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 -mr-1">
            {isSaved && (
              <button onClick={() => handleToggleFavorite(template.id, false)} className={`p-1.5 rounded-md transition-colors ${template.favorite ? 'text-red-500 hover:text-red-600 hover:bg-red-500/10' : 'text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10'}`} title="Toggle Favorite">
                <IconHeart size={15} filled={template.favorite} />
              </button>
            )}
            {isSaved && (
              <button onClick={() => setEditingTemplate(template)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors" title="Edit Template">
                <IconEdit size={15} />
              </button>
            )}
            <button onClick={() => handleDuplicateTemplate(template.id)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors" title="Duplicate to Saved">
              <IconCopy size={15} />
            </button>
            {isSaved && (
              <button onClick={() => handleDeleteTemplate(template.id)} className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Delete Template">
                <IconTrash2 size={15} />
              </button>
            )}
          </div>
        </div>
        
        <p className="text-xs text-[var(--text-secondary)] flex-1 mb-4 line-clamp-2" title={template.description}>
          {template.description || <span className="opacity-50 italic">No description</span>}
        </p>
        
        {/* Settings Chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(template.settings).map(([k, v]) => {
            if (typeof v === 'boolean' || !v || k === 'outputName') return null;
            let displayVal = String(v);
            if (k === 'aspectRatio') displayVal = v;
            else if (k === 'exportResolution') displayVal = v;
            else if (k === 'renderProfile') displayVal = displayVal.replace('_', ' ');
            else if (k === 'outputFormat') displayVal = displayVal.toUpperCase();
            else if (k === 'outputMode') displayVal = displayVal.replace('_', ' ');
            else return null;

            return (
              <span key={k} className="px-2 py-0.5 bg-[var(--bg-input)] rounded-md text-[10px] text-[var(--text-secondary)] font-medium capitalize border border-[var(--border-subtle)]">
                {displayVal}
              </span>
            )
          })}
        </div>

        {/* Tags */}
        {template.tags && template.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {template.tags.map(tag => (
              <span key={tag} className="text-[10px] text-[var(--text-muted)] before:content-['#']">
                {tag}
              </span>
            ))}
          </div>
        )}

        <button 
          onClick={() => handleUseTemplate(template)}
          className="w-full mt-auto py-2 rounded-lg text-xs font-bold bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--accent-primary)] hover:text-white transition-colors border border-[var(--border-subtle)] hover:border-transparent flex items-center justify-center gap-2 group-hover:bg-[var(--accent-primary)] group-hover:text-white group-hover:border-transparent"
        >
          Use Template
          <IconArrowRight size={14} className="opacity-70 group-hover:opacity-100" />
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-8 animate-fade-in pb-24">
      <StudioPageHeader
        icon={<IconLayers size={17} />}
        title="Templates"
        subtitle="Professional Preset Studio for your workflows."
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Built-in" value={stats.builtIn} />
        <StatCard title="Saved" value={stats.saved} highlight />
        <StatCard title="Favorites" value={stats.favorites} color="text-red-500" />
        <StatCard title="Video" value={stats.video} color="text-indigo-500" />
        <StatCard title="Audio / Script" value={stats.audioScript} color="text-emerald-500" />
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between p-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl shadow-sm">
        <div className="relative w-full md:w-64">
          <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input 
            type="text" 
            className="form-input text-sm pl-9 w-full bg-[var(--bg-input)]" 
            placeholder="Search templates..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <IconFilter size={14} className="text-[var(--text-muted)]" />
            <select className="form-select text-xs py-1.5 pl-2 pr-6 bg-[var(--bg-input)]" value={toolFilter} onChange={e => setToolFilter(e.target.value as any)}>
              <option value="all">All Tools</option>
              <option value="image">Image Timeline</option>
              <option value="video">Video Timeline</option>
              <option value="media">Media Timeline</option>
              <option value="batch_video">Batch Video</option>
              <option value="audio_merger">Audio Merger</option>
              <option value="script_timestamp">Script Timestamp</option>
            </select>
          </div>

          <select className="form-select text-xs py-1.5 pl-2 pr-6 bg-[var(--bg-input)]" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="form-select text-xs py-1.5 pl-2 pr-6 bg-[var(--bg-input)]" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
            <option value="all">All Types</option>
            <option value="built-in">Built-in</option>
            <option value="saved">Saved</option>
            <option value="favorites">Favorites</option>
          </select>

          <select className="form-select text-xs py-1.5 pl-2 pr-6 bg-[var(--bg-input)]" value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name (A-Z)</option>
            <option value="tool">Tool</option>
            <option value="category">Category</option>
          </select>

          <div className="w-px h-6 bg-[var(--border-subtle)] hidden lg:block mx-1" />

          <button 
            onClick={() => setIsCreating(true)}
            className="btn-primary text-xs py-1.5 px-4 whitespace-nowrap ml-auto md:ml-0 flex items-center gap-2"
          >
            <IconPlus size={14} />
            Create
          </button>
        </div>
      </div>

      {/* Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center justify-center text-[var(--text-muted)] border-dashed">
          <IconLayers size={40} className="mb-4 opacity-40" />
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-1">
            {allTemplates.length === BUILT_IN_TEMPLATES.length && savedTemplates.length === 0 && typeFilter === 'saved' 
              ? "No saved templates yet" 
              : "No templates match your filters"}
          </h3>
          <p className="text-sm max-w-sm">
            {allTemplates.length === BUILT_IN_TEMPLATES.length && savedTemplates.length === 0 && typeFilter === 'saved'
              ? "Create a custom template to reuse your favorite workflow settings."
              : "Try changing the search, tool, category, or template type."}
          </p>
          {(searchQuery || toolFilter !== 'all' || categoryFilter !== 'all' || typeFilter !== 'all') && (
            <button 
              className="mt-6 btn px-4 text-xs"
              onClick={() => {
                setSearchQuery(''); setToolFilter('all'); setCategoryFilter('all'); setTypeFilter('all');
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTemplates.map(renderCard)}
        </div>
      )}

      {/* Modals */}
      {(isCreating || editingTemplate) && (
        <TemplateEditorModal 
          initialData={editingTemplate || undefined}
          onSave={handleSaveModal}
          onClose={() => { setIsCreating(false); setEditingTemplate(null) }}
        />
      )}
    </div>
  )
}

function StatCard({ title, value, highlight, color }: { title: string, value: number, highlight?: boolean, color?: string }) {
  return (
    <div className={`rounded-xl p-3 sm:p-4 border ${highlight ? 'bg-[var(--accent-primary)]/5 border-[var(--accent-primary)]/20' : 'bg-[var(--bg-card)] border-[var(--border-subtle)]'}`}>
      <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">{title}</p>
      <p className={`text-xl sm:text-2xl font-black ${color || (highlight ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]')}`}>{value}</p>
    </div>
  )
}
