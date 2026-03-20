import { useState, useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { SlideRenderer } from '../slides/SlideRenderer'
import { CodeEditor } from '../code/CodeEditor'
import { ExecutionOutput } from '../code/ExecutionOutput'
import { MarkdownPreview } from '../code/MarkdownPreview'
import { WebPanel } from '../web/WebPanel'
import { VideoPanel } from '../video/VideoPanel'
import { PromptPanel } from '../prompt/PromptPanel'
import { useSubSlides } from '../../hooks/useSubSlides'

type ArtifactType = 'code' | 'video' | 'webapp' | 'prompt' | 'artifact'

export function PresenterView(): JSX.Element {
  const { slides, currentSlideIndex, nextSlide, prevSlide, presentation } =
    usePresentationStore()
  const { setPresenting } = useUIStore()
  const { isExecuting, output: executionOutput } = useExecutionStore()
  const { runCode, cancelCode } = useCodeExecution()

  // Force dark theme for presenter view
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark')
  }, [])

  // Expose slide state for remote control
  useEffect(() => {
    (window as any).__lectaSlideState = { current: currentSlideIndex + 1, total: slides.length }
    ;(window as any).__lectaRemoteAction = (action: string) => {
      if (action === 'next') nextSlide()
      else if (action === 'prev') prevSlide()
    }
    return () => {
      delete (window as any).__lectaSlideState
      delete (window as any).__lectaRemoteAction
    }
  }, [currentSlideIndex, slides.length, nextSlide, prevSlide])

  const [activeArtifact, setActiveArtifact] = useState<ArtifactType | null>(null)
  const [artifactExpanded, setArtifactExpanded] = useState(false)
  const [panelSize, setPanelSize] = useState(34)
  const artifactMemory = useRef<Record<number, { type: ArtifactType; expanded: boolean; panelSize: number }>>({})
  const typeSizeMemory = useRef<Record<string, number>>({ code: 34, video: 34, webapp: 34, prompt: 34, artifact: 34 })

  // Save artifact state before slide change, restore on return
  const prevSlideRef = useRef(currentSlideIndex)
  const [timer, setTimer] = useState(0)
  const [timerRunning, setTimerRunning] = useState(true)
  const [audienceOpen, setAudienceOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)

  // Listen for audience window being closed externally
  useEffect(() => {
    if (typeof window.electronAPI.onPresenterAudienceClosed === 'function') {
      window.electronAPI.onPresenterAudienceClosed(() => {
        setAudienceOpen(false)
      })
      return () => {
        window.electronAPI.removeAllListeners('presenter:audience-closed')
      }
    }
  }, [])

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
  const nextSlideData = slides[currentSlideIndex + 1] ?? null
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const hasPrompts = (currentSlide?.config.prompts?.length ?? 0) > 0
  const hasArtifacts = (currentSlide?.config.artifacts?.length ?? 0) > 0
  const isMarkdown = currentSlide?.config.code?.language === 'markdown'
  const layout = currentSlide?.config.layout
  const hasAnyArtifact = hasCode || hasVideo || hasWebApp || hasPrompts || hasArtifacts

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

  // Sync artifact state to audience window
  useEffect(() => {
    window.electronAPI.syncPresenterArtifact(activeArtifact)
  }, [activeArtifact])

  // Sync execution output to audience window
  useEffect(() => {
    if (typeof window.electronAPI.syncPresenterExecution === 'function') {
      window.electronAPI.syncPresenterExecution(executionOutput)
    }
  }, [executionOutput])

  // Sync code content changes to audience window
  const codeContent = currentSlide?.codeContent ?? ''
  useEffect(() => {
    if (typeof window.electronAPI.syncPresenterCode === 'function') {
      window.electronAPI.syncPresenterCode(codeContent)
    }
  }, [codeContent])

  // Mouse tracking — send relative position to audience window
  const mainAreaRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = mainAreaRef.current
    if (!el) return
    let throttle: ReturnType<typeof setTimeout> | null = null
    const onMove = (e: MouseEvent) => {
      if (throttle) return
      throttle = setTimeout(() => { throttle = null }, 50) // 20fps
      const rect = el.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        window.electronAPI.syncPresenterMouse({ x, y, area: activeArtifact ? 'artifact' : 'slide' })
      }
    }
    const onLeave = () => {
      window.electronAPI.syncPresenterMouse(null)
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [activeArtifact])

  // Sub-slides
  const { subSlides, currentSubSlide } = useSubSlides(
    currentSlide?.markdownContent ?? '',
    currentSlideIndex
  )
  const activeMarkdown = subSlides[currentSubSlide]?.markdown ?? currentSlide?.markdownContent ?? ''

  const handleRun = () => {
    if (currentSlide?.codeContent && currentSlide.config.code) {
      runCode(currentSlide.codeContent, currentSlide.config.code)
    }
  }

  const slideMarkdown = activeMarkdown
  const rootPath = presentation?.rootPath

  // Find the current slide's group
  const { slideGroups } = useUIStore.getState()
  const currentGroup = currentSlide
    ? slideGroups.find((g) => g.slideIds.includes(currentSlide.config.id))
    : null
  const groupSlideIndex = currentGroup
    ? currentGroup.slideIds.indexOf(currentSlide?.config.id ?? '') + 1
    : 0

  // Open audience window
  const openAudience = async () => {
    if (presentation?.rootPath) {
      window.electronAPI.sendPresenterPath(presentation.rootPath)
    }
    await window.electronAPI.openAudienceWindow()
    // Sync current state after the audience window loads
    setTimeout(() => {
      window.electronAPI.syncPresenterSlide(currentSlideIndex)
      window.electronAPI.syncPresenterArtifact(activeArtifact)
    }, 800)
    setAudienceOpen(true)
  }

  const closeAudience = async () => {
    await window.electronAPI.closeAudienceWindow()
    setAudienceOpen(false)
  }

  const endPresentation = () => {
    setPresenting(false)
    window.electronAPI.closeAudienceWindow()
    const t = useUIStore.getState().theme
    document.documentElement.setAttribute('data-theme', t)
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-black">
      {/* Top bar */}
      <div className="h-10 flex-shrink-0 bg-gray-900 border-b border-gray-800 flex items-center pl-20 pr-4 gap-3"
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
          {subSlides.length > 1 && (
            <div className="flex items-center gap-1 ml-1">
              {subSlides.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === currentSubSlide ? 'bg-white' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
          )}
          <button onClick={nextSlide} disabled={currentSlideIndex === slides.length - 1}
            className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 transition-colors">
            <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        {currentGroup && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full"
               style={{ backgroundColor: currentGroup.color || '#374151' }}>
            <span className="text-xs text-white font-semibold">{currentGroup.name}</span>
            <span className="text-xs text-white/60 font-medium">{groupSlideIndex}/{currentGroup.slideIds.length}</span>
          </div>
        )}

        <span className="text-gray-500 text-xs truncate flex-1">{presentation?.title}</span>

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* Audience window toggle */}
          <button onClick={audienceOpen ? closeAudience : openAudience}
            className={`px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1.5 ${
              audienceOpen ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
            title={audienceOpen ? 'Close audience window' : 'Open audience window on external display'}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
            </svg>
            {audienceOpen ? 'Audience On' : 'Audience'}
          </button>
          <RemoteControlButton />
          <button onClick={endPresentation}
            className="px-3 py-1 text-xs bg-red-500 hover:bg-red-400 text-white rounded font-medium transition-colors">
            End
          </button>
        </div>
      </div>

      {/* Main area */}
      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left column: slide + artifacts + speaker notes below */}
        <Panel defaultSize={78} minSize={40}>
        <PanelGroup direction="vertical" className="h-full">
          <Panel defaultSize={65} minSize={25}>
          {/* Slide + artifacts area — mouse tracked for audience cursor */}
          <div ref={mainAreaRef} className="h-full flex">
            {activeArtifact && artifactExpanded ? (
              <div className="flex-1 min-w-0" data-artifact-capture>
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
                onLayout={(sizes) => { if (sizes[1] !== undefined) { setPanelSize(sizes[1]); if (activeArtifact) typeSizeMemory.current[activeArtifact] = sizes[1] } }}>
                <Panel defaultSize={100 - panelSize} minSize={30}>
                  <PresenterSlide markdown={slideMarkdown} rootPath={rootPath} layout={layout} theme={presentation?.theme || 'dark'} />
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors" />
                <Panel defaultSize={panelSize} minSize={15} id="artifact-panel">
                  <div className="h-full" data-artifact-capture>
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
                </Panel>
              </PanelGroup>
            ) : (
              <PresenterSlide markdown={slideMarkdown} rootPath={rootPath} layout={layout} theme={presentation?.theme || 'dark'} />
            )}

            {/* Artifact sidebar */}
            {hasAnyArtifact && (
              <div className="flex flex-col items-center py-2 gap-1 w-9 flex-shrink-0 bg-gray-900 border-l border-gray-800">
                {hasCode && (
                  <SidebarBtn active={activeArtifact === 'code'} onClick={() => {
                    const opening = activeArtifact !== 'code'
                    setActiveArtifact(opening ? 'code' : null); setArtifactExpanded(false)
                    if (opening) setPanelSize(typeSizeMemory.current.code)
                  }} title="Code">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                    </svg>
                  </SidebarBtn>
                )}
                {hasVideo && (
                  <SidebarBtn active={activeArtifact === 'video'} onClick={() => {
                    const opening = activeArtifact !== 'video'
                    setActiveArtifact(opening ? 'video' : null); setArtifactExpanded(false)
                    if (opening) setPanelSize(typeSizeMemory.current.video)
                  }} title="Video">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  </SidebarBtn>
                )}
                {hasWebApp && (
                  <SidebarBtn active={activeArtifact === 'webapp'} onClick={() => {
                    const opening = activeArtifact !== 'webapp'
                    setActiveArtifact(opening ? 'webapp' : null); setArtifactExpanded(false)
                    if (opening) setPanelSize(typeSizeMemory.current.webapp)
                  }} title="Web">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                    </svg>
                  </SidebarBtn>
                )}
                {hasPrompts && (
                  <SidebarBtn active={activeArtifact === 'prompt'} onClick={() => {
                    const opening = activeArtifact !== 'prompt'
                    setActiveArtifact(opening ? 'prompt' : null); setArtifactExpanded(false)
                    if (opening) setPanelSize(typeSizeMemory.current.prompt)
                  }} title="AI Prompt">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                  </SidebarBtn>
                )}
                {hasArtifacts && (
                  <SidebarBtn active={activeArtifact === 'artifact'} onClick={() => {
                    const opening = activeArtifact !== 'artifact'
                    setActiveArtifact(opening ? 'artifact' : null); setArtifactExpanded(false)
                    if (opening) setPanelSize(typeSizeMemory.current.artifact)
                  }} title="Files">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </SidebarBtn>
                )}
                {activeArtifact && (
                  <>
                    <div className="w-5 h-px bg-gray-700 my-0.5" />
                    <SidebarBtn active={artifactExpanded} onClick={() => setArtifactExpanded(!artifactExpanded)}
                      title={artifactExpanded ? 'Split view' : 'Expand artifact'}>
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
                    {/* Close artifact */}
                    <SidebarBtn active={false} onClick={() => { setActiveArtifact(null); setArtifactExpanded(false) }}
                      title="Close artifact">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </SidebarBtn>
                  </>
                )}
              </div>
            )}
          </div>
          </Panel>
          <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-row-resize" />
          <Panel defaultSize={35} minSize={15}>
          {/* Speaker notes — below the slide, resizable, prominent and scrollable */}
          <div className="h-full flex flex-col bg-gray-950">
            <div className="px-4 py-2 flex items-center gap-2 flex-shrink-0 border-b border-gray-800/50">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Speaker Notes</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 pt-3">
              {currentSlide?.notesContent ? (
                <p className="text-gray-200 text-lg leading-relaxed whitespace-pre-wrap">{currentSlide.notesContent}</p>
              ) : (
                <p className="text-gray-600 text-sm italic">No notes for this slide</p>
              )}
            </div>
          </div>
          </Panel>
        </PanelGroup>
        </Panel>
        <PanelResizeHandle className="w-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-col-resize" />
        {/* Right panel: next slide preview + timer/clock — resizable */}
        <Panel defaultSize={22} minSize={15} maxSize={45}>
        <PanelGroup direction="vertical" className="h-full bg-gray-950">
          <Panel defaultSize={55} minSize={20}>
          {/* Next slide preview */}
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Next</span>
              {nextSlideData && (
                <span className="text-[10px] text-gray-600 font-mono">{currentSlideIndex + 2}/{slides.length}</span>
              )}
            </div>
            <div className="flex-1 min-h-0 px-3 pb-3 flex items-center justify-center">
              {nextSlideData ? (
                <MiniSlide
                  markdown={nextSlideData.markdownContent || ''}
                  rootPath={rootPath}
                  layout={nextSlideData.config.layout}
                  theme={presentation?.theme || 'dark'}
                />
              ) : (
                <div className="w-full aspect-video rounded bg-gray-900 flex items-center justify-center">
                  <span className="text-gray-600 text-xs">End of presentation</span>
                </div>
              )}
            </div>
          </div>
          </Panel>
          <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-row-resize" />
          <Panel defaultSize={25} minSize={10}>
          {/* Timer + clock */}
          <div className="h-full flex flex-col items-center justify-center px-4">
            <button
              onClick={() => setTimerRunning(!timerRunning)}
              className="text-white font-mono text-4xl font-bold tracking-wider hover:text-gray-300 transition-colors cursor-pointer"
              title={timerRunning ? 'Pause timer' : 'Resume timer'}
            >
              {formatTime(timer)}
            </button>
            <div className="text-gray-500 text-xs font-mono mt-2">
              <CurrentTime />
            </div>
            <button
              onClick={() => { setTimer(0); setTimerRunning(true) }}
              className="mt-2 text-[10px] text-gray-600 hover:text-gray-400 uppercase tracking-wider transition-colors"
            >
              Reset
            </button>
          </div>
          </Panel>
          <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-row-resize" />
          <Panel defaultSize={20} minSize={10}>
          {/* Presenter live notes */}
          <div className="h-full flex flex-col">
            <div className="px-3 py-1.5 flex items-center gap-2 flex-shrink-0 border-b border-gray-800/50">
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
              </svg>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Action Notes</span>
            </div>
            <PresenterLiveNotes />
          </div>
          </Panel>
        </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}

/** 16:9 slide canvas — centered in container, auto-scaled to match editor rendering */
function PresenterSlide({ markdown, rootPath, layout, theme }: {
  markdown: string; rootPath?: string; layout?: string; theme?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasScale, setCanvasScale] = useState(1)

  const SLIDE_W = 1280
  const SLIDE_H = 720
  const PAD = 48

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      const margin = 16
      const s = Math.min((cw - margin * 2) / SLIDE_W, (ch - margin * 2) / SLIDE_H)
      setCanvasScale(Math.max(0.05, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="h-full w-full flex items-center justify-center presenter-canvas-bg overflow-hidden">
      <div
        className="relative rounded overflow-hidden presenter-slide-frame"
        data-slide-theme={theme || 'dark'}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${canvasScale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        <div className="absolute inset-0 rounded" style={{ background: 'var(--slide-bg)' }} />
        <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div
            style={{
              width: layout === 'blank' ? SLIDE_W : SLIDE_W - PAD * 2,
              height: layout === 'blank' ? SLIDE_H : undefined,
            }}
          >
            <SlideRenderer
              markdown={markdown}
              rootPath={rootPath}
              clickStep={usePresentationStore.getState().clickStep}
              onClickSteps={(total) => usePresentationStore.setState({ totalClickSteps: total })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small 16:9 slide preview for the "next slide" panel */
function MiniSlide({ markdown, rootPath, layout, theme }: {
  markdown: string; rootPath?: string; layout?: string; theme?: string
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.2)

  const SLIDE_W = 1280
  const SLIDE_H = 720

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const cw = container.clientWidth
      setScale(cw / SLIDE_W)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full aspect-video rounded overflow-hidden relative" style={{ background: '#111' }}>
      <div
        data-slide-theme={theme || 'dark'}
        className="absolute top-0 left-0 overflow-hidden"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--slide-bg)' }} />
        <div className={`absolute inset-0 ${layout === 'blank' ? '' : 'p-12'} overflow-hidden ${layout && layout !== 'default' ? `slide-layout-${layout}` : ''}`}>
          <div style={{ width: SLIDE_W - 96 }}>
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
  if (activeArtifact === 'prompt' && currentSlide?.config.prompts?.length > 0) {
    return (
      <div className="h-full flex flex-col bg-gray-950">
        {currentSlide.config.prompts.map((p: any, i: number) => (
          <div key={i} className="flex-1 min-h-0">
            <PromptPanel prompt={p} promptIndex={i} />
          </div>
        ))}
      </div>
    )
  }
  if (activeArtifact === 'artifact' && currentSlide?.config.artifacts?.length > 0) {
    return (
      <div className="h-full bg-gray-950 p-3 overflow-y-auto">
        <div className="text-gray-400 text-xs font-medium mb-2">File Artifacts</div>
        {currentSlide.config.artifacts.map((a: any, i: number) => (
          <button
            key={i}
            onClick={() => window.electronAPI.openInSystemApp(
              presentation?.rootPath ? `${presentation.rootPath}/${a.path}` : a.path
            )}
            className="w-full text-left px-3 py-2 mb-1 rounded bg-gray-900 hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <div className="min-w-0">
              <div className="text-gray-300 text-xs truncate">{a.label || a.path}</div>
              <div className="text-gray-600 text-[10px] truncate">{a.path}</div>
            </div>
          </button>
        ))}
      </div>
    )
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

function RemoteControlButton(): JSX.Element {
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null)
  const [showQR, setShowQR] = useState(false)

  const toggleRemote = async () => {
    if (remoteUrl) {
      // If popup is hidden, show it; otherwise stop the remote
      if (!showQR) {
        setShowQR(true)
      } else {
        await window.electronAPI.stopRemote()
        setRemoteUrl(null)
        setShowQR(false)
      }
    } else {
      const url = await window.electronAPI.startRemote()
      setRemoteUrl(url)
      setShowQR(true)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={toggleRemote}
        className={`px-2 py-1 text-[11px] rounded transition-colors flex items-center gap-1 ${
          remoteUrl ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
        }`}
        title={remoteUrl ? `Remote: ${remoteUrl}` : 'Start remote control'}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
        {remoteUrl ? 'Remote On' : 'Remote'}
      </button>
      {showQR && remoteUrl && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowQR(false)} />
          <div className="absolute top-full right-0 mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-4 w-56">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Remote Control</div>
            <div className="text-xs text-white font-mono mb-2 break-all">{remoteUrl}</div>
            <div className="text-[9px] text-gray-500">Open this URL on your phone to control the presentation</div>
            <div className="flex gap-1.5 mt-2">
              <button onClick={() => { navigator.clipboard.writeText(remoteUrl) }}
                className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                Copy URL
              </button>
              <button onClick={async () => { await window.electronAPI.stopRemote(); setRemoteUrl(null); setShowQR(false) }}
                className="px-2 py-1 text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors">
                Stop
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CurrentTime(): JSX.Element {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span>
      {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
      {' '}
      {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
    </span>
  )
}

function PresenterLiveNotes(): JSX.Element {
  const { presentation, updatePresenterNotes } = usePresentationStore()
  const [lines, setLines] = useState<string[]>(() => parseNoteLines(presentation?.presenterNotes ?? ''))
  const saveRef = useRef<ReturnType<typeof setTimeout>>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusIdx = useRef<number | null>(null)

  useEffect(() => {
    setLines(parseNoteLines(presentation?.presenterNotes ?? ''))
  }, [presentation?.presenterNotes])

  useEffect(() => {
    if (focusIdx.current !== null) {
      inputRefs.current[focusIdx.current]?.focus()
      focusIdx.current = null
    }
  })

  const persist = (newLines: string[]) => {
    setLines(newLines)
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      updatePresenterNotes(newLines.filter(l => l.trim()).join('\n'))
    }, 800)
  }

  const toggleCheck = (i: number) => {
    const line = lines[i]
    const next = [...lines]
    if (line.startsWith('- [x] ')) next[i] = '- [ ] ' + line.slice(6)
    else if (line.startsWith('- [ ] ')) next[i] = '- [x] ' + line.slice(6)
    persist(next)
  }

  const handleContentChange = (i: number, content: string) => {
    const line = lines[i]
    let prefix = ''
    if (line.startsWith('- [x] ')) prefix = '- [x] '
    else if (line.startsWith('- [ ] ')) prefix = '- [ ] '
    else if (line.startsWith('- ')) prefix = '- '
    const next = [...lines]
    next[i] = prefix + content
    persist(next)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const line = lines[i]
    if (e.key === 'Enter') {
      e.preventDefault()
      let prefix = ''
      if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) prefix = '- [ ] '
      else if (line.startsWith('- ')) prefix = '- '
      const next = [...lines]
      next.splice(i + 1, 0, prefix)
      focusIdx.current = i + 1
      persist(next)
    } else if (e.key === 'Backspace' && getNoteContent(line) === '') {
      e.preventDefault()
      if (lines.length > 1) {
        const next = [...lines]
        next.splice(i, 1)
        focusIdx.current = Math.max(0, i - 1)
        persist(next)
      } else {
        persist([''])
      }
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      inputRefs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowDown' && i < lines.length - 1) {
      e.preventDefault()
      inputRefs.current[i + 1]?.focus()
    }
  }

  const addLine = (prefix: string) => {
    const next = [...lines, prefix]
    focusIdx.current = next.length - 1
    persist(next)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Quick-add buttons */}
      <div className="flex items-center gap-1 px-2 py-1 flex-shrink-0">
        <button onClick={() => addLine('- [ ] ')}
          className="px-1.5 py-0.5 text-[9px] text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          title="Add todo">☑ Todo</button>
        <button onClick={() => addLine('- ')}
          className="px-1.5 py-0.5 text-[9px] text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          title="Add bullet">• Bullet</button>
        <button onClick={() => addLine('')}
          className="px-1.5 py-0.5 text-[9px] text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
          title="Add text">+ Text</button>
      </div>
      {/* Lines */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {lines.map((line, i) => {
          const isChecked = line.startsWith('- [x] ')
          const isUnchecked = line.startsWith('- [ ] ')
          const isBullet = !isChecked && !isUnchecked && line.startsWith('- ')
          const content = getNoteContent(line)
          return (
            <div key={i} className="flex items-center gap-1.5 py-px">
              {(isChecked || isUnchecked) && (
                <button onClick={() => toggleCheck(i)} className="flex-shrink-0">
                  {isChecked ? (
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  )}
                </button>
              )}
              {isBullet && <span className="w-1 h-1 rounded-full bg-gray-500 flex-shrink-0" />}
              <input
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                value={content}
                onChange={(e) => handleContentChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`flex-1 min-w-0 bg-transparent text-xs outline-none ${
                  isChecked ? 'text-gray-600 line-through' : 'text-gray-300'
                } placeholder-gray-700`}
                placeholder={isChecked || isUnchecked ? 'Action item...' : isBullet ? 'Note...' : 'Text...'}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function parseNoteLines(text: string): string[] {
  if (!text.trim()) return ['']
  return text.split('\n')
}

function getNoteContent(line: string): string {
  if (line.startsWith('- [x] ')) return line.slice(6)
  if (line.startsWith('- [ ] ')) return line.slice(6)
  if (line.startsWith('- ')) return line.slice(2)
  return line
}
