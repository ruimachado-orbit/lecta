import { useEffect, useCallback, useRef, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { ContentRenderer } from '../slides/ContentRenderer'
import { VideoPanel } from '../video/VideoPanel'
import Editor from '@monaco-editor/react'

/**
 * Set slide index directly WITHOUT triggering IPC sync back to the presenter.
 */
function setSlideIndexSilently(index: number): void {
  const { slides, presentation } = usePresentationStore.getState()
  if (index >= 0 && index < slides.length) {
    usePresentationStore.setState({
      currentSlideIndex: index,
      currentSubSlide: 0,
      clickStep: 0,
      ...(presentation ? { presentation: { ...presentation, lastViewedIndex: index } } : {})
    })
  }
}

/**
 * Audience-facing view: renders the same slide and artifact components as the presenter.
 * All state synced live via IPC from the presenter window.
 */
export function AudienceView(): JSX.Element {
  const { slides, currentSlideIndex, presentation, loadPresentation } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [activeArtifact, setActiveArtifact] = useState<string | null>(null)
  const [executionOutput, setExecutionOutput] = useState('')
  const [liveCode, setLiveCode] = useState<string | null>(null)
  const [artifactFrame, setArtifactFrame] = useState<string | null>(null) // for webapp screenshot stream
  const [mousePos, setMousePos] = useState<{ x: number; y: number; area: string } | null>(null)
  const mouseFadeRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Listen for presentation path
  useEffect(() => {
    window.electronAPI.onPresenterLoadPath(async (rootPath: string) => {
      await loadPresentation(rootPath)
    })
    return () => { window.electronAPI.removeAllListeners('presenter:load-path') }
  }, [loadPresentation])

  // Listen for slide sync
  useEffect(() => {
    window.electronAPI.onPresenterSync((slideIndex: number) => {
      setSlideIndexSilently(slideIndex)
      // Reset live code when slide changes — will be re-synced
      setLiveCode(null)
      setExecutionOutput('')
    })
    return () => { window.electronAPI.removeAllListeners('presenter:sync-slide') }
  }, [])

  // Listen for artifact sync
  useEffect(() => {
    window.electronAPI.onPresenterArtifactSync((artifact: string | null) => {
      setActiveArtifact(artifact)
      if (!artifact || artifact !== 'webapp') setArtifactFrame(null)
    })
    return () => { window.electronAPI.removeAllListeners('presenter:sync-artifact') }
  }, [])

  // Listen for webapp screenshot frames (webapp artifacts are streamed as images)
  useEffect(() => {
    if (typeof window.electronAPI.onPresenterArtifactFrame === 'function') {
      window.electronAPI.onPresenterArtifactFrame((base64: string) => {
        setArtifactFrame(`data:image/png;base64,${base64}`)
      })
      return () => { window.electronAPI.removeAllListeners('presenter:artifact-frame') }
    }
  }, [])

  // Listen for execution output sync
  useEffect(() => {
    if (typeof window.electronAPI.onPresenterExecutionSync === 'function') {
      window.electronAPI.onPresenterExecutionSync((output: string) => {
        setExecutionOutput(output)
      })
      return () => { window.electronAPI.removeAllListeners('presenter:sync-execution') }
    }
  }, [])

  // Listen for code content sync
  useEffect(() => {
    if (typeof window.electronAPI.onPresenterCodeSync === 'function') {
      window.electronAPI.onPresenterCodeSync((code: string) => {
        setLiveCode(code)
      })
      return () => { window.electronAPI.removeAllListeners('presenter:sync-code') }
    }
  }, [])

  // Listen for mouse position sync
  useEffect(() => {
    window.electronAPI.onPresenterMouseSync((pos: { x: number; y: number; area: string } | null) => {
      setMousePos(pos)
      if (mouseFadeRef.current) clearTimeout(mouseFadeRef.current)
      if (pos) {
        mouseFadeRef.current = setTimeout(() => setMousePos(null), 3000)
      }
    })
    return () => {
      window.electronAPI.removeAllListeners('presenter:sync-mouse')
      if (mouseFadeRef.current) clearTimeout(mouseFadeRef.current)
    }
  }, [])

  // Keyboard: only Escape to close
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') window.close()
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!currentSlide) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-gray-600 text-lg">
        Loading presentation...
      </div>
    )
  }

  const showCode = activeArtifact === 'code' && !!currentSlide.config.code
  const showVideo = activeArtifact === 'video' && !!currentSlide.config.video
  const showWebApp = activeArtifact === 'webapp' && !!currentSlide.config.webapp
  const hasArtifactToShow = showCode || showVideo || showWebApp
  const codeToDisplay = liveCode ?? currentSlide.codeContent ?? ''
  const codeLanguage = currentSlide.config.code?.language ?? 'plaintext'

  return (
    <div className="h-screen w-screen overflow-hidden flex" style={{ background: '#000' }}>
      {/* Slide area */}
      <div className={`relative flex items-center justify-center ${hasArtifactToShow ? 'w-1/2' : 'w-full'}`}>
        <AudienceSlide
          markdown={currentSlide.markdownContent}
          rootPath={presentation?.rootPath}
          layout={currentSlide.config.layout}
          theme={presentation?.theme || 'dark'}
          mousePos={mousePos?.area === 'slide' ? mousePos : null}
          isMdx={currentSlide.isMdx}
        />
      </div>

      {/* Artifact area — renders live, matching the presenter */}
      {hasArtifactToShow && (
        <div className="w-1/2 h-full border-l border-gray-800 relative bg-gray-950 flex flex-col">
          {showCode && (
            <PanelGroup direction="vertical" className="flex-1">
              <Panel defaultSize={executionOutput ? 55 : 100} minSize={20}>
                <div className="h-full flex flex-col">
                  <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2 flex-shrink-0">
                    <span className="text-gray-500 text-[10px] font-mono flex-1 truncate">{currentSlide.config.code!.file}</span>
                    <span className="text-[9px] uppercase px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">{codeLanguage}</span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <Editor
                      height="100%"
                      language={codeLanguage === 'typescript' ? 'typescript' : codeLanguage === 'python' ? 'python' : codeLanguage === 'javascript' ? 'javascript' : codeLanguage}
                      value={codeToDisplay}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        fontSize: 14,
                        lineHeight: 20,
                        fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 12, bottom: 12 },
                        lineNumbers: 'on',
                        renderLineHighlight: 'none',
                        wordWrap: 'on',
                        automaticLayout: true,
                        domReadOnly: true,
                        cursorStyle: 'line-thin',
                        scrollbar: { vertical: 'auto', horizontal: 'auto' }
                      }}
                    />
                  </div>
                </div>
              </Panel>
              {executionOutput && (
                <>
                  <PanelResizeHandle className="h-1 bg-gray-800 hover:bg-indigo-500 transition-colors" />
                  <Panel defaultSize={45} minSize={10}>
                    <div className="h-full flex flex-col bg-gray-950">
                      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-3 flex-shrink-0">
                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Output</span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto p-3">
                        <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">{executionOutput}</pre>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          )}
          {showVideo && (
            <div className="h-full bg-black">
              <VideoPanel video={currentSlide.config.video!} />
            </div>
          )}
          {showWebApp && (
            <div className="h-full flex items-center justify-center">
              {artifactFrame ? (
                <img src={artifactFrame} alt="Presenter web app" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-gray-600 text-sm">Loading web app...</div>
              )}
            </div>
          )}
          {mousePos && mousePos.area === 'artifact' && <RemoteCursor x={mousePos.x} y={mousePos.y} />}
        </div>
      )}
    </div>
  )
}

