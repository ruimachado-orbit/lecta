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
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useTabsStore } from '../../stores/tabs-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useFileWatcher } from '../../hooks/useFileWatcher'

export function AppShell(): JSX.Element {
  const { isPresenting, showNotes, showArticlePanel, showArtifactDrawer, showSlideMap } = useUIStore()
  const { tabs } = useTabsStore()
  const currentSlide = usePresentationStore((s) => s.slides[s.currentSlideIndex])

  useKeyboardShortcuts()
  useFileWatcher()

  if (isPresenting) {
    return <PresenterView />
  }

  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp
  const hasRightPane = hasCode || hasVideo || hasWebApp

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {tabs.length > 1 && <TabBar />}
      <Toolbar />

      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Pane: Slides */}
          <Panel defaultSize={hasRightPane || showArticlePanel || showArtifactDrawer ? 40 : 100} minSize={25}>
            <SlidePanel />
          </Panel>

          {/* Right Pane: Code / Video / Web */}
          {hasRightPane && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-col-resize" />
              <Panel defaultSize={showArticlePanel ? 30 : 60} minSize={20}>
                {hasCode ? (
                  <CodePanel />
                ) : hasVideo ? (
                  <VideoPanel video={currentSlide!.config.video!} />
                ) : hasWebApp ? (
                  <WebPanel webapp={currentSlide!.config.webapp!} />
                ) : null}
              </Panel>
            </>
          )}

          {/* Artifact Drawer */}
          {showArtifactDrawer && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-col-resize" />
              <Panel defaultSize={30} minSize={20}>
                <ArtifactDrawer />
              </Panel>
            </>
          )}

          {/* Article Panel */}
          {showArticlePanel && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-col-resize" />
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
