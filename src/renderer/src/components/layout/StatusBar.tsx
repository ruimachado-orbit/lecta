import { useShallow } from 'zustand/react/shallow'
import { usePresentationStore } from '../../stores/presentation-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useState, useEffect } from 'react'

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}

export function StatusBar(): JSX.Element {
  const { slides, currentSlideIndex, isSaving, lastSavedAt, hasUnsavedChanges, error } =
    usePresentationStore(
      useShallow((s) => ({
        slides: s.slides,
        currentSlideIndex: s.currentSlideIndex,
        isSaving: s.isSaving,
        lastSavedAt: s.lastSavedAt,
        hasUnsavedChanges: s.hasUnsavedChanges,
        error: s.error
      }))
    )
  const { isExecuting, lastResult } = useExecutionStore(
    useShallow((s) => ({ isExecuting: s.isExecuting, lastResult: s.lastResult }))
  )
  const currentSlide = slides[currentSlideIndex]

  const executionEngine = currentSlide?.config.code?.execution
  const language = currentSlide?.config.code?.language

  // Re-render periodically to keep "time ago" fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const interval = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(interval)
  }, [lastSavedAt])

  return (
    <div className="h-7 bg-gray-900 border-t border-gray-800 flex items-center px-4 text-xs text-gray-500 gap-4 select-none">
      {/* Execution status indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            isExecuting
              ? 'bg-gray-400 animate-pulse'
              : lastResult?.status === 'error'
                ? 'bg-red-400'
                : 'bg-gray-300'
          }`}
        />
        <span>
          {isExecuting
            ? 'Executing...'
            : lastResult
              ? `${lastResult.status} (${lastResult.duration}ms)`
              : 'Ready'}
        </span>
      </div>

      {/* Store error — the only place a failed load/save/delete becomes visible inside a deck */}
      {error && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 max-w-[40%]">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span className="truncate" title={error}>{error}</span>
          <button
            onClick={() => usePresentationStore.setState({ error: null })}
            title="Dismiss error"
            aria-label="Dismiss error"
            className="flex-shrink-0 rounded hover:bg-red-500/20 text-red-300/80 hover:text-red-200 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status */}
      <div className="flex items-center gap-1.5">
        {isSaving ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            <span className="text-gray-500">Saving...</span>
          </>
        ) : hasUnsavedChanges ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Unsaved changes</span>
          </>
        ) : lastSavedAt ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-gray-500">Saved {formatTimeAgo(lastSavedAt)}</span>
          </>
        ) : null}
      </div>

      {/* Engine info */}
      {executionEngine && executionEngine !== 'none' && (
        <span className="text-gray-600">
          {language} ({executionEngine})
        </span>
      )}

      {/* Slide info */}
      <span className="text-gray-600">
        Slide {currentSlideIndex + 1} of {slides.length}
      </span>
    </div>
  )
}
