import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { SlidePanel } from '../slides/SlidePanel'
import { CodePanel } from '../code/CodePanel'
import { VideoPanel } from '../video/VideoPanel'
import { WebPanel } from '../web/WebPanel'
import { PromptPanel } from '../prompt/PromptPanel'
import { SpeakerNotes } from '../ai/SpeakerNotes'
import { ArticlePanel } from '../ai/ArticlePanel'
import { ArtifactDrawer } from '../artifacts/ArtifactDrawer'
import { ArtifactSidebarHeader } from '../artifacts/ArtifactSidebar'
import { SlideMap } from '../slides/SlideMap'
import { TabBar } from './TabBar'
import { PresenterView } from '../presenter/PresenterView'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useFileWatcher } from '../../hooks/useFileWatcher'

export function AppShell(): JSX.Element {
  const { isPresenting, showNotes, showArticlePanel, showArtifactDrawer, showRightPane, showSlideMap } = useUIStore()
  const { tabs } = useTabsStore()
  const currentSlide = usePresentationStore((s) => s.slides[s.currentSlideIndex])
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)

  useKeyboardShortcuts()
  useFileWatcher()

  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const promptCount = currentSlide?.config.prompts?.length ?? 0
  const hasFiles = (currentSlide?.config.artifacts.length ?? 0) > 0

  // Build list of available artifacts for this slide
  // Each prompt gets its own entry: 'prompt-0', 'prompt-1', etc.
  type ArtifactType = string
  const availableArtifacts: ArtifactType[] = []
  if (hasCode) availableArtifacts.push('code')
  if (hasVideo) availableArtifacts.push('video')
  if (hasWebApp) availableArtifacts.push('webapp')
  for (let i = 0; i < promptCount; i++) availableArtifacts.push(`prompt-${i}`)
  if (hasFiles) availableArtifacts.push('files')
  const hasRightPane = availableArtifacts.length > 0

  const [activeArtifact, setActiveArtifact] = useState<ArtifactType | null>(
    availableArtifacts[0] ?? null
  )

  // Reset active artifact when slide changes or artifacts change
  useEffect(() => {
    if (availableArtifacts.length > 0 && (!activeArtifact || !availableArtifacts.includes(activeArtifact))) {
      setActiveArtifact(availableArtifacts[0])
    } else if (availableArtifacts.length === 0) {
      setActiveArtifact(null)
    }
  }, [currentSlideIndex, availableArtifacts.join(',')])

  if (isPresenting) {
    return <PresenterView />
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <TabBar />
      <Toolbar />

      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Pane: Slides */}
          <Panel defaultSize={hasRightPane || showArticlePanel || showArtifactDrawer ? 66 : 100} minSize={30}>
            <SlidePanel />
          </Panel>

          {/* Right Pane: Artifact sidebar header + content */}
          {showRightPane && hasRightPane && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={showArticlePanel ? 25 : 34} minSize={15}>
                {activeArtifact === 'code' && hasCode && <CodePanel key={currentSlideIndex} />}
                {activeArtifact === 'video' && hasVideo && <VideoPanel key={currentSlideIndex} video={currentSlide!.config.video!} />}
                {activeArtifact === 'webapp' && hasWebApp && <WebPanel key={currentSlideIndex} webapp={currentSlide!.config.webapp!} />}
                {activeArtifact?.startsWith('prompt-') && (() => {
                  const idx = parseInt(activeArtifact.split('-')[1], 10)
                  const p = currentSlide?.config.prompts?.[idx]
                  return p ? <PromptPanel key={`${currentSlideIndex}-prompt-${idx}`} prompt={p} promptIndex={idx} /> : null
                })()}
                {activeArtifact === 'files' && hasFiles && <ArtifactDrawer />}
              </Panel>
            </>
          )}

          {/* Vertical icon strip */}
          <ArtifactIconStrip
            availableArtifacts={availableArtifacts}
            activeArtifact={activeArtifact}
            showRightPane={showRightPane}
            onSelectArtifact={(type) => {
              if (activeArtifact === type && showRightPane) {
                useUIStore.setState({ showRightPane: false })
              } else {
                setActiveArtifact(type as ArtifactType)
                useUIStore.setState({ showRightPane: true })
              }
            }}
            onToggleAll={() => {
              if (availableArtifacts.length > 0) {
                useUIStore.setState({ showRightPane: !showRightPane })
              }
            }}
            artifactLabel={artifactLabel}
            artifactIcon={artifactIcon}
          />

          {/* Artifact Drawer */}
          {showArtifactDrawer && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={30} minSize={20}>
                <ArtifactDrawer />
              </Panel>
            </>
          )}

          {/* Article Panel */}
          {showArticlePanel && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={hasRightPane ? 30 : 60} minSize={25}>
                <ArticlePanel />
              </Panel>
            </>
          )}
        </PanelGroup>

        {/* Speaker Notes (toggleable bottom panel) */}
        {showNotes && <SpeakerNotes />}
      </div>

      <StatusBar />

      {/* Slide Map overlay */}
      {showSlideMap && <SlideMap />}
    </div>
  )
}

