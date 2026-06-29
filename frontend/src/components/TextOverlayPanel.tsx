import React, { useState, useEffect } from 'react';
import { GenerateSettings } from '../types';
import { getAllPresets, savePreset, deletePreset, TextOverlayPreset } from '../utils/textOverlayPresets';

export function TextOverlayPreview({ settings, isActive }: { settings: any; isActive: boolean }) {
  const {
    textOverlayMode: mode = 'whole_video',
    textOverlayItems: items = [],
    textOverlayText: text,
    textOverlayFontFamily: fontFamily,
    textOverlayFontSizePercent: fontSize,
    textOverlayFontWeight: fontWeight,
    textOverlayColor: color,
    textOverlayOpacity: opacity,
    textOverlayXPercent: x,
    textOverlayYPercent: y,
    textOverlayAlign: align,
    textOverlayMaxWidthPercent: maxWidth,
    textOverlayShadowEnabled: shadow,
    textOverlayStrokeEnabled: stroke,
    textOverlayStrokeColor: strokeColor,
    textOverlayBackgroundEnabled: bgEnabled,
    textOverlayBackgroundColor: bgColor,
    textOverlayBackgroundOpacity: bgOpacity,
    aspectRatio = '9:16',
  } = settings;

  const previewText = mode === 'whole_video' 
    ? (text || 'Sample Text')
    : mode === 'timed_text'
    ? (items[0]?.text || 'Timed text preview')
    : 'CSV caption preview';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Live Preview</h2>
        {!isActive && <span className="text-[10px] text-[var(--text-muted)] italic">Inactive</span>}
      </div>
      <div className={`rounded overflow-hidden relative shadow-inner transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`} style={{ aspectRatio: aspectRatio.replace(':', '/'), background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
        {isActive ? (
          <div 
            className="absolute"
            style={{
              left: align === 'center' ? '50%' : align === 'right' ? '100%' : '0%',
              top: `${y}%`,
              transform: `translate(${align === 'center' ? '-50%' : align === 'right' ? `calc(-100% + ${100 - x}%)` : `${x}%`}, -50%)`, // fixed transform
              width: '100%',
              textAlign: align,
              pointerEvents: 'none',
            }}
          >
            <div 
              style={{
                display: 'inline-block',
                maxWidth: `${maxWidth}%`,
                fontFamily: `${fontFamily}, sans-serif`,
                fontWeight: fontWeight === 'Regular' ? 400 : fontWeight === 'Medium' ? 500 : fontWeight === 'Bold' ? 700 : 800,
                fontSize: `calc(100cqh * ${fontSize / 100})`,
                color: color,
                opacity: opacity / 100,
                textShadow: shadow ? '0px 2px 4px rgba(0,0,0,0.5)' : 'none',
                WebkitTextStroke: stroke ? `1px ${strokeColor}` : 'none',
                backgroundColor: bgEnabled ? `${bgColor}${Math.round(bgOpacity * 2.55).toString(16).padStart(2, '0')}` : 'transparent',
                padding: bgEnabled ? '0.2em 0.4em' : '0',
                borderRadius: bgEnabled ? '0.2em' : '0',
                lineHeight: 1.2,
                wordWrap: 'break-word',
              }}
            >
              {previewText}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Add text or choose a preset to preview overlay.</span>
          </div>
        )}
        <div className="absolute inset-0 border rounded pointer-events-none" style={{ borderColor: 'var(--border-subtle)' }} />
      </div>
    </div>
  );
}

export function TextOverlayPanel({
  settings,
  onChange
}: {
  settings: any;
  onChange: (updates: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [presets, setPresets] = useState<TextOverlayPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  useEffect(() => {
    setPresets(getAllPresets());
  }, []);

  const handleApplyPreset = (presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;
    onChange({
      ...preset.settings
    });
  };

  const handleSavePreset = () => {
    const name = prompt('Enter preset name:', 'My Text Overlay Preset');
    if (!name || !name.trim()) return;
    const {
      textOverlayMode = 'whole_video', textOverlayItems = [], textOverlayText, textOverlayFontFamily, textOverlayFontSizePercent,
      textOverlayFontWeight, textOverlayColor, textOverlayOpacity, textOverlayXPercent,
      textOverlayYPercent, textOverlayAlign, textOverlayMaxWidthPercent, textOverlayShadowEnabled,
      textOverlayStrokeEnabled, textOverlayStrokeColor, textOverlayBackgroundEnabled,
      textOverlayBackgroundColor, textOverlayBackgroundOpacity
    } = settings;
    
    const newPreset = savePreset(name.trim(), {
      textOverlayEnabled: true, textOverlayMode, textOverlayItems, textOverlayText, textOverlayFontFamily, textOverlayFontSizePercent,
      textOverlayFontWeight, textOverlayColor, textOverlayOpacity, textOverlayXPercent,
      textOverlayYPercent, textOverlayAlign, textOverlayMaxWidthPercent, textOverlayShadowEnabled,
      textOverlayStrokeEnabled, textOverlayStrokeColor, textOverlayBackgroundEnabled,
      textOverlayBackgroundColor, textOverlayBackgroundOpacity
    });
    setPresets(getAllPresets());
    setSelectedPresetId(newPreset.id);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    const preset = presets.find(p => p.id === selectedPresetId);
    if (!preset || preset.type === 'built-in') return;
    
    if (confirm(`Delete preset "${preset.name}"?`)) {
      deletePreset(preset.id);
      setPresets(getAllPresets());
      setSelectedPresetId('');
    }
  };

  const {
    textOverlayMode: mode = 'whole_video',
    textOverlayItems: items = [],
    textOverlayText: text,
    textOverlayFontFamily: fontFamily,
    textOverlayFontSizePercent: fontSize,
    textOverlayFontWeight: fontWeight,
    textOverlayColor: color,
    textOverlayOpacity: opacity,
    textOverlayXPercent: x,
    textOverlayYPercent: y,
    textOverlayAlign: align,
    textOverlayMaxWidthPercent: maxWidth,
    textOverlayShadowEnabled: shadow,
    textOverlayStrokeEnabled: stroke,
    textOverlayStrokeColor: strokeColor,
    textOverlayBackgroundEnabled: bgEnabled,
    textOverlayBackgroundColor: bgColor,
    textOverlayBackgroundOpacity: bgOpacity,
  } = settings;

  const isActive = mode === 'whole_video' ? (text || '').trim().length > 0
                 : mode === 'timed_text' ? items.length > 0
                 : mode === 'csv_text';

  const fonts = [
    'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Impact'
  ];

  return (
    <div className="card transition-all duration-300">
      <div 
        className="p-5 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            Text Overlay
            {isActive ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                Active
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                Inactive
              </span>
            )}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Add custom text, branding, or watermark-style text.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div 
            className="transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'var(--text-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="px-5 pb-5 pt-0 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          
          <div className="mt-5 flex flex-col lg:flex-row gap-8">
            
            {/* Left Column (Controls) */}
            <div className="flex-1 space-y-6">
              
              {/* Presets Row */}
              <div className="flex items-center gap-3 p-3 rounded" style={{ background: 'var(--bg-elevated)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Presets</span>
                <select 
                  className="form-select flex-1 text-xs py-1"
                  value={selectedPresetId}
                  onChange={e => {
                    setSelectedPresetId(e.target.value);
                    handleApplyPreset(e.target.value);
                  }}
                >
                  <option value="" disabled>Load Preset...</option>
                  <optgroup label="Built-in Presets">
                    {presets.filter(p => p.type === 'built-in').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                  {presets.filter(p => p.type === 'saved').length > 0 && (
                    <optgroup label="Saved Presets">
                      {presets.filter(p => p.type === 'saved').map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <button onClick={handleSavePreset} className="px-3 py-1 rounded text-xs font-bold bg-[var(--bg-input)] hover:bg-[var(--border-subtle)] transition-all text-[var(--text-primary)] border border-[var(--border-subtle)]">Save Current</button>
                {presets.find(p => p.id === selectedPresetId)?.type === 'saved' && (
                  <button onClick={handleDeletePreset} className="px-2 py-1 rounded text-xs font-bold text-white bg-red-500 hover:bg-red-400 transition-all">✕</button>
                )}
              </div>

              {/* Mode Select */}
              <div className="flex items-center gap-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] w-16 shrink-0">Mode</label>
                <select 
                  value={mode}
                  onChange={e => onChange({ textOverlayMode: e.target.value })}
                  className="form-select flex-1 text-xs py-1.5"
                >
                  <option value="whole_video">Whole Video</option>
                  <option value="timed_text">Timed Text</option>
                  <option value="csv_text">CSV Text Column</option>
                </select>
              </div>

              {/* Input Data Row */}
              {mode === 'whole_video' && (
                <div className="space-y-1.5">
                  <input 
                    type="text" 
                    value={text}
                    onChange={e => onChange({ textOverlayText: e.target.value })}
                    placeholder="Your custom text here..."
                    className="form-input text-sm font-medium"
                  />
                </div>
              )}
              
              {mode === 'timed_text' && (
                <div className="space-y-2 p-4 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Timed Text Items</label>
                    <button onClick={() => onChange({ textOverlayItems: [...items, { id: Date.now().toString(), text: 'New Text', start: '00:00', end: '00:05' }] })} className="text-[10px] font-bold px-2 py-1 rounded bg-[var(--accent-primary)] text-white hover:brightness-110">+ Add Item</button>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-[var(--text-muted)] italic">No timed text items yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                      {items.map((item: any, idx: number) => (
                        <div key={item.id} className="p-2 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] grid gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[var(--text-muted)]">Item {idx + 1}</span>
                            <button onClick={() => { const newItems = [...items]; newItems.splice(idx, 1); onChange({ textOverlayItems: newItems }); }} className="text-red-500 hover:text-red-400 text-xs font-bold">✕ Delete</button>
                          </div>
                          <input type="text" value={item.text} onChange={e => { const newItems = [...items]; newItems[idx].text = e.target.value; onChange({ textOverlayItems: newItems }); }} placeholder="Text to display" className="form-input text-xs p-1.5" />
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[var(--text-muted)] w-8">Start:</label>
                              <input type="text" value={item.start} onChange={e => { const newItems = [...items]; newItems[idx].start = e.target.value; onChange({ textOverlayItems: newItems }); }} className="form-input flex-1 text-xs p-1.5 font-mono" />
                            </div>
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-[var(--text-muted)] w-8">End:</label>
                              <input type="text" value={item.end} onChange={e => { const newItems = [...items]; newItems[idx].end = e.target.value; onChange({ textOverlayItems: newItems }); }} className="form-input flex-1 text-xs p-1.5 font-mono" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {mode === 'csv_text' && (
                <div className="space-y-1.5 p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <p className="text-xs text-[var(--text-primary)]">Use the text column from your timeline CSV as timed captions.</p>
                  <pre className="text-[10px] p-2 rounded overflow-x-auto font-mono bg-[var(--bg-input)] text-[var(--text-muted)]">image,start,end,text{"\n"}1.jpg,00:00,00:03,"A wolf does not love you."</pre>
                </div>
              )}

              {/* Typography Grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Typography</span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="form-label">Font Family</label>
                    <select value={fontFamily} onChange={e => onChange({ textOverlayFontFamily: e.target.value })} className="form-select text-xs">
                      {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="form-label">Weight</label>
                    <select value={fontWeight} onChange={e => onChange({ textOverlayFontWeight: e.target.value })} className="form-select text-xs">
                      <option value="Regular">Regular</option><option value="Medium">Medium</option><option value="Bold">Bold</option><option value="Extra Bold">Extra</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="form-label">Align</label>
                    <select value={align} onChange={e => onChange({ textOverlayAlign: e.target.value as any })} className="form-select text-xs">
                      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="form-label">Color</label>
                    <div className="flex gap-2">
                      <input type="color" value={color} onChange={e => onChange({ textOverlayColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer p-0 border-0 shrink-0" />
                      <input type="text" value={color} onChange={e => onChange({ textOverlayColor: e.target.value })} className="form-input flex-1 text-xs font-mono px-2" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sizing & Position Grid */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Sizing & Position</span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                  <div className="space-y-1">
                    <label className="form-label flex justify-between"><span>Size</span><span className="text-[var(--text-muted)]">{fontSize}%</span></label>
                    <input type="range" min="1" max="20" step="1" value={fontSize} onChange={e => onChange({ textOverlayFontSizePercent: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--accent-primary)' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="form-label flex justify-between"><span>Opacity</span><span className="text-[var(--text-muted)]">{opacity}%</span></label>
                    <input type="range" min="0" max="100" step="1" value={opacity} onChange={e => onChange({ textOverlayOpacity: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--accent-primary)' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="form-label flex justify-between"><span>X Pos</span><span className="text-[var(--text-muted)]">{x}%</span></label>
                    <input type="range" min="0" max="100" step="1" value={x} onChange={e => onChange({ textOverlayXPercent: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--accent-primary)' }} />
                  </div>
                  <div className="space-y-1">
                    <label className="form-label flex justify-between"><span>Y Pos</span><span className="text-[var(--text-muted)]">{y}%</span></label>
                    <input type="range" min="0" max="100" step="1" value={y} onChange={e => onChange({ textOverlayYPercent: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--accent-primary)' }} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="form-label flex justify-between"><span>Max Width</span><span className="text-[var(--text-muted)]">{maxWidth}%</span></label>
                    <input type="range" min="20" max="100" step="1" value={maxWidth} onChange={e => onChange({ textOverlayMaxWidthPercent: Number(e.target.value) })} className="w-full" style={{ accentColor: 'var(--accent-primary)' }} />
                  </div>
                </div>
              </div>

              {/* Effects & Background */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Effects</span>
                  <div className="flex-1 h-px bg-[var(--border-subtle)]" />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  
                  {/* Shadow Pill */}
                  <div className="p-3 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-center cursor-pointer" onClick={() => onChange({ textOverlayShadowEnabled: !shadow })}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">Drop Shadow</span>
                      <input type="checkbox" checked={shadow} onChange={() => {}} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--accent-primary)' }} />
                    </div>
                  </div>
                  
                  {/* Outline Pill */}
                  <div className="p-3 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-center space-y-2 transition-all">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => onChange({ textOverlayStrokeEnabled: !stroke })}>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">Text Outline</span>
                      <input type="checkbox" checked={stroke} onChange={() => {}} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--accent-primary)' }} />
                    </div>
                    {stroke && (
                      <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                        <input type="color" value={strokeColor} onChange={e => onChange({ textOverlayStrokeColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer p-0 border-0 shrink-0" />
                        <input type="text" value={strokeColor} onChange={e => onChange({ textOverlayStrokeColor: e.target.value })} className="form-input flex-1 text-[10px] font-mono px-1 py-0 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Background Pill */}
                  <div className="p-3 rounded bg-[var(--bg-input)] border border-[var(--border-subtle)] flex flex-col justify-center space-y-2 transition-all">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => onChange({ textOverlayBackgroundEnabled: !bgEnabled })}>
                      <span className="text-xs font-semibold text-[var(--text-primary)]">Box Background</span>
                      <input type="checkbox" checked={bgEnabled} onChange={() => {}} className="w-3.5 h-3.5 rounded" style={{ accentColor: 'var(--accent-primary)' }} />
                    </div>
                    {bgEnabled && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                        <div className="flex gap-2">
                          <input type="color" value={bgColor} onChange={e => onChange({ textOverlayBackgroundColor: e.target.value })} className="w-6 h-6 rounded cursor-pointer p-0 border-0 shrink-0" />
                          <input type="text" value={bgColor} onChange={e => onChange({ textOverlayBackgroundColor: e.target.value })} className="form-input flex-1 text-[10px] font-mono px-1 py-0 h-6" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--text-muted)] w-8">{bgOpacity}%</span>
                          <input type="range" min="0" max="100" step="1" value={bgOpacity} onChange={e => onChange({ textOverlayBackgroundOpacity: Number(e.target.value) })} className="w-full flex-1" style={{ accentColor: 'var(--accent-primary)' }} />
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>

            </div>

            {/* Right Column (Live Preview) */}
            <div className="lg:w-[320px] shrink-0">
              <div className="sticky top-6">
                <TextOverlayPreview settings={settings} isActive={isActive} />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
