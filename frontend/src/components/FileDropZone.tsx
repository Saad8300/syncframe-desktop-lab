// components/FileDropZone.tsx – Premium drag-and-drop upload component

import React, { useCallback, useRef, useState } from 'react'
import { IconCheck, IconX } from './icons'

interface FileDropZoneProps {
  id:          string
  label:       string
  description: string
  accept:      string
  icon:        React.ReactNode
  file?:       File | null
  files?:      File[]
  onChange?:   (file: File | null) => void
  onFilesChange?: (files: File[]) => void
  multiple?:   boolean
  disabled?:   boolean
  required?:   boolean
  compact?:    boolean
}

export default function FileDropZone({
  id,
  label,
  description,
  accept,
  icon,
  file,
  files = [],
  onChange,
  onFilesChange,
  multiple,
  disabled,
  required,
  compact,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (droppedFiles: FileList | File[]) => {
      if (disabled) return
      const list = Array.from(droppedFiles)
      if (list.length === 0) {
        if (onChange) onChange(null)
        if (onFilesChange) onFilesChange([])
        return
      }

      // Natural sort by filename
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

      if (multiple && onFilesChange) {
        onFilesChange(list)
      } else if (onChange) {
        onChange(list[0])
      }
    },
    [onChange, onFilesChange, multiple, disabled],
  )

  const onDragOver  = (e: React.DragEvent) => { if (disabled) return; e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (disabled) return
    handleFiles(e.dataTransfer.files)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasFile = (file !== undefined && file !== null) || files.length > 0
  const showMultipleFiles = files.length > 1
  const zoneClass = [
    'dropzone',
    compact ? 'px-3 py-3' : 'px-4 py-3.5',
    dragging && !disabled ? 'dropzone-active' : '',
    hasFile ? 'dropzone-filled' : '',
    disabled ? 'opacity-50 pointer-events-none' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="form-label mb-0 flex items-center gap-1">
          {label}
          {required && !hasFile && <span className="text-xs font-bold" style={{ color: 'var(--color-error)' }}>*</span>}
        </label>
        <div className="flex items-center gap-1.5">
          {hasFile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onChange) onChange(null);
                if (onFilesChange) onFilesChange([]);
              }}
              className="w-5 h-5 rounded-md flex items-center justify-center transition-colors"
              style={{
                color: 'var(--text-muted)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-default)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--color-error)'
                e.currentTarget.style.borderColor = 'var(--color-error-border)'
                e.currentTarget.style.background = 'var(--color-error-bg)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.borderColor = 'var(--border-default)'
                e.currentTarget.style.background = 'var(--bg-input)'
              }}
              aria-label={`Remove ${label}`}
              title="Remove file"
            >
              <IconX size={10} />
            </button>
          )}
        </div>
      </div>

      <div
        className={zoneClass}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Upload ${label}`}
        aria-disabled={disabled}
        onKeyDown={(e) => !disabled && e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files ?? [])}
        />

        {hasFile ? (
          <div className="flex items-center gap-3 w-full animate-pop-in">
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
              style={{
                background: 'var(--color-success-bg)',
                border: '1px solid var(--color-success-border)',
                color: 'var(--color-success)',
              }}
            >
              <IconCheck size={14} />
            </div>
            <div className="flex-1 min-w-0">
              {showMultipleFiles ? (
                <>
                  <p className="text-xs font-semibold" style={{ color: 'var(--color-success)' }}>
                    {files.length} files selected
                  </p>
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {files.slice(0, 2).map(f => f.name).join(', ')}
                    {files.length > 2 && (
                      <span style={{ color: 'var(--accent-primary)' }}> +{files.length - 2} more</span>
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-success)' }}>
                    {file ? file.name : files[0]?.name}
                  </p>
                  <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {formatSize(file ? file.size : (files[0]?.size ?? 0))}
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 w-full">
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center transition-colors"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-muted)',
              }}
            >
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Drop or <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>browse</span>
              </p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{description}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
