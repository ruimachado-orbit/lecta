import { useRef, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore, type SlideGroup } from '../../stores/ui-store'

export function SlideMap(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, presentation } = usePresentationStore()
  const { slideGroups, toggleSlideMap } = useUIStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Build group lookup
  const slideToGroup = new Map<string, SlideGroup>()
  slideGroups.forEach((g) => g.slideIds.forEach((id) => slideToGroup.set(id, g)))

  // Build timeline in slide order
  const timeline = slides.map((slide, i) => ({
    slide,
    index: i,
    group: slideToGroup.get(slide.config.id) || null
  }))

  // Scroll to active slide on open
  useEffect(() => {
    if (!scrollRef.current) return
    const active = scrollRef.current.querySelector('[data-active="true"]') as HTMLElement
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentSlideIndex])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end"
         onClick={toggleSlideMap}>
      <div className="w-full bg-gray-950/95 backdrop-blur-xl border-t border-gray-800 shadow-2xl shadow-black/50"
           onClick={(e) => e.stopPropagation()}>

        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-gray-800/50">
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-sm">{presentation?.title}</span>
            <span className="text-gray-600 text-xs">{slides.length} slides</span>
            {slideGroups.length > 0 && (
              <div className="flex items-center gap-2 ml-2">
                {slideGroups.map((g) => (
                  <span key={g.id} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color || '#6366f1' }} />
                    <span className="text-[10px] text-gray-500">{g.name}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs font-mono">{currentSlideIndex + 1} / {slides.length}</span>
            <button onClick={toggleSlideMap}
              className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-500 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden px-8 py-6"
          style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center gap-0 min-w-fit relative">

            {timeline.map((item, i) => {
              const { slide, index: globalIndex, group } = item
              const isActive = globalIndex === currentSlideIndex
              const prevGroup = i > 0 ? timeline[i - 1].group : null
              const isGroupStart = group && group !== prevGroup
              const nextItem = timeline[i + 1]
              const nextGroup = nextItem?.group

              const title = slide.markdownContent
                ?.replace(/<!--.*?-->/g, '')
                .replace(/^#+\s*/, '')
                .trim()
                .split('\n')[0]
                ?.slice(0, 40) || slide.config.id

              const previewLines = slide.markdownContent
                ?.replace(/<!--.*?-->/g, '')
                .trim()
                .split('\n')
                .filter((l) => l.trim())
                .slice(0, 5)
                .map((l) => l.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').replace(/^#+\s*/, '').slice(0, 50))

              const transition = slide.config.transition
              const hasTransition = transition && transition !== 'none'
              const groupColor = group?.color || '#6366f1'

              return (
                <div key={slide.config.id} className="flex items-center flex-shrink-0"
                  data-active={isActive ? 'true' : undefined}>

                  {/* Group start label */}
                  {isGroupStart && group && (
                    <div className="flex flex-col items-center justify-center mr-3 flex-shrink-0 -mt-2">
                      <span className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap px-2 py-0.5 rounded-full"
                        style={{ color: groupColor, backgroundColor: groupColor + '15', border: `1px solid ${groupColor}30` }}>
                        {group.name}
                      </span>
                    </div>
                  )}

                  {/* Connector line + transition bubble */}
                  {i > 0 && (
                    <div className="w-8 flex-shrink-0 flex items-center justify-center relative">
                      <div className="w-full h-0.5 rounded-full"
                        style={{ background: group ? `linear-gradient(90deg, ${prevGroup?.color || '#333'}50, ${groupColor}50)` : '#262626' }} />
                      <span
                        className={`absolute w-4 h-4 rounded-full flex items-center justify-center text-[8px] cursor-pointer transition-all hover:scale-125 z-10 ${
                          hasTransition
                            ? 'text-white shadow-md'
                            : 'bg-gray-800 text-gray-600 hover:bg-gray-700 hover:text-gray-400 border border-gray-700'
                        }`}
                        style={hasTransition ? { backgroundColor: groupColor, boxShadow: `0 0 8px ${groupColor}60` } : undefined}
                        onClick={(e) => {
                          e.stopPropagation()
                          const ts = ['none', 'left', 'right', 'top', 'bottom']
                          const cur = transition || 'none'
                          const next = ts[(ts.indexOf(cur) + 1) % ts.length]
                          goToSlide(globalIndex)
                          setTimeout(() => usePresentationStore.getState().setSlideTransition(next), 50)
                        }}
                        title={`Transition: ${transition || 'none'}`}
                      >
                        {!hasTransition ? '·' : transition === 'left' ? '←' : transition === 'right' ? '→' : transition === 'top' ? '↑' : '↓'}
                      </span>
                    </div>
                  )}

                  {/* Slide card */}
                  <button
                    onClick={() => { goToSlide(globalIndex); toggleSlideMap() }}
                    className={`flex-shrink-0 w-44 rounded-xl overflow-hidden transition-all duration-200 ${
                      isActive
                        ? 'ring-2 ring-white shadow-xl shadow-white/10 scale-105 z-10'
                        : 'hover:scale-[1.03] hover:shadow-lg'
                    }`}
                    style={{
                      border: `2px solid ${isActive ? '#fff' : group ? groupColor + '40' : '#1e1e1e'}`,
                    }}
                  >
                    {/* 16:9 thumbnail */}
                    <div className="aspect-video overflow-hidden p-2.5 relative"
                      data-slide-theme={presentation?.theme || 'dark'}
                      style={{ background: 'var(--slide-bg, #0a0a0a)' }}>
                      <div className="space-y-0.5">
                        {previewLines?.map((line, li) => {
                          const isH = slide.markdownContent?.split('\n').find((l) => l.trim())?.startsWith('#') && li === 0
                          return (
                            <div key={li} className={`truncate leading-tight ${isH ? 'text-[8px] font-bold' : 'text-[6px]'}`}
                              style={{ color: 'var(--slide-text, #e2e8f0)', opacity: isH ? 0.9 : 0.4 }}>
                              {line}
                            </div>
                          )
                        })}
                      </div>
                      {/* Number */}
                      <span className={`absolute top-1.5 left-1.5 text-[8px] font-bold w-5 h-5 rounded-md flex items-center justify-center ${
                        isActive ? 'bg-white text-black' : 'bg-black/30 text-white/50'
                      }`}>{globalIndex + 1}</span>
                      {/* Group color strip at top */}
                      {group && (
                        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: groupColor }} />
                      )}
                    </div>
                    {/* Footer */}
                    <div className="px-2 py-1.5 bg-gray-900/80">
                      <div className={`text-[10px] font-medium truncate ${isActive ? 'text-white' : 'text-gray-400'}`}>
                        {title}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {slide.config.code && <span className="text-[7px] text-gray-600">{'{ }'}</span>}
                        {slide.config.video && <span className="text-[7px] text-gray-600">▶</span>}
                        {slide.config.webapp && <span className="text-[7px] text-gray-600">◎</span>}
                        {slide.config.layout && slide.config.layout !== 'default' && (
                          <span className="text-[7px] px-1 rounded bg-gray-800/80 text-gray-500">{slide.config.layout}</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Group end — small gap before next group */}
                  {group && nextGroup !== group && nextItem && (
                    <div className="w-4 flex-shrink-0" />
                  )}
                </div>
              )
            })}

            {/* End cap */}
            <div className="w-8 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  )
}
