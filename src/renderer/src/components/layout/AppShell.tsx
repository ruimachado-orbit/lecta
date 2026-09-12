import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { SlidePanel } from '../slides/SlidePanel'
import { CodePanel } from '../code/CodePanel'
import { VideoPanel } from '../video/VideoPanel'
import { WebPanel } from '../web/WebPanel'
import { SpeakerNotes } from '../ai/SpeakerNotes'
import { ArticlePanel } from '../ai/ArticlePanel'
import { ArtifactDrawer } from '../artifacts/ArtifactDrawer'
import { SlideMap } from '../slides/SlideMap'
import { TabBar } from './TabBar'
import { PresenterView } from '../presenter/PresenterView'
import { ChatSidebarPanel } from '../chat/ChatPanel'
import { AIAlert } from '../ai/AIAlert'
import { CommandPalette } from '../common/CommandPalette'
import { ShortcutsOverlay } from '../common/ShortcutsOverlay'
import { Popover, MenuItem, MenuLabel, MenuSeparator } from '../common/Popover'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useChatStore } from '../../stores/chat-store'
import { applySlideTheme } from '../../themes/theme-registry'
import { useTabsStore } from '../../stores/tabs-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useFileWatcher } from '../../hooks/useFileWatcher'

export function AppShell(): JSX.Element {
  const { isPresenting, showNotes, showArticlePanel, showArtifactDrawer, showRightPane, showSlideMap } = useUIStore(
    useShallow((s) => ({
      isPresenting: s.isPresenting,
      showNotes: s.showNotes,
      showArticlePanel: s.showArticlePanel,
      showArtifactDrawer: s.showArtifactDrawer,
      showRightPane: s.showRightPane,
      showSlideMap: s.showSlideMap
    }))
  )
  const isChatOpen = useChatStore((s) => s.isSidebarOpen)
  const activeTabId = useTabsStore((s) => s.activeTabId)
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
  const hasFiles = (currentSlide?.config.artifacts.length ?? 0) > 0

  // Artifacts this slide can show on the right. The per-slide prompt panel was retired
  // in Phase 2 — the AI chat sidebar is the one AI surface now.
  type ArtifactType = string
  const availableArtifacts: ArtifactType[] = []
  if (hasCode) availableArtifacts.push('code')
  if (hasVideo) availableArtifacts.push('video')
  if (hasWebApp) availableArtifacts.push('webapp')
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

  // A slide that ships code shows it: the first slide of the demo deck says "try modifying
  // the code on the right", and an empty right-hand side made that a lie. Once the user
  // collapses the pane we stop reopening it for the rest of the session.
  const userCollapsedPane = useRef(false)
  useEffect(() => {
    if (hasCode && !showRightPane && !userCollapsedPane.current) {
      useUIStore.setState({ showRightPane: true })
    }
  }, [currentSlideIndex, hasCode])

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
                userCollapsedPane.current = true
                useUIStore.setState({ showRightPane: false })
              } else {
                userCollapsedPane.current = false
                setActiveArtifact(type as ArtifactType)
                useUIStore.setState({ showRightPane: true })
              }
            }}
            onToggleAll={() => {
              if (availableArtifacts.length > 0) {
                userCollapsedPane.current = showRightPane
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

      {/* App-wide overlays */}
      <CommandPalette />
      <ShortcutsOverlay />
    </div>
  )
}


function SpeakerNotesToggle(): JSX.Element {
  const { showNotes, toggleNotes } = useUIStore()
  return (
    <button
      onClick={toggleNotes}
      className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
        showNotes ? 'text-yellow-300' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
      title="Speaker & action notes"
      aria-label="Speaker & action notes"
      aria-pressed={showNotes}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    </button>
  )
}

function artifactIcon(type: string): string {
  switch (type) {
    case 'code': return '{ }'
    case 'video': return '▶'
    case 'webapp': return '◎'
    case 'files': return '⎘'
    default: return '?'
  }
}

function artifactLabel(type: string): string {
  switch (type) {
    case 'code': return 'Code editor'
    case 'video': return 'Video'
    case 'webapp': return 'Web browser'
    case 'files': return 'File artifacts'
    default: return type
  }
}

/**
 * The narrow rail beside the right pane. It now holds only what belongs to the
 * *current slide* — the code/video/web/files toggles and the notes switch.
 * Image Library and Slide Store moved into the toolbar's `Insert ▾` menu, and the
 * Design System panel was retired.
 */
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
  const { addCodeToSlide, addArtifact, addVideo, addWebApp, slides, currentSlideIndex } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [webAppUrl, setWebAppUrl] = useState<string | null>(null)
  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  return (
    <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0 bg-neutral-800">
      {/* Add to slide */}
      <div className="relative">
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            showAddMenu ? 'text-white font-bold' : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          title="Add to slide"
          aria-label="Add to slide"
          aria-haspopup="menu"
          aria-expanded={showAddMenu}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <Popover
          open={showAddMenu}
          onClose={() => { setShowAddMenu(false); setVideoUrl(null); setWebAppUrl(null) }}
          label="Add to slide"
          side="left-of"
          widthClass="w-56"
        >
          <MenuLabel>Add to slide</MenuLabel>

          {!hasCode && (
            <div className="px-3 pb-2">
              <div className="text-xs text-gray-400 mb-1.5">Code editor</div>
              <div className="flex flex-wrap gap-1">
                {[
                  { lang: 'javascript', label: 'JS' },
                  { lang: 'typescript', label: 'TS' },
                  { lang: 'python', label: 'PY' },
                  { lang: 'sql', label: 'SQL' },
                  { lang: 'markdown', label: 'MD' },
                  { lang: 'bash', label: 'SH' },
                  { lang: 'go', label: 'GO' },
                  { lang: 'rust', label: 'RS' }
                ].map((l) => (
                  <button
                    key={l.lang}
                    onClick={() => { addCodeToSlide(l.lang as never); setShowAddMenu(false) }}
                    className="px-2 py-1 rounded text-[11px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-100 transition-colors"
                    title={`Add a ${l.lang} code block`}
                    aria-label={`Add a ${l.lang} code block`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!hasVideo && (
            <>
              <MenuSeparator />
              {videoUrl !== null ? (
                <form
                  className="px-3 py-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (videoUrl.trim()) { addVideo(videoUrl.trim()); setVideoUrl(null); setShowAddMenu(false) }
                  }}
                >
                  <label className="block text-xs text-gray-300 mb-1" htmlFor="add-video-url">YouTube / video URL</label>
                  <div className="flex gap-1">
                    <input
                      id="add-video-url"
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/…"
                      autoFocus
                      className="flex-1 min-w-0 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-400"
                      onKeyDown={(e) => { if (e.key === 'Escape') setVideoUrl(null) }}
                    />
                    <button type="submit" className="px-2 py-1 text-xs rounded bg-white text-black font-medium">Add</button>
                  </div>
                </form>
              ) : (
                <MenuItem
                  onClick={() => setVideoUrl('')}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  }
                >
                  Embed video
                </MenuItem>
              )}
            </>
          )}

          {!hasWebApp && (
            <>
              <MenuSeparator />
              {webAppUrl !== null ? (
                <form
                  className="px-3 py-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    let url = (webAppUrl || '').trim()
                    if (url) {
                      if (!/^https?:\/\//.test(url)) url = 'https://' + url
                      addWebApp(url); setWebAppUrl(null); setShowAddMenu(false)
                    }
                  }}
                >
                  <label className="block text-xs text-gray-300 mb-1" htmlFor="add-web-url">Website URL</label>
                  <div className="flex gap-1">
                    <input
                      id="add-web-url"
                      type="text"
                      value={webAppUrl}
                      onChange={(e) => setWebAppUrl(e.target.value)}
                      placeholder="https://example.com"
                      autoFocus
                      className="flex-1 min-w-0 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-400"
                      onKeyDown={(e) => { if (e.key === 'Escape') setWebAppUrl(null) }}
                    />
                    <button type="submit" className="px-2 py-1 text-xs rounded bg-white text-black font-medium">Add</button>
                  </div>
                </form>
              ) : (
                <MenuItem
                  onClick={() => setWebAppUrl('')}
                  icon={
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                    </svg>
                  }
                >
                  Embed website
                </MenuItem>
              )}
            </>
          )}

          <MenuSeparator />
          <MenuItem
            onClick={() => { addArtifact(); setShowAddMenu(false) }}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
            }
          >
            Upload file
          </MenuItem>
        </Popover>
      </div>

      <div className="w-4 h-px bg-gray-600" />

      {/* One toggle per artifact on this slide */}
      {availableArtifacts.map((type) => (
        <button
          key={type}
          onClick={() => onSelectArtifact(type)}
          className={`relative w-6 h-6 rounded flex items-center justify-center text-[11px] transition-colors ${
            activeArtifact === type && showRightPane
              ? 'bg-white text-black font-bold'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
          title={artifactLabel(type)}
          aria-label={artifactLabel(type)}
          aria-pressed={activeArtifact === type && showRightPane}
        >
          {artifactIcon(type)}
        </button>
      ))}

      {/* Collapse/expand the right pane */}
      {availableArtifacts.length > 0 && (
        <>
          <div className="w-4 h-px bg-gray-600" />
          <button
            onClick={onToggleAll}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title={showRightPane ? 'Collapse the side panel' : 'Expand the side panel'}
            aria-label={showRightPane ? 'Collapse the side panel' : 'Expand the side panel'}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              {showRightPane ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              )}
            </svg>
          </button>
        </>
      )}

      <div className="flex-1" />

      <SpeakerNotesToggle />
    </div>
  )
}
