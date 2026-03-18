import { useState, useEffect, useRef, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { SlideRenderer } from '../slides/SlideRenderer'
import { CodeEditor } from '../code/CodeEditor'
import { ExecutionOutput } from '../code/ExecutionOutput'
import { MarkdownPreview } from '../code/MarkdownPreview'
import { WebPanel } from '../web/WebPanel'
import { VideoPanel } from '../video/VideoPanel'

type ArtifactType = 'code' | 'video' | 'webapp'

export function PresenterView(): JSX.Element {
  const { slides, currentSlideIndex, nextSlide, prevSlide, presentation } =
    usePresentationStore()
  const { setPresenting } = useUIStore()
  const { isExecuting } = useExecutionStore()
  const { runCode, cancelCode } = useCodeExecution()
  useKeyboardShortcuts()

  const [activeArtifact, setActiveArtifact] = useState<ArtifactType | null>(null)

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const isMarkdown = currentSlide?.config.code?.language === 'markdown'
  const layout = currentSlide?.config.layout
  const hasAnyArtifact = hasCode || hasVideo || hasWebApp

  // Reset artifact when slide changes
  useEffect(() => {
    setActiveArtifact(null)
  }, [currentSlideIndex])

  // Sync slide to audience window
  useEffect(() => {
    window.electronAPI.syncPresenterSlide(currentSlideIndex)
  }, [currentSlideIndex])

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  const endPresentation = () => {
    setPresenting(false)
    window.electronAPI.closeAudienceWindow()
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 select-none">
      {/* Slide area + optional artifact panel */}
      <div className="flex-1 min-h-0 flex">
        {activeArtifact ? (
          <PanelGroup direction="horizontal" className="flex-1">
            {/* Slide (2/3) */}
            <Panel defaultSize={66} minSize={30}>
              <PresenterSlide
                currentSlide={currentSlide}
                presentation={presentation}
                layout={layout}
              />
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors" />
            {/* Artifact (1/3) */}
            <Panel defaultSize={34} minSize={15}>
              <div className="h-full flex flex-col bg-gray-950">
                {activeArtifact === 'code' && hasCode ? (
                  <>
                    <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 flex-shrink-0">
                      <span className="text-gray-500 text-[10px] font-mono flex-1 truncate">
                        {currentSlide?.config.code?.file}
                      </span>
                      <span className="text-[9px] uppercase px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
                        {currentSlide?.config.code?.language}
                      </span>
                      {isExecuting ? (
                        <button onClick={cancelCode}
                          className="px-2 py-0.5 bg-red-500 hover:bg-red-400 text-white text-[10px] rounded">Stop</button>
                      ) : (
                        <button onClick={handleRun}
                          className="px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded">Run</button>
                      )}
                    </div>
                    <PanelGroup direction="vertical" className="flex-1">
                      <Panel defaultSize={55} minSize={20}>
                        <CodeEditor />
                      </Panel>
                      <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-indigo-500" />
                      <Panel defaultSize={45} minSize={10}>
                        {isMarkdown ? (
                          <MarkdownPreview content={currentSlide?.codeContent ?? ''} rootPath={presentation?.rootPath} />
                        ) : (
                          <ExecutionOutput />
                        )}
                      </Panel>
                    </PanelGroup>
                  </>
                ) : activeArtifact === 'video' && hasVideo ? (
                  <VideoPanel key={currentSlideIndex} video={currentSlide!.config.video!} />
                ) : activeArtifact === 'webapp' && hasWebApp ? (
                  <WebPanel key={currentSlideIndex} webapp={currentSlide!.config.webapp!} />
                ) : null}
              </div>
            </Panel>
          </PanelGroup>
        ) : (
          <PresenterSlide
            currentSlide={currentSlide}
            presentation={presentation}
            layout={layout}
          />
        )}

        {/* Artifact sidebar — only when artifacts exist */}
        {hasAnyArtifact && (
          <div className="flex flex-col items-center py-2 gap-1 bg-gray-900 border-l border-gray-800 w-9 flex-shrink-0">
            {hasCode && (
              <button
                onClick={() => setActiveArtifact(activeArtifact === 'code' ? null : 'code')}
                className={`w-7 h-7 rounded flex items-center justify-center text-[9px] transition-colors ${
                  activeArtifact === 'code' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title="Code"
              >{ '{ }' }</button>
            )}
            {hasVideo && (
              <button
                onClick={() => setActiveArtifact(activeArtifact === 'video' ? null : 'video')}
                className={`w-7 h-7 rounded flex items-center justify-center text-[9px] transition-colors ${
                  activeArtifact === 'video' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title="Video"
              >▶</button>
            )}
            {hasWebApp && (
              <button
                onClick={() => setActiveArtifact(activeArtifact === 'webapp' ? null : 'webapp')}
                className={`w-7 h-7 rounded flex items-center justify-center text-[9px] transition-colors ${
                  activeArtifact === 'webapp' ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title="Web"
              >◎</button>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="h-10 bg-gray-900 border-t border-gray-800 flex items-center px-4 gap-3 flex-shrink-0">
        <button onClick={prevSlide} disabled={currentSlideIndex === 0}
          className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-white text-xs font-mono font-semibold min-w-[50px] text-center">
          {currentSlideIndex + 1} / {slides.length}
        </span>
        <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}
          className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
          <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="w-px h-5 bg-gray-800" />
        <span className="text-gray-600 text-[11px] truncate flex-1">{presentation?.title}</span>
        <button onClick={endPresentation}
          className="px-3 py-1 text-[11px] bg-gray-800 hover:bg-red-500 text-gray-400 hover:text-white rounded transition-colors">
          End (Esc)
        </button>
      </div>
    </div>
  )
}

/** Self-contained slide canvas with its own ResizeObserver */
function PresenterSlide({ currentSlide, presentation, layout }: {
  currentSlide: any; presentation: any; layout?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)
  const [contentScale, setContentScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD = 48
  const CONTENT_H = SLIDE_H - PAD * 2

  // Scale canvas to fit container
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const s = Math.min(cw / SLIDE_W, ch / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Scale content if it overflows
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => {
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      const natural = el.scrollHeight
      setContentScale(natural > CONTENT_H ? Math.max(0.3, CONTENT_H / natural) : 1)
    }
    measure()
    const t = setTimeout(measure, 500)
    return () => clearTimeout(t)
  }, [currentSlide?.markdownContent])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center bg-gray-950 overflow-hidden">
      <div
        className="relative"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0
        }}
      >
        <div className="absolute inset-0 bg-gray-950" />
        <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div
            ref={contentRef}
            style={{
              width: layout === 'blank' ? SLIDE_W : SLIDE_W - PAD * 2,
              transform: `scale(${contentScale})`,
              transformOrigin: 'top left'
            }}
          >
            {currentSlide && (
              <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
