import { usePresentationStore } from '../../stores/presentation-store'
import { useExecutionStore } from '../../stores/execution-store'

export function StatusBar(): JSX.Element {
  const { slides, currentSlideIndex } = usePresentationStore()
  const { isExecuting, lastResult } = useExecutionStore()
  const currentSlide = slides[currentSlideIndex]

  const executionEngine = currentSlide?.config.code?.execution
  const language = currentSlide?.config.code?.language

  return (
    <div className="h-7 bg-gray-900 border-t border-gray-800 flex items-center px-4 text-xs text-gray-500 gap-4 select-none">
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={`w-2 h-2 rounded-full ${
            isExecuting
              ? 'bg-amber-400 animate-pulse'
              : lastResult?.status === 'error'
                ? 'bg-red-400'
                : 'bg-green-400'
          }`}
        />
        <span>
          {isExecuting ? 'Executing...' : lastResult ? `${lastResult.status} (${lastResult.duration}ms)` : 'Ready'}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

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
