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

                {/* Slides row with connectors */}
                <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
                  {section.slides.map((item, i) => {
                    const { slide, globalIndex } = item
                    const isActive = globalIndex === currentSlideIndex
                    const hasCode = !!slide.config.code
                    const hasVideo = !!slide.config.video
                    const hasWebApp = !!slide.config.webapp
                    const artifactCount = slide.config.artifacts.length
                    const isAI = slide.markdownContent?.includes('<!-- ai-generated -->')

                    const title = slide.markdownContent
                      ?.replace(/<!--.*?-->/g, '')
                      .replace(/^#+\s*/, '')
                      .trim()
                      .split('\n')[0]
                      ?.slice(0, 50) || slide.config.id

                    const bodyLines = slide.markdownContent
                      ?.replace(/<!--.*?-->/g, '')
                      .trim()
                      .split('\n')
                      .filter((l) => l.trim() && !l.startsWith('#'))
                      .slice(0, 2)
                      .map((l) => l.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').slice(0, 45))

                    return (
                      <div key={slide.config.id} className="flex items-center">
                        {/* Connector with transition picker */}
                        {i > 0 && (
                          <TransitionConnector
                            slideIndex={globalIndex}
                            currentTransition={slide.config.transition || 'none'}
                            onSetTransition={async (t) => {
                              goToSlide(globalIndex)
                              setTimeout(() => {
                                usePresentationStore.getState().setSlideTransition(t)
                              }, 50)
                            }}
                          />
                        )}

                        {/* Slide card */}
                        <button
                          onClick={() => { goToSlide(globalIndex); toggleSlideMap() }}
                          className={`flex-shrink-0 w-44 rounded-xl border transition-colors text-left ${
                            isActive
                              ? 'border-white bg-gray-900 shadow-md shadow-white/5 ring-1 ring-white/30'
                              : 'border-gray-800 bg-gray-900 hover:border-gray-500 hover:bg-gray-800'
                          }`}
                        >
                          {/* Card header */}
                          <div className={`px-3 py-2 rounded-t-xl border-b ${
                            isActive ? 'bg-white/5 border-gray-700' : 'bg-gray-800/50 border-gray-800'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-bold ${isActive ? 'text-white' : 'text-gray-500'}`}>
                                {String(globalIndex + 1).padStart(2, '0')}
                              </span>
                              <div className="flex items-center gap-1">
                                {isAI && <span className="text-[8px] text-white">✦ AI</span>}
                              </div>
                            </div>
                            <div className="text-[11px] text-white font-medium truncate mt-0.5">
                              {title}
                            </div>
                          </div>

                          {/* Card body */}
                          <div className="px-3 py-2 space-y-1">
                            {bodyLines && bodyLines.length > 0 ? (
                              bodyLines.map((line, li) => (
                                <div key={li} className="text-[9px] text-gray-500 truncate">
                                  {line}
                                </div>
                              ))
                            ) : (
                              <div className="text-[9px] text-gray-600 italic">Empty slide</div>
                            )}
                          </div>

                          {/* Card footer — attachments */}
                          {(hasCode || hasVideo || hasWebApp || artifactCount > 0) && (
                            <div className="px-3 py-1.5 border-t border-gray-800 flex items-center gap-1 flex-wrap">
                              {hasCode && (
                                <span className="text-[7px] px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded-full font-medium">
                                  {slide.config.code!.language}
                                </span>
                              )}
                              {hasVideo && (
                                <span className="text-[7px] px-1.5 py-0.5 bg-gray-800 text-red-400 rounded-full font-medium">
                                  video
                                </span>
                              )}
                              {hasWebApp && (
                                <span className="text-[7px] px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded-full font-medium">
                                  web
                                </span>
                              )}
                              {artifactCount > 0 && (
                                <span className="text-[7px] px-1.5 py-0.5 bg-gray-800 text-gray-300 rounded-full font-medium">
                                  {artifactCount} file{artifactCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                      </div>
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
