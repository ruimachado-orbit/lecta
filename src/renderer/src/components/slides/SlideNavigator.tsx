import { usePresentationStore } from '../../stores/presentation-store'

export function SlideNavigator(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide } = usePresentationStore()

  return (
    <div className="h-16 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-2 overflow-x-auto">
      {slides.map((slide, index) => {
        const isActive = index === currentSlideIndex
        return (
          <button
            key={slide.config.id}
            onClick={() => goToSlide(index)}
            className={`flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                        overflow-hidden px-1.5 py-1 text-left ${
              isActive
                ? 'border-indigo-500 bg-gray-800 text-gray-300'
                : 'border-gray-700 bg-gray-850 text-gray-500 hover:border-gray-600 hover:text-gray-400'
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
          </button>
        )
      })}
    </div>
  )
}
