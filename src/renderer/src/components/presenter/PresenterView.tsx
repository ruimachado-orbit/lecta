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

const BOTTOM_BAR_H = 40

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
  const sidebarW = hasAnyArtifact ? 36 : 0

  useEffect(() => { setActiveArtifact(null) }, [currentSlideIndex])
  useEffect(() => { window.electronAPI.syncPresenterSlide(currentSlideIndex) }, [currentSlideIndex])

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
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0a' }}>
      {/* Main area */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {activeArtifact ? (
          <PanelGroup direction="horizontal" style={{ flex: 1, minWidth: 0 }}>
            <Panel defaultSize={66} minSize={30}>
              <PresenterSlide
                markdown={currentSlide?.markdownContent ?? ''}
                rootPath={presentation?.rootPath}
                layout={layout}
              />
            </Panel>
            <PanelResizeHandle style={{ width: 6, background: '#1f2937', cursor: 'col-resize' }} />
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
          <div style={{ flex: 1, minWidth: 0 }}>
            <PresenterSlide
              markdown={currentSlide?.markdownContent ?? ''}
              rootPath={presentation?.rootPath}
              layout={layout}
            />
          </div>
        )}

        {/* Artifact sidebar */}
        {hasAnyArtifact && (
          <div style={{
            width: sidebarW, flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, paddingTop: 8, paddingBottom: 8,
            background: '#111827', borderLeft: '1px solid #1f2937'
          }}>
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
      <div style={{
        height: BOTTOM_BAR_H, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        background: '#111827', borderTop: '1px solid #1f2937'
      }}>
        <button onClick={prevSlide} disabled={currentSlideIndex === 0}
          style={{ padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', opacity: currentSlideIndex === 0 ? 0.3 : 1 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#d1d5db">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span style={{ color: '#fff', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, minWidth: 50, textAlign: 'center' }}>
          {currentSlideIndex + 1} / {slides.length}
        </span>
        <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}
          style={{ padding: 4, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', opacity: currentSlideIndex === slides.length - 1 ? 0.3 : 1 }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#d1d5db">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div style={{ width: 1, height: 20, background: '#1f2937' }} />
        <span style={{ color: '#4b5563', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {presentation?.title}
        </span>
        <button onClick={endPresentation}
          style={{
            padding: '4px 12px', fontSize: 11, borderRadius: 4,
            background: '#1f2937', color: '#9ca3af', border: 'none', cursor: 'pointer'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1f2937'; e.currentTarget.style.color = '#9ca3af' }}
        >
          End (Esc)
        </button>
      </div>
    </div>
  )
}

/** Slide canvas — uses viewport-relative sizing to guarantee correct scaling */
function PresenterSlide({ markdown, rootPath, layout }: {
  markdown: string; rootPath?: string; layout?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [contentScale, setContentScale] = useState(1)

  const W = 1280
  const H = 720
  const PAD = 48
  const CH = H - PAD * 2

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const cw = el.clientWidth || el.offsetWidth || window.innerWidth
      const ch = el.clientHeight || el.offsetHeight || window.innerHeight
      if (cw > 0 && ch > 0) {
        setScale(Math.min(cw / W, ch / H))
      }
    }
    // Delay initial measurement to ensure layout is complete
    requestAnimationFrame(update)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const m = () => {
      el.style.transform = 'scale(1)'
      el.style.transformOrigin = 'top left'
      const h = el.scrollHeight
      setContentScale(h > CH ? Math.max(0.3, CH / h) : 1)
    }
    m()
    const t = setTimeout(m, 400)
    return () => clearTimeout(t)
  }, [markdown])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%',
        overflow: 'hidden', background: '#0a0a0a'
      }}
    >
      <div style={{
        width: W, height: H,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        position: 'absolute',
        left: '50%', top: '50%',
        marginLeft: -W / 2, marginTop: -H / 2,
        borderRadius: 4, overflow: 'hidden'
      }}>
        {/* Slide background */}
        <div style={{ position: 'absolute', inset: 0, background: '#000', borderRadius: 4 }} />
        {/* Content wrapper with layout */}
        <div
          className={layout && layout !== 'default' ? `slide-layout-${layout}` : ''}
          style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            padding: layout === 'blank' ? 0 : PAD
          }}
        >
          <div
            ref={contentRef}
            style={{
              width: layout === 'blank' ? W : W - PAD * 2,
              height: layout === 'blank' ? H : undefined,
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
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: 4, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, transition: 'all 0.15s',
        background: active ? '#fff' : 'transparent',
        color: active ? '#000' : '#6b7280'
      }}
    >{children}</button>
  )
}
