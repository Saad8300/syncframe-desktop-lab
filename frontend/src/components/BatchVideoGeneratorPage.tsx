import React, { useState, useEffect } from 'react'
import StudioPageHeader from './StudioPageHeader'
import {
  IconFilm, IconPlay, IconPause, IconSquare, IconTrash,
  IconLoader, IconCopy, IconSearch, IconFilter, IconArrowUp, IconArrowDown,
  IconCheck, IconX, IconRefreshCw
} from './icons'
import {
  getBatchJobs, getBatchStats, deleteBatchJob,
  clearCompletedBatchJobs, clearFailedBatchJobs, clearCancelledBatchJobs, clearAllBatchJobs,
  moveBatchJobUp, moveBatchJobDown, duplicateBatchJob,
  getBatchState, startBatchQueue,
  pauseBatchAfterCurrent, stopBatchQueue, retryFailedBatchJobs,
  retryBatchJob, BatchState
} from '../utils/api'
import { notifyBatchQueueCompleted, notifyBatchJobFailed } from '../utils/notifications'

export default function BatchVideoGeneratorPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [stats, setStats] = useState<any>({
    total: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [batchState, setBatchState] = useState<BatchState | null>(null)
  const [isQueueLoading, setIsQueueLoading] = useState(false)
  
  const [prevIsRunning, setPrevIsRunning] = useState<boolean | null>(null)
  const [prevFailedCount, setPrevFailedCount] = useState<number | null>(null)

  useEffect(() => {
    if (prevIsRunning === true && batchState?.is_running === false && stats?.queued === 0) {
      notifyBatchQueueCompleted(stats.completed, stats.failed)
    }
    
    if (prevFailedCount !== null && stats.failed > prevFailedCount) {
      notifyBatchJobFailed("A job in the batch queue failed.")
    }

    if (batchState) setPrevIsRunning(batchState.is_running)
    if (stats) setPrevFailedCount(stats.failed)
  }, [batchState?.is_running, stats?.failed])
  
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterTool, setFilterTool] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  
  const [confirmAction, setConfirmAction] = useState<{title: string, msg: string, action: () => void} | null>(null)

  const loadData = async () => {
    try {
      const [j, s, st] = await Promise.all([getBatchJobs(), getBatchStats(), getBatchState()])
      setJobs(j)
      setStats(s)
      setBatchState(st)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    const interval = setInterval(() => {
      loadData()
    }, batchState?.is_running ? 2000 : 8000)
    return () => clearInterval(interval)
  }, [batchState?.is_running])

  const requireConfirm = (title: string, msg: string, action: () => void) => {
    setConfirmAction({ title, msg, action })
  }

  const handleDelete = async (id: string) => {
    if (batchState?.current_job_id === id) {
      alert("Cannot delete a running job. Stop the queue after current job first.")
      return
    }
    requireConfirm(
      "Delete Job",
      "Are you sure you want to remove this job from the queue?",
      async () => {
        try { await deleteBatchJob(id); loadData(); if(selectedJob?.id===id) setSelectedJob(null) } 
        catch (err) { alert("Failed to delete job: " + err) }
      }
    )
  }

  const handleClearCompleted = () => requireConfirm(
    "Clear Completed", "Remove all completed jobs from the queue?", 
    async () => { try { await clearCompletedBatchJobs(); loadData() } catch(err){ alert(err) } }
  )

  const handleClearFailed = () => requireConfirm(
    "Clear Failed", "Remove all failed jobs from the queue?", 
    async () => { try { await clearFailedBatchJobs(); loadData() } catch(err){ alert(err) } }
  )

  const handleClearAll = () => requireConfirm(
    "Clear All Jobs", "This will permanently remove all jobs (except running ones). History logs are preserved.", 
    async () => { try { await clearAllBatchJobs(); loadData() } catch(err){ alert(err) } }
  )

  const handleMoveUp = async (id: string) => { try { await moveBatchJobUp(id); loadData() } catch (err) {} }
  const handleMoveDown = async (id: string) => { try { await moveBatchJobDown(id); loadData() } catch (err) {} }
  const handleDuplicate = async (id: string) => { try { await duplicateBatchJob(id); loadData() } catch (err) { alert("Duplicate failed: " + err) } }

  const handleStartQueue = async () => {
    setIsQueueLoading(true)
    try { await startBatchQueue(); await loadData() } catch (e) { alert("Start failed: " + e) } 
    finally { setIsQueueLoading(false) }
  }

  const handlePauseQueue = async () => {
    setIsQueueLoading(true)
    try { await pauseBatchAfterCurrent(); await loadData() } catch (e) { alert("Pause failed: " + e) } 
    finally { setIsQueueLoading(false) }
  }

  const handleStopQueue = async () => {
    setIsQueueLoading(true)
    try { await stopBatchQueue(); await loadData() } catch (e) { alert("Stop failed: " + e) } 
    finally { setIsQueueLoading(false) }
  }

  const handleRetryFailed = async () => {
    setIsQueueLoading(true)
    try { await retryFailedBatchJobs(); await loadData() } catch (e) { alert("Retry failed: " + e) } 
    finally { setIsQueueLoading(false) }
  }

  const handleRetrySingle = async (id: string) => {
    try { await retryBatchJob(id); await loadData() } catch (e) { alert("Retry failed: " + e) }
  }

  const filteredJobs = jobs.filter(job => {
    if (filterStatus !== 'all' && job.status !== filterStatus) return false
    if (filterTool !== 'all' && job.source_tool !== filterTool) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!job.title?.toLowerCase().includes(q) && !job.output_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[500px]">
        <IconLoader size={36} className="animate-spin mb-4" style={{ color: 'var(--color-accent)' }} />
        <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Loading Queue...</h3>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-8 pb-12">
        <StudioPageHeader icon={<IconFilm size={16} />} title="Batch Video Generator" />
        <div className="mt-8 p-6 rounded-2xl border" style={{ background: 'var(--color-error-bg)', borderColor: 'var(--color-error-border)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-error)' }}>Failed to connect to backend</h3>
          <p className="text-xs mt-2 opacity-80" style={{ color: 'var(--color-error)' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 pt-8 pb-12 relative min-h-screen flex flex-col">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <StudioPageHeader 
            icon={<IconFilm size={18} />} 
            title="Batch Video Generator" 
          />
          <p className="mt-2 text-sm max-w-xl" style={{ color: 'var(--text-muted)' }}>
            Manage queued video exports and render them one by one automatically. 
            Add jobs from the Image, Video, or Media Timelines.
          </p>
        </div>
        {batchState && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shrink-0 shadow-sm transition-all"
               style={{ 
                 background: batchState.is_running ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-input)',
                 color: batchState.is_running ? '#a855f7' : 'var(--text-primary)',
                 border: `1px solid ${batchState.is_running ? 'rgba(168, 85, 247, 0.3)' : 'var(--border-default)'}`
               }}>
            {batchState.is_running ? (
              <><IconLoader size={14} className="animate-spin" /> {batchState.stopping ? "Stopping..." : batchState.paused_after_current ? "Pausing after current..." : "Queue is Active"}</>
            ) : (
              <><IconPause size={14} /> Queue Idle</>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6 flex-1 flex flex-col">
        {/* ── STATS DASHBOARD ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Jobs" value={stats.total} color="var(--text-primary)" icon={<IconFilm size={18}/>} />
          <StatCard title="Queued" value={stats.queued} color="#3b82f6" icon={<IconLoader size={18}/>} />
          <StatCard title="Running" value={stats.running} color="#a855f7" icon={<IconPlay size={18}/>} pulse={stats.running > 0} />
          <StatCard title="Completed" value={stats.completed} color="#10b981" icon={<IconCheck size={18}/>} />
          <StatCard title="Failed" value={stats.failed} color="#ef4444" icon={<IconX size={18}/>} />
        </div>

        {/* ── QUEUE CONTROLS ── */}
        <div className="card p-4 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {/* Primary Actions */}
            <button 
              onClick={handleStartQueue}
              disabled={isQueueLoading || stats.queued === 0 || (batchState?.is_running && !batchState.stopping)} 
              className={`btn-control btn-accent ${(!batchState?.is_running && stats.queued > 0) ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
              <IconPlay size={16} /> Start Queue
            </button>
            <button 
              onClick={handlePauseQueue}
              disabled={isQueueLoading || !batchState?.is_running || batchState.paused_after_current || batchState.stopping} 
              className={`btn-control ${batchState?.is_running && !batchState.paused_after_current && !batchState.stopping ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
              <IconPause size={16} /> Pause Current
            </button>
            <button 
              onClick={handleStopQueue}
              disabled={isQueueLoading || !batchState?.is_running || batchState.stopping} 
              className={`btn-control ${batchState?.is_running && !batchState.stopping ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
              <IconSquare size={16} /> Stop
            </button>
            
            <div className="w-px h-6 mx-2" style={{ background: 'var(--border-subtle)' }} />
            
            {/* Recovery */}
            <button 
              onClick={handleRetryFailed}
              disabled={isQueueLoading || stats.failed === 0} 
              className={`btn-control ${stats.failed > 0 ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
              <IconRefreshCw size={14} /> Retry Failed
            </button>
          </div>

          {/* Cleanup Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <button 
              onClick={handleClearCompleted}
              disabled={stats.completed === 0}
              className={`btn-destructive ${stats.completed > 0 ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
               Clear Completed
            </button>
            <button 
              onClick={handleClearFailed}
              disabled={stats.failed === 0}
              className={`btn-destructive ${stats.failed > 0 ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
               Clear Failed
            </button>
            <button 
              onClick={handleClearAll}
              disabled={jobs.length === 0}
              className={`btn-destructive ${jobs.length > 0 ? '' : 'opacity-50 cursor-not-allowed'}`}
            >
               Clear All
            </button>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col lg:flex-row gap-6 relative items-start">
          
          <div className="flex-1 flex flex-col w-full">
            {/* ── FILTERS ── */}
            {jobs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
                <div className="flex-1 relative w-full sm:w-auto max-w-sm">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">
                    <IconSearch size={16} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search outputs..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="form-input pl-10 w-full"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select className="form-select text-sm py-2" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Statuses</option>
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="form-select text-sm py-2" value={filterTool} onChange={e => setFilterTool(e.target.value)}>
                    <option value="all">All Sources</option>
                    <option value="image_timeline">Image Timeline</option>
                    <option value="video_timeline">Video Timeline</option>
                    <option value="media_timeline">Media Timeline</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── JOB LIST / EMPTY STATE ── */}
            {jobs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center rounded-2xl" style={{ border: '1px dashed var(--border-default)', background: 'var(--bg-elevated)' }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ background: 'var(--bg-input)' }}>
                  <IconFilm size={32} style={{ color: 'var(--text-muted)' }} />
                </div>
                <h3 className="text-xl font-black mb-3" style={{ color: 'var(--text-primary)' }}>Queue is Empty</h3>
                <p className="text-sm max-w-md mx-auto mb-8" style={{ color: 'var(--text-muted)' }}>
                  Your batch queue is currently empty. Head over to any Timeline tool and choose "Add to Batch Queue" to queue up jobs for automated rendering.
                </p>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  <span>1. Configure</span>
                  <IconArrowDown size={14} className="-rotate-90" />
                  <span>2. Queue</span>
                  <IconArrowDown size={14} className="-rotate-90" />
                  <span>3. Render All</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.length === 0 && (
                  <div className="text-center py-12 text-sm font-semibold opacity-50" style={{ color: 'var(--text-muted)' }}>No jobs match your current filters.</div>
                )}
                {filteredJobs.map(job => (
                  <JobRow 
                    key={job.id} 
                    job={job} 
                    isSelected={selectedJob?.id === job.id}
                    onSelect={() => setSelectedJob(job)}
                    onMoveUp={() => handleMoveUp(job.id)}
                    onMoveDown={() => handleMoveDown(job.id)}
                    onDuplicate={() => handleDuplicate(job.id)}
                    onRetry={() => handleRetrySingle(job.id)}
                    onDelete={() => handleDelete(job.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── INSPECTOR PANEL ── */}
          {selectedJob && (
            <div className="w-full lg:w-[400px] shrink-0 sticky top-6 card overflow-hidden flex flex-col border border-indigo-500/20 shadow-2xl transition-all duration-300">
              <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                <div>
                  <h3 className="text-sm font-black tracking-wide" style={{ color: 'var(--text-primary)' }}>Inspector</h3>
                  <div className="text-[10px] uppercase font-bold mt-0.5" style={{ color: 'var(--text-muted)' }}>{selectedJob.id}</div>
                </div>
                <button 
                  onClick={() => setSelectedJob(null)}
                  className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <IconX size={16} />
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto space-y-6 max-h-[70vh]">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                  <InspectorField label="Status" value={<span style={{ color: getStatusColor(selectedJob.status) }}>{selectedJob.status}</span>} />
                  <InspectorField label="Tool Source" value={selectedJob.source_tool_label} />
                  <InspectorField label="Created" value={new Date(selectedJob.created_at).toLocaleString()} />
                  <InspectorField label="Output Name" value={selectedJob.output_name} />
                  <InspectorField label="Preset" value={selectedJob.export_preset || selectedJob.config?.export_resolution || 'Unknown'} />
                  <InspectorField label="Aspect" value={selectedJob.aspect_ratio || selectedJob.config?.aspect_ratio || 'Unknown'} />
                </div>

                {selectedJob.error && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-error)' }}>Error Details</div>
                    <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
                      {selectedJob.error}
                    </div>
                    {(selectedJob.status === 'failed' || selectedJob.status === 'cancelled') && (
                      <button 
                        onClick={() => handleRetrySingle(selectedJob.id)}
                        className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
                        style={{ background: 'var(--color-accent)' }}
                      >
                        Retry This Job
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Assets Map</div>
                  <div className="bg-[#1e1e1e] p-3 rounded-lg text-[10px] font-mono text-gray-300 overflow-x-auto shadow-inner">
                    <pre>{JSON.stringify(selectedJob.assets || {}, null, 2)}</pre>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Configuration</div>
                  <div className="bg-[#1e1e1e] p-3 rounded-lg text-[10px] font-mono text-gray-300 overflow-x-auto shadow-inner">
                    <pre>{JSON.stringify(selectedJob.config || {}, null, 2)}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CONFIRMATION MODAL ── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="card w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}>
              <IconTrash size={24} />
            </div>
            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{confirmAction.title}</h3>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{confirmAction.msg}</p>
            <div className="flex items-center gap-3 w-full">
              <button 
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2 rounded-xl text-sm font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-primary)' }}
              >
                Cancel
              </button>
              <button 
                onClick={() => { confirmAction.action(); setConfirmAction(null) }}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-all shadow hover:opacity-90 hover:-translate-y-0.5"
                style={{ background: 'var(--color-error)' }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .btn-control {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.55rem 1rem;
          border-radius: 0.75rem;
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: var(--bg-input);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
          transition: all 0.2s;
        }
        .btn-control:not(:disabled):hover {
          background: var(--bg-elevated);
          border-color: var(--text-muted);
        }
        .btn-accent {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white !important;
          border: none;
          box-shadow: 0 4px 12px rgba(99,102,241,0.25);
        }
        .btn-accent:not(:disabled):hover {
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          box-shadow: 0 6px 16px rgba(99,102,241,0.35);
          transform: translateY(-1px);
        }
        .btn-destructive {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.55rem 1rem;
          border-radius: 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--color-error);
          background: transparent;
          transition: all 0.2s;
        }
        .btn-destructive:not(:disabled):hover {
          background: var(--color-error-bg);
        }
        .job-row {
          border: 1px solid transparent;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .job-row:hover {
          border-color: var(--border-default);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.05);
        }
        .job-row.selected {
          border-color: #8b5cf6;
          box-shadow: 0 0 0 1px #8b5cf6, 0 8px 24px rgba(139, 92, 246, 0.1);
        }
        @keyframes pulse-border {
          0% { border-color: rgba(168, 85, 247, 0.3); }
          50% { border-color: rgba(168, 85, 247, 1); box-shadow: 0 0 10px rgba(168, 85, 247, 0.2); }
          100% { border-color: rgba(168, 85, 247, 0.3); }
        }
        .running-row {
          animation: pulse-border 2s infinite;
        }
      `}</style>
    </div>
  )
}

function JobRow({ job, isSelected, onSelect, onMoveUp, onMoveDown, onDuplicate, onRetry, onDelete }: any) {
  const isQueued = job.status === 'queued'
  const isRunning = job.status === 'running'
  const isCompleted = job.status === 'completed'
  const isFailed = job.status === 'failed' || job.status === 'cancelled'

  return (
    <div 
      className={`job-row card p-4 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer ${isSelected ? 'selected' : ''} ${isRunning ? 'running-row' : ''}`}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>
            {job.source_tool_label}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: `${getStatusColor(job.status)}15`, color: getStatusColor(job.status) }}>
            {job.status}
          </span>
          {job.config?.text_overlay_enabled === true && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', color: 'var(--color-accent)', border: '1px solid var(--border-subtle)' }}>
              Text Overlay · {
                job.config.text_overlay_mode === 'timed_text' ? 'Timed Text' : 
                job.config.text_overlay_mode === 'csv_text' ? 'CSV Text' : 'Whole Video'
              }
            </span>
          )}
          {isCompleted && <span className="text-[10px] font-bold text-gray-400 ml-1">Added to History</span>}
        </div>
        <h4 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{job.title}</h4>
        <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="truncate">{job.output_name}</span>
          <span>•</span>
          <span>{job.export_preset || job.config?.export_resolution || '1080p'}</span>
          <span>•</span>
          <span>{new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        
        {/* Active Progress */}
        {isRunning && (
          <div className="mt-3 w-full max-w-sm">
            <div className="flex justify-between text-[10px] font-bold mb-1" style={{ color: '#a855f7' }}>
              <span>{job.message || 'Processing...'}</span>
              <span>{job.progress}%</span>
            </div>
            <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
              <div className="bg-purple-500 h-full rounded-full transition-all duration-300 relative" style={{ width: `${job.progress}%` }}>
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
          </div>
        )}
        
        {/* Error Detail */}
        {isFailed && (
          <div className="mt-2 text-xs font-medium text-red-500 truncate max-w-xl">
            {job.message || job.error}
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {isQueued && (
          <div className="flex flex-col gap-0.5 mr-2 bg-black/5 dark:bg-white/5 rounded-md">
            <button onClick={onMoveUp} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-muted)' }} title="Move Up"><IconArrowUp size={12} /></button>
            <button onClick={onMoveDown} className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-muted)' }} title="Move Down"><IconArrowDown size={12} /></button>
          </div>
        )}

        {isCompleted && job.output_url ? (
          <div className="flex items-center gap-2 mr-2">
            <a href={`http://127.0.0.1:8000${job.output_url}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-primary)' }}>
              Open
            </a>
            <a href={`http://127.0.0.1:8000${job.output_url}`} download className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90 shadow-sm" style={{ background: 'var(--color-accent)' }}>
              Download
            </a>
          </div>
        ) : isFailed ? (
          <button onClick={onRetry} className="px-3 py-1.5 mr-2 rounded-lg text-xs font-bold transition-colors bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10" style={{ color: 'var(--text-primary)' }}>
            Retry
          </button>
        ) : (
          <button onClick={onDuplicate} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors" style={{ color: 'var(--text-muted)' }} title="Duplicate Job">
            <IconCopy size={16} />
          </button>
        )}
        
        <button 
          onClick={onDelete}
          disabled={isRunning}
          className={`p-2 rounded-lg transition-colors ml-1 ${isRunning ? 'opacity-30 cursor-not-allowed' : 'hover:bg-red-500/10'}`}
          style={{ color: isRunning ? 'var(--text-muted)' : 'var(--color-error)' }}
          title={isRunning ? "Cannot delete running job" : "Delete Job"}
        >
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  )
}

function StatCard({ title, value, color, icon, pulse }: { title: string; value: number; color: string; icon: React.ReactNode; pulse?: boolean }) {
  return (
    <div className="card p-4 relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: color, opacity: 0.8 }} />
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{title}</span>
        <div className={`opacity-70 group-hover:opacity-100 transition-opacity ${pulse ? 'animate-pulse' : ''}`} style={{ color }}>{icon}</div>
      </div>
      <div className="text-3xl font-black mt-1" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="absolute -bottom-6 -right-6 opacity-[0.03] transform group-hover:scale-110 transition-transform duration-500 pointer-events-none" style={{ color }}>
        {React.cloneElement(icon as React.ReactElement, { size: 80 })}
      </div>
    </div>
  )
}

function InspectorField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}

function getStatusColor(status: string) {
  switch (status) {
    case 'queued': return '#3b82f6'
    case 'running': return '#a855f7'
    case 'completed': return '#10b981'
    case 'failed': return '#ef4444'
    case 'cancelled': return '#9ca3af'
    default: return 'var(--text-muted)'
  }
}
