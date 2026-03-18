import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

export function SlideMap(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, presentation } = usePresentationStore()
  const { slideGroups, toggleSlideMap } = useUIStore()

  // Build group lookup
  const slideGroupMap = new Map<string, string>()
  slideGroups.forEach((g) => g.slideIds.forEach((id) => slideGroupMap.set(id, g.name)))

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
         onClick={toggleSlideMap}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-[90vw] max-w-5xl max-h-[85vh]
                      flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-gray-200 font-semibold text-sm">{presentation?.title} — Slide Map</h2>
            <p className="text-gray-500 text-[10px]">{slides.length} slides</p>
          </div>
          <button
            onClick={toggleSlideMap}
            className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col items-center gap-3">
            {/* Title node */}
            <div className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold shadow-lg">
              {presentation?.title}
            </div>
            <div className="w-px h-4 bg-gray-700" />

            {/* Slides */}
            <div className="flex flex-wrap justify-center gap-4 max-w-4xl">
              {slides.map((slide, index) => {
                const isActive = index === currentSlideIndex
                const groupName = slideGroupMap.get(slide.config.id)
                const hasCode = !!slide.config.code
                const hasVideo = !!slide.config.video
                const hasWebApp = !!slide.config.webapp
                const artifactCount = slide.config.artifacts.length
                const isAI = slide.markdownContent?.includes('<!-- ai-generated -->')

                // Extract first line as preview
                const firstLine = slide.markdownContent
                  ?.replace(/<!--.*?-->/g, '')
                  .replace(/^#+\s*/, '')
                  .trim()
                  .split('\n')[0]
                  ?.slice(0, 40) || slide.config.id

                return (
                  <div key={slide.config.id} className="flex flex-col items-center gap-1">
                    {/* Connection line */}
                    {index > 0 && index < slides.length && (
                      <div className="w-px h-2 bg-gray-700 -mt-1" />
                    )}

                    <button
                      onClick={() => { goToSlide(index); toggleSlideMap() }}
                      className={`w-36 rounded-lg border-2 p-2.5 text-left transition-all hover:scale-105 ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-950/40 shadow-lg shadow-indigo-500/20'
                          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      }`}
                    >
                      {/* Group badge */}
                      {groupName && (
                        <span className="text-[8px] px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded-sm mb-1 inline-block">
                          {groupName}
                        </span>
                      )}

                      {/* Slide number */}
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[10px] font-bold text-gray-400">{index + 1}</span>
                        {isAI && <span className="text-[8px] text-indigo-400">✦</span>}
                      </div>

                      {/* Title */}
                      <div className="text-[11px] text-gray-200 font-medium truncate leading-tight">
                        {firstLine}
                      </div>

                      {/* Attachments row */}
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        {hasCode && (
                          <span className="text-[8px] px-1 py-0.5 bg-green-900/40 text-green-400 rounded">
                            {slide.config.code!.language}
                          </span>
                        )}
                        {hasVideo && (
                          <span className="text-[8px] px-1 py-0.5 bg-red-900/40 text-red-400 rounded">
                            video
                          </span>
                        )}
                        {hasWebApp && (
                          <span className="text-[8px] px-1 py-0.5 bg-cyan-900/40 text-cyan-400 rounded">
                            web
                          </span>
                        )}
                        {artifactCount > 0 && (
                          <span className="text-[8px] px-1 py-0.5 bg-amber-900/40 text-amber-400 rounded">
                            {artifactCount} file{artifactCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
