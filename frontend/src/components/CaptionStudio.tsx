import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { CaptionConfig, CaptionOverrides } from '../types/caption';
import { BUILT_IN_PRESETS } from './CaptionSettingsSection';
import { useCaptionPresets } from '../hooks/useCaptionPresets';
import { resolveCaptionStyle } from '../utils/captionResolver';
import { CaptionPreview } from './CaptionPreview';
import { CaptionInspector } from './CaptionInspector';

interface Props {
  config: CaptionConfig;
  onSave: (cfg: CaptionConfig) => void;
  onClose: () => void;
}

const CATEGORIES = ['All', 'Trending', 'Classic', 'Clean', 'Bold', 'Social', 'Cinematic', 'Minimal', 'Podcast'];

const PRESET_CATEGORY_MAP: Record<string, string[]> = {
  'viral_bold': ['Trending', 'Bold', 'Social'],
  'impact_stack': ['Trending', 'Bold'],
  'highlight_bar': ['Social', 'Bold'],
  'neon_pop': ['Trending', 'Social'],
  'minimal': ['Minimal', 'Clean', 'Classic'],
  'hot_take': ['Social', 'Trending'],
  'clean_subtitle': ['Clean', 'Classic'],
  'documentary': ['Cinematic', 'Classic'],
  'podcast_bold': ['Podcast', 'Bold'],
  'soft_box': ['Minimal', 'Clean'],
  'punch_yellow': ['Bold', 'Social'],
  'mono_tech': ['Minimal'],
  'cinema_clean': ['Cinematic', 'Clean'],
  'news_bar': ['Classic', 'Bold'],
  'electric_blue': ['Social', 'Trending'],
  'red_alert': ['Trending', 'Bold'],
};

