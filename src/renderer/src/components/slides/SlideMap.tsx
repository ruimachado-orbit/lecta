import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore, type SlideGroup } from '../../stores/ui-store'
import type { LoadedSlide, SlideTransition } from '../../../../../packages/shared/src/types/presentation'

export function SlideMap(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, presentation, setSlideTransition } = usePresentationStore()
  const { slideGroups, toggleSlideMap } = useUIStore()

  // Build group lookup
  const slideToGroup = new Map<string, SlideGroup>()
  slideGroups.forEach((g) => g.slideIds.forEach((id) => slideToGroup.set(id, g)))

  // Organize slides into sections: groups + ungrouped
  const groupedSections: { group: SlideGroup | null; slides: { slide: LoadedSlide; globalIndex: number }[] }[] = []

  // Collect grouped slides by group order
  const usedGroups = new Set<string>()
  const ungrouped: { slide: LoadedSlide; globalIndex: number }[] = []

  slides.forEach((slide, index) => {
    const group = slideToGroup.get(slide.config.id)
    if (group) {
      if (!usedGroups.has(group.id)) {
        usedGroups.add(group.id)
        const groupSlides = slides
          .map((s, i) => ({ slide: s, globalIndex: i }))
          .filter((s) => group.slideIds.includes(s.slide.config.id))
        groupedSections.push({ group, slides: groupSlides })
      }
    } else {
      ungrouped.push({ slide, globalIndex: index })
    }
  })

  // Add ungrouped at the end
  if (ungrouped.length > 0) {
    groupedSections.push({ group: null, slides: ungrouped })
  }

  const totalGroups = slideGroups.length
  const totalSlides = slides.length

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center"
         onClick={toggleSlideMap}>
      <div className="bg-gray-950 rounded-2xl border border-gray-800 w-[92vw] max-w-6xl max-h-[88vh]
                      flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-black font-bold text-sm">
              {presentation?.title?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <h2 className="text-white font-semibold">{presentation?.title}</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-gray-500 text-xs">{totalSlides} slides</span>
                {totalGroups > 0 && <span className="text-gray-600 text-xs">{totalGroups} groups</span>}
                {presentation?.author && <span className="text-gray-600 text-xs">by {presentation.author}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={toggleSlideMap}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-6 min-w-fit">
            {groupedSections.map((section, sIdx) => (
              <div key={section.group?.id ?? 'ungrouped'}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-3">
                  {section.group ? (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span className="text-xs font-semibold text-white uppercase tracking-wider">
                        {section.group.name}
                      </span>
                      <span className="text-[10px] text-gray-600">{section.slides.length} slides</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </>
                  ) : totalGroups > 0 ? (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Ungrouped
                      </span>
                      <span className="text-[10px] text-gray-600">{section.slides.length} slides</span>
                      <div className="flex-1 h-px bg-gray-800" />
                    </>
                  ) : null}
                </div>

                {/* Slides grid */}
                <div className="grid grid-cols-4 gap-3 pb-2">
                  {section.slides.map((item) => {
                    const { slide, globalIndex } = item
                    const isActive = globalIndex === currentSlideIndex
                    const hasCode = !!slide.config.code
                    const hasVideo = !!slide.config.video
                    const hasWebApp = !!slide.config.webapp
                    const artifactCount = slide.config.artifacts.length

                    const title = slide.markdownContent
                      ?.replace(/<!--.*?-->/g, '')
                      .replace(/^#+\s*/, '')
                      .trim()
                      .split('\n')[0]
                      ?.slice(0, 50) || slide.config.id

                    const previewLines = slide.markdownContent
                      ?.replace(/<!--.*?-->/g, '')
                      .trim()
                      .split('\n')
                      .filter((l) => l.trim())
                      .slice(0, 6)
                      .map((l) => l.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').replace(/^#+\s*/, '').slice(0, 60))

                    return (
                      <button
                        key={slide.config.id}
                        onClick={() => { goToSlide(globalIndex); toggleSlideMap() }}
                        className={`rounded-lg border transition-all text-left overflow-hidden ${
                          isActive
                            ? 'border-white ring-2 ring-white/30 shadow-lg shadow-white/10'
                            : 'border-gray-800 hover:border-gray-500'
                        }`}
                      >
                        {/* 16:9 aspect ratio thumbnail */}
                        <div className="aspect-video bg-black rounded-t-lg overflow-hidden p-3 relative"
                          data-slide-theme={presentation?.theme || 'dark'}
                          style={{ background: 'var(--slide-bg, #0a0a0a)' }}>
                          {/* Mini slide preview */}
                          <div className="space-y-0.5">
                            {previewLines?.map((line, li) => {
                              const isH = slide.markdownContent?.split('\n').find((l) => l.trim())?.startsWith('#') && li === 0
                              return (
                                <div key={li} className={`truncate ${
                                  isH ? 'text-[8px] font-bold' : 'text-[6px]'
                                }`} style={{ color: 'var(--slide-text, #e2e8f0)', opacity: isH ? 1 : 0.6 }}>
                                  {line}
                                </div>
                              )
                            })}
                          </div>
                          {/* Slide number badge */}
                          <span className={`absolute top-1.5 left-1.5 text-[8px] font-bold px-1 py-0.5 rounded ${
                            isActive ? 'bg-white text-black' : 'bg-white/10 text-white/50'
                          }`}>
                            {globalIndex + 1}
                          </span>
                        </div>

                        {/* Card footer */}
                        <div className={`px-2 py-1.5 ${isActive ? 'bg-gray-900' : 'bg-gray-900/50'}`}>
                          <div className={`text-[10px] font-medium truncate ${isActive ? 'text-white' : 'text-gray-400'}`}>
                            {title}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {hasCode && <span className="text-[7px] text-gray-600">{'{ }'}</span>}
                            {hasVideo && <span className="text-[7px] text-gray-600">▶</span>}
                            {hasWebApp && <span className="text-[7px] text-gray-600">◎</span>}
                            {artifactCount > 0 && <span className="text-[7px] text-gray-600">📎{artifactCount}</span>}
                            {slide.config.layout && slide.config.layout !== 'default' && (
                              <span className="text-[7px] px-1 rounded bg-gray-800 text-gray-500">{slide.config.layout}</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px] text-gray-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500/50" /> Code</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400/50" /> Video</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500/50" /> Web</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500/50" /> Files</span>
            <span className="flex items-center gap-1">← → ↑ ↓ Click arrows to set transitions</span>
          </div>
          <span className="text-[10px] text-gray-600">Click a slide to navigate</span>
        </div>
      </div>
    </div>
  )
}

const TRANSITIONS: { value: SlideTransition; arrow: string; label: string }[] = [
  { value: 'none', arrow: '·', label: 'No transition' },
  { value: 'left', arrow: '←', label: 'Slide from left' },
  { value: 'right', arrow: '→', label: 'Slide from right' },
  { value: 'top', arrow: '↑', label: 'Slide from top' },
  { value: 'bottom', arrow: '↓', label: 'Slide from bottom' }
]

function TransitionConnector({
  slideIndex, currentTransition, onSetTransition
}: {
  slideIndex: number
  currentTransition: string
  onSetTransition: (t: string) => void
}): JSX.Element {
  const [showPicker, setShowPicker] = useState(false)
  const current = TRANSITIONS.find((t) => t.value === currentTransition) || TRANSITIONS[0]

  return (
    <div className="w-10 flex-shrink-0 flex items-center justify-center relative">
      <div className="w-full h-px bg-gray-700" />
      <button
        onClick={(e) => { e.stopPropagation(); setShowPicker(!showPicker) }}
        className={`absolute w-6 h-6 rounded-full flex items-center justify-center text-[10px] transition-colors z-10 ${
          currentTransition !== 'none'
            ? 'bg-white text-black'
            : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
        }`}
        title={current.label}
      >
        {current.arrow}
      </button>

      {showPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
          <div className="absolute top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-1 flex gap-0.5">
            {TRANSITIONS.map((t) => (
              <button
                key={t.value}
                onClick={(e) => { e.stopPropagation(); onSetTransition(t.value); setShowPicker(false) }}
                className={`w-7 h-7 rounded flex items-center justify-center text-[11px] transition-colors ${
                  currentTransition === t.value
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
                title={t.label}
              >
                {t.arrow}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
