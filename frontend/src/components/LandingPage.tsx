import React from 'react'
import {
  IconVideo,
  IconImage,
  IconMusic,
  IconFileText,
  IconSparkles,
  IconZap
} from './icons'

interface LandingPageProps {
  onEnterStudio: () => void
  onViewTools: () => void
}

export default function LandingPage({ onEnterStudio, onViewTools }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--bg-default)', color: 'var(--text-primary)' }}>
      {/* Background ambient gradient pattern */}
      <div className="absolute top-0 left-0 right-0 h-[500px] opacity-20 pointer-events-none"
           style={{
             background: 'radial-gradient(circle at 50% 0%, var(--accent-primary) 0%, transparent 70%)',
             filter: 'blur(60px)'
           }}
      />
      
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20 relative z-10">
        
        {/* Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8 max-w-2xl animate-fade-in-up">
          {['Local Processing', 'Timeline Tools', 'Audio Tools', 'Script Timestamp', 'No Cloud Upload'].map(chip => (
            <span key={chip} className="px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest uppercase transition-colors"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
              {chip}
            </span>
          ))}
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <span className="text-gradient">SyncFrame Studio</span>
        </h1>
        
        <p className="text-lg md:text-xl font-medium mb-12 max-w-2xl animate-fade-in-up" style={{ color: 'var(--text-secondary)', animationDelay: '200ms' }}>
          Create videos, timestamps, audio tools, and media timelines locally.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-xs mx-auto justify-center animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <button
            onClick={onEnterStudio}
            className="w-full px-8 py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'var(--accent-gradient)',
              color: '#fff',
              boxShadow: '0 8px 24px var(--accent-glow)'
            }}
          >
            Studio <IconZap size={16} />
          </button>
          
          <button
            onClick={onViewTools}
            className="w-full px-8 py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)'
            }}
          >
            Tools
          </button>
        </div>

        {/* Feature Cards Showcase */}
        <div className="mt-24 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 w-full max-w-6xl mx-auto animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          {[
            { title: 'Image Timeline', icon: <IconImage size={24} className="text-sky-500" /> },
            { title: 'Video Timeline', icon: <IconVideo size={24} className="text-purple-500" /> },
            { title: 'Media Timeline', icon: <IconSparkles size={24} className="text-blue-500" /> },
            { title: 'Audio Merger', icon: <IconMusic size={24} className="text-emerald-500" /> },
            { title: 'Script Timestamp', icon: <IconFileText size={24} className="text-amber-500" /> },
          ].map(feat => (
            <div key={feat.title} className="card p-6 flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-all duration-300" style={{ boxShadow: '0 10px 30px -10px rgba(0,0,0,0.1)' }}>
              <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--bg-input)' }}>
                {feat.icon}
              </div>
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{feat.title}</span>
            </div>
          ))}
        </div>
        
      </main>
    </div>
  )
}
