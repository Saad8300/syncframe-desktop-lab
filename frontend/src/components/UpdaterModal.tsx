import React, { useState, useEffect } from 'react';
import { IconX, IconAlertCircle, IconLoader, IconCheck } from './icons';

interface UpdaterModalProps {
  release: any;
  currentVersion: string;
  onClose: () => void;
}

export function UpdaterModal({ release, currentVersion, onClose }: UpdaterModalProps) {
  const [status, setStatus] = useState<'prompt' | 'downloading' | 'success' | 'error'>('prompt');
  const [progress, setProgress] = useState({ percent: 0, loadedBytes: 0, totalBytes: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // @ts-ignore
    if (window.syncframeDesktop?.onUpdateProgress) {
      // @ts-ignore
      unsubscribe = window.syncframeDesktop.onUpdateProgress((p: any) => {
        setProgress(p);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleDownload = async () => {
    setStatus('downloading');
    setErrorMsg(null);
    try {
      // @ts-ignore
      const res = await window.syncframeDesktop.downloadUpdate(release);
      if (res.success && res.filePath) {
        setFilePath(res.filePath);
        setStatus('success');
        
        // Auto-launch the installer
        // @ts-ignore
        const installRes = await window.syncframeDesktop.installUpdate(res.filePath);
        if (!installRes.success) {
          console.error("Install launch error:", installRes.error);
        }
      } else {
        setStatus('error');
        setErrorMsg(res.error || 'Failed to download update.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message || 'An unexpected error occurred.');
    }
  };
  
  // Format bytes
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={status !== 'downloading' ? onClose : undefined} 
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md p-8 rounded-2xl bg-[#0b101a] border border-[#1e293b] shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button */}
        {status !== 'downloading' && (
          <button 
            onClick={onClose} 
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
          >
            <IconX size={20} />
          </button>
        )}

        {status === 'prompt' && (
          <>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">Update Available</h2>
              <p className="text-sm text-slate-400">A new version of SyncFrame Studio is ready.</p>
            </div>
            
            <div className="bg-[#0f172a] rounded-lg border border-[#1e293b] p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Current Version</span>
                <span className="text-white font-mono">v{currentVersion}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Latest Version</span>
                <span className="text-cyan-400 font-mono font-bold">v{release.version}</span>
              </div>
              <div className="h-px bg-[#1e293b] w-full" />
              {release.file_size_bytes > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">File Size</span>
                  <span className="text-slate-300">{formatBytes(release.file_size_bytes)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 mt-2">
              <button 
                onClick={handleDownload} 
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg shadow-lg shadow-cyan-900/20 transition-all"
              >
                Download Update
              </button>
              <button 
                onClick={onClose} 
                className="w-full py-2 px-4 bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-semibold rounded-lg transition-all"
              >
                Later
              </button>
            </div>
          </>
        )}

        {status === 'downloading' && (
          <div className="text-center space-y-6 py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <IconLoader size={24} className="text-cyan-500 animate-spin" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Downloading... {progress.percent}%</h2>
              <p className="text-sm text-slate-400">
                {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes || release.file_size_bytes)}
              </p>
            </div>
            <div className="w-full h-2 rounded-full overflow-hidden bg-[#1e293b]">
              <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-6 py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
              <IconCheck size={24} className="text-green-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Update Downloaded</h2>
              <p className="text-sm text-slate-400">
                The installer has been opened. Please follow the instructions to install the update, then restart SyncFrame Studio.
              </p>
            </div>
            <button 
              onClick={onClose} 
              className="w-full mt-4 py-2 px-4 bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-semibold rounded-lg transition-all"
            >
              Close
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-6 py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
              <IconAlertCircle size={24} className="text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">Download Failed</h2>
              <p className="text-sm text-red-400 break-words">{errorMsg}</p>
            </div>
            <button 
              onClick={() => setStatus('prompt')} 
              className="w-full mt-4 py-2 px-4 bg-[#1e293b] hover:bg-[#334155] text-slate-300 font-semibold rounded-lg transition-all"
            >
              Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
