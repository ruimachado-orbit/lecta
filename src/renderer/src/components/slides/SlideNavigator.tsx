import { useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

export function SlideNavigator(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, addSlide, deleteSlide, reorderSlide } =
    usePresentationStore()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const handleQuickAdd = async () => {
    const nextNum = slides.length + 1
    await addSlide(`slide-${nextNum}`)
  }

  const handleDelete = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (slides.length <= 1) return
    await deleteSlide(index)
  }

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragRef.current = index
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(index)
  }

  const handleDragLeave = () => {
    setDropTarget(null)
  }

  const handleDrop = async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragRef.current
    setDragIndex(null)
    setDropTarget(null)
    dragRef.current = null

    if (fromIndex !== null && fromIndex !== toIndex) {
      await reorderSlide(fromIndex, toIndex)
    }
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDropTarget(null)
    dragRef.current = null
  }

  return (
    <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-2 overflow-x-auto">
      {slides.map((slide, index) => {
        const isActive = index === currentSlideIndex
        const isAI = slide.markdownContent?.includes('<!-- ai-generated -->')
        const isDragging = dragIndex === index
        const isDropTarget = dropTarget === index && dragIndex !== index

        return (
          <div
            key={slide.config.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => goToSlide(index)}
            className={`group flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                        overflow-visible px-1.5 py-1 text-left relative cursor-grab active:cursor-grabbing ${
              isDragging
                ? 'opacity-40 border-gray-600'
                : isDropTarget
                  ? 'border-indigo-400 bg-indigo-950/30'
                  : isActive
                    ? 'border-indigo-500 bg-gray-800 text-gray-300'
                    : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600 hover:text-gray-400'
            }`}
            title={`Slide ${index + 1} — drag to reorder`}
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
              <span className="absolute top-0.5 right-0.5 text-[7px] text-indigo-400 group-hover:hidden" title="AI generated">
                ✦
              </span>
            )}

            {/* Delete button — shown on hover, top-right */}
            {slides.length > 1 && (
              <button
                onClick={(e) => handleDelete(e, index)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 text-white
                           rounded-full hidden group-hover:flex items-center justify-center transition-colors z-10"
                title="Delete slide"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      {/* Quick add slide button */}
      <button
        onClick={handleQuickAdd}
        className="flex-shrink-0 w-10 h-10 rounded-md border-2 border-dashed border-gray-700
                   hover:border-indigo-500 hover:text-indigo-400 text-gray-600
                   flex items-center justify-center transition-colors"
        title="Add slide"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  )
}
