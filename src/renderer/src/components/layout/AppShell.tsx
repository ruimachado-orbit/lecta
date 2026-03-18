import { useState, useEffect } from 'react'
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
  const hasFiles = (currentSlide?.config.artifacts.length ?? 0) > 0

  // Build list of available artifacts for this slide
  type ArtifactType = 'code' | 'video' | 'webapp' | 'files'
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
  switch (type) {
    case 'code': return '{ }'
    case 'video': return '▶'
    case 'webapp': return '◎'
    case 'files': return '📎'
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
            <div className="absolute top-0 right-full mr-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-52 overflow-hidden">
              {!hasCode && (
                <div className="px-2 pt-2 pb-1">
                  <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Code</div>
                  <select
                    onChange={(e) => { if (e.target.value) { addCodeToSlide(e.target.value as any); setShowAddMenu(false) } }}
                    defaultValue=""
                    className="w-full px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none"
                  >
                    <option value="" disabled>Select language...</option>
                    {['markdown', 'javascript', 'python', 'sql', 'typescript', 'bash', 'go', 'rust'].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              )}
              {!hasVideo && (
                <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                  <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Video</div>
                  <div className="flex gap-1">
                    <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && videoUrl.trim()) { addVideo(videoUrl.trim()); setVideoUrl(''); setShowAddMenu(false) } }}
                      placeholder="YouTube URL..."
                      className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                    <button onClick={() => { if (videoUrl.trim()) { addVideo(videoUrl.trim()); setVideoUrl(''); setShowAddMenu(false) } }}
                      disabled={!videoUrl.trim()}
                      className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                  </div>
                </div>
              )}
              {!hasWebApp && (
                <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                  <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Web App</div>
                  <div className="flex gap-1">
                    <input type="text" value={webAppUrl} onChange={(e) => setWebAppUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && webAppUrl.trim()) { let u = webAppUrl.trim(); if (!u.match(/^https?:\/\//)) u = 'https://' + u; addWebApp(u); setWebAppUrl(''); setShowAddMenu(false) } }}
                      placeholder="https://localhost:3000"
                      className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                    <button onClick={() => { let u = webAppUrl.trim(); if (!u) return; if (!u.match(/^https?:\/\//)) u = 'https://' + u; addWebApp(u); setWebAppUrl(''); setShowAddMenu(false) }}
                      disabled={!webAppUrl.trim()}
                      className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                  </div>
                </div>
              )}
              <button onClick={() => { addArtifact(); setShowAddMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800">
                Upload file
              </button>
            </div>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-4 h-px bg-gray-600" />

      {/* Individual artifact type buttons */}
      {availableArtifacts.map((type) => (
        <button
          key={type}
          onClick={() => onSelectArtifact(type)}
          className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
            activeArtifact === type && showRightPane
              ? 'text-white font-bold'
              : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title={artifactLabel(type)}
        >
          {artifactIcon(type)}
        </button>
      ))}

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
