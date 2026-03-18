import { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { NotebookToolbar } from './NotebookToolbar'
import { NotePanel } from './NotePanel'
import { NoteNavigator } from './NoteNavigator'
import { NoteMap } from './NoteMap'
import { AgendaView } from './AgendaView'
import { TabBar } from '../layout/TabBar'
import { CodePanel } from '../code/CodePanel'
import { ArtifactDrawer } from '../artifacts/ArtifactDrawer'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'

type NotebookView = 'notes' | 'agenda'

export function NotebookShell(): JSX.Element {
  const { pages, currentPageIndex, notebook, isSaving, lastSavedAt, hasUnsavedChanges } = useNotebookStore()
  const { showSlideMap, showRightPane } = useUIStore()
  const [activeView, setActiveView] = useState<NotebookView>('notes')

  const currentPage = pages[currentPageIndex]
  const hasCode = !!currentPage?.config.code
  const hasFiles = (currentPage?.config.artifacts?.length ?? 0) > 0
  const hasRightContent = hasCode || hasFiles

  // Track what to show on the right pane
  type RightPaneContent = 'code' | 'files' | null
  const [rightPaneContent, setRightPaneContent] = useState<RightPaneContent>(null)

  useEffect(() => {
    if (hasCode) setRightPaneContent('code')
    else if (hasFiles) setRightPaneContent('files')
    else setRightPaneContent(null)
  }, [currentPageIndex, hasCode, hasFiles])

  if (!notebook) {
    return (
      <div className="h-screen flex flex-col bg-gray-950">
        <TabBar />
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No notebook loaded
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      <TabBar />
      <NotebookToolbar />

      {/* View tabs */}
      <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-1 flex-shrink-0">
        <button onClick={() => setActiveView('notes')}
          className={`px-3 py-1 text-[10px] rounded transition-colors ${activeView === 'notes' ? 'bg-white text-black font-medium' : 'text-gray-500 hover:text-gray-300'}`}>
          Notes
        </button>
        <button onClick={() => setActiveView('agenda')}
          className={`px-3 py-1 text-[10px] rounded transition-colors flex items-center gap-1 ${activeView === 'agenda' ? 'bg-white text-black font-medium' : 'text-gray-500 hover:text-gray-300'}`}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          Agenda
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeView === 'agenda' ? (
          /* Agenda view — full width */
          <AgendaView />
        ) : (
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Pane: Note Editor */}
          <Panel defaultSize={hasRightContent && showRightPane ? 66 : 100} minSize={30}>
            <NotePanel />
          </Panel>

          {/* Right Pane: Code / Artifacts (optional) */}
          {showRightPane && hasRightContent && (
            <>
              <PanelResizeHandle className="w-1 bg-gray-800 hover:bg-white transition-colors cursor-col-resize" />
              <Panel defaultSize={34} minSize={15}>
                {rightPaneContent === 'code' && hasCode && <CodePanel key={currentPageIndex} />}
                {rightPaneContent === 'files' && hasFiles && <ArtifactDrawer />}
                {!hasCode && !hasFiles && (
                  <div className="h-full flex items-center justify-center text-gray-600 bg-gray-950 text-sm">
                    No artifacts for this note
                  </div>
                )}
              </Panel>
            </>
          )}

          {/* Vertical toggle strip for right pane */}
          {hasRightContent && (
            <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0">
              {hasCode && (
                <button
                  onClick={() => {
                    setRightPaneContent('code')
                    useUIStore.setState({ showRightPane: true })
                  }}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                    rightPaneContent === 'code' && showRightPane
                      ? 'text-white font-bold'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                  title="Code editor"
                >
                  {'{ }'}
                </button>
              )}
              {hasFiles && (
                <button
                  onClick={() => {
                    setRightPaneContent('files')
                    useUIStore.setState({ showRightPane: true })
                  }}
                  className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                    rightPaneContent === 'files' && showRightPane
                      ? 'text-white font-bold'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                  }`}
                  title="File artifacts"
                >
                  {'\u{1F4CE}'}
                </button>
              )}

              {(hasCode || hasFiles) && (
                <>
                  <div className="w-4 h-px bg-gray-600" />
                  <button
                    onClick={() => useUIStore.setState({ showRightPane: !showRightPane })}
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
            </div>
          )}
        </PanelGroup>
        )}
      </div>

      {/* Bottom navigator — only in notes view */}
      {activeView === 'notes' && <NoteNavigator />}

      {/* Status bar */}
      <NotebookStatusBar />

      {/* Note map overlay */}
      {showSlideMap && <NoteMap />}
    </div>
  )
}

/** Status bar adapted for notebook context */
function NotebookStatusBar(): JSX.Element {
  const { pages, currentPageIndex, isSaving, lastSavedAt, hasUnsavedChanges, notebook } = useNotebookStore()
  const currentPage = pages[currentPageIndex]

  // Re-render periodically to keep "time ago" fresh
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!lastSavedAt) return
    const interval = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(interval)
  }, [lastSavedAt])

  return (
    <div className="h-7 bg-gray-900 border-t border-gray-800 flex items-center px-4 text-xs text-gray-500 gap-4 select-none">
      {/* Notebook indicator */}
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-gray-300" />
        <span>Notebook</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status */}
      <div className="flex items-center gap-1.5">
        {isSaving ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            <span className="text-gray-500">Saving...</span>
          </>
        ) : hasUnsavedChanges ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-gray-500">Unsaved changes</span>
          </>
        ) : lastSavedAt ? (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-300" />
            <span className="text-gray-500">Saved {formatTimeAgo(lastSavedAt)}</span>
          </>
        ) : null}
      </div>

      {/* Layout info */}
      {currentPage && (
        <span className="text-gray-600 capitalize">
          {currentPage.config.layout || notebook?.defaultLayout || 'blank'}
        </span>
      )}

      {/* Note info */}
      <span className="text-gray-600">
        Note {currentPageIndex + 1} of {pages.length}
      </span>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}