function SpeakerNotesToggle(): JSX.Element {
  const { showNotes, toggleNotes } = useUIStore()
  return (
    <button
      onClick={toggleNotes}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
        showNotes ? 'text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
      title="Speaker notes"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    </button>
  )
}

function TransitionPicker(): JSX.Element {
  const currentSlide = usePresentationStore((s) => s.slides[s.currentSlideIndex])
  const { setSlideTransition } = usePresentationStore()
  const current = currentSlide?.config.transition || 'none'

  const directions: { value: string; label: string; arrow: string }[] = [
    { value: 'none', label: 'No transition', arrow: '·' },
    { value: 'left', label: 'From left', arrow: '←' },
    { value: 'right', label: 'From right', arrow: '→' },
    { value: 'top', label: 'From top', arrow: '↑' },
    { value: 'bottom', label: 'From bottom', arrow: '↓' }
  ]

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[6px] text-gray-600 uppercase tracking-wider mb-0.5">Trans</span>
      {directions.map((d) => (
        <button
          key={d.value}
          onClick={() => setSlideTransition(d.value)}
          className={`w-6 h-5 rounded flex items-center justify-center text-[10px] transition-colors ${
            current === d.value
              ? 'bg-white text-black'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title={d.label}
        >
          {d.arrow}
        </button>
      ))}
    </div>
  )
}

function artifactIcon(type: string): string {
  if (type.startsWith('prompt-')) return '✦'
  switch (type) {
    case 'code': return '{ }'
    case 'video': return '▶'
    case 'webapp': return '◎'
    case 'files': return '📎'
    default: return '?'
  }
}

function artifactLabel(type: string): string {
  if (type.startsWith('prompt-')) {
    const idx = parseInt(type.split('-')[1], 10)
    return `AI Prompt ${idx + 1}`
  }
  switch (type) {
    case 'code': return 'Code editor'
    case 'video': return 'Video'
    case 'webapp': return 'Web browser'
    case 'files': return 'File artifacts'
    default: return type
  }
}

function ArtifactIconStrip({
  availableArtifacts, activeArtifact, showRightPane,
  onSelectArtifact, onToggleAll, artifactLabel, artifactIcon
}: {
  availableArtifacts: string[]
  activeArtifact: string | null
  showRightPane: boolean
  onSelectArtifact: (type: string) => void
  onToggleAll: () => void
  artifactLabel: (t: string) => string
  artifactIcon: (t: string) => string
}): JSX.Element {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const { addCodeToSlide, addArtifact, addVideo, addWebApp, addPrompt: storeAddPrompt, slides, currentSlideIndex } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  return (
    <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0">
      {/* Add artifact button */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            showAddMenu ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title="Add artifact"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        {showAddMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
            <div className="absolute top-0 right-full mr-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-56 overflow-hidden">
              {/* Header */}
              <div className="px-3 py-2 border-b border-gray-800">
                <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Add to slide</span>
              </div>

              {/* Quick actions — icon + label rows */}
              <div className="py-1">
                {!hasCode && (
                  <div className="px-1">
                    <div className="px-2 py-1.5 text-[10px] text-gray-500 font-medium">Code editor</div>
                    <div className="flex flex-wrap gap-1 px-2 pb-2">
                      {[
                        { lang: 'javascript', label: 'JS', color: '#fbbf24' },
                        { lang: 'typescript', label: 'TS', color: '#3b82f6' },
                        { lang: 'python', label: 'PY', color: '#22c55e' },
                        { lang: 'sql', label: 'SQL', color: '#a855f7' },
                        { lang: 'markdown', label: 'MD', color: '#a3a3a3' },
                        { lang: 'bash', label: 'SH', color: '#f97316' },
                        { lang: 'go', label: 'GO', color: '#06b6d4' },
                        { lang: 'rust', label: 'RS', color: '#ef4444' },
                      ].map((l) => (
                        <button key={l.lang}
                          onClick={() => { addCodeToSlide(l.lang as any); setShowAddMenu(false) }}
                          className="px-2 py-1 rounded text-[9px] font-bold bg-gray-800 hover:bg-gray-700 transition-colors"
                          style={{ color: l.color }}
                          title={l.lang}
                        >{l.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {!hasVideo && (
                  <div className="px-1 border-t border-gray-800">
                    <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                      onClick={() => {
                        const url = prompt('YouTube URL:')
                        if (url?.trim()) { addVideo(url.trim()); setShowAddMenu(false) }
                      }}>
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                      Embed video
                    </button>
                  </div>
                )}

                {!hasWebApp && (
                  <div className="px-1 border-t border-gray-800">
                    <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                      onClick={() => {
                        let url = prompt('Web app URL:')
                        if (url?.trim()) {
                          if (!url.match(/^https?:\/\//)) url = 'https://' + url
                          addWebApp(url); setShowAddMenu(false)
                        }
                      }}>
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                      </svg>
                      Embed website
                    </button>
                  </div>
                )}

                <div className="px-1 border-t border-gray-800">
                  <button onClick={() => { storeAddPrompt(''); setShowAddMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors">
                    <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    AI Prompt
                  </button>
                </div>

                <div className="px-1 border-t border-gray-800">
                  <button onClick={() => { addArtifact(); setShowAddMenu(false) }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                    </svg>
                    Upload file
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-4 h-px bg-gray-600" />

      {/* Individual artifact type buttons */}
      {availableArtifacts.map((type) => {
        const isPrompt = type.startsWith('prompt-')
        const promptIdx = isPrompt ? parseInt(type.split('-')[1], 10) : -1
        return (
          <button
            key={type}
            onClick={() => onSelectArtifact(type)}
            className={`relative w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
              activeArtifact === type && showRightPane
                ? 'text-white font-bold'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            }`}
            title={artifactLabel(type)}
          >
            {isPrompt && (
              <span className="absolute -top-0.5 right-0 min-w-[9px] h-[9px] flex items-center justify-center text-[6px] font-bold text-gray-200 bg-gray-600 rounded-full leading-none">
                {promptIdx + 1}
              </span>
            )}
            {artifactIcon(type)}
          </button>
        )
      })}

      {/* Collapse/expand panel */}
      {availableArtifacts.length > 0 && (
        <>
          <div className="w-4 h-px bg-gray-600" />
          <button
            onClick={onToggleAll}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
            title={showRightPane ? 'Collapse panel' : 'Expand panel'}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              {showRightPane ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              )}
            </svg>
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Speaker notes toggle */}
      <SpeakerNotesToggle />
    </div>
  )
}
