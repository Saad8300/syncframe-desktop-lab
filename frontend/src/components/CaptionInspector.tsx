import React, { useState } from 'react';
import { CaptionOverrides } from '../types/caption';
import { ResolvedCaptionStyle } from '../utils/captionResolver';
import { FONTS_MANIFEST, FONT_CATEGORIES } from '../types/fonts';

interface Props {
  overrides: CaptionOverrides;
  resolvedStyle: ResolvedCaptionStyle;
  onChange: (overrides: CaptionOverrides) => void;
  onReset: () => void;
}

export function CaptionInspector({ overrides, resolvedStyle, onChange, onReset }: Props) {
  const [activeTab, setActiveTab] = useState<'text'|'layout'|'style'|'effects'|'timing'>('text');

  const update = (category: keyof CaptionOverrides, field: string, value: any) => {
    const newOverrides = { ...overrides };
    if (!newOverrides[category]) newOverrides[category] = {};
    (newOverrides[category] as any)[field] = value;
    onChange(newOverrides);
  };

  const tabs = [
    { id: 'text', label: 'Text' },
    { id: 'layout', label: 'Layout' },
    { id: 'style', label: 'Style' },
    { id: 'effects', label: 'Effects' },
    { id: 'timing', label: 'Timing' }
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 text-sm">
      <div className="flex overflow-x-auto border-b border-gray-800 p-1 bg-gray-900 flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex-1 min-w-[50px] text-[10px] font-semibold py-2 px-1 rounded transition uppercase tracking-wider ${activeTab === t.id ? 'bg-[#0a0a0a] text-white shadow-sm border border-gray-700' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin scrollbar-thumb-gray-800">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{activeTab} Properties</span>
          <button onClick={onReset} className="text-[10px] text-gray-500 hover:text-white transition uppercase">Reset All</button>
        </div>

        {activeTab === 'text' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Font Family</label>
              <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                value={resolvedStyle.fontFamily} onChange={e => update('text', 'fontFamily', e.target.value)}>
                {FONT_CATEGORIES.map(category => (
                  <optgroup key={category} label={category}>
                    {FONTS_MANIFEST.fonts.filter(f => f.category === category).map(font => (
                      <option key={font.id} value={font.cssFamily}>{font.displayName}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Weight</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.fontWeight} onChange={e => update('text', 'fontWeight', e.target.value)}>
                  <option value="400">Regular</option>
                  <option value="600">Semibold</option>
                  <option value="800">Bold</option>
                  <option value="900">Heavy</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Transform</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.textTransform} onChange={e => update('text', 'textTransform', e.target.value)}>
                  <option value="original">Original</option>
                  <option value="uppercase">UPPERCASE</option>
                  <option value="lowercase">lowercase</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 flex justify-between">
                <span>Scale</span> <span>{Math.round(resolvedStyle.fontScale * 100)}%</span>
              </label>
              <input type="range" min="0.3" max="2.0" step="0.05" value={resolvedStyle.fontScale} onChange={e => update('text', 'fontScale', parseFloat(e.target.value))} className="w-full accent-gray-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Spacing</label>
                <input type="range" min="-0.1" max="0.2" step="0.01" value={resolvedStyle.letterSpacing} onChange={e => update('text', 'letterSpacing', parseFloat(e.target.value))} className="w-full accent-gray-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Height</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.lineHeight} onChange={e => update('text', 'lineHeight', e.target.value)}>
                  <option value="tight">Tight</option>
                  <option value="normal">Normal</option>
                  <option value="relaxed">Relaxed</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Alignment</label>
              <div className="flex rounded-sm overflow-hidden border border-gray-700">
                {['left', 'center', 'right'].map(align => (
                  <button key={align} onClick={() => update('text', 'textAlign', align)} className={`flex-1 py-0.5 text-[10px] uppercase font-semibold ${resolvedStyle.textAlign === align ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}>
                    {align}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'layout' && (
          <div className="space-y-4 animate-fade-in">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Position Anchor</label>
              <div className="grid grid-cols-3 gap-1">
                {['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right', 'lower_center'].map(pos => (
                  <button key={pos} onClick={() => update('layout', 'position', pos)} className={`py-2 text-[8px] uppercase font-bold border rounded-sm ${resolvedStyle.position === pos ? 'border-gray-400 bg-gray-800 text-white' : 'border-gray-800 bg-gray-900 text-gray-600 hover:border-gray-600'}`}>
                    {pos.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 flex justify-between">
                <span>Vertical Offset</span> <span>{resolvedStyle.verticalOffset}px</span>
              </label>
              <input type="range" min="-200" max="200" step="10" value={resolvedStyle.verticalOffset} onChange={e => update('layout', 'verticalOffset', parseInt(e.target.value))} className="w-full accent-gray-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Max Width %</label>
                <input type="number" min="30" max="100" value={resolvedStyle.maxWidth} onChange={e => update('layout', 'maxWidth', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Safe Margin</label>
                <input type="number" min="0" max="20" value={resolvedStyle.safeMargin} onChange={e => update('layout', 'safeMargin', parseInt(e.target.value))} className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Max Lines</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.maxLines} onChange={e => update('layout', 'maxLines', parseInt(e.target.value))}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Max Words</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.maxWords} onChange={e => update('layout', 'maxWords', parseInt(e.target.value))}>
                  {[1,2,3,4,5,6,8,10,12].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={resolvedStyle.primaryColor} onChange={e => update('appearance', 'primaryColor', e.target.value)} className="w-8 h-7 rounded border-none bg-transparent cursor-pointer p-0" />
                  <input type="text" value={resolvedStyle.primaryColor} onChange={e => update('appearance', 'primaryColor', e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none uppercase font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Accent Color</label>
                <div className="flex gap-2">
                  <input type="color" value={resolvedStyle.accentColor} onChange={e => update('appearance', 'accentColor', e.target.value)} className="w-8 h-7 rounded border-none bg-transparent cursor-pointer p-0" />
                  <input type="text" value={resolvedStyle.accentColor} onChange={e => update('appearance', 'accentColor', e.target.value)} className="flex-1 bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none uppercase font-mono" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Accent Mode</label>
              <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                value={resolvedStyle.accentMode} onChange={e => update('appearance', 'accentMode', e.target.value)}>
                <option value="none">None</option>
                <option value="first_word">First Word</option>
                <option value="last_word">Last Word</option>
                <option value="second_line">Second Line</option>
                <option value="alternate_phrase">Alternate Phrase</option>
              </select>
            </div>

            <div className="h-px bg-gray-800 w-full my-4"></div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Outline</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500 mb-2"
                  value={resolvedStyle.outlineStyle} onChange={e => update('appearance', 'outlineStyle', e.target.value)}>
                  <option value="none">None</option>
                  <option value="thin">Thin</option>
                  <option value="medium">Medium</option>
                  <option value="thick">Thick</option>
                </select>
                <input type="color" value={resolvedStyle.outlineColor} onChange={e => update('appearance', 'outlineColor', e.target.value)} className="w-full h-6 rounded border-none bg-transparent cursor-pointer p-0" disabled={resolvedStyle.outlineStyle === 'none'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Shadow</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500 mb-2"
                  value={resolvedStyle.shadowStyle} onChange={e => update('appearance', 'shadowStyle', e.target.value)}>
                  <option value="none">None</option>
                  <option value="soft">Soft</option>
                  <option value="medium">Medium</option>
                  <option value="strong">Strong</option>
                  <option value="glow">Glow</option>
                </select>
                <input type="color" value={resolvedStyle.shadowColor} onChange={e => update('appearance', 'shadowColor', e.target.value)} className="w-full h-6 rounded border-none bg-transparent cursor-pointer p-0" disabled={resolvedStyle.shadowStyle === 'none'} />
              </div>
            </div>

            <div className="h-px bg-gray-800 w-full my-4"></div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Background Box</label>
              <div className="flex gap-2">
                <select className="flex-1 bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={resolvedStyle.boxStyle} onChange={e => update('appearance', 'boxStyle', e.target.value)}>
                  <option value="none">None</option>
                  <option value="subtle">Subtle Box</option>
                  <option value="medium">Medium Box</option>
                  <option value="strong">Solid Box</option>
                </select>
                <input type="color" value={resolvedStyle.boxColor} onChange={e => update('appearance', 'boxColor', e.target.value)} className="w-10 h-7 rounded border-none bg-transparent cursor-pointer p-0" disabled={resolvedStyle.boxStyle === 'none'} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="space-y-4 text-center py-8 text-gray-500 animate-fade-in">
            <p className="text-[10px]">Effects will be simulated in the preview during playback.</p>
            <div className="text-left mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Entry Effect</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                  value={(overrides.effects as any)?.entryAnimation || 'none'} onChange={e => update('effects', 'entryAnimation', e.target.value)}>
                  <option value="none">None</option>
                  <option value="fade">Fade In</option>
                  <option value="pop">Pop In</option>
                  <option value="rise">Rise Up</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timing' && (
          <div className="space-y-4 text-center py-8 text-gray-500 animate-fade-in">
             <p className="text-[10px] mb-2">Timing defaults control chunking logic during caption generation.</p>
             <div className="text-left space-y-4">
               <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Reading Speed Bias</label>
                  <select className="w-full bg-gray-900 border border-gray-700 rounded-sm p-1.5 text-[10px] text-gray-200 outline-none focus:border-gray-500"
                    value={(overrides.timing as any)?.readingSpeed || 'normal'} onChange={e => update('timing', 'readingSpeed', e.target.value)}>
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
