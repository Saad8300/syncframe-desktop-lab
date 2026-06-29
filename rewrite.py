import re

with open('frontend/src/App.tsx', 'r') as f:
    content = f.read()

# 1. Remove SettingsPanel and EnhancementsPanel imports
content = re.sub(r"import SettingsPanel from '\./components/SettingsPanel'\n", "", content)
content = re.sub(r"import EnhancementsPanel from '\./components/EnhancementsPanel'\n", "", content)
# Add IconVideo if missing
if 'IconVideo' not in content:
    content = content.replace('IconSparkles,\n} from', 'IconSparkles,\n  IconVideo,\n} from')

# Add Sel component before WorkflowBar
sel_comp = """
// ── Reusable select ─────────────────────────────────────────────────────────

function Sel<T extends string>({
  id, label, value, options, onChange, disabled,
}: {
  id: string; label: string; value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="form-label">{label}</label>
      <select
        id={id} value={value} disabled={disabled} className="form-select"
        onChange={e => onChange(e.target.value as T)}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
"""
if "function Sel<" not in content:
    content = content.replace("// ── Workflow step indicator", sel_comp + "\n// ── Workflow step indicator")

# 2. Replace everything inside `<main>...</main>`
main_pattern = re.compile(r'<main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">.*?</main>', re.DOTALL)

