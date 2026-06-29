// components/AppModeSwitcher.tsx — Premium segmented mode switcher

import React from 'react'
import { IconLayers, IconFilm, IconGrid } from './icons'

export type AppMode = 'image' | 'video' | 'media'

interface ModeDef {
  id: AppMode
  label: string
  subtitle: string
  icon: React.ReactNode
}

const MODES: ModeDef[] = [
  {
    id: 'image',
    label: 'Image Timeline',
    subtitle: 'Images + audio + timestamp CSV',
    icon: <IconLayers size={16} />,
  },
  {
    id: 'video',
    label: 'Video Timeline',
    subtitle: 'Video clips + audio + timeline CSV',
    icon: <IconFilm size={16} />,
  },
  {
    id: 'media',
    label: 'Media Timeline',
    subtitle: 'Images, videos & text in one CSV',
    icon: <IconGrid size={16} />,
  },
]

interface Props {
  activeMode: AppMode
  onChange: (mode: AppMode) => void
}

export default function AppModeSwitcher({ activeMode, onChange }: Props) {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-card)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div
          className="flex items-stretch gap-1 py-2"
          role="tablist"
          aria-label="App mode"
        >
          {MODES.map((mode) => {
            const active = mode.id === activeMode
            return (
              <button
                key={mode.id}
                id={`mode-tab-${mode.id}`}
                role="tab"
                aria-selected={active}
                onClick={() => onChange(mode.id)}
                className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl cursor-pointer
                           transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                style={{
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  border: active
                    ? '1px solid var(--accent-border)'
                    : '1px solid transparent',
                  color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  boxShadow: active ? '0 0 0 2px var(--accent-glow)' : 'none',
                  transform: 'translateZ(0)',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'var(--bg-card-hover)'
                    e.currentTarget.style.borderColor = 'var(--border-default)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.color = 'var(--text-muted)'
                  }
                }}
              >
                {/* Icon */}
                <span
                  className="shrink-0 transition-colors"
                  style={{
                    color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                  }}
                >
                  {mode.icon}
                </span>

                {/* Labels */}
                <span className="text-left min-w-0">
                  <span
                    className="text-[12px] font-semibold leading-tight block"
                    style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {mode.label}
                  </span>
                  <span
                    className="text-[10px] leading-tight hidden sm:block mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {mode.subtitle}
                  </span>
                </span>

                {/* Active indicator dot */}
                {active && (
                  <span
                    className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--accent-primary)' }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
