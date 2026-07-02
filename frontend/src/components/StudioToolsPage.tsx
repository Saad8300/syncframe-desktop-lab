import React, { useState } from 'react'
import {
  IconLayers,
  IconFilm,
  IconGrid,
  IconMusic,
  IconArrowRight,
  IconZap,
} from './icons'
import StudioPageHeader from './StudioPageHeader'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { canUseTool } from '../lib/plans'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { PlanBadge } from './billing/PlanBadge'

// ── Inline icons ────────────────────────────────────────────────────────────

function IconMic({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  )
}

function IconCpu({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
      <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
    </svg>
  )
}

function IconBook({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
}

function IconImage({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

function IconBriefcase({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )
}

function IconLock({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ViewMode = 'home' | 'image' | 'video' | 'media' | 'audio_merger' | 'script_timestamp' | 'batch_video'

interface Props {
  onSelectTool: (tool: ViewMode) => void
}

// ── Active tools ─────────────────────────────────────────────────────────────

const ACTIVE_TOOLS: {
  id: ViewMode
  icon: React.ReactNode
  title: string
  desc: string
  accentColor: string
}[] = [
  {
    id: 'image',
    icon: <IconLayers size={22} />,
    title: 'Image Timeline',
    desc: 'Create videos from images, audio, and timestamp CSV files.',
    accentColor: '#0ea5e9',
  },
  {
    id: 'video',
    icon: <IconFilm size={22} />,
    title: 'Video Timeline',
    desc: 'Build videos from reusable clips, main audio, and timeline CSV.',
    accentColor: '#8b5cf6',
  },
  {
    id: 'media',
    icon: <IconGrid size={22} />,
    title: 'Media Timeline',
    desc: 'Mix images, videos, and text rows using one timeline CSV.',
    accentColor: '#3b82f6',
  },
  {
    id: 'audio_merger',
    icon: <IconMusic size={22} />,
    title: 'Audio Merger',
    desc: 'Combine multiple audio files into one clean track.',
    accentColor: '#10b981',
  },
  {
    id: 'script_timestamp',
    icon: <IconMic size={22} />,
    title: 'Script Timestamp',
    desc: 'Transcribe voice audio and generate timestamped scripts.',
    accentColor: '#f59e0b',
  },
  {
    id: 'batch_video',
    icon: <IconFilm size={22} />,
    title: 'Batch Video Generator',
    desc: 'Queue multiple video export jobs and run them one by one.',
    accentColor: '#4ade80',
  },
]

// ── Upcoming tools ───────────────────────────────────────────────────────────

const UPCOMING_TOOLS: {
  icon: React.ReactNode
  title: string
  desc: string
  accentColor: string
}[] = [
  { icon: <IconMic size={20} />,       title: 'Voice Generator',       desc: 'Generate natural-sounding voiceovers from text scripts.',            accentColor: '#a78bfa' },
  { icon: <IconBook size={20} />,      title: 'Voice Library',         desc: 'Browse and preview a local library of voice models.',                accentColor: '#c084fc' },
  { icon: <IconCpu size={20} />,       title: 'Voice Cloning',         desc: 'Clone your own voice for custom voiceover generation.',              accentColor: '#e879f9' },
  { icon: <IconBriefcase size={20} />, title: 'Brand Kit',             desc: 'Save your logo, colors, and fonts for consistent video branding.',   accentColor: '#fbbf24' },
  { icon: <IconFilm size={20} />,      title: 'AI Video Repurposer',   desc: 'Turn long-form content into multiple short-form video exports.',     accentColor: '#ec4899' },
  { icon: <IconZap size={20} />,       title: 'Smart Auto Editor',     desc: 'Auto-cut, sync, and polish timeline videos with intelligent editing presets.', accentColor: '#f43f5e' },
  { icon: <IconLayers size={20} />,    title: 'Caption Style Studio',  desc: 'Design advanced caption styles, fonts, colors, and animated text presets.', accentColor: '#8b5cf6' },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StudioToolsPage({ onSelectTool }: Props) {
  const { plan, loading: planLoading } = usePlan()
  const { remaining } = useCredits()

  // Access Limit Modal state
  const [limitModalOpen, setLimitModalOpen] = useState(false)
  const [limitModalReason, setLimitModalReason] = useState('')
  const [limitModalRequiredPlan, setLimitModalRequiredPlan] = useState<string | undefined>(undefined)

  const handleSelectTool = (toolId: ViewMode) => {
    const access = canUseTool(plan, remaining, toolId, { is_batch: toolId === 'batch_video' }, 0, planLoading)
    if (!access.allowed) {
      setLimitModalReason(access.reason)
      setLimitModalRequiredPlan(access.requiredPlan)
      setLimitModalOpen(true)
      return
    }
    onSelectTool(toolId)
  }

  return (
    <div className="w-full px-5 sm:px-8 py-8 space-y-10 animate-fade-in" style={{ maxWidth: 1280 }}>

      <StudioPageHeader
        icon={<IconZap size={18} />}
        title="Tools"
        subtitle="Select a tool below to open it."
      />

      {/* ── Active Tools ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Active Tools</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {ACTIVE_TOOLS.map(tool => {
            const access = canUseTool(plan, remaining, tool.id, { is_batch: tool.id === 'batch_video' }, 0, planLoading)
            const isCheckingPlan = !access.allowed && access.reason === 'Checking plan...'
            return (
              <ActiveToolCard
                key={tool.id}
                tool={tool}
                onClick={() => handleSelectTool(tool.id)}
                isLocked={!access.allowed && !isCheckingPlan}
                isCheckingPlan={isCheckingPlan}
                requiredPlan={access.requiredPlan}
              />
            )
          })}
        </div>
      </section>

      {/* ── Upcoming Release ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Upcoming Release</span>
          <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {UPCOMING_TOOLS.map(tool => (
            <UpcomingToolCard key={tool.title} tool={tool} />
          ))}
        </div>
      </section>

    {/* ── Access Limit Modal ── */}
    <AccessLimitModal
      isOpen={limitModalOpen}
      onClose={() => setLimitModalOpen(false)}
      reason={limitModalReason}
      requiredPlan={limitModalRequiredPlan}
      currentPlan={plan?.display_name || 'Free Trial'}
      currentCredits={remaining}
    />

    </div>
  )
}

// ── Active Tool Card ─────────────────────────────────────────────────────────

function ActiveToolCard({
  tool,
  onClick,
  isLocked,
  isCheckingPlan,
  requiredPlan
}: {
  tool: typeof ACTIVE_TOOLS[number]
  onClick: () => void
  isLocked: boolean
  isCheckingPlan?: boolean
  requiredPlan?: string
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex flex-col gap-4 text-left rounded-2xl p-5 transition-all duration-200"
      style={{
        cursor: 'pointer',
        outline: 'none',
        background: hovered
          ? `linear-gradient(145deg, ${tool.accentColor}18, var(--bg-card-hover))`
          : 'var(--bg-card)',
        border: hovered
          ? `1px solid ${tool.accentColor}55`
          : '1px solid var(--border-default)',
        boxShadow: hovered
          ? `0 8px 32px ${tool.accentColor}25, 0 2px 8px rgba(0,0,0,0.2)`
          : 'var(--shadow-card)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      <div className="flex items-start justify-between w-full">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200"
          style={{
            background: isLocked ? 'rgba(255,255,255,0.05)' : `${tool.accentColor}18`,
            border: isLocked ? '1px solid var(--border-subtle)' : `1px solid ${tool.accentColor}35`,
            color: isLocked ? 'var(--text-muted)' : tool.accentColor,
            transform: hovered && !isLocked ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          {isCheckingPlan ? <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }} /> : isLocked ? <IconLock size={18} /> : tool.icon}
        </div>
        {requiredPlan && (
          <PlanBadge planId={requiredPlan.toLowerCase()} size="sm" />
        )}
      </div>

      <div className={`flex-1 space-y-1 ${isLocked ? 'opacity-60' : ''}`}>
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          {tool.title}
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {tool.desc}
        </p>
      </div>

      <div
        className="flex items-center gap-1.5 text-xs font-semibold transition-all duration-200"
        style={{ color: hovered && !isCheckingPlan ? tool.accentColor : 'var(--text-muted)' }}
      >
        {isCheckingPlan ? 'Checking plan...' : (
          <>
            Open tool <IconArrowRight size={12} />
          </>
        )}
      </div>
    </button>
  )
}

// ── Upcoming Tool Card ───────────────────────────────────────────────────────

function UpcomingToolCard({
  tool,
}: {
  tool: typeof UPCOMING_TOOLS[number]
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5 select-none"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        opacity: 0.7,
        cursor: 'default',
      }}
    >
      <div className="flex items-start justify-between w-full">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: `${tool.accentColor}12`,
            border: `1px dashed ${tool.accentColor}40`,
            color: `${tool.accentColor}90`,
          }}
        >
          {tool.icon}
        </div>
      </div>

      <div className="flex-1 space-y-1">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
          {tool.title}
        </h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {tool.desc}
        </p>
      </div>
    </div>
  )
}