replacement = """<main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6">
        <div className="flex flex-col xl:flex-row gap-6 items-start">

          {/* ── LEFT COLUMN ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Audio duration warning */}
            {audioDuration !== null && audioDuration > 600 && (
              <div className="alert-warning animate-fade-in">
                <span>⚠</span>
                <p className="text-xs">
                  {audioDuration > 1200
                    ? 'This audio is very long (>20 min). Generation may take a long time depending on your settings and computer.'
                    : 'Long audio detected (>10 min). Use 720p Fast Preview to check timing before your final 1080p export.'}
                </p>
              </div>
            )}

            {/* Source Files card */}
            <div className="card p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Source Files</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Three required files to generate your video</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5">
                  <FileReq label="Audio"  files={audioFiles} />
                  <span style={{ color: 'var(--border-default)' }}>·</span>
                  <FileReq label="Images" file={imagesZip} />
                  <span style={{ color: 'var(--border-default)' }}>·</span>
                  <FileReq label="CSV"    file={csvFile} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FileDropZone
                  id="audio-upload"
                  label="Main Audio"
                  description="Upload one file or multiple audio parts"
                  accept="audio/*,.mp3,.wav,.m4a,.aac"
                  icon={<IconMusic size={14} />}
                  files={audioFiles}
                  onFilesChange={setAudioFiles}
                  multiple
                  disabled={isLoading}
                  required
                />
                <FileDropZone
                  id="images-upload"
                  label="Images ZIP"
                  description="1.jpg, 2.jpg…"
                  accept=".zip,application/zip"
                  icon={<IconImage size={14} />}
                  file={imagesZip}
                  onChange={setImagesZip}
                  disabled={isLoading}
                  required
                />
                <FileDropZone
                  id="csv-upload"
                  label="Timestamp CSV"
                  description="image, start, end columns"
                  accept=".csv,text/csv"
                  icon={<IconFileText size={14} />}
                  file={csvFile}
                  onChange={setCsvFile}
                  disabled={isLoading}
                  required
                />
              </div>

              <div>
                <div className="flex items-center gap-2 mt-1 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Optional Appends</span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FileDropZone id="intro-upload" label="Intro Video" description="Appended before timeline" accept="video/mp4,video/quicktime,video/webm"
                    icon={<IconVideo size={14} />} file={introFile} onChange={setIntroFile} disabled={isLoading} />
                  <FileDropZone id="outro-upload" label="Outro Video" description="Appended after timeline" accept="video/mp4,video/quicktime,video/webm"
                    icon={<IconVideo size={14} />} file={outroFile} onChange={setOutroFile} disabled={isLoading} />
                </div>
              </div>
            </div>

            {/* Video Settings card */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Video Settings</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Configure core dimensions and playback behaviors.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Sel id="aspect-ratio" label="Aspect Ratio" value={settings.aspectRatio} disabled={isLoading} onChange={v => setSettings({...settings, aspectRatio: v as any})}
                  options={[ { value: '9:16', label: '9:16 Vertical' }, { value: '16:9', label: '16:9 Landscape' }, { value: '1:1', label: '1:1 Square' } ]} />
                
                <Sel id="export-resolution" label="Resolution" value={settings.exportResolution} disabled={isLoading} onChange={v => setSettings({...settings, exportResolution: v as any})}
                  options={[ { value: '720p', label: '720p Fast' }, { value: '1080p', label: '1080p HD' }, { value: '2K', label: '2K Sharp' }, { value: '4K', label: '4K Ultra' } ]} />

                <Sel id="fit-mode" label="Fit Mode" value={settings.fitMode} disabled={isLoading} onChange={v => setSettings({...settings, fitMode: v as any})}
                  options={[ { value: 'cover', label: 'Cover (Crop)' }, { value: 'contain', label: 'Contain (Pad)' } ]} />

                <Sel id="render-profile" label="Render Profile" value={settings.renderProfile} disabled={isLoading} onChange={v => setSettings({...settings, renderProfile: v as any})}
                  options={[ { value: 'fast_preview', label: 'Fast Preview' }, { value: 'balanced', label: 'Balanced' }, { value: 'high_quality', label: 'High Quality' } ]} />
              </div>

              <div className="space-y-1">
                <label htmlFor="output-name" className="form-label">Output Filename</label>
                <div className="flex items-center gap-2">
                  <input
                    id="output-name" type="text" value={settings.outputName} disabled={isLoading}
                    onChange={e => setSettings({...settings, outputName: e.target.value})}
                    placeholder="my_video"
                    className="form-input flex-1"
                  />
                  <span className="text-[10px] font-mono shrink-0 px-2 py-1.5 rounded-md" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    _YYYYMMDD.mp4
                  </span>
                </div>
              </div>
            </div>

            {/* Timeline Styling / Motion card */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Timeline Styling / Motion</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Apply transitions and motion to your media.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Sel id="style-preset" label="Style Preset" value={settings.stylePreset} disabled={isLoading} onChange={v => {
                    const preset = v as any;
                    const map: Record<string, any> = {
                      clean_default: { motionEffect: 'slow_zoom_in', motionIntensity: 'medium', transition: 'fade', transitionDuration: '0.5', visualEffect: 'none', effectStrength: 'medium' },
                      youtube_documentary: { motionEffect: 'ken_burns', motionIntensity: 'medium', transition: 'crossfade', transitionDuration: '0.8', visualEffect: 'cinematic', effectStrength: 'medium' },
                      tiktok_reels: { motionEffect: 'dynamic_shorts', motionIntensity: 'high', transition: 'flash', transitionDuration: '0.2', visualEffect: 'high_contrast', effectStrength: 'medium' },
                      cinematic_story: { motionEffect: 'ken_burns', motionIntensity: 'medium', transition: 'fade_black', transitionDuration: '0.8', visualEffect: 'cinematic', effectStrength: 'medium' },
                      news_report: { motionEffect: 'pan_left', motionIntensity: 'low', transition: 'fade', transitionDuration: '0.5', visualEffect: 'clean_bright', effectStrength: 'low' },
                      calm_educational: { motionEffect: 'slow_zoom_in', motionIntensity: 'low', transition: 'crossfade', transitionDuration: '0.8', visualEffect: 'clean_bright', effectStrength: 'low' },
                      dramatic_shorts: { motionEffect: 'dynamic_shorts', motionIntensity: 'high', transition: 'zoom_in', transitionDuration: '0.2', visualEffect: 'high_contrast', effectStrength: 'high' }
                    };
                    const cfg = map[preset];
                    setSettings({
                      ...settings,
                      stylePreset: preset,
                      ...cfg,
                      zoomEffect: cfg.motionEffect === 'slow_zoom_in' ? 'slow_zoom_in' : 'none'
                    });
                  }}
                  options={[
                    { value: 'clean_default', label: 'Clean Default' },
                    { value: 'youtube_documentary', label: 'YouTube Documentary' },
                    { value: 'tiktok_reels', label: 'TikTok / Reels Dynamic' },
                    { value: 'cinematic_story', label: 'Cinematic Story' },
                    { value: 'news_report', label: 'News / Report Style' },
                    { value: 'calm_educational', label: 'Calm Educational' },
                    { value: 'dramatic_shorts', label: 'Dramatic Shorts' }
                  ]} />

                <Sel id="motion-effect" label="Motion Effect" value={settings.motionEffect} disabled={isLoading} onChange={v => setSettings({...settings, motionEffect: v as any, zoomEffect: v === 'slow_zoom_in' ? 'slow_zoom_in' : 'none'})}
                  options={[
                    { value: 'none', label: 'None' }, { value: 'slow_zoom_in', label: 'Slow Zoom In' }, { value: 'slow_zoom_out', label: 'Slow Zoom Out' },
                    { value: 'ken_burns', label: 'Ken Burns' }, { value: 'pan_left', label: 'Pan Left' }, { value: 'pan_right', label: 'Pan Right' },
                    { value: 'pan_up', label: 'Pan Up' }, { value: 'pan_down', label: 'Pan Down' }, { value: 'subtle_random', label: 'Subtle Random' },
                    { value: 'dynamic_shorts', label: 'Dynamic Shorts' }
                  ]} />

                <Sel id="motion-intensity" label="Motion Intensity" value={settings.motionIntensity} disabled={isLoading} onChange={v => setSettings({...settings, motionIntensity: v as any})}
                  options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />

                <Sel id="transition" label="Transition" value={settings.transition} disabled={isLoading} onChange={v => setSettings({...settings, transition: v as any})}
                  options={[
                    { value: 'none', label: 'None' }, { value: 'fade', label: 'Fade' }, { value: 'crossfade', label: 'Crossfade' },
                    { value: 'fade_black', label: 'Fade to Black' }, { value: 'fade_white', label: 'Fade to White' }, { value: 'slide_left', label: 'Slide Left' },
                    { value: 'slide_right', label: 'Slide Right' }, { value: 'slide_up', label: 'Slide Up' }, { value: 'slide_down', label: 'Slide Down' },
                    { value: 'push_left', label: 'Push Left' }, { value: 'push_right', label: 'Push Right' }, { value: 'zoom_in', label: 'Zoom In' },
                    { value: 'zoom_out', label: 'Zoom Out' }, { value: 'blur_crossfade', label: 'Blur Crossfade' }, { value: 'flash', label: 'Flash' }
                  ]} />

                <Sel id="transition-duration" label="Transition Duration" value={settings.transitionDuration} disabled={isLoading} onChange={v => setSettings({...settings, transitionDuration: v as any})}
                  options={[ { value: '0.2', label: '0.2s' }, { value: '0.5', label: '0.5s' }, { value: '0.8', label: '0.8s' }, { value: '1.0', label: '1.0s' } ]} />

                <Sel id="visual-effect" label="Visual Style" value={settings.visualEffect} disabled={isLoading} onChange={v => setSettings({...settings, visualEffect: v as any})}
                  options={[
                    { value: 'none', label: 'None' }, { value: 'cinematic', label: 'Cinematic' }, { value: 'warm', label: 'Warm' },
                    { value: 'high_contrast', label: 'High Contrast' }, { value: 'black_and_white', label: 'Black & White' }, { value: 'clean_bright', label: 'Clean Bright' }
                  ]} />

                <Sel id="effect-strength" label="Style Strength" value={settings.effectStrength} disabled={isLoading} onChange={v => setSettings({...settings, effectStrength: v as any})}
                  options={[ { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' } ]} />
              </div>
            </div>

            {/* Background Music card */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Background Music</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Optional music track mixed under the main voice audio.</p>
              </div>
              
              <FileDropZone
                id="bg-music-upload"
                label="Upload Music"
                description="mp3, wav, m4a, aac"
                accept="audio/mpeg,audio/wav,audio/aac,audio/x-m4a,audio/mp4,.m4a"
                icon={<IconMusic size={14} />}
                file={bgMusicFile}
                onChange={setBgMusicFile}
                disabled={isLoading}
              />

              {bgMusicFile && (
                <div className="space-y-3 mt-4">
                  <div className="flex items-center gap-2 mt-1 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Music Controls</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  </div>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between items-center">
                      <label className="form-label mb-0">Music Volume</label>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{settings.musicVolume}%</span>
                    </div>
                    <input type="range" min={0} max={100} value={settings.musicVolume}
                      onChange={e => setSettings({...settings, musicVolume: Number(e.target.value)})}
                      className="w-full" disabled={isLoading} />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-primary)', cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                      <input type="checkbox" checked={settings.musicFade} onChange={e => setSettings({...settings, musicFade: e.target.checked})} disabled={isLoading} />
                      Fade music in/out
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Watermark card */}
            <div className="card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Watermark</h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Add text over your entire timeline.</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="form-label" htmlFor="wm-text">Watermark Text</label>
                  <input
                    id="wm-text" type="text" placeholder="@YourChannel or brand name" className="form-input" disabled={isLoading}
                    value={settings.watermarkText} onChange={(e) => setSettings({...settings, watermarkText: e.target.value.slice(0, 60)})}
                  />
                </div>
              </div>
              
              {settings.watermarkText.trim() && (
                <div className="animate-fade-in mt-4">
                  <div className="flex items-center gap-2 mt-1 mb-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Watermark Options</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <Sel id="wm-pos-mode" label="Position Mode" value={settings.watermarkPositionMode} disabled={isLoading} onChange={v => setSettings({...settings, watermarkPositionMode: v as any})}
                      options={[ { value: 'preset', label: 'Preset Position' }, { value: 'custom', label: 'Custom (X/Y px)' } ]} />
                    
                    {settings.watermarkPositionMode === 'preset' ? (
                      <Sel id="wm-pos" label="Position" value={settings.watermarkPosition} disabled={isLoading} onChange={v => setSettings({...settings, watermarkPosition: v as any})}
                        options={[
                          { value: 'white_default', label: 'White Default (Bottom Center)' },
                          { value: 'bottom_right', label: 'Bottom Right' },
                          { value: 'bottom_left', label: 'Bottom Left' },
                          { value: 'top_right', label: 'Top Right' },
                          { value: 'top_left', label: 'Top Left' },
                          { value: 'center', label: 'Center' }
                        ]} />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="form-label" htmlFor="wm-x">X px</label>
                            <input id="wm-x" type="number" className="form-input text-center" value={settings.watermarkX} onChange={e => setSettings({...settings, watermarkX: parseInt(e.target.value) || 0})} disabled={isLoading} />
                          </div>
                          <div className="space-y-1">
                            <label className="form-label" htmlFor="wm-y">Y px</label>
                            <input id="wm-y" type="number" className="form-input text-center" value={settings.watermarkY} onChange={e => setSettings({...settings, watermarkY: parseInt(e.target.value) || 0})} disabled={isLoading} />
                          </div>
                        </div>
                        
                        <div className="space-y-1 mt-1">
                          <label className="form-label" htmlFor="wm-coord-mode">Coordinate Mode</label>
                          <select id="wm-coord-mode" value={settings.watermarkCoordinateMode} onChange={e => setSettings({...settings, watermarkCoordinateMode: e.target.value as any})} className="form-select" disabled={isLoading}>
                            <option value="design_canvas">Design Canvas X/Y</option>
                            <option value="final_pixels">Final Export Pixels</option>
                          </select>
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="form-label">Opacity ({settings.watermarkOpacity}%)</label>
                      </div>
                      <input type="range" min="10" max="100" className="w-full mt-2" value={settings.watermarkOpacity} onChange={e => setSettings({...settings, watermarkOpacity: parseInt(e.target.value)})} disabled={isLoading} />
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="form-label">Size ({settings.watermarkSize}px base)</label>
                      </div>
                      <input type="range" min="10" max="80" className="w-full mt-2" value={settings.watermarkSize} onChange={e => setSettings({...settings, watermarkSize: parseInt(e.target.value)})} disabled={isLoading} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Results */}
            {result && <ResultsPanel result={result} settings={settings} />}
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="xl:w-[320px] shrink-0 space-y-6">

            {/* Generate Button */}
            <div className="card p-5 space-y-4 sticky top-20">
              <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Action</h2>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className={`w-full relative overflow-hidden transition-all duration-300 flex items-center justify-center gap-2 rounded-xl text-sm font-bold active:scale-[0.98] ${
                  canGenerate
                    ? 'active:brightness-95'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                style={{
                  height: 52,
                  background: canGenerate ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'var(--bg-elevated)',
                  boxShadow: canGenerate ? '0 4px 16px rgba(99,102,241,0.35)' : 'none',
                  color: canGenerate ? '#fff' : 'var(--text-muted)',
                  border: canGenerate ? 'none' : '1px solid var(--border-default)'
                }}
                onMouseEnter={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 28px rgba(99,102,241,0.55)' }}
                onMouseLeave={e => { if (canGenerate) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.35)' }}
              >
                {isLoading ? (
                  <>
                    <IconLoader size={18} className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <IconZap size={18} />
                    Generate Video
                  </>
                )}
              </button>

              {/* Missing files indicator */}
              {!canGenerate && !isLoading && (
                <div className="flex items-center gap-3 flex-wrap mt-3">
                  {[
                    { label: 'Audio',     hasFile: audioFiles.length > 0 },
                    { label: 'Images',    hasFile: !!imagesZip },
                    { label: 'CSV',       hasFile: !!csvFile   },
                  ].filter(f => !f.hasFile).map(f => (
                    <span
                      key={f.label}
                      className="flex items-center gap-1 text-[10px]"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <span style={{ color: 'var(--color-error-border)' }}>✗</span>
                      {f.label} missing
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* CSV Format Guide */}
            <div className="card p-5 space-y-4">
              <CsvGuide />
            </div>

          </div>

        </div>
      </main>"""

content = main_pattern.sub(replacement, content)

with open('frontend/src/App.tsx', 'w') as f:
    f.write(content)

