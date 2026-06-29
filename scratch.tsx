// Imports block:
import React, { useState, useEffect, useCallback } from 'react'
import FileDropZone from './components/FileDropZone'
import CsvGuide from './components/CsvGuide'
import ResultsPanel from './components/ResultsPanel'
import ProgressOverlay from './components/ProgressOverlay'
import AppModeSwitcher, { type AppMode } from './components/AppModeSwitcher'
import VideoTimelinePage from './components/VideoTimelinePage'
import MediaTimelinePage from './components/MediaTimelinePage'
import {
  IconMusic,
  IconImage,
  IconFileText,
  IconLoader,
  IconSun,
  IconMoon,
  IconZap,
  IconSparkles,
  IconVideo,
} from './components/icons'
import type { GenerateSettings, GenerateResponse, GenerateStatus, JobStatus } from './types'
import { checkHealth, startJob } from './utils/api'

// We need Sel
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
