import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

export function SlideNavigator(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, addSlide } = usePresentationStore()
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickId, setQuickId] = useState('')

  const handleQuickAdd = async () => {
    const id = quickId.trim().replace(/\s+/g, '-').toLowerCase()
    if (!id) return
    await addSlide(id)
    setQuickId('')
    setShowQuickAdd(false)
  }

  return (
    <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-2 overflow-x-auto">
      {slides.map((slide, index) => {
        const isActive = index === currentSlideIndex
        const isAI = slide.markdownContent?.includes('<!-- ai-generated -->')
        return (
          <button
            key={slide.config.id}
            onClick={() => goToSlide(index)}
            className={`flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                        overflow-hidden px-1.5 py-1 text-left relative ${
              isActive
                ? 'border-indigo-500 bg-gray-800 text-gray-300'
                : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`}
            title={`Slide ${index + 1}: ${slide.config.id}`}
          >
            <span className="block truncate font-medium">
              {index + 1}. {slide.config.id}
            </span>
            {slide.config.code && (
              <span className="block truncate text-indigo-400/60 mt-0.5">
                {slide.config.code.language}
              </span>
            )}
            {isAI && (
              <span className="absolute top-0.5 right-0.5 text-[7px] text-indigo-400" title="AI generated">
                ✦
              </span>
            )}
          </button>
        )
      })}

      {/* Quick add slide button */}
      {showQuickAdd ? (
        <div className="flex-shrink-0 flex items-center gap-1">
          <input
            type="text"
            value={quickId}
            onChange={(e) => setQuickId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleQuickAdd()
              if (e.key === 'Escape') { setShowQuickAdd(false); setQuickId('') }
            }}
            placeholder="slide-id"
            autoFocus
            className="w-24 px-2 py-1 bg-gray-950 text-gray-300 text-[10px] rounded border border-gray-700
                       focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickId.trim()}
            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] rounded transition-colors"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowQuickAdd(true)}
          className="flex-shrink-0 w-10 h-10 rounded-md border-2 border-dashed border-gray-700
                     hover:border-indigo-500 hover:text-indigo-400 text-gray-600
                     flex items-center justify-center transition-colors"
          title="Add slide"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}
    </div>
  )
}