/** Audience slide canvas — matches editor rendering exactly */
function AudienceSlide({ markdown, rootPath, layout, theme, mousePos, isMdx }: {
  markdown: string; rootPath?: string; layout?: string; theme?: string
  mousePos: { x: number; y: number } | null; isMdx?: boolean
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD_H = 80

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const margin = 8
      const s = Math.min((cw - margin * 2) / SLIDE_W, (ch - margin * 2) / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center overflow-hidden">
      <div
        className="relative overflow-hidden"
        data-slide-theme={theme || 'dark'}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--slide-bg)' }} />
        <div className={`absolute inset-0 ${layout === 'blank' || isMdx ? '' : 'slide-pad'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div style={{
            width: layout === 'blank' || isMdx ? SLIDE_W : SLIDE_W - PAD_H * 2,
            height: layout === 'blank' || isMdx ? SLIDE_H : undefined,
          }}>
            <ContentRenderer markdown={markdown} rootPath={rootPath} isMdx={isMdx} />
          </div>
        </div>
        {mousePos && <RemoteCursor x={mousePos.x} y={mousePos.y} />}
      </div>
    </div>
  )
}

/** Renders a red laser-pointer-style cursor at relative position */
function RemoteCursor({ x, y }: { x: number; y: number }): JSX.Element {
  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="absolute -inset-3 rounded-full bg-red-500/20 animate-pulse" />
      <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50 border border-red-400" />
    </div>
  )
}
