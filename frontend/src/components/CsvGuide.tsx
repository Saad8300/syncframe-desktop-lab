// components/CsvGuide.tsx – Compact CSV template reference card

import React from 'react'
import { IconDownload } from './icons'

const TEMPLATE_CONTENT = `image,start,end,text
1.png,0,3,"Opening image"
2.png,3,6.5,"Decimal seconds"
3.png,00:06.5,00:10,"Timestamp format"
4.png,10s,+5,"Relative end"
5.png,,+4,"Auto continues after previous row"
6.png,1m20s,1m25s,"Minute format"`

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
          { col: 'start', desc: 'Row start time', req: true, help: 'Supports seconds, decimals, mm:ss, hh:mm:ss, 90s, 1m30s.\nBlank start can continue from previous row when end uses +duration.' },
          { col: 'end',   desc: 'Row end time', req: true, help: 'Supports absolute time or relative +duration.\nExamples: 5, 00:05, 1:20, 90s, +5, +1m30s.' },
          { col: 'text',  desc: 'Overlay text or text-only screen', req: false },
        ].map(({ col, desc, req, help }) => (
          <div key={col} className="flex flex-col gap-1 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
            <div className="flex items-center gap-2">
              <code className="text-[11px] px-2 py-0.5 rounded font-mono font-semibold" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--accent-primary)' }}>{col}</code>
              <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{desc}</span>
              {req ? (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>REQ</span>
              ) : (
                <span className="text-[9px] font-medium italic ml-auto" style={{ color: 'var(--text-muted)' }}>optional</span>
              )}
            </div>
            {help && <p className="text-[10px] text-[var(--text-muted)] whitespace-pre-line ml-1">{help}</p>}
          </div>
        ))}
      </div>

      <div className="pt-2">
        <div className="p-2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)]">
          <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Supported time formats:</p>
          <ul className="list-disc pl-4 space-y-0.5 text-[9px] text-[var(--text-muted)]">
            <li>5, 5.5, 00:05, 1:20, 00:01:20, 90s, 1m30s</li>
            <li>+5, +1m30s (Use + in the end column to add from start. Example: start 00:10, end +5 means 10s to 15s)</li>
          </ul>
        </div>
      </div>
      
      <div className="pt-2">
        <pre className="text-[10px] leading-relaxed font-mono rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
{`image,start,end,text
1.png,0,3,"Opening image"
2.png,3,6.5,"Decimal seconds"
3.png,00:06.5,00:10,"Timestamp format"
4.png,10s,+5,"Relative end"
5.png,,+4,"Auto continues after previous row"
6.png,1m20s,1m25s,"Minute format"`}
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
