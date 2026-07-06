import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptionConfig, DEFAULT_CAPTION_CONFIG } from '../types/caption';
import { CaptionStudio } from './CaptionStudio';
import { useCaptionPresets } from '../hooks/useCaptionPresets';
import { BUILT_IN_PRESETS } from './CaptionSettingsSection';

export const BUILT_IN_PRESETS_DATA = [
  { id: 'viral_bold', name: 'Viral Bold', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'impact_stack', name: 'Impact Stack', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'highlight_bar', name: 'Highlight Bar', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'neon_pop', name: 'Neon Pop', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'minimal', name: 'Minimal', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'hot_take', name: 'Hot Take', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'clean_subtitle', name: 'Clean Sub', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'documentary', name: 'Documentary', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'podcast_bold', name: 'Podcast', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'soft_box', name: 'Soft Box', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'punch_yellow', name: 'Punch Yellow', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'mono_tech', name: 'Mono Tech', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'cinema_clean', name: 'Cinema Clean', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'news_bar', name: 'News Bar', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'electric_blue', name: 'Electric Blue', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
  { id: 'red_alert', name: 'Red Alert', cardBg: 'linear-gradient(135deg, #111 0%, #000 100%)' },
];
(window as any).BUILT_IN_PRESETS = BUILT_IN_PRESETS_DATA;
const EXPORTED_PRESETS = BUILT_IN_PRESETS_DATA;

interface Props {
  config?: CaptionConfig;
  onChange: (cfg: CaptionConfig) => void;
  hideSource?: boolean;
  disabled?: boolean;
}

export { EXPORTED_PRESETS as BUILT_IN_PRESETS };

export function CaptionSettingsSection({ config = DEFAULT_CAPTION_CONFIG, onChange, hideSource, disabled }: Props) {
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const { customPresets, toggleFavorite, deletePreset } = useCaptionPresets();
  const [menuState, setMenuState] = useState<{ id: string, x: number, y: number } | null>(null);

  React.useEffect(() => {
    if (!menuState) return;
    const handleClick = () => setMenuState(null);
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuState(null);
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuState]);

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...config, source: e.target.value as any });
  };

  const handlePresetChange = (presetId: string) => {
    onChange({ ...config, presetId, overrides: {} });
  };

  const handleStudioSave = (newConfig: CaptionConfig) => {
    onChange(newConfig);
    setIsStudioOpen(false);
  };

  const allPresets = [...EXPORTED_PRESETS.map(p => ({ ...p, isCustom: false, isFavorite: false })), ...customPresets.map(p => ({ ...p, cardBg: '#1a1a1a', isCustom: true }))];
  const activePreset = allPresets.find(p => p.id === config.presetId) || allPresets[0];

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg>
            </div>
            <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>Captions</span>
          </div>
          {!hideSource && (
            <select
              value={config.source}
              onChange={handleSourceChange}
              className="liquid-glass-pill appearance-none cursor-pointer border border-gray-200 dark:border-gray-700/50 text-[11px] text-gray-700 dark:text-gray-300 rounded-md px-3 py-1 outline-none font-semibold hover:border-indigo-500/50 transition-colors bg-white/50 dark:bg-black/20"
              style={{ paddingRight: '24px', backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23999%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px top 55%', backgroundSize: '8px auto' }}
            >
              <option value="none">Off</option>
              <option value="auto">Auto (Main Audio)</option>
              <option value="srt">Upload .SRT</option>
            </select>
          )}
        </div>
        
        <button
          onClick={() => setIsStudioOpen(true)}
          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all duration-200 flex items-center gap-1.5 liquid-glass-pill px-3 py-1.5 rounded-md hover:scale-105 active:scale-95 border border-indigo-500/20 shadow-sm"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          Open Studio
        </button>
      </div>

      {config.source !== 'none' && (
        <div className="liquid-glass-card rounded-xl overflow-hidden flex flex-col shadow-sm">
          {config.source === 'srt' && (
            <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-orange-50/50 dark:bg-orange-500/5">
              <div className="flex flex-col gap-2">
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">SRT File</div>
                {config.srtFile ? (
                  <div className="flex items-center justify-between bg-white dark:bg-black/40 border border-gray-200 dark:border-gray-700 rounded-md p-2 shadow-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{config.srtFile.name}</span>
                    </div>
                    <button 
                      onClick={() => onChange({ ...config, srtFile: null })}
                      className="text-red-500 hover:text-red-600 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors ml-2 flex-shrink-0"
                      title="Remove file"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-16 px-4 transition bg-white dark:bg-black/40 border-2 border-gray-300 dark:border-gray-700 border-dashed rounded-md appearance-none cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 focus:outline-none group">
                    <span className="flex items-center space-x-2">
                      <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 group-hover:text-orange-500 transition-colors">Click to browse or drag SRT file here</span>
                    </span>
                    <input type="file" name="srt_upload" className="hidden" accept=".srt" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (!file.name.toLowerCase().endsWith('.srt')) {
                          alert('Please select a valid .srt file');
                          return;
                        }
                        onChange({ ...config, srtFile: file });
                      }
                    }} />
                  </label>
                )}
              </div>
            </div>
          )}
          {/* Active Preset Banner */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
            <div className="flex gap-3 items-center">
              <div 
                className="w-16 h-10 rounded-md border border-gray-300 dark:border-gray-700 flex items-center justify-center shadow-sm"
                style={{ background: activePreset.cardBg }}
              >
                <span className="text-[7px] font-bold text-white text-center leading-tight px-1" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                  {activePreset.name}
                </span>
              </div>
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-0.5">Current Style</div>
                <div className="text-sm text-gray-900 dark:text-gray-100 font-semibold flex items-center gap-2">
                  {activePreset.name}
                  {activePreset.isCustom ? (
                    <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">Custom</span>
                  ) : (
                    <span className="text-[9px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded border border-gray-500/30">Built-in</span>
                  )}
                  {Object.keys(config.overrides).length > 0 && (
                    <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">Edited</span>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsStudioOpen(true)}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold shadow-sm transition"
            >
              Open Caption Studio
            </button>
          </div>
          
          {/* Quick Strips (Built-in) */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-2 flex justify-between">
              <span>Quick Presets</span>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {EXPORTED_PRESETS.slice(0, 8).map(preset => {
                const isSelected = preset.id === config.presetId && Object.keys(config.overrides).length === 0;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetChange(preset.id)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition ${isSelected ? 'border border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'liquid-glass-pill text-gray-700 dark:text-gray-300 hover:brightness-110'}`}
                  >
                    {preset.name}
                  </button>
                );
              })}
              <button
                onClick={() => setIsStudioOpen(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full liquid-glass-pill border-dashed bg-transparent text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 transition"
              >
                More Styles...
              </button>
            </div>
          </div>

          {/* Saved Presets */}
          <div className="p-3 bg-gray-50/50 dark:bg-gray-950/50">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-2 flex justify-between">
              <span>Saved Presets</span>
              <span className="text-gray-500 font-normal normal-case">{customPresets.length} saved</span>
            </div>
            {customPresets.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-800 pb-2">
                {customPresets.map(preset => {
                  const isSelected = preset.id === config.presetId;
                  return (
                    <div key={preset.id} className="relative group flex-shrink-0 animate-fade-in">
                      <button
                        onClick={() => handlePresetChange(preset.id)}
                        className={`w-24 h-14 rounded-md border flex flex-col items-center justify-center text-[10px] font-bold transition overflow-hidden ${isSelected ? 'border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.3)]' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}
                        style={{ background: '#111', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}
                      >
                        <span className="relative z-10 px-1 text-center text-white">{preset.name}</span>
                      </button>
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition z-20">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMenuState({
                              id: preset.id,
                              x: rect.right,
                              y: rect.bottom + 4
                            });
                          }}
                          className="p-1 rounded bg-black/50 text-gray-300 hover:text-white hover:bg-black/70 flex items-center justify-center shadow-sm"
                        >
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-gray-500 italic py-2">
                No custom presets saved yet. Customize a style in Caption Studio and click "Save As New".
              </div>
            )}
          </div>
        </div>
      )}

      {isStudioOpen && (
        <CaptionStudio
          config={config}
          onSave={handleStudioSave}
          onClose={() => setIsStudioOpen(false)}
        />
      )}

      {menuState && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 w-36 text-[11px] font-medium text-gray-700 dark:text-gray-300"
          style={{
            top: Math.min(menuState.y, window.innerHeight - 100),
            left: Math.min(menuState.x - 144, window.innerWidth - 150)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50"
            onClick={() => {
              handlePresetChange(menuState.id);
              setMenuState(null);
            }}
          >
            Apply Preset
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50"
            onClick={() => {
              toggleFavorite(menuState.id);
              setMenuState(null);
            }}
          >
            {customPresets.find(p => p.id === menuState.id)?.isFavorite ? 'Remove Favorite' : 'Add to Favorites'}
          </button>
          <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
            onClick={() => {
              if (window.confirm('Delete this custom preset?')) {
                deletePreset(menuState.id);
              }
              setMenuState(null);
            }}
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
