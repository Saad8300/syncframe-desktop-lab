import React, { useState } from 'react'
import {
  IconFileText,
  IconVideo,
  IconImage,
  IconMusic,
  IconSparkles,
  IconAlertTriangle,
  IconZap,
  IconFilm,
  IconGrid,
  IconHelpCircle,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconSettings,
  IconHistory,
} from './icons'
import StudioPageHeader from './StudioPageHeader'

// ── Inline icons ─────────────────────────────────────────────────────────────

function IconMic({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  )
}

function IconTerminal({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  )
}

function IconWorkflow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="8" height="8" rx="1"/>
      <rect x="14" y="2" width="8" height="8" rx="1"/>
      <rect x="8" y="14" width="8" height="8" rx="1"/>
      <path d="M6 10v4M18 10v4M10 18H6M14 18h4"/>
    </svg>
  )
}

function IconGlobe({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

// ── Accordion Section ─────────────────────────────────────────────────────────

function AccordionSection({
  icon,
  iconColor,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode
  iconColor: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
        style={{ background: open ? 'var(--bg-card)' : 'var(--bg-card)' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${iconColor}18`, color: iconColor, border: `1px solid ${iconColor}30` }}
        >
          {icon}
        </div>
        <span className="flex-1 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="pt-4 space-y-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Code Chip ─────────────────────────────────────────────────────────────────

function Code({ children }: { children: string }) {
  return (
    <code
      className="px-1.5 py-0.5 rounded text-[11px] font-mono"
      style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary)', border: '1px solid var(--border-subtle)' }}
    >
      {children}
    </code>
  )
}

// ── Step List Item ────────────────────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5"
        style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
      >
        {n}
      </div>
      <p className="flex-1">{children}</p>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StudioHelpPage() {
  const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')

  return (
    <div className="w-full px-5 sm:px-8 py-8 space-y-6 animate-fade-in" style={{ maxWidth: 1000 }}>

      <StudioPageHeader
        icon={<IconHelpCircle size={17} />}
        title="Help / Guide"
        subtitle="Learn how to use SyncFrame Studio tools, exports, and local workflows."
      />

      {/* ── Quick Reference Banner ── */}
      <div
        className="rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}
      >
        <div style={{ color: 'var(--accent-primary)', flexShrink: 0 }}>
          <IconZap size={20} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold" style={{ color: 'var(--accent-primary)' }}>Quick Reference</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            SyncFrame Studio runs 100% locally. The backend must be running (green status in sidebar) before you generate anything. No cloud, no login, no fees.
          </p>
        </div>
      </div>

      <div className="space-y-3">

        {/* 1. Quick Start */}
        <AccordionSection icon={<IconZap size={15} />} iconColor="#6366f1" title="1. Quick Start" defaultOpen>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Follow these steps to generate your first export:</p>
          <div className="space-y-3 mt-2">
            <Step n={1}>Open SyncFrame Studio in your browser at <Code>http://localhost:5173</Code>. Click <strong>Enter Studio</strong>.</Step>
            <Step n={2}>Click <strong>Tools</strong> in the sidebar and select a tool (e.g. <strong>Image Timeline</strong>).</Step>
            <Step n={3}>Upload the required files — audio file, images ZIP, and a timestamp CSV.</Step>
            <Step n={4}>Configure your settings: Aspect Ratio, Resolution, Output filename, transitions, etc.</Step>
            <Step n={5}>Click <strong>Generate</strong>. The process runs locally on your Mac or PC — no internet required.</Step>
            <Step n={6}>When done, use <strong>Download</strong> in the results panel to save your export.</Step>
            <Step n={7}>Your export appears in <strong>History</strong> for future reference.</Step>
          </div>
        </AccordionSection>

        {/* 2. Timeline Tools */}
        <AccordionSection icon={<IconFilm size={15} />} iconColor="#8b5cf6" title="2. Timeline Tools" defaultOpen>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: <IconImage size={15} />, color: '#0ea5e9', title: 'Image Timeline',
                items: [
                  'Upload an audio file, a ZIP of images, and a timestamp CSV.',
                  'Images must be named to match CSV references (e.g. 1.jpg, 2.jpg).',
                  'CSV columns: image, start, end, text (optional).',
                  'Supports JPG, PNG, WEBP.',
                ]
              },
              {
                icon: <IconFilm size={15} />, color: '#8b5cf6', title: 'Video Timeline',
                items: [
                  'Upload an audio file, a ZIP of video clips, and a timeline CSV.',
                  'Clips can be named 1.mp4, 2.mov, 3.webm.',
                  'CSV columns: video, start, end, text (optional).',
                  'Supports MP4, MOV, WEBM.',
                ]
              },
              {
                icon: <IconGrid size={15} />, color: '#3b82f6', title: 'Media Timeline',
                items: [
                  'Mix images, video clips, and text-only screens.',
                  'Upload audio + a single ZIP containing both images and videos.',
                  'CSV columns: start, end, asset, text.',
                  'Asset can be blank for text-only screens.',
                ]
              },
            ].map(t => (
              <div key={t.title} className="p-4 rounded-xl space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: t.color }}>{t.icon}</span>
                  <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{t.title}</h3>
                </div>
                <ul className="space-y-1.5">
                  {t.items.map((i, idx) => (
                    <li key={idx} className="text-[11px] flex gap-2" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: t.color, flexShrink: 0 }}>›</span> {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            <strong>Time formats accepted:</strong> <Code>MM:SS</Code> · <Code>MM:SS.mmm</Code> · <Code>HH:MM:SS</Code> · <Code>HH:MM:SS.mmm</Code> · plain seconds like <Code>5.5</Code>
          </p>
        </AccordionSection>

        {/* 3. Audio Tools */}
        <AccordionSection icon={<IconMusic size={15} />} iconColor="#10b981" title="3. Audio Tools">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <IconMusic size={14} style={{ color: '#10b981' }} />
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Audio Merger</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Upload multiple audio files and stitch them into one seamless output. Order them by dragging or re-ordering in the list. Supports MP3, WAV, M4A, AAC.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Outputs: <Code>MP3</Code> or <Code>WAV</Code></p>
            </div>
            <div className="p-4 rounded-xl space-y-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2">
                <IconMic size={14} style={{ color: '#f59e0b' }} />
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Script Timestamp</h3>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Upload a voiceover audio file. The local Whisper AI transcribes it and generates timestamps. Choose your model (tiny / base / small) for speed vs. accuracy.
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Outputs: <Code>Simple Timestamps</Code> · <Code>Detailed Timestamps</Code> · <Code>Scene Plan</Code> · <Code>SRT Captions</Code> · <Code>SyncFrame CSV</Code>
              </p>
            </div>
          </div>
        </AccordionSection>

        {/* 4. File Naming Tips */}
        <AccordionSection icon={<IconFileText size={15} />} iconColor="#f59e0b" title="4. File Naming Tips">
          <ul className="space-y-3">
            {[
              'Use simple, clean filenames without spaces or special characters.',
              <>ZIP file contents must exactly match your CSV references — <Code>1.jpg</Code> in CSV means <Code>1.jpg</Code> inside the ZIP.</>,
              'Do NOT place files inside subfolders within the ZIP. Keep them at the root level.',
              <>Recommended naming pattern: <Code>1.jpg</Code>, <Code>2.jpg</Code>, <Code>3.jpg</Code> — or <Code>1.mp4</Code>, <Code>2.mp4</Code>.</>,
              'Output filenames are set in the settings panel. Use clean names without date suffixes.',
              'Avoid characters like / \\ : * ? " < > | in filenames.',
            ].map((item, idx) => (
              <li key={idx} className="flex gap-2 items-start text-xs">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded flex items-center justify-center font-bold text-[9px]" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>{idx + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </AccordionSection>

        {/* 5. Export Presets */}
        <AccordionSection icon={<IconDownload size={15} />} iconColor="#06b6d4" title="5. Export Presets">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'TikTok / Shorts', ratio: '9:16', res: '1080p', note: 'Vertical portrait for short-form content' },
              { name: 'YouTube Landscape', ratio: '16:9', res: '1080p', note: 'Standard widescreen for YouTube' },
              { name: 'Instagram Reel', ratio: '9:16', res: '1080p', note: 'Vertical portrait for Instagram' },
              { name: 'Instagram Square', ratio: '1:1', res: '1080p', note: 'Square format for feed posts' },
              { name: 'Fast Test Render', ratio: 'Any', res: '720p', note: 'Fastest export for timing checks' },
              { name: 'High Quality', ratio: 'Any', res: '2K / 4K', note: 'Final deliverables — slower export' },
            ].map(p => (
              <div key={p.name} className="p-3 rounded-xl space-y-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.ratio} · {p.res}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.note}</p>
              </div>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Tip: Use <strong>Fast Test Render (720p)</strong> during development. Only switch to 2K/4K for final exports — they are significantly slower.
          </p>
        </AccordionSection>

        {/* 6. Local Processing */}
        <AccordionSection icon={<IconGlobe size={15} />} iconColor="#94a3b8" title="6. Local Processing">
          <div className="space-y-3">
            <div className="p-4 rounded-xl flex gap-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <span className="text-2xl">🖥️</span>
              <div>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>100% Local — No Cloud Required</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Everything runs on your own machine. No files are uploaded to any server. No internet connection is needed for generating exports.
                </p>
              </div>
            </div>
            <ul className="space-y-2 text-xs">
              <li className="flex gap-2"><span style={{ color: '#6366f1' }}>›</span> The <strong>backend server</strong> must be running before you can generate. Check the green status in the sidebar.</li>
              <li className="flex gap-2">
                <span style={{ color: '#6366f1' }}>›</span> 
                {isWindows 
                  ? <>Start with <Code>start_windows.bat</Code> · Stop with <Code>stop_windows.bat</Code></>
                  : <>Start with <Code>start_app.command</Code> · Stop with <Code>stop_app.command</Code></>}
              </li>
              <li className="flex gap-2"><span style={{ color: '#6366f1' }}>›</span> Generated files are saved to <Code>backend/outputs/</Code> on your machine.</li>
              <li className="flex gap-2"><span style={{ color: '#6366f1' }}>›</span> History, templates, and settings are stored locally in your browser's localStorage.</li>
            </ul>
          </div>
        </AccordionSection>

        {/* 7. Troubleshooting */}
        <AccordionSection icon={<IconAlertTriangle size={15} />} iconColor="#ef4444" title="7. Troubleshooting">
          <div className="space-y-3">
            {[
              {
                problem: 'Backend offline (red status indicator)',
                fix: <>Restart the backend: double-click <Code>{isWindows ? 'start_windows.bat' : 'start_app.command'}</Code>. Then refresh the page.</>,
              },
              {
                problem: 'FFmpeg not found error',
                fix: <>Install FFmpeg: {isWindows ? <>run <Code>install_windows.bat</Code> or install manually</> : <><Code>brew install ffmpeg</Code></>}.</>,
              },
              {
                problem: 'Python or Node.js not found',
                fix: <>Install Python 3.9+ from <strong>python.org</strong> and Node.js 18+ from <strong>nodejs.org</strong>. Then re-run the installer script.</>,
              },
              {
                problem: 'Port already in use',
                fix: isWindows 
                  ? <>Run <Code>stop_windows.bat</Code> to kill existing processes, then start again. Or manually: <Code>netstat -ano | findstr :8000</Code> then <Code>taskkill /PID &lt;PID&gt; /F</Code></>
                  : <>Run <Code>stop_app.command</Code> to kill existing processes, then start again. Or manually: <Code>lsof -i :8000</Code> then <Code>kill &lt;PID&gt;</Code></>,
              },
              {
                problem: 'ZIP extraction fails',
                fix: 'Make sure files are at the root of the ZIP, not inside subfolders. Re-zip by selecting all files and compressing directly.',
              },
              {
                problem: 'Generation takes too long',
                fix: 'Use 720p + Fast Preview for timing checks. Avoid 4K + High Quality + Slow Zoom together — it is the most demanding combination.',
              },
              {
                problem: 'Whisper transcription fails',
                fix: <>Check that <Code>faster-whisper</Code> is installed in the backend venv. Run <Code>pip install faster-whisper</Code> inside the venv.</>,
              },
              {
                problem: 'Runtime errors or crashes',
                fix: <>Check <Code>logs/backend.log</Code> for detailed error output. This file is created automatically and persists across restarts.</>,
              },
            ].map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: 'var(--text-primary)' }}>⚠ {item.problem}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.fix}</p>
              </div>
            ))}
          </div>
        </AccordionSection>

        {/* 8. Best Workflow */}
        <AccordionSection icon={<IconWorkflow size={15} />} iconColor="#10b981" title="8. Recommended Workflow">
          <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Here's a proven end-to-end workflow for creating polished short-form videos:
          </p>
          <div className="space-y-2">
            {[
              { step: 'Step 1 — Script Timestamp', desc: 'Record your voiceover. Upload it to Script Timestamp. Generate a SyncFrame Timeline CSV with timestamps.', color: '#f59e0b', icon: <IconMic size={13} /> },
              { step: 'Step 2 — Image / Video Timeline', desc: 'Prepare your images or video clips named 1.jpg, 2.jpg (or 1.mp4, 2.mp4). Upload them + your audio + the timestamp CSV into Image Timeline or Video Timeline.', color: '#8b5cf6', icon: <IconFilm size={13} /> },
              { step: 'Step 3 — Configure Settings', desc: 'Set Aspect Ratio (9:16 for Shorts/TikTok), Resolution (1080p), transitions, and output filename.', color: '#6366f1', icon: <IconSettings size={13} /> },
              { step: 'Step 4 — Generate', desc: 'Click Generate and wait. The export runs locally. You can monitor progress in the results panel.', color: '#10b981', icon: <IconZap size={13} /> },
              { step: 'Step 5 — Audio Merger (optional)', desc: 'If your voiceover is split into parts, merge them with Audio Merger before uploading to the timeline.', color: '#06b6d4', icon: <IconMusic size={13} /> },
              { step: 'Step 6 — Download + Review History', desc: 'Download your export from the results panel. Check History to track all your exports and re-download if needed.', color: '#94a3b8', icon: <IconHistory size={13} /> },
            ].map((item, idx) => (
              <div key={idx} className="flex gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${item.color}18`, color: item.color }}>
                  {item.icon}
                </div>
                <div>
                  <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{item.step}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </AccordionSection>

      </div>

      {/* Footer note */}
      <div className="text-center py-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          SyncFrame Studio — fully local, no cloud required. Refer to the <strong>README.md</strong> in the project folder for detailed setup instructions.
        </p>
      </div>

    </div>
  )
}
