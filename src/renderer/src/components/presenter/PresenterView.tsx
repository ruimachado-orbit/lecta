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
  useKeyboardShortcuts()

  const [activeArtifact, setActiveArtifact] = useState<ArtifactType | null>(null)

  const currentSlide = slides[currentSlideIndex]
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const isMarkdown = currentSlide?.config.code?.language === 'markdown'
  const layout = currentSlide?.config.layout
  const hasAnyArtifact = hasCode || hasVideo || hasWebApp

  // Force dark theme while presenting, restore on exit
  useEffect(() => {
    const prevTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    document.documentElement.setAttribute('data-theme', 'dark')
    return () => {
      const t = useUIStore.getState().theme
      document.documentElement.setAttribute('data-theme', t || prevTheme)
    }
  }, [])

  useEffect(() => { setActiveArtifact(null) }, [currentSlideIndex])

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  const slideMarkdown = currentSlide?.markdownContent ?? ''
  const rootPath = presentation?.rootPath

  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* Main area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {activeArtifact ? (
          <PanelGroup direction="horizontal" className="flex-1 min-w-0">
            <Panel defaultSize={66} minSize={30}>
              <PresenterSlide markdown={slideMarkdown} rootPath={rootPath} layout={layout} />
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors" />
            <Panel defaultSize={34} minSize={15}>
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
          <div className="flex flex-col items-center py-2 gap-1 w-9 flex-shrink-0" style={{ background: '#111827', borderLeft: '1px solid #1f2937' }}>
            {hasCode && (
              <SidebarBtn active={activeArtifact === 'code'} onClick={() => setActiveArtifact(activeArtifact === 'code' ? null : 'code')} title="Code">{'{ }'}</SidebarBtn>
            )}
            {hasVideo && (
              <SidebarBtn active={activeArtifact === 'video'} onClick={() => setActiveArtifact(activeArtifact === 'video' ? null : 'video')} title="Video">▶</SidebarBtn>
            )}
            {hasWebApp && (
              <SidebarBtn active={activeArtifact === 'webapp'} onClick={() => setActiveArtifact(activeArtifact === 'webapp' ? null : 'webapp')} title="Web">◎</SidebarBtn>
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
        <button onClick={() => setPresenting(false)}
          className="px-3 py-1 text-[11px] bg-gray-800 hover:bg-red-500 text-gray-400 hover:text-white rounded transition-colors">
          End (Esc)
        </button>
      </div>
    </div>
  )
}

/** 16:9 slide canvas — identical pattern to SlidePanel's SlideCanvas */
function PresenterSlide({ markdown, rootPath, layout }: {
  markdown: string; rootPath?: string; layout?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)
  const [contentScale, setContentScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD = 48
  const CONTENT_H = SLIDE_H - PAD * 2

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateScale = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (cw > 0 && ch > 0) {
        const margin = 16
        setCanvasScale(Math.min((cw - margin * 2) / SLIDE_W, (ch - margin * 2) / SLIDE_H))
      }
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

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
  }, [markdown])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center overflow-hidden" style={{ background: '#262626' }}>
      <div
        className="relative rounded overflow-hidden"
        style={{
          width: SLIDE_W, height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.6), 0 0 80px rgba(0,0,0,0.4)'
        }}
      >
        <div className="absolute inset-0 rounded" style={{ background: '#000' }} />
        <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div
            ref={contentRef}
            style={{
              width: layout === 'blank' ? SLIDE_W : SLIDE_W - PAD * 2,
              height: layout === 'blank' ? SLIDE_H : undefined,
              transform: `scale(${contentScale})`,
              transformOrigin: 'top left'
            }}
          >
            <SlideRenderer markdown={markdown} rootPath={rootPath} />
          </div>
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
