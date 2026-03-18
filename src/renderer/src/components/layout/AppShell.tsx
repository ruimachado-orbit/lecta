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

  useKeyboardShortcuts()
  useFileWatcher()

  if (isPresenting) {
    return <PresenterView />
  }

  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
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

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <TabBar />
      <Toolbar />

      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Pane: Slides */}
          <Panel defaultSize={hasRightPane || showArticlePanel || showArtifactDrawer ? 40 : 100} minSize={25}>
            <SlidePanel />
          </Panel>

          {/* Right Pane: Artifact sidebar header + content */}
          {showRightPane && (hasRightPane || true) && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={showArticlePanel ? 30 : 60} minSize={20}>
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
                setActiveArtifact(type)
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
