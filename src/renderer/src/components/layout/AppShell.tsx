import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Toolbar } from './Toolbar'
import { StatusBar } from './StatusBar'
import { SlidePanel } from '../slides/SlidePanel'
import { CodePanel } from '../code/CodePanel'
import { VideoPanel } from '../video/VideoPanel'
import { WebPanel } from '../web/WebPanel'
import { SpeakerNotes } from '../ai/SpeakerNotes'
import { PresenterView } from '../presenter/PresenterView'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useFileWatcher } from '../../hooks/useFileWatcher'

export function AppShell(): JSX.Element {
  const { isPresenting, showNotes } = useUIStore()
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
      <Toolbar />

      <div className="flex-1 min-h-0 flex flex-col">
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Pane: Slides */}
          <Panel defaultSize={hasRightPane ? 40 : 100} minSize={25}>
            <SlidePanel />
          </Panel>

          {/* Right Pane: Code or Video */}
          {hasRightPane && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-indigo-500 transition-colors cursor-col-resize" />
              <Panel defaultSize={60} minSize={30}>
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
        </PanelGroup>

        {/* Speaker Notes (toggleable bottom panel) */}
        {showNotes && <SpeakerNotes />}
      </div>

      <StatusBar />
    </div>
  )
}
