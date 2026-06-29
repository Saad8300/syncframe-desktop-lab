// components/CsvGuide.tsx – Compact CSV template reference card

import React from 'react'
import { IconDownload } from './icons'

const TEMPLATE_CONTENT = `image,start,end,text
1.jpg,0,3,"Opening line"
2.jpg,3,6,"Next line"`

export default function CsvGuide() {
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'timestamps_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>CSV Format Guide</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Timestamp file reference</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { col: 'image', desc: 'Filename inside ZIP', req: true },
          { col: 'start', desc: 'Clip start time (sec)', req: true },
          { col: 'end',   desc: 'Clip end time (sec)', req: true },
          { col: 'text',  desc: 'Overlay or text-only screen', req: false },
        ].map(({ col, desc, req }) => (
          <div key={col} className="flex items-center gap-2">
            <code className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)' }}>{col}</code>
            <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{desc}</span>
            {req ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>REQ</span>
            ) : (
              <span className="text-[9px] font-medium italic ml-auto" style={{ color: 'var(--text-muted)' }}>optional</span>
            )}
          </div>
        ))}
      </div>
      
      <div className="pt-2">
        <pre className="text-[10px] leading-relaxed font-mono rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
{`image,start,end,text
1.jpg,0,3,"Opening line"
2.jpg,3,6,"Next line"`}
        </pre>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={downloadTemplate}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        >
          <IconDownload size={14} /> Template
        </button>
      </div>
    </div>
  )
}
