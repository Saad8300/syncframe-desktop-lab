import React, { useState } from 'react'
import { IconX } from './icons'
import { StudioTemplate, ToolKey } from '../utils/templateStore'

interface Props {
  initialData?: StudioTemplate
  onSave: (template: Partial<StudioTemplate>) => void
  onClose: () => void
}

export default function TemplateEditorModal({ initialData, onSave, onClose }: Props) {
  const [name, setName] = useState(initialData?.name || '')
  const [desc, setDesc] = useState(initialData?.description || '')
  const [tool, setTool] = useState<ToolKey>(initialData?.tool || 'image')
  const [category, setCategory] = useState(initialData?.category || 'Custom')
  const [tagsStr, setTagsStr] = useState(initialData?.tags?.join(', ') || '')
  const [favorite, setFavorite] = useState(initialData?.favorite || false)
  const [settings, setSettings] = useState<Record<string, any>>(initialData?.settings || {})

  const handleSave = () => {
    if (!name.trim()) return

    const tags = tagsStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
    
    // Clean up settings that don't belong to the selected tool (simplified cleanup)
    const cleanedSettings = { ...settings }

    onSave({
      name: name.trim(),
      description: desc.trim(),
      tool,
      category: category.trim(),
      tags,
      favorite,
      settings: cleanedSettings
    })
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
  }

  const isVideoTool = ['image', 'video', 'media'].includes(tool)
  const isAudioTool = tool === 'audio_merger'
  const isScriptTool = tool === 'script_timestamp'
  const isBatchTool = tool === 'batch_video'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="card w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-[var(--border-subtle)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {initialData ? 'Edit Template' : 'Create Template'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">Configure preset settings to apply when using this template.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
          
          {/* Basic Info */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
              Basic Info
              <div className="flex-1 h-px bg-[var(--border-subtle)]" />
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Template Name *</label>
                <input 
                  type="text" 
                  className="form-input text-sm" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="e.g. My Awesome TikTok Preset"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Target Tool *</label>
                <select 
                  className="form-select text-sm" 
                  value={tool} 
                  onChange={e => setTool(e.target.value as ToolKey)}
                >
                  <option value="image">Image Timeline</option>
                  <option value="video">Video Timeline</option>
                  <option value="media">Media Timeline</option>
                  <option value="audio_merger">Audio Merger</option>
                  <option value="script_timestamp">Script Timestamp</option>
                  <option value="batch_video">Batch Video Generator</option>
                </select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Description</label>
                <input 
                  type="text" 
                  className="form-input text-sm" 
                  value={desc} 
                  onChange={e => setDesc(e.target.value)} 
                  placeholder="Brief summary of what this template does"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Category</label>
                <input 
                  type="text" 
                  className="form-input text-sm" 
                  value={category} 
                  onChange={e => setCategory(e.target.value)} 
                  placeholder="e.g. Social, Podcast, Video"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Tags (comma-separated)</label>
                <input 
                  type="text" 
                  className="form-input text-sm" 
                  value={tagsStr} 
                  onChange={e => setTagsStr(e.target.value)} 
                  placeholder="e.g. 1080p, fast, draft"
                />
              </div>

              <div className="md:col-span-2 flex items-center mt-2">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-[var(--border-default)] checked:bg-violet-500 cursor-pointer"
                    checked={favorite}
                    onChange={e => setFavorite(e.target.checked)}
                  />
                  <span className="text-sm font-bold text-[var(--text-primary)]">Add to Favorites</span>
                </label>
              </div>
            </div>
          </section>

          {/* Video Settings */}
          {isVideoTool && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                Video Settings
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-subtle)]">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Aspect Ratio</label>
                  <select className="form-select text-xs py-1.5" value={settings.aspectRatio || ''} onChange={e => updateSetting('aspectRatio', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="16:9">16:9 (Landscape)</option>
                    <option value="9:16">9:16 (Vertical)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="4:3">4:3 (Classic)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Resolution</label>
                  <select className="form-select text-xs py-1.5" value={settings.exportResolution || ''} onChange={e => updateSetting('exportResolution', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="720p">720p HD</option>
                    <option value="1080p">1080p Full HD</option>
                    <option value="1440p">1440p 2K</option>
                    <option value="4K">4K Ultra HD</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Render Profile</label>
                  <select className="form-select text-xs py-1.5" value={settings.renderProfile || ''} onChange={e => updateSetting('renderProfile', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="fast_preview">Fast Preview</option>
                    <option value="balanced">Balanced</option>
                    <option value="high_quality">High Quality</option>
                    <option value="max_quality">Max Quality</option>
                  </select>
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Output Filename</label>
                  <input type="text" className="form-input text-xs py-1.5" value={settings.outputName || ''} onChange={e => updateSetting('outputName', e.target.value)} placeholder="e.g. output_video" />
                </div>
              </div>
            </section>
          )}

          {/* Timeline Settings */}
          {isVideoTool && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                Timeline Settings
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-subtle)]">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Motion Preset</label>
                  <select className="form-select text-xs py-1.5" value={settings.motionPreset || ''} onChange={e => updateSetting('motionPreset', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="none">None</option>
                    <option value="pan_zoom">Ken Burns (Pan & Zoom)</option>
                    <option value="subtle_zoom">Subtle Zoom</option>
                    <option value="dynamic">Dynamic</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Transition Preset</label>
                  <select className="form-select text-xs py-1.5" value={settings.transitionStyle || ''} onChange={e => updateSetting('transitionStyle', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="none">None (Cut)</option>
                    <option value="crossfade">Crossfade</option>
                    <option value="dip_to_black">Dip to Black</option>
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Visual Style</label>
                  <select className="form-select text-xs py-1.5" value={settings.visualStyle || ''} onChange={e => updateSetting('visualStyle', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="none">None (Original)</option>
                    <option value="cinematic">Cinematic</option>
                    <option value="vibrant">Vibrant</option>
                    <option value="vintage">Vintage</option>
                    <option value="bw">Black & White</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Background Music Default</label>
                  <select className="form-select text-xs py-1.5" value={settings.bgMusicDefault || ''} onChange={e => updateSetting('bgMusicDefault', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* Audio Settings */}
          {isAudioTool && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                Audio Settings
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-subtle)]">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Output Format</label>
                  <select className="form-select text-xs py-1.5" value={settings.outputFormat || ''} onChange={e => updateSetting('outputFormat', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Default Filename</label>
                  <input type="text" className="form-input text-xs py-1.5" value={settings.outputName || ''} onChange={e => updateSetting('outputName', e.target.value)} placeholder="e.g. merged_audio" />
                </div>
              </div>
            </section>
          )}

          {/* Script Timestamp Settings */}
          {isScriptTool && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                Script Settings
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-subtle)]">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Output Mode</label>
                  <select className="form-select text-xs py-1.5" value={settings.outputMode || ''} onChange={e => updateSetting('outputMode', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="csv_image_timeline">Image Timeline CSV</option>
                    <option value="csv">Standard CSV</option>
                    <option value="txt">Readable TXT</option>
                    <option value="srt">SRT Captions</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Default Filename</label>
                  <input type="text" className="form-input text-xs py-1.5" value={settings.outputName || ''} onChange={e => updateSetting('outputName', e.target.value)} placeholder="e.g. transcript" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Model Size</label>
                  <select className="form-select text-xs py-1.5" value={settings.modelSize || ''} onChange={e => updateSetting('modelSize', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="tiny">Tiny</option>
                    <option value="base">Base</option>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large-v3">Large v3</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* Batch Settings */}
          {isBatchTool && (
            <section className="space-y-4">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                Batch Settings
                <div className="flex-1 h-px bg-[var(--border-subtle)]" />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-subtle)]">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Queue Behavior</label>
                  <select className="form-select text-xs py-1.5" value={settings.queueBehavior || ''} onChange={e => updateSetting('queueBehavior', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="auto_start">Auto Start on Add</option>
                    <option value="manual_start">Manual Start</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--text-secondary)]">Naming Style</label>
                  <select className="form-select text-xs py-1.5" value={settings.namingStyle || ''} onChange={e => updateSetting('namingStyle', e.target.value)}>
                    <option value="">(None)</option>
                    <option value="sequence">Sequential (Batch_1)</option>
                    <option value="timestamp">Timestamp (Batch_20240101)</option>
                  </select>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0 flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn px-5">Cancel</button>
          <button 
            onClick={handleSave} 
            className="btn-primary px-5"
            disabled={!name.trim()}
          >
            Save Template
          </button>
        </div>

      </div>
    </div>
  )
}
