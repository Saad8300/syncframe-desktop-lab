// frontend/src/components/StudioLayout.tsx
// SyncFrame Studio — Sidebar layout shell with auth-aware user profile widget

import React, { ReactNode, useState, useEffect } from 'react'
import {
  IconZap, IconSun, IconMoon, IconSettings, IconHistory,
  IconDashboard, IconMenu, IconX, IconLayers, IconChevronRight,
  IconFilm, IconGrid, IconMusic, IconFileText,
} from './icons'
import { loadSidebarItems, ALL_SIDEBAR_ITEMS, SidebarItemId } from '../utils/appSettings'
import { useAuth } from '../auth/AuthProvider'
import { PlanBadge } from './billing/PlanBadge'
import { CreditsBadge } from './billing/CreditsBadge'
import { AccessLimitModal } from './billing/AccessLimitModal'
import { usePlan } from '../hooks/usePlan'
import { useCredits } from '../hooks/useCredits'
import { WEBSITE_URLS } from '../lib/websiteLinks'

export type StudioTab = 'tools' | 'batch_video' | 'dashboard' | 'history' | 'templates' | 'settings' | 'help' | string

interface StudioLayoutProps {
  children: ReactNode
  activeTab: StudioTab | string
  onNavigate: (tab: StudioTab) => void
  isDark: boolean
  toggleTheme: () => void
  backendStatus: ReactNode
}

const SIDEBAR_COLLAPSED_KEY = 'studio_sidebar_collapsed'

function getIconForId(id: SidebarItemId, size = 17): ReactNode {
  switch (id) {
    case 'dashboard':            return <IconDashboard size={size} />
    case 'tools':                return <IconZap size={size} />
    case 'history':              return <IconHistory size={size} />
    case 'templates':            return <IconLayers size={size} />
    case 'settings':             return <IconSettings size={size} />
    case 'batch_video':          return <IconFilm size={size} />
    case 'tool:image':           return <IconGrid size={size} />
    case 'tool:video':           return <IconFilm size={size} />
    case 'tool:media':           return <IconGrid size={size} />
    case 'tool:audio_merger':    return <IconMusic size={size} />
    case 'tool:script_timestamp': return <IconFileText size={size} />
    default:                     return <IconZap size={size} />
  }
}

function getLabelForId(id: SidebarItemId): string {
  const item = ALL_SIDEBAR_ITEMS.find(i => i.id === id)
  return item?.label ?? id
}

