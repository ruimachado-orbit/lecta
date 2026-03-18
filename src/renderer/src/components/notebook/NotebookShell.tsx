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
      <NotebookToolbar showAgenda={activeView === 'agenda'} onToggleAgenda={() => setActiveView(activeView === 'agenda' ? 'notes' : 'agenda')} />

      <div className="flex-1 min-h-0 flex">
        {/* Notes + artifacts panel group */}
        <div className="flex-1 min-w-0">
          <PanelGroup direction="horizontal" className="h-full">
            <Panel defaultSize={showRightPane && hasRightContent ? 66 : 100} minSize={30}>
              <NotePanel />
            </Panel>

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
        </PanelGroup>
        </div>

        {/* Vertical artifact toggle strip */}
        {hasRightContent && (
          <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0 border-l border-gray-800">
            {hasCode && (
              <button onClick={() => { setRightPaneContent('code'); useUIStore.setState({ showRightPane: true }) }}
                className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                  rightPaneContent === 'code' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`} title="Code editor">{'{ }'}</button>
            )}
            {hasFiles && (
              <button onClick={() => { setRightPaneContent('files'); useUIStore.setState({ showRightPane: true }) }}
                className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                  rightPaneContent === 'files' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`} title="File artifacts">{'\u{1F4CE}'}</button>
            )}
            <div className="w-4 h-px bg-gray-600" />
            <button onClick={() => useUIStore.setState({ showRightPane: !showRightPane })}
              className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
              title={showRightPane ? 'Collapse panel' : 'Expand panel'}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {showRightPane
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />}
              </svg>
            </button>
          </div>
        )}

        {/* Agenda drawer — outside PanelGroup, plain flex */}
        {activeView === 'agenda' && (
          <div className="flex-shrink-0 border-l border-gray-800" style={{ width: '35%', minWidth: 280 }}>
            <AgendaView />
          </div>
        )}
      </div>

      {/* Bottom navigator */}
      <NoteNavigator />

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