export function CaptionStudio({ config: initialConfig, onSave, onClose }: Props) {
  const [history, setHistory] = useState<CaptionConfig[]>([JSON.parse(JSON.stringify(initialConfig))]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const currentConfig = history[historyIndex];
  
  const { customPresets, saveAsNew, updatePreset, renamePreset, duplicatePreset, deletePreset, toggleFavorite } = useCaptionPresets();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [filterType, setFilterType] = useState<'All'|'Custom'|'Favorites'>('All');

  // Modals state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState('');
  const [saveModalCategory, setSaveModalCategory] = useState('Custom');
  const [saveModalFavorite, setSaveModalFavorite] = useState(false);

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameName, setRenameName] = useState('');

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState('');

  const [menuOpenId, setMenuOpenId] = useState('');

  const isCustom = customPresets.some(p => p.id === currentConfig.presetId);
  const isDirty = Object.keys(currentConfig.overrides).length > 0;

  const resolvedStyle = useMemo(() => {
    return resolveCaptionStyle(currentConfig.presetId, currentConfig.overrides, customPresets);
  }, [currentConfig.presetId, currentConfig.overrides, customPresets]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = originalOverflow; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isDirty) handleSaveChanges();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history.length, isDirty, currentConfig]);

  const pushHistory = (newConfig: CaptionConfig) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newConfig);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = useCallback(() => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); }, [historyIndex]);
  const handleRedo = useCallback(() => { if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1); }, [historyIndex, history.length]);

  const handleSelectPreset = (id: string) => pushHistory({ ...currentConfig, presetId: id, overrides: {} });
  const handleOverridesChange = (overrides: CaptionOverrides) => pushHistory({ ...currentConfig, overrides });
  const handleReset = () => pushHistory({ ...currentConfig, overrides: {} });

  const handleSaveAsNewClick = () => {
    setSaveModalName('');
    setSaveModalCategory('Custom');
    setSaveModalFavorite(false);
    setSaveModalOpen(true);
  };

  const deepMergeOverrides = (base: CaptionOverrides, delta: CaptionOverrides): CaptionOverrides => {
    return {
      text: { ...(base.text || {}), ...(delta.text || {}) },
      layout: { ...(base.layout || {}), ...(delta.layout || {}) },
      appearance: { ...(base.appearance || {}), ...(delta.appearance || {}) },
      effects: { ...(base.effects || {}), ...(delta.effects || {}) },
      timing: { ...(base.timing || {}), ...(delta.timing || {}) },
    };
  };

  const handleConfirmSaveAsNew = () => {
    const trimmed = saveModalName.trim();
    if (!trimmed) return;
    const baseId = isCustom ? customPresets.find(p => p.id === currentConfig.presetId)!.basePreset : currentConfig.presetId;
    let merged = currentConfig.overrides;
    if (isCustom) {
      const p = customPresets.find(p => p.id === currentConfig.presetId)!;
      merged = deepMergeOverrides(p.overrides, currentConfig.overrides);
    }
    const newPreset = saveAsNew(trimmed, saveModalCategory, baseId, merged);
    if (saveModalFavorite) {
      toggleFavorite(newPreset.id);
    }
    pushHistory({ ...currentConfig, presetId: newPreset.id, overrides: {} });
    setSaveModalOpen(false);
  };

  const handleSaveChanges = () => {
    if (isCustom) {
      const p = customPresets.find(p => p.id === currentConfig.presetId)!;
      const merged = deepMergeOverrides(p.overrides, currentConfig.overrides);
      updatePreset(p.id, p.name, merged);
      pushHistory({ ...currentConfig, overrides: {} });
    } else {
      handleSaveAsNewClick();
    }
  };

  const handleRenameClick = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenameTargetId(id);
    setRenameName(name);
    setRenameModalOpen(true);
    setMenuOpenId('');
  };

  const handleConfirmRename = () => {
    const trimmed = renameName.trim();
    if (trimmed && renameTargetId) {
      renamePreset(renameTargetId, trimmed);
    }
    setRenameModalOpen(false);
  };

  const handleDuplicateClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newPreset = duplicatePreset(id);
    setMenuOpenId('');
    if (newPreset && currentConfig.presetId === id) {
      pushHistory({ ...currentConfig, presetId: newPreset.id, overrides: {} });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTargetId(id);
    setDeleteModalOpen(true);
    setMenuOpenId('');
  };

  const handleConfirmDelete = () => {
    if (deleteTargetId) {
      deletePreset(deleteTargetId);
      if (currentConfig.presetId === deleteTargetId) {
        pushHistory({ ...currentConfig, presetId: 'viral_bold', overrides: {} });
      }
    }
    setDeleteModalOpen(false);
  };

  const displayedPresets = useMemo(() => {
    let items = [
      ...BUILT_IN_PRESETS.map(p => ({ ...p, type: 'Built-in', isFavorite: false, categories: PRESET_CATEGORY_MAP[p.id] || [] })),
      ...customPresets.map(p => ({ ...p, cardBg: 'linear-gradient(160deg, #111 0%, #050505 100%)', type: 'Custom', categories: ['Custom'] }))
    ];

    if (searchQuery) items = items.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterType === 'Custom') items = items.filter(p => p.type === 'Custom');
    if (filterType === 'Favorites') items = items.filter(p => p.isFavorite);
    if (selectedCategory !== 'All' && filterType === 'All') {
      items = items.filter(p => p.categories.includes(selectedCategory));
    }

    return items;
  }, [customPresets, searchQuery, filterType, selectedCategory]);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] bg-[#000] flex flex-col font-sans" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      
      {/* Header Toolbar */}
      <div className="h-12 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-200">
            <span className="text-[13px] font-semibold tracking-wide">Caption Editor</span>
          </div>
          <div className="h-4 w-px bg-gray-800"></div>
          <div className="flex gap-1">
            <button onClick={handleUndo} disabled={historyIndex === 0} className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Cmd+Z)">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button onClick={handleRedo} disabled={historyIndex === history.length - 1} className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800 disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Cmd+Shift+Z)">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-gray-300">{isCustom ? customPresets.find(p=>p.id===currentConfig.presetId)?.name : BUILT_IN_PRESETS.find(p=>p.id===currentConfig.presetId)?.name}</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-blue-500 ml-1" title="Unsaved Changes"></span>}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-[11px] text-gray-400 hover:text-white px-3 py-1.5 transition">Close</button>
          <div className="flex rounded-md overflow-hidden bg-gray-900 border border-[#222]">
            {isDirty && isCustom && (
              <button onClick={handleSaveChanges} className="text-[11px] text-gray-200 hover:text-white hover:bg-gray-800 px-3 py-1.5 transition border-r border-[#222] font-medium">
                Save Changes
              </button>
            )}
            {isDirty && (
              <button onClick={handleSaveAsNewClick} className="text-[11px] text-gray-200 hover:text-white hover:bg-gray-800 px-3 py-1.5 transition border-r border-[#222] font-medium">
                Save As New
              </button>
            )}
            <button onClick={() => onSave(currentConfig)} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 font-semibold transition">
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left: Presets Browser (Inspired by professional templates) */}
        <div className="w-[280px] border-r border-[#1a1a1a] bg-[#0a0a0a] flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-[#1a1a1a]">
            <input 
              type="text" placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#111] border border-[#222] rounded text-[11px] px-3 py-2 text-gray-200 outline-none focus:border-gray-500 transition placeholder-gray-600"
            />
            <div className="flex gap-4 mt-3 px-1 border-b border-[#1a1a1a]">
              {['All', 'Custom', 'Favorites'].map(f => (
                <button 
                  key={f} onClick={() => setFilterType(f as any)}
                  className={`text-[10px] uppercase font-bold tracking-wider pb-1.5 border-b-2 transition ${filterType === f ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-400'}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex flex-1 overflow-hidden">
            {/* Categories Sidebar */}
            {filterType === 'All' && (
              <div className="w-[72px] border-r border-[#1a1a1a] bg-[#050505] flex flex-col overflow-y-auto scrollbar-none py-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c} onClick={() => setSelectedCategory(c)}
                    className={`text-left text-[10px] py-2 px-2 transition border-l-2 ${selectedCategory === c ? 'border-blue-500 text-white bg-[#111]' : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#111]/50'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            
            {/* Preset Grid */}
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
              {displayedPresets.map(p => {
                const isSelected = p.id === currentConfig.presetId;
                return (
                  <div 
                    key={p.id} onClick={() => handleSelectPreset(p.id)}
                    className={`group relative rounded-md cursor-pointer border flex flex-col overflow-hidden transition-all duration-200 animate-fade-in bg-[#111] ${isSelected ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,1)]' : 'border-[#222] hover:border-gray-600 hover:bg-[#1a1a1a]'}`}
                  >
                    <div className="h-16 flex items-center justify-center text-[7px] font-bold text-white text-center p-2 relative overflow-hidden transition-opacity" style={{ background: p.cardBg, textShadow: '1px 1px 3px rgba(0,0,0,0.8)' }}>
                      {p.name}
                      {p.type === 'Custom' && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(p.id); }} className={`p-1 ${p.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-white'}`}>★</button>
                          <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? '' : p.id); }} className="p-1 text-gray-400 hover:text-white">⋮</button>
                        </div>
                      )}
                    </div>
                    {menuOpenId === p.id && (
                      <div className="absolute top-7 right-1 liquid-glass-elevated w-24 rounded shadow-lg z-50 flex flex-col animate-fade-in text-left">
                        <button onClick={(e) => handleRenameClick(e, p.id, p.name)} className="text-[10px] text-gray-300 hover:bg-gray-800 px-2 py-1.5 text-left transition-colors">Rename</button>
                        <button onClick={(e) => handleDuplicateClick(e, p.id)} className="text-[10px] text-gray-300 hover:bg-gray-800 px-2 py-1.5 text-left transition-colors">Duplicate</button>
                        <button onClick={(e) => handleDeleteClick(e, p.id)} className="text-[10px] text-red-400 hover:bg-gray-800 px-2 py-1.5 text-left transition-colors">Delete</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Preview Canvas */}
        <CaptionPreview resolvedStyle={resolvedStyle} />

        {/* Right: Inspector */}
        <div className="w-[340px] border-l border-[#1a1a1a] bg-[#0a0a0a] flex flex-col flex-shrink-0">
          <CaptionInspector 
            overrides={currentConfig.overrides} 
            resolvedStyle={resolvedStyle} 
            onChange={handleOverridesChange}
            onReset={handleReset}
          />
        </div>

      </div>

      {/* Save As New Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center animate-fade-in">
          <div className="liquid-glass-elevated rounded-2xl p-5 w-80 shadow-2xl scale-100 transition-transform">
            <h3 className="text-sm font-bold text-white mb-4">Save New Preset</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5">Preset Name</label>
                <input 
                  type="text" 
                  value={saveModalName} 
                  onChange={e => setSaveModalName(e.target.value)} 
                  placeholder="e.g. My Shorts Style"
                  autoFocus
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 mb-1.5">Category</label>
                <select 
                  value={saveModalCategory}
                  onChange={e => setSaveModalCategory(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors"
                >
                  {CATEGORIES.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Custom">Custom</option>
                </select>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input 
                  type="checkbox" 
                  id="fav-check"
                  checked={saveModalFavorite}
                  onChange={e => setSaveModalFavorite(e.target.checked)}
                  className="accent-blue-500 w-3 h-3 cursor-pointer"
                />
                <label htmlFor="fav-check" className="text-[11px] text-gray-300 cursor-pointer select-none">Add to Favorites</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setSaveModalOpen(false)} className="text-xs px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleConfirmSaveAsNew} disabled={!saveModalName.trim()} className="text-xs px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-semibold transition-colors">Save Preset</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModalOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center animate-fade-in">
          <div className="liquid-glass-elevated rounded-2xl p-5 w-80 shadow-2xl scale-100 transition-transform">
            <h3 className="text-sm font-bold text-white mb-4">Rename Preset</h3>
            <div>
              <input 
                type="text" 
                value={renameName} 
                onChange={e => setRenameName(e.target.value)} 
                autoFocus
                className="w-full bg-[#0a0a0a] border border-[#333] rounded px-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setRenameModalOpen(false)} className="text-xs px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleConfirmRename} disabled={!renameName.trim()} className="text-xs px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded font-semibold transition-colors">Rename</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center animate-fade-in">
          <div className="bg-[#111] border border-red-900/50 rounded-lg p-5 w-80 shadow-2xl scale-100 transition-transform">
            <h3 className="text-sm font-bold text-white mb-2">Delete Preset?</h3>
            <p className="text-[11px] text-gray-400 mb-6">This action cannot be undone. Are you sure you want to delete this custom preset?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteModalOpen(false)} className="text-xs px-4 py-2 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleConfirmDelete} className="text-xs px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-semibold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
