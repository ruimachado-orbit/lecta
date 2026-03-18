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
  const { slides, currentSlideIndex, isSaving, lastSavedAt, hasUnsavedChanges } =
    usePresentationStore()
  const { isExecuting, lastResult } = useExecutionStore()
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
