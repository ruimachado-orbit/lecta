import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'

export function Toolbar(): JSX.Element {
  const { presentation, currentSlideIndex, slides, nextSlide, prevSlide } =
    usePresentationStore()
  const { togglePresenting, toggleNotes, showNotes } = useUIStore()
  const { isExecuting } = useExecutionStore()

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-4 select-none">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={prevSlide}
          disabled={currentSlideIndex === 0}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous slide (←)"
        >
          <ChevronLeftIcon />
        </button>

        <span className="text-gray-400 text-sm font-mono min-w-[60px] text-center">
          {currentSlideIndex + 1} / {slides.length}
        </span>

        <button
          onClick={nextSlide}
          disabled={currentSlideIndex === slides.length - 1}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next slide (→)"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-800" />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 text-sm font-medium truncate block">
          {presentation?.title}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Execution status */}
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-amber-400 text-xs">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Running...
          </div>
        )}

        {/* Notes toggle */}
        <button
          onClick={toggleNotes}
          className={`p-1.5 rounded transition-colors ${
            showNotes ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 text-gray-400'
          }`}
          title="Toggle speaker notes (N)"
        >
          <NotesIcon />
        </button>

        {/* Present mode */}
        <button
          onClick={togglePresenting}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
                     rounded-lg transition-colors flex items-center gap-1.5"
          title="Start presentation (F5)"
        >
          <PlayIcon />
          Present
        </button>
      </div>
    </div>
  )
}

function ChevronLeftIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function PlayIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function NotesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}
