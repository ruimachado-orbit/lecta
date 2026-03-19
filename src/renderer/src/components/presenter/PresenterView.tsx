import { useState, useEffect, useRef } from 'react'
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
  // keyboard shortcuts already handled by AppShell

  const [activeArtifact, setActiveArtifact] = useState<ArtifactType | null>(null)
  const [artifactExpanded, setArtifactExpanded] = useState(false)
  const [panelSize, setPanelSize] = useState(34)
  const artifactMemory = useRef<Record<number, { type: ArtifactType; expanded: boolean; panelSize: number }>>({})
  const typeSizeMemory = useRef<Record<ArtifactType, number>>({ code: 34, video: 34, webapp: 34 })

  // Save artifact state before slide change, restore on return
  const prevSlideRef = useRef(currentSlideIndex)
  const [timer, setTimer] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const [showNotes, setShowNotes] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  }

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const isMarkdown = currentSlide?.config.code?.language === 'markdown'
  const layout = currentSlide?.config.layout
  const hasAnyArtifact = hasCode || hasVideo || hasWebApp

  useEffect(() => {
    // Save current artifact state for the slide we're leaving
    const prev = prevSlideRef.current
    if (activeArtifact) {
      artifactMemory.current[prev] = { type: activeArtifact, expanded: artifactExpanded, panelSize }
      typeSizeMemory.current[activeArtifact] = panelSize
    } else {
      delete artifactMemory.current[prev]
    }
    prevSlideRef.current = currentSlideIndex

    // Restore artifact state if we've been on this slide before
    const saved = artifactMemory.current[currentSlideIndex]
    if (saved) {
      setActiveArtifact(saved.type)
      setArtifactExpanded(saved.expanded)
      setPanelSize(saved.panelSize)
    } else {
      setActiveArtifact(null)
      setArtifactExpanded(false)
    }
  }, [currentSlideIndex])

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  const slideMarkdown = currentSlide?.markdownContent ?? ''
  const rootPath = presentation?.rootPath

  // Find the current slide's group
  const { slideGroups } = useUIStore.getState()
  const currentGroup = currentSlide
    ? slideGroups.find((g) => g.slideIds.includes(currentSlide.config.id))
    : null
  const groupSlideIndex = currentGroup
    ? currentGroup.slideIds.indexOf(currentSlide?.config.id ?? '') + 1
    : 0

  return (
    <div className="h-screen w-screen flex flex-col bg-black">
      {/* Top bar — spans full width for consistent background */}
      <div className="h-10 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-center px-20 gap-3"
           style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={prevSlide} disabled={currentSlideIndex === 0}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-white text-xs font-mono font-semibold min-w-[40px] text-center">
            {currentSlideIndex + 1}/{slides.length}
          </span>
          <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        {/* Group label */}
        {currentGroup && (
          <div className="flex items-center gap-2 px-3 py-1 bg-white rounded-full">
            <span className="text-xs text-black font-semibold">{currentGroup.name}</span>
            <span className="text-xs text-gray-500 font-medium">{groupSlideIndex}/{currentGroup.slideIds.length}</span>
          </div>
        )}
        <span className="text-gray-500 text-xs truncate flex-1">{presentation?.title}</span>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => setShowNotes(!showNotes)}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${showNotes ? 'bg-white text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
            Notes
          </button>
          <button onClick={() => setTimerRunning(!timerRunning)}
            className="text-xs font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-300">
            {formatTime(timer)}
          </button>
          <button onClick={() => {
            setPresenting(false)
            window.electronAPI.closeAudienceWindow()
            const t = useUIStore.getState().theme
            document.documentElement.setAttribute('data-theme', t)
          }}
            className="px-3 py-1 text-xs bg-red-500 hover:bg-red-400 text-white rounded font-medium">
            End
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeArtifact && artifactExpanded ? (
          /* Artifact expanded to full width */
          <div className="flex-1 min-w-0">
            <ArtifactPanel
              activeArtifact={activeArtifact}
              currentSlide={currentSlide}
              presentation={presentation}
              isExecuting={isExecuting}
              isMarkdown={!!isMarkdown}
              onRun={handleRun}
              onCancel={cancelCode}
            />
          </div>
        ) : activeArtifact ? (
          <PanelGroup direction="horizontal" className="flex-1 min-w-0"
            onLayout={(sizes) => { if (sizes[1] !== undefined) setPanelSize(sizes[1]) }}>
            <Panel defaultSize={100 - panelSize} minSize={30}>
              <PresenterSlide markdown={slideMarkdown} rootPath={rootPath} layout={layout} />
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors" />
            <Panel defaultSize={panelSize} minSize={15}>
              <ArtifactPanel
                activeArtifact={activeArtifact}
                currentSlide={currentSlide}
                presentation={presentation}
                isExecuting={isExecuting}
                isMarkdown={!!isMarkdown}
                onRun={handleRun}
                onCancel={cancelCode}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <PresenterSlide markdown={slideMarkdown} rootPath={rootPath} layout={layout} />
        )}

        {/* Artifact sidebar */}
        {hasAnyArtifact && (
          <div className="flex flex-col items-center py-2 gap-1 w-9 flex-shrink-0 bg-gray-900 border-l border-gray-800">
            {hasCode && (
              <SidebarBtn active={activeArtifact === 'code'} onClick={() => {
                const opening = activeArtifact !== 'code'
                setActiveArtifact(opening ? 'code' : null); setArtifactExpanded(false)
                if (opening) setPanelSize(typeSizeMemory.current.code)
              }} title="Code">{'{ }'}</SidebarBtn>
            )}
            {hasVideo && (
              <SidebarBtn active={activeArtifact === 'video'} onClick={() => {
                const opening = activeArtifact !== 'video'
                setActiveArtifact(opening ? 'video' : null); setArtifactExpanded(false)
                if (opening) setPanelSize(typeSizeMemory.current.video)
              }} title="Video">▶</SidebarBtn>
            )}
            {hasWebApp && (
              <SidebarBtn active={activeArtifact === 'webapp'} onClick={() => {
                const opening = activeArtifact !== 'webapp'
                setActiveArtifact(opening ? 'webapp' : null); setArtifactExpanded(false)
                if (opening) setPanelSize(typeSizeMemory.current.webapp)
              }} title="Web">◎</SidebarBtn>
            )}

            {/* Expand / collapse artifact panel */}
            {activeArtifact && (
              <>
                <div className="w-5 h-px bg-gray-700" />
                <SidebarBtn
                  active={artifactExpanded}
                  onClick={() => setArtifactExpanded(!artifactExpanded)}
                  title={artifactExpanded ? 'Split view' : 'Expand artifact'}
                >
                  {artifactExpanded ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  )}
                </SidebarBtn>
              </>
            )}
          </div>
        )}
      </div>

      {/* Speaker notes panel */}
      {showNotes && (
        <div className="h-36 flex-shrink-0 bg-gray-900 border-t border-gray-800 overflow-y-auto px-6 py-3">
          {currentSlide?.notesContent ? (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{currentSlide.notesContent}</p>
          ) : (
            <p className="text-gray-600 text-sm italic">No notes for this slide</p>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="h-10 flex items-center px-4 gap-3 flex-shrink-0 bg-gray-900 border-t border-gray-800">
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
        <button onClick={() => setPresenting(false)}
          className="px-3 py-1 text-[11px] bg-gray-800 hover:bg-red-500 text-gray-400 hover:text-white rounded transition-colors">
          End (Esc)
        </button>
      </div>
    </div>
  )
}

/** Fullscreen slide — fills the entire container, no borders */
function PresenterSlide({ markdown, rootPath, layout }: {
  markdown: string; rootPath?: string; layout?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentScale, setContentScale] = useState(1)
  const [containerH, setContainerH] = useState(0)

  // Track container height for content scaling
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => setContainerH(container.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const PAD = 48
  const availH = containerH - PAD * 2

  // Scale content down if it overflows the available height
  useEffect(() => {
    const el = contentRef.current
    if (!el || availH <= 0) return
    const measure = () => {
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      const natural = el.scrollHeight
      setContentScale(natural > availH ? Math.max(0.3, availH / natural) : 1)
    }
    measure()
    const t = setTimeout(measure, 500)
    return () => clearTimeout(t)
  }, [markdown, availH])

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-black relative">
      <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
        <div
          ref={contentRef}
          style={{
            transform: `scale(${contentScale})`,
            transformOrigin: 'top left'
          }}
        >
          <SlideRenderer markdown={markdown} rootPath={rootPath} />
        </div>
      </div>
    </div>
  )
}

function ArtifactPanel({ activeArtifact, currentSlide, presentation, isExecuting, isMarkdown, onRun, onCancel }: {
  activeArtifact: ArtifactType; currentSlide: any; presentation: any
  isExecuting: boolean; isMarkdown: boolean; onRun: () => void; onCancel: () => void
}): JSX.Element {
  const idx = usePresentationStore((s) => s.currentSlideIndex)
  if (activeArtifact === 'code' && currentSlide?.config.code) {
    return (
      <div className="h-full flex flex-col bg-gray-950">
        <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 flex-shrink-0">
          <span className="text-gray-500 text-[10px] font-mono flex-1 truncate">{currentSlide.config.code.file}</span>
          <span className="text-[9px] uppercase px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">{currentSlide.config.code.language}</span>
          {isExecuting ? (
            <button onClick={onCancel} className="px-2 py-0.5 bg-red-500 hover:bg-red-400 text-white text-[10px] rounded">Stop</button>
          ) : (
            <button onClick={onRun} className="px-2 py-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] rounded">Run</button>
          )}
        </div>
        <PanelGroup direction="vertical" className="flex-1">
          <Panel defaultSize={55} minSize={20}><CodeEditor /></Panel>
          <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-indigo-500" />
          <Panel defaultSize={45} minSize={10}>
            {isMarkdown ? <MarkdownPreview content={currentSlide.codeContent ?? ''} rootPath={presentation?.rootPath} /> : <ExecutionOutput />}
          </Panel>
        </PanelGroup>
      </div>
    )
  }
  if (activeArtifact === 'video' && currentSlide?.config.video) {
    return <div className="h-full bg-gray-950"><VideoPanel key={idx} video={currentSlide.config.video} /></div>
  }
  if (activeArtifact === 'webapp' && currentSlide?.config.webapp) {
    return <div className="h-full bg-gray-950"><WebPanel key={idx} webapp={currentSlide.config.webapp} /></div>
  }
  return <div className="h-full bg-gray-950" />
}

function SidebarBtn({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}): JSX.Element {
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 rounded flex items-center justify-center text-[9px] transition-colors ${
        active ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
    >{children}</button>
  )
}