export default function StudioLayout({ children, activeTab, onNavigate, isDark, toggleTheme, backendStatus }: StudioLayoutProps) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const [sidebarItems, setSidebarItems] = useState<SidebarItemId[]>(() => loadSidebarItems())
  const { user, isAuthenticated, signOut, setAuthModalOpen } = useAuth()
  const { requireAuth } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { plan } = usePlan()
  const { remaining } = useCredits()
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed)) } catch { /* noop */ }
  }, [collapsed])

  // Re-sync sidebar items when settings change (e.g., after Settings page saves)
  useEffect(() => {
    const handleStorage = () => setSidebarItems(loadSidebarItems())
    window.addEventListener('storage', handleStorage)
    window.addEventListener('syncframe-sidebar-changed', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('syncframe-sidebar-changed', handleStorage)
    }
  }, [])

  const handleNav = (tab: StudioTab) => {
    onNavigate(tab)
    setMobileMenuOpen(false)
  }

  const sidebarW = collapsed ? 'md:w-[60px]' : 'md:w-56'

  // ── User avatar helpers ────────────────────────────────────────────────────
  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'
  const userLabel = user?.name || user?.email || ''

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--bg-app)', color: 'var(--text-primary)' }}>

      {/* ── Mobile Header ── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <span className="font-bold text-gradient text-base">SyncFrame Studio</span>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="p-1.5 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-secondary)' }} title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1.5 rounded-lg" style={{ color: 'var(--text-secondary)' }}>
            {mobileMenuOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Backdrop ── */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          flex flex-col shrink-0 border-r md:sticky md:top-0 md:h-screen
          ${sidebarW}
          transition-all duration-200
          ${mobileMenuOpen
            ? 'fixed inset-y-0 left-0 z-50 shadow-2xl w-56 flex'
            : 'hidden md:flex'}
        `}
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
      >
        {/* Brand header */}
        <div className={`flex items-center gap-2 px-4 py-4 border-b ${collapsed ? 'justify-center' : ''}`} style={{ borderColor: 'var(--border-subtle)' }}>
          {!collapsed && (
            <span className="font-bold text-gradient text-base leading-tight truncate flex-1">
              SyncFrame<br />Studio
            </span>
          )}
          {/* Collapse toggle — desktop only */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex p-1 rounded-lg transition-colors hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
            style={{ color: 'var(--text-muted)' }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span style={{ display: 'inline-block', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              <IconChevronRight size={15} />
            </span>
          </button>
        </div>

        {/* Backend status — only when expanded */}
        {!collapsed && (
          <div className="px-3 pt-2 pb-1">
            {backendStatus}
          </div>
        )}

        {/* Navigation */}
        <nav className={`flex-1 py-3 space-y-0.5 overflow-y-auto ${collapsed ? 'px-2' : 'px-2'}`}>
          {sidebarItems.map(itemId => {
            const isActive = (() => {
              if (activeTab === itemId) return true
              if (itemId === 'tools' && typeof activeTab === 'string' && activeTab.startsWith('tool:') && !sidebarItems.some(si => si === activeTab)) return true
              if (itemId === 'batch_video' && activeTab === 'batch_video') return true
              return false
            })()

            const label = getLabelForId(itemId)

            return (
              <button
                key={itemId}
                onClick={() => handleNav(itemId as StudioTab)}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center rounded-xl transition-all duration-150 font-medium text-[13px] ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2.5'}`}
                style={{
                  background: isActive ? 'var(--accent-subtle)' : 'transparent',
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderLeft: isActive && !collapsed ? '2px solid var(--accent-primary)' : '2px solid transparent',
                }}
              >
                <span className="shrink-0">{getIconForId(itemId)}</span>
                {!collapsed && <span className="truncate">{label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Mobile backend status */}
        <div className="md:hidden px-3 pb-2">
          {backendStatus}
        </div>

        {/* ── User Profile / Login Widget ── */}
        {isAuthenticated && user ? (
          <div className={`relative border-t px-3 py-3 ${collapsed ? 'flex justify-center' : ''}`} style={{ borderColor: 'var(--border-subtle)' }}>
            
            {/* The clickable card */}
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className={`flex items-center gap-2 w-full text-left rounded-xl transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 ${collapsed ? 'justify-center p-1' : 'p-1.5'}`}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg,#06b6d4,#6366f1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff',
                overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}>
                {user.avatarUrl
                  ? <img src={user.avatarUrl} alt={userInitial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : userInitial
                }
              </div>

              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-bold text-[var(--text-primary)] truncate">{userLabel}</div>
                  <div className="text-[10px] text-[var(--text-muted)] truncate">{plan?.display_name || 'Free Trial'}</div>
                </div>
              )}
            </button>

            {/* The Dropdown Panel */}
            {profileDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setProfileDropdownOpen(false)} />
                <div 
                  className="absolute bottom-[110%] left-2 right-2 md:left-4 md:right-auto md:w-64 rounded-2xl z-[70] shadow-2xl animate-fade-in origin-bottom-left"
                  style={{ 
                    background: 'var(--bg-card)', 
                    border: '1px solid var(--border-default)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)'
                  }}
                >
                  <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg,#06b6d4,#6366f1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 700, color: '#fff',
                        boxShadow: '0 4px 10px rgba(99,102,241,0.3)'
                      }}>
                        {user.avatarUrl ? <img src={user.avatarUrl} alt={userInitial} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : userInitial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-[var(--text-primary)] truncate">{user.name || userLabel}</div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email || 'No email provided'}</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                        <PlanBadge />
                        <a href={WEBSITE_URLS.ACCOUNT} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase font-bold text-[var(--accent-primary)] hover:text-white transition-colors">Manage</a>
                      </div>
                      <div className="bg-black/5 dark:bg-white/5 p-2 rounded-lg flex items-center justify-center">
                        <CreditsBadge />
                      </div>
                    </div>
                  </div>

                  <div className="p-2 flex flex-col">
                    <button 
                      onClick={() => { signOut(); setProfileDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-[12px] font-medium text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            className={`border-t px-4 py-3 flex ${collapsed ? 'justify-center' : 'justify-start'}`}
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-2 text-sm font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              {!collapsed && <span>Login</span>}
            </button>
          </div>
        )}

        {/* Footer: compact theme toggle */}
        <div className={`border-t p-3 ${collapsed ? 'flex justify-center' : 'flex items-center gap-2'}`} style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={toggleTheme}
            className={`flex items-center justify-center rounded-xl transition-colors hover:bg-black/10 dark:hover:bg-white/10 ${collapsed ? 'w-10 h-10' : 'w-10 h-10'}`}
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          {!collapsed && (
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto min-h-screen">
        <div className="w-full h-full">
          {children}
        </div>
      </div>



    </div>
  )
}
