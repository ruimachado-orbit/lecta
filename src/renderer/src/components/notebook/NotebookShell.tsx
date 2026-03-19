import { useState, useEffect } from 'react'
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

export function NotebookShell(): JSX.Element {
  const { pages, currentPageIndex, notebook, isSaving, lastSavedAt, hasUnsavedChanges } = useNotebookStore()
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
function AddArtifactButton(): JSX.Element {
  const [showMenu, setShowMenu] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')
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
          <div className="absolute top-0 right-full mr-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-52 overflow-hidden">
            {/* Code */}
            {!hasCode && (
              <div className="px-2 pt-2 pb-1">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Code</div>
                <select
                  onChange={(e) => { if (e.target.value) { addCodeToNote(e.target.value); setShowMenu(false) } }}
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

            {/* Video */}
            {!hasVideo && (
              <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Video</div>
                <div className="flex gap-1">
                  <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && videoUrl.trim()) { addVideoToNote(videoUrl.trim()); setVideoUrl(''); setShowMenu(false) } }}
                    placeholder="YouTube URL..."
                    className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                  <button onClick={() => { if (videoUrl.trim()) { addVideoToNote(videoUrl.trim()); setVideoUrl(''); setShowMenu(false) } }}
                    disabled={!videoUrl.trim()}
                    className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                </div>
              </div>
            )}

            {/* Web App */}
            {!hasWebApp && (
              <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Web App</div>
                <div className="flex gap-1">
                  <input type="text" value={webAppUrl} onChange={(e) => setWebAppUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && webAppUrl.trim()) { let u = webAppUrl.trim(); if (!u.match(/^https?:\/\//)) u = 'https://' + u; addWebAppToNote(u); setWebAppUrl(''); setShowMenu(false) } }}
                    placeholder="https://..."
                    className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                  <button onClick={() => { let u = webAppUrl.trim(); if (!u) return; if (!u.match(/^https?:\/\//)) u = 'https://' + u; addWebAppToNote(u); setWebAppUrl(''); setShowMenu(false) }}
                    disabled={!webAppUrl.trim()}
                    className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                </div>
              </div>
            )}

            {/* File upload */}
            <button onClick={async () => {
              const { notebook: nb } = useNotebookStore.getState()
              if (nb?.rootPath) await window.electronAPI.uploadImage(nb.rootPath)
              setShowMenu(false)
            }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
              </svg>
              Upload file
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
