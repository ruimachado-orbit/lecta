import { useState, useEffect, useCallback } from 'react'
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
import { ChatSidebarPanel } from '../chat/ChatPanel'
import { AIAlert } from '../ai/AIAlert'
import { DesignSystemPanel } from '../design/DesignSystemPanel'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useChatStore } from '../../stores/chat-store'
import { useImageStore } from '../../stores/image-store'
import { applySlideTheme } from '../../themes/theme-registry'
import { useTabsStore } from '../../stores/tabs-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useFileWatcher } from '../../hooks/useFileWatcher'

export function AppShell(): JSX.Element {
  const { isPresenting, showNotes, showArticlePanel, showArtifactDrawer, showRightPane, showSlideMap } = useUIStore()
  const isChatOpen = useChatStore((s) => s.isSidebarOpen)
  const { tabs, activeTabId } = useTabsStore()
  const currentSlide = usePresentationStore((s) => s.slides[s.currentSlideIndex])
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const presentationTitle = usePresentationStore((s) => s.presentation?.title)
  const presentationTheme = usePresentationStore((s) => s.presentation?.theme)

  // Apply theme fonts when presentation loads or theme changes
  useEffect(() => {
    if (presentationTheme) {
      applySlideTheme(presentationTheme)
    }
  }, [presentationTheme])

  // Keep active tab title and type in sync with presentation state
  useEffect(() => {
    useTabsStore.getState().syncCurrentTab()
  }, [presentationTitle, activeTabId])

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

  // Open specific artifact when requested (e.g. after adding code/video/file)
  const pendingArtifactOpen = useUIStore((s) => s.pendingArtifactOpen)
  useEffect(() => {
    if (pendingArtifactOpen && availableArtifacts.includes(pendingArtifactOpen)) {
      setActiveArtifact(pendingArtifactOpen)
      useUIStore.setState({ pendingArtifactOpen: null })
    }
  }, [pendingArtifactOpen, availableArtifacts.join(',')])

  if (isPresenting) {
    return <PresenterView />
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <AIAlert />
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
                {activeArtifact === 'files' && hasFiles && <ArtifactDrawer onClose={() => useUIStore.setState({ showRightPane: false })} />}
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

          {/* AI Chat Panel */}
          {isChatOpen && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={30} minSize={20}>
                <ChatSidebarPanel />
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
        showNotes ? 'text-yellow-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
      title="Speaker & Action Notes"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
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
  const [showSlideStore, setShowSlideStore] = useState(false)
  const [showDesignSystem, setShowDesignSystem] = useState(false)
  const { addCodeToSlide, addArtifact, addVideo, addWebApp, addPrompt: storeAddPrompt, slides, currentSlideIndex, addSlide, presentation } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [webAppUrl, setWebAppUrl] = useState<string | null>(null)
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  return (
    <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0 bg-neutral-800">
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
                    {videoUrl !== null ? (
                      <div className="px-2 py-1.5">
                        <div className="text-[10px] text-gray-500 mb-1">YouTube / video URL</div>
                        <form onSubmit={(e) => {
                          e.preventDefault()
                          if (videoUrl.trim()) { addVideo(videoUrl.trim()); setVideoUrl(null); setShowAddMenu(false) }
                        }} className="flex gap-1">
                          <input
                            type="text"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            placeholder="https://youtube.com/..."
                            autoFocus
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                            onKeyDown={(e) => { if (e.key === 'Escape') setVideoUrl(null) }}
                          />
                          <button type="submit" className="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white">Add</button>
                        </form>
                      </div>
                    ) : (
                      <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                        onClick={() => setVideoUrl('')}>
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        Embed video
                      </button>
                    )}
                  </div>
                )}

                {!hasWebApp && (
                  <div className="px-1 border-t border-gray-800">
                    {webAppUrl !== null ? (
                      <div className="px-2 py-1.5">
                        <div className="text-[10px] text-gray-500 mb-1">Website URL</div>
                        <form onSubmit={(e) => {
                          e.preventDefault()
                          let url = (webAppUrl || '').trim()
                          if (url) {
                            if (!url.match(/^https?:\/\//)) url = 'https://' + url
                            addWebApp(url); setWebAppUrl(null); setShowAddMenu(false)
                          }
                        }} className="flex gap-1">
                          <input
                            type="text"
                            value={webAppUrl}
                            onChange={(e) => setWebAppUrl(e.target.value)}
                            placeholder="https://example.com"
                            autoFocus
                            className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                            onKeyDown={(e) => { if (e.key === 'Escape') setWebAppUrl(null) }}
                          />
                          <button type="submit" className="px-2 py-1 text-[10px] rounded bg-indigo-600 hover:bg-indigo-500 text-white">Add</button>
                        </form>
                      </div>
                    ) : (
                      <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                        onClick={() => setWebAppUrl('')}>
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                        </svg>
                        Embed website
                      </button>
                    )}
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

      {/* Image Library button */}
      <button
        onClick={() => useImageStore.getState().togglePanel()}
        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
          useImageStore.getState().isPanelOpen ? 'text-purple-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
        }`}
        title="Image Library"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 3.75h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6a2.25 2.25 0 0 1 2.25-2.25z" />
        </svg>
      </button>

      {/* Design System button */}
      <div className="relative">
        <button
          onClick={() => { setShowDesignSystem(!showDesignSystem); setShowSlideStore(false) }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            showDesignSystem ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title="Design System"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008Z" />
          </svg>
        </button>
        {showDesignSystem && (
          <DesignSystemPanel
            onClose={() => setShowDesignSystem(false)}
            onInsert={async (content) => {
              // Insert the design element content into the current slide
              const state = usePresentationStore.getState()
              const slide = state.slides[state.currentSlideIndex]
              const rootPath = state.presentation?.rootPath
              if (slide && rootPath) {
                const filePath = `${rootPath}/${slide.config.content}`
                const existing = slide.markdownContent || ''
                // Append the element content
                await window.electronAPI.writeFile(filePath, existing + '\n' + content)
                await usePresentationStore.getState().loadPresentation(rootPath)
              }
              setShowDesignSystem(false)
            }}
          />
        )}
      </div>

      {/* Slide Store button */}
      <div className="relative">
        <button
          onClick={() => { setShowSlideStore(!showSlideStore); setShowDesignSystem(false) }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            showSlideStore ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title="Slide Store"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
        </button>
        {showSlideStore && (
          <SlideStorePanel
            onClose={() => setShowSlideStore(false)}
            onInsert={async (markdown, layout) => {
              const slideId = `store-${Date.now().toString(36)}`
              const prevIndex = usePresentationStore.getState().currentSlideIndex
              await addSlide(slideId)
              // The new slide is inserted after prevIndex, so it's at prevIndex + 1
              const state = usePresentationStore.getState()
              const newIdx = prevIndex + 1
              const newSlide = state.slides[newIdx]
              const rootPath = state.presentation?.rootPath
              if (newSlide && rootPath) {
                const filePath = `${rootPath}/${newSlide.config.content}`
                await window.electronAPI.writeFile(filePath, markdown)
                if (layout && layout !== 'default') {
                  await window.electronAPI.setSlideLayout(rootPath, newIdx, layout)
                }
                // Reload to pick up the new content
                await usePresentationStore.getState().loadPresentation(rootPath)
                usePresentationStore.getState().goToSlide(newIdx)
              }
              setShowSlideStore(false)
            }}
          />
        )}
      </div>

      {/* Speaker notes toggle */}
      <SpeakerNotesToggle />
    </div>
  )
}

interface StoredSlideItem {
  id: string
  name: string
  markdown: string
  layout?: string
  codeContent?: string
  codeLanguage?: string
  savedAt: string
}

function SlideStorePanel({ onClose, onInsert }: {
  onClose: () => void
  onInsert: (markdown: string, layout?: string) => void
}): JSX.Element {
  const [slides, setSlides] = useState<StoredSlideItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const loadSlides = useCallback(async () => {
    setLoading(true)
    const stored = await window.electronAPI.listLibrarySlides()
    setSlides(stored)
    setLoading(false)
  }, [])

  useEffect(() => { loadSlides() }, [loadSlides])

  const handleDelete = async (id: string) => {
    await window.electronAPI.deleteLibrarySlide(id)
    setSlides((prev) => prev.filter((s) => s.id !== id))
  }

  const handleRename = async (id: string) => {
    if (!editName.trim()) return
    await window.electronAPI.renameLibrarySlide(id, editName.trim())
    setSlides((prev) => prev.map((s) => s.id === id ? { ...s, name: editName.trim() } : s))
    setEditingId(null)
  }

  // Extract first heading from markdown for preview
  const getPreviewLines = (md: string) => {
    return md.split('\n').filter((l) => l.trim()).slice(0, 5)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-0 right-full mr-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-72 max-h-96 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
          <span className="text-xs font-medium text-gray-300 flex-1">Slide Store</span>
          <span className="text-[9px] text-gray-600">{slides.length} saved</span>
        </div>

        {/* Slide list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-gray-500">Loading...</div>
          ) : slides.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-gray-600 text-xs mb-1">No saved slides</div>
              <div className="text-gray-700 text-[10px]">Right-click a slide and choose "Save to Slide Store"</div>
            </div>
          ) : (
            slides.map((slide) => (
              <div key={slide.id} className="group border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                {/* Preview card */}
                <div className="px-3 py-2">
                  {/* Name */}
                  {editingId === slide.id ? (
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(slide.id); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={() => handleRename(slide.id)}
                      autoFocus
                      className="w-full text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-200 truncate flex-1">{slide.name}</span>
                      {slide.layout && slide.layout !== 'default' && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-gray-800 text-gray-500">{slide.layout}</span>
                      )}
                    </div>
                  )}

                  {/* Markdown preview */}
                  <div className="mt-1 space-y-0.5">
                    {getPreviewLines(slide.markdown).map((line, i) => {
                      const isH1 = line.startsWith('# ')
                      const isBullet = !!line.match(/^[-*+] /)
                      const text = line.replace(/^#{1,3}\s/, '').replace(/^[-*+]\s/, '').replace(/\*\*/g, '').replace(/<[^>]+>/g, '').trim()
                      return (
                        <div key={i} className={`truncate ${
                          isH1 ? 'text-[9px] font-semibold text-gray-400' :
                          isBullet ? 'text-[8px] text-gray-600 pl-1.5' :
                          'text-[8px] text-gray-600'
                        }`}>
                          {isBullet && <span className="mr-0.5">•</span>}
                          {text}
                        </div>
                      )
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onInsert(slide.markdown, slide.layout)}
                      className="px-2 py-0.5 text-[9px] font-medium rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                      Insert
                    </button>
                    <button
                      onClick={() => { setEditingId(slide.id); setEditName(slide.name) }}
                      className="px-1.5 py-0.5 text-[9px] rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(slide.id)}
                      className="px-1.5 py-0.5 text-[9px] rounded text-red-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
                    >
                      Delete
                    </button>
                    <div className="flex-1" />
                    <span className="text-[8px] text-gray-700">
                      {new Date(slide.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
