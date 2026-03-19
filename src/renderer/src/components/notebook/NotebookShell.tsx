import React, { useState, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { NotebookToolbar } from './NotebookToolbar'
import { NotePanel } from './NotePanel'
import { NoteNavigator } from './NoteNavigator'
import { NoteMap } from './NoteMap'
import { AgendaView } from './AgendaView'
import { TabBar } from '../layout/TabBar'
import { ArtifactDrawer } from '../artifacts/ArtifactDrawer'
import { CodePanel } from '../code/CodePanel'
import { VideoPanel } from '../video/VideoPanel'
import { WebPanel } from '../web/WebPanel'
import { usePresentationStore } from '../../stores/presentation-store'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'

type NotebookView = 'notes' | 'agenda'

export function NotebookShell(): React.ReactElement {
  const { pages, currentPageIndex, notebook } = useNotebookStore()
  const { showSlideMap, showRightPane } = useUIStore()
  const [activeView, setActiveView] = useState<NotebookView>('notes')

  const currentPage = pages[currentPageIndex]
  const hasCode = !!currentPage?.config.code
  const hasVideo = !!currentPage?.config.video
  const hasWebApp = !!currentPage?.config.webapp
  const hasFiles = (currentPage?.config.artifacts?.length ?? 0) > 0
  const hasRightContent = hasCode || hasVideo || hasWebApp || hasFiles

  // Sync current note data into presentation store so CodePanel/VideoPanel/WebPanel work
  useEffect(() => {
    if (!notebook || !currentPage) return
    const slideConfig = {
      id: currentPage.config.id,
      content: currentPage.config.content,
      code: currentPage.config.code,
      video: currentPage.config.video,
      webapp: currentPage.config.webapp,
      artifacts: currentPage.config.artifacts || [],
    }
    usePresentationStore.setState({
      presentation: {
        title: notebook.title,
        author: notebook.author,
        theme: notebook.theme,
        slides: [slideConfig as any],
        rootPath: notebook.rootPath,
      },
      slides: [{
        config: slideConfig as any,
        markdownContent: currentPage.markdownContent,
        codeContent: currentPage.codeContent,
        codeLanguage: currentPage.codeLanguage,
        notesContent: null,
      }],
      currentSlideIndex: 0,
    })
    return () => {
      // Clean up on unmount — don't leave stale presentation data
    }
  }, [notebook, currentPage, currentPageIndex])

  // Track what to show on the right pane
  type RightPaneContent = 'code' | 'video' | 'webapp' | 'files' | null
  const [rightPaneContent, setRightPaneContent] = useState<RightPaneContent>(null)

  useEffect(() => {
    if (hasCode) setRightPaneContent('code')
    else if (hasVideo) setRightPaneContent('video')
    else if (hasWebApp) setRightPaneContent('webapp')
    else if (hasFiles) setRightPaneContent('files')
    else setRightPaneContent(null)
  }, [currentPageIndex, hasCode, hasVideo, hasWebApp, hasFiles])

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
                  {rightPaneContent === 'video' && hasVideo && <VideoPanel key={currentPageIndex} video={currentPage!.config.video!} />}
                  {rightPaneContent === 'webapp' && hasWebApp && <WebPanel key={currentPageIndex} webapp={currentPage!.config.webapp!} />}
                  {rightPaneContent === 'files' && hasFiles && <ArtifactDrawer />}
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

          {(hasCode || hasVideo || hasWebApp || hasFiles) && <div className="w-4 h-px bg-gray-700" />}
          {hasCode && (
            <button onClick={() => { setRightPaneContent('code'); useUIStore.setState({ showRightPane: true }) }}
              className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                rightPaneContent === 'code' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`} title="Code editor">{'{ }'}</button>
          )}
          {hasVideo && (
            <button onClick={() => { setRightPaneContent('video'); useUIStore.setState({ showRightPane: true }) }}
              className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                rightPaneContent === 'video' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`} title="Video">▶</button>
          )}
          {hasWebApp && (
            <button onClick={() => { setRightPaneContent('webapp'); useUIStore.setState({ showRightPane: true }) }}
              className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                rightPaneContent === 'webapp' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`} title="Web browser">◎</button>
          )}
          {hasFiles && (
            <button onClick={() => { setRightPaneContent('files'); useUIStore.setState({ showRightPane: true }) }}
              className={`w-6 h-6 rounded flex items-center justify-center text-[8px] transition-colors ${
                rightPaneContent === 'files' && showRightPane ? 'text-white font-bold' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`} title="File artifacts">📎</button>
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

/** Add artifact button — same dropdown as presentation slides */
function AddArtifactButton(): React.ReactElement {
  const [showMenu, setShowMenu] = useState(false)
  const { pages, currentPageIndex, addCodeToNote, addVideoToNote, addWebAppToNote } = useNotebookStore()
  const currentPage = pages[currentPageIndex]

  const hasCode = !!currentPage?.config.code
  const hasVideo = !!currentPage?.config.video
  const hasWebApp = !!currentPage?.config.webapp

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
          <div className="absolute top-0 right-full mr-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-56 overflow-hidden">
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-800">
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Add to note</span>
            </div>

            <div className="py-1">
              {/* Code languages as colored pills */}
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
                        onClick={() => { addCodeToNote(l.lang); setShowMenu(false) }}
                        className="px-2 py-1 rounded text-[9px] font-bold bg-gray-800 hover:bg-gray-700 transition-colors"
                        style={{ color: l.color }}
                        title={l.lang}
                      >{l.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Video */}
              {!hasVideo && (
                <div className="px-1 border-t border-gray-800">
                  <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                    onClick={() => {
                      const url = prompt('YouTube URL:')
                      if (url?.trim()) { addVideoToNote(url.trim()); setShowMenu(false) }
                    }}>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                    Embed video
                  </button>
                </div>
              )}

              {/* Web App */}
              {!hasWebApp && (
                <div className="px-1 border-t border-gray-800">
                  <button className="w-full flex items-center gap-2.5 px-2 py-2 text-xs text-gray-300 hover:bg-gray-800 rounded transition-colors"
                    onClick={() => {
                      let url = prompt('Web app URL:')
                      if (url?.trim()) {
                        if (!url.match(/^https?:\/\//)) url = 'https://' + url
                        addWebAppToNote(url); setShowMenu(false)
                      }
                    }}>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582" />
                    </svg>
                    Embed website
                  </button>
                </div>
              )}

              {/* Upload file */}
              <div className="px-1 border-t border-gray-800">
                <button onClick={async () => {
                  const { notebook: nb } = useNotebookStore.getState()
                  if (nb?.rootPath) await window.electronAPI.uploadImage(nb.rootPath)
                  setShowMenu(false)
                }}
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
  )
}

/** Status bar adapted for notebook context */
function NotebookStatusBar(): React.ReactElement {
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
