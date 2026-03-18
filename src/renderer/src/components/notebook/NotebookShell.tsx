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
import { usePresentationStore } from '../../stores/presentation-store'
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

        {/* Vertical artifact toggle strip — always visible */}
        <div className="flex flex-col items-center py-2 gap-1 w-7 flex-shrink-0 border-l border-gray-800">
          {/* Add artifact button */}
          <AddArtifactButton />

          {hasCode && (
            <>
              <div className="w-4 h-px bg-gray-700" />
              <button onClick={() => { setRightPaneContent('code'); useUIStore.setState({ showRightPane: true }) }}
                className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                  rightPaneContent === 'code' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }`} title="Code editor">{'{ }'}</button>
            </>
          )}
          {hasFiles && (
            <button onClick={() => { setRightPaneContent('files'); useUIStore.setState({ showRightPane: true }) }}
              className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                rightPaneContent === 'files' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`} title="File artifacts">{'\u{1F4CE}'}</button>
          )}
          {hasRightContent && (
            <>
              <div className="w-4 h-px bg-gray-700" />
              <button onClick={() => useUIStore.setState({ showRightPane: !showRightPane })}
                className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                title={showRightPane ? 'Collapse panel' : 'Expand panel'}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  {showRightPane
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />}
                </svg>
              </button>
            </>
          )}
        </div>

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

/** Add artifact button with dropdown */
function AddArtifactButton(): JSX.Element {
  const [showMenu, setShowMenu] = useState(false)
  const { addCodeToSlide, addArtifact, addVideo, addWebApp, slides, currentSlideIndex } = usePresentationStore()
  // For notebooks we use the notebook store's presentation-compatible APIs
  // But artifacts are slide-level concepts — notebooks reuse the same IPC
  // For now, provide a simple "attach file" option
  const { notebook } = useNotebookStore()

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
          showMenu ? 'text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
        }`}
        title="Add artifact"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-0 right-full mr-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-44 overflow-hidden">
            <button
              onClick={async () => {
                if (notebook?.rootPath) {
                  // Use presentation store's addArtifact which opens file dialog
                  // This works because it uses the same IPC handler
                  await window.electronAPI.uploadImage(notebook.rootPath)
                }
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18A2.25 2.25 0 0 1 23.25 6v12a2.25 2.25 0 0 1-2.25 2.25H3A2.25 2.25 0 0 1 .75 18V6A2.25 2.25 0 0 1 3 3.75Z" />
              </svg>
              Upload image
            </button>
            <button
              onClick={() => {
                // TODO: Add code artifact to notebook note
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2 border-t border-gray-800"
            >
              <span className="text-[9px] font-mono">{'{ }'}</span>
              Add code
            </button>
            <button
              onClick={() => {
                // TODO: Add file artifact to notebook note
                setShowMenu(false)
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2 border-t border-gray-800"
            >
              📎 Attach file
            </button>
          </div>
        </>
      )}
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
