import { useState, useEffect, useCallback, useRef } from 'react'
import { ContentRenderer } from '../slides/ContentRenderer'
import { usePresentationStore } from '../../stores/presentation-store'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore, COLOR_PALETTES } from '../../stores/ui-store'
import { useChatStore } from '../../stores/chat-store'
import { useTabsStore } from '../../stores/tabs-store'
import { ModelSelector } from '../ai/ModelSelector'
import { MyPresentations } from '../library/MyPresentations'
import { AI_PROVIDERS, getProviderForModel } from '../../../../../packages/shared/src/constants'

interface RecentDeck {
  path: string
  title: string
  date: string
  type?: 'presentation' | 'notebook'
  slideCount?: number
  firstSlidePreview?: string
  firstSlideContent?: string
  firstSlideIsMdx?: boolean
  theme?: string
  artifacts?: string[]
}

export function HomeScreen(): JSX.Element {
  const { openFolder, loadPresentation, isLoading, error } = usePresentationStore()
  const { loadNotebook } = useNotebookStore()
  const pendingGeneratePrompt = useUIStore((s) => s.pendingGeneratePrompt)
  const [recentDecks, setRecentDecks] = useState<RecentDeck[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [createType, setCreateType] = useState<'presentation' | 'notebook'>('presentation')
  const [showSettings, setShowSettings] = useState(false)
  const [showAIGenerate, setShowAIGenerate] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // Auto-open AI Generate panel when a pending prompt arrives from the chat
  useEffect(() => {
    if (pendingGeneratePrompt) {
      setShowAIGenerate(true)
    }
  }, [pendingGeneratePrompt])

  const refreshRecentDecks = useCallback(() => {
    window.electronAPI.getRecentDecks().then((decks: any[]) => {
      // Handle both old string[] and new object[] formats
      setRecentDecks(decks.map((d) =>
        typeof d === 'string'
          ? { path: d, title: d.split('/').pop()?.replace(/^lecta-workspace-/, '').replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ') || d, date: '' }
          : d
      ))
    })
  }, [])

  useEffect(() => {
    refreshRecentDecks()

    // Re-fetch when window gets focus (picks up MCP server changes)
    const onFocus = () => refreshRecentDecks()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshRecentDecks])

  const handleCreateLecta = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    setCreateError(null)
    try {
      const workspaceDir = await window.electronAPI.createLectaFile(trimmed, createType)
      if (workspaceDir) {
        if (createType === 'notebook') {
          await loadNotebook(workspaceDir)
        } else {
          await loadPresentation(workspaceDir)
        }
      }
    } catch (err) {
      setCreateError((err as Error).message)
    }
  }

  const handleCreateFolder = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    setCreateError(null)
    try {
      const folderPath = await window.electronAPI.createPresentation(trimmed)
      if (folderPath) {
        await loadPresentation(folderPath)
      }
    } catch (err) {
      setCreateError((err as Error).message)
    }
  }

  if (showLibrary) {
    return <MyPresentations onBack={() => setShowLibrary(false)} />
  }

  if (showSettings) {
    return <SettingsPanel onBack={() => setShowSettings(false)} />
  }

  if (showHelp) {
    return <HelpPanel onBack={() => setShowHelp(false)} />
  }

  if (showAIGenerate) {
    return <AIGeneratePanel onBack={() => setShowAIGenerate(false)} onGenerated={async (workspaceDir) => {
      setShowAIGenerate(false)
      await loadPresentation(workspaceDir)
    }} />
  }

  return (
    <div className="h-screen flex flex-col relative bg-gray-950 text-white" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Tab bar — show open presentation tabs so user can switch back */}
      <HomeTabBar />

      <div className="flex-1 overflow-y-auto flex items-start justify-center pt-20">
      <div className="max-w-xl w-full px-8 pb-28" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1
            className="text-5xl text-white tracking-tight mb-3"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontWeight: 700 }}
          >
            lecta
            <sup className="text-[10px] font-sans not-italic font-semibold tracking-widest uppercase ml-1.5 align-super bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400 bg-clip-text text-transparent">beta</sup>
          </h1>
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={openFolder}
              disabled={isLoading}
              className="flex-1 py-2.5 px-4 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500
                         text-white font-medium rounded-full transition-colors text-sm
                         flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <LoadingSpinner />
                  Loading...
                </>
              ) : (
                <>
                  <FolderIcon />
                  Open
                </>
              )}
            </button>

          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="flex-1 py-2.5 px-4 bg-gray-900 hover:bg-gray-800
                         text-gray-300 font-medium rounded-full transition-colors text-sm
                         flex items-center justify-center gap-2 border border-gray-700"
            >
              <PlusIcon />
              New
            </button>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="flex-1 py-2.5 px-4 bg-gray-900 hover:bg-gray-800
                         text-gray-300 font-medium rounded-full transition-colors text-sm
                         flex items-center justify-center gap-2 border border-gray-700"
            >
              <PlusIcon />
              New
            </button>
          )}
          </div>

          {/* Secondary actions */}
          <div className="flex items-center justify-center gap-4 mt-1">
            <button
              onClick={() => setShowAIGenerate(true)}
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
              Generate with AI
            </button>
<button
              onClick={() => setShowLibrary(true)}
              className="text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              My Presentations
            </button>
          </div>

          {showCreate && (
            <div className="space-y-2">
              {/* Type toggle — inline pills */}
              <div className="flex gap-1 justify-center">
                <button onClick={() => setCreateType('presentation')}
                  className={`px-3 py-1 text-[11px] rounded-full transition-colors ${
                    createType === 'presentation' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}>Presentation</button>
                <button onClick={() => setCreateType('notebook')}
                  className={`px-3 py-1 text-[11px] rounded-full transition-colors ${
                    createType === 'notebook' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}>Notebook</button>
              </div>
              {/* Inline input + create */}
              <div className="flex gap-2">
                <input type="text" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLecta(); if (e.key === 'Escape') { setShowCreate(false); setNewName('') } }}
                  placeholder={createType === 'notebook' ? 'Notebook name' : 'Presentation name'}
                  autoFocus
                  className="flex-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-full border border-gray-700
                             focus:border-gray-900 focus:outline-none placeholder-gray-400" />
                <button onClick={handleCreateLecta} disabled={!newName.trim()}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-30
                             text-white text-sm font-medium rounded-full transition-colors">
                  Create
                </button>
              </div>
              {createError && (
                <p className="text-red-400 text-xs text-center">{createError}</p>
              )}
            </div>
          )}

          {(error && !createError) && (
            <div className="bg-gray-900 border border-gray-800 text-gray-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Recent items — split by type */}
        {recentDecks.length > 0 && (() => {
          const presentations = recentDecks.filter((d) => d.type !== 'notebook')
          const notebooks = recentDecks.filter((d) => d.type === 'notebook')

          const handleOpenRecent = async (deck: RecentDeck) => {
            if (deck.type === 'notebook') {
              await loadNotebook(deck.path)
            } else {
              try {
                await loadPresentation(deck.path)
              } catch (err: any) {
                // If it's a notebook disguised as presentation, load as notebook
                if (err?.message?.startsWith('NOTEBOOK:')) {
                  await loadNotebook(err.message.replace('NOTEBOOK:', ''))
                }
              }
            }
          }

          return (
            <>
              {/* Recent Notebooks */}
              {notebooks.length > 0 && (
                <div className="mt-10">
                  <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                    </svg>
                    Recent Notebooks
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {notebooks.slice(0, 4).map((deck) => (
                      <RecentCard key={deck.path} deck={deck} onClick={() => handleOpenRecent(deck)} onRemove={async () => {
                        await window.electronAPI.removeRecentDeck(deck.path)
                        setRecentDecks((prev) => prev.filter((d) => d.path !== deck.path))
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Presentations */}
              {presentations.length > 0 && (
                <div className="mt-10">
                  <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
                    </svg>
                    Recent Presentations
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {presentations.slice(0, 4).map((deck) => (
                      <RecentCard key={deck.path} deck={deck} onClick={() => handleOpenRecent(deck)} onRemove={async () => {
                        await window.electronAPI.removeRecentDeck(deck.path)
                        setRecentDecks((prev) => prev.filter((d) => d.path !== deck.path))
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* LEGACY — remove the old inline map below; replaced by RecentCard component */}
        {false && recentDecks.length > 0 && (
          <div className="mt-10">
            <div className="grid grid-cols-2 gap-3">
              {recentDecks.map((deck) => {
                // Parse the first slide preview into mini-rendered lines
                const previewLines = (deck.firstSlidePreview || '')
                  .split('\n')
                  .filter((l) => l.trim())
                  .slice(0, 4)

                return (
                  <button
                    key={deck.path}
                    onClick={() => loadPresentation(deck.path)}
                    className="group text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600
                               hover:bg-gray-800 transition-all overflow-hidden"
                  >
                    {/* First slide preview */}
                    <div className="h-28 bg-black p-3 border-b border-gray-800 overflow-hidden">
                      {previewLines.length > 0 ? (
                        <div className="space-y-1">
                          {previewLines.map((line, i) => {
                            const isH1 = line.startsWith('# ')
                            const isH2 = line.startsWith('## ')
                            const isBullet = line.match(/^[-*+] /)
                            const text = line.replace(/^#{1,3}\s/, '').replace(/^[-*+]\s/, '').replace(/\*\*/g, '').replace(/<[^>]+>/g, '')
                            return (
                              <div key={i} className={`truncate ${
                                isH1 ? 'text-[11px] font-bold text-white' :
                                isH2 ? 'text-[10px] font-semibold text-gray-300' :
                                isBullet ? 'text-[8px] text-gray-500 pl-2' :
                                'text-[8px] text-gray-500'
                              }`}>
                                {isBullet && <span className="mr-1">•</span>}
                                {text}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-gray-300 text-2xl font-bold">{deck.title.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div className="text-sm text-gray-200 font-medium truncate group-hover:text-white">
                        {deck.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        {/* Artifact icons */}
                        <div className="flex items-center gap-1">
                          {deck.artifacts?.includes('code') && (
                            <span className="text-[8px] text-gray-500" title="Has code">{'{ }'}</span>
                          )}
                          {deck.artifacts?.includes('video') && (
                            <span className="text-[8px] text-gray-500" title="Has video">▶</span>
                          )}
                          {deck.artifacts?.includes('webapp') && (
                            <span className="text-[8px] text-gray-500" title="Has web app">◎</span>
                          )}
                          {deck.artifacts?.includes('files') && (
                            <span className="text-[8px] text-gray-500" title="Has files">📎</span>
                          )}
                        </div>
                        {/* Slide count */}
                        {deck.slideCount && (
                          <span className="text-[10px] text-gray-600">{deck.slideCount} slides</span>
                        )}
                        {/* Date */}
                        {deck.date && (
                          <span className="text-[10px] text-gray-600">
                            {new Date(deck.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI Chat Input — fixed at bottom */}
      <div className="fixed bottom-6 left-0 right-0 z-40 flex justify-center px-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="max-w-xl w-full">
          <ChatInput />
        </div>
      </div>

      {/* Bottom-left buttons: Settings + Help */}
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          title="Help"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </button>
      </div>
      </div>
    </div>
  )
}

function HomeTabBar(): JSX.Element {
  const { tabs, switchTab, closeTab, newHomeTab } = useTabsStore()

  const activeTabId = useTabsStore((s) => s.activeTabId)

  if (tabs.length === 0) return <></>

  return (
    <div
      className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-20 flex-shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* All tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isHome = tab.type === 'home'
        return (
          <div
            key={tab.id}
            onClick={() => { if (!isActive) switchTab(tab.id) }}
            className={`group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer border-r border-gray-800 transition-colors max-w-[180px] ${
              isActive
                ? 'text-white border-b-2 border-b-gray-900'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {isHome && (
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            )}
            <span className="truncate flex-1">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="hidden group-hover:flex w-4 h-4 items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-gray-400 transition-colors flex-shrink-0"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      {/* Add new tab */}
      <button
        onClick={newHomeTab}
        className="h-full px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors flex items-center"
        title="New tab"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {/* New window button */}
      <button
        onClick={() => window.electronAPI.newWindow()}
        className="h-full px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors flex items-center"
        title="New window"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </button>
    </div>
  )
}

function ChatInput(): JSX.Element {
  const [value, setValue] = useState('')
  const { openFullChat } = useChatStore()
  const { providerStatuses } = useUIStore()
  const noProviders = !providerStatuses.some((s) => s.hasKey)

  const handleSend = (): void => {
    const text = value.trim()
    if (!text || noProviders) return
    setValue('')
    openFullChat(text)
  }

  return (
    <div className={`mb-6 space-y-2 ${noProviders ? 'opacity-50' : ''}`}>
      <div className={`flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-4 py-2.5 shadow-sm transition-colors ${noProviders ? 'cursor-not-allowed' : 'focus-within:border-gray-700'}`}>
        <svg className={`w-4 h-4 flex-shrink-0 ${noProviders ? 'text-gray-500' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
          placeholder={noProviders ? 'Configure an AI provider in Settings to use chat' : 'Ask Lecta AI...'}
          className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-500 focus:outline-none disabled:cursor-not-allowed"
          disabled={noProviders}
        />
        <ModelSelector compact />
        <button
          onClick={handleSend}
          disabled={!value.trim() || noProviders}
          className="w-7 h-7 rounded-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function AIGeneratePanel({ onBack, onGenerated }: { onBack: () => void; onGenerated: (workspaceDir: string) => void }): JSX.Element {
  const pendingPrompt = useUIStore((s) => s.pendingGeneratePrompt)
  const [prompt, setPrompt] = useState('')
  const [title, setTitle] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [sourceFile, setSourceFile] = useState<string | null>(null)
  const [sourceFileName, setSourceFileName] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<{ status: string; slideIndex: number; total: number } | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  // Consume pending prompt from chat selection
  useEffect(() => {
    if (pendingPrompt) {
      setPrompt(pendingPrompt)
      useUIStore.getState().setPendingGeneratePrompt(null)
    }
  }, [pendingPrompt])

  const handleSelectFile = useCallback(async () => {
    const filePath = await window.electronAPI.selectFile()
    if (filePath) {
      setSourceFile(filePath)
      setSourceFileName(filePath.split('/').pop() || filePath)
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && !sourceFile) return

    setIsGenerating(true)
    setGenError(null)
    setProgress({ status: 'Preparing...', slideIndex: 0, total: slideCount })

    try {
      // Read source file content if provided
      let sourceContent: string | null = null
      if (sourceFile) {
        sourceContent = await window.electronAPI.readSourceFile(sourceFile)
      }

      const finalTitle = title.trim() || prompt.trim().slice(0, 60)

      // Generate slides via AI
      const result = await window.electronAPI.generateFullPresentation(
        prompt,
        finalTitle,
        sourceContent,
        slideCount,
        (data: { status: string; slideIndex: number; total: number }) => setProgress(data)
      )

      if (!result.slides || result.slides.length === 0) {
        throw new Error('AI returned no slides')
      }

      setProgress({ status: 'Creating presentation file...', slideIndex: slideCount, total: slideCount })

      // Create a .lecta file
      const workspaceDir = await window.electronAPI.createLectaFile(result.title || finalTitle, 'presentation')
      if (!workspaceDir) throw new Error('User cancelled file creation')

      // Add the generated slides after the default welcome slide, then delete it
      await window.electronAPI.addBulkSlides(workspaceDir, result.slides, 0)

      // Delete the default welcome slide (now at index 0 since bulk inserts after it)
      await window.electronAPI.deleteSlide(workspaceDir, 0)

      // Set layouts for each slide
      for (let i = 0; i < result.slides.length; i++) {
        const layout = result.slides[i].layout
        if (layout && layout !== 'default') {
          try {
            await window.electronAPI.setSlideLayout(workspaceDir, i, layout)
          } catch { /* ignore layout errors */ }
        }
      }

      onGenerated(workspaceDir)
    } catch (err) {
      setGenError((err as Error).message)
      setIsGenerating(false)
    }
  }, [prompt, title, slideCount, sourceFile, onGenerated])

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-12 pb-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onBack}
          disabled={isGenerating}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
          <h2 className="text-lg font-medium text-white">Generate Presentation with AI</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="max-w-lg mx-auto space-y-6">

          {/* Title */}
          <div>
            <label className="text-sm text-gray-300 block mb-1.5">Presentation title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Business Review"
              disabled={isGenerating}
              className="w-full px-3 py-2 bg-gray-900 text-gray-300 text-sm rounded-lg border border-gray-700
                         focus:border-indigo-500 focus:outline-none placeholder-gray-600 disabled:opacity-50"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-sm text-gray-300 block mb-1.5">Describe your presentation</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={"e.g. Create a quarterly business review presentation covering:\n- Revenue performance and growth metrics\n- Product roadmap updates\n- Team hiring progress\n- Key risks and mitigations\n- Next quarter priorities"}
              disabled={isGenerating}
              rows={6}
              className="w-full px-3 py-2 bg-gray-900 text-gray-300 text-sm rounded-lg border border-gray-700
                         focus:border-indigo-500 focus:outline-none placeholder-gray-600 resize-none disabled:opacity-50"
            />
          </div>

          {/* Source file */}
          <div>
            <label className="text-sm text-gray-300 block mb-1.5">Source file (optional)</label>
            <p className="text-[10px] text-gray-600 mb-2">Upload a document to generate slides from its content — supports .txt, .md, .pdf, .csv, .json</p>
            {sourceFile ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg border border-gray-700">
                <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="text-sm text-gray-300 truncate flex-1">{sourceFileName}</span>
                <button onClick={() => { setSourceFile(null); setSourceFileName(null) }}
                  disabled={isGenerating}
                  className="p-0.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 disabled:opacity-30">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={handleSelectFile}
                disabled={isGenerating}
                className="w-full px-3 py-3 bg-gray-900 hover:bg-gray-800 text-gray-500 hover:text-gray-300
                           text-sm rounded-lg border border-dashed border-gray-700 hover:border-gray-500
                           transition-colors flex items-center justify-center gap-2 disabled:opacity-30"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                Choose file...
              </button>
            )}
          </div>

          {/* AI Model */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">AI Model</label>
            <ModelSelector direction="down" />
          </div>

          {/* Slide count */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-300">Number of slides</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSlideCount(Math.max(1, slideCount - 1))}
                disabled={isGenerating}
                className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 text-sm flex items-center justify-center disabled:opacity-30"
              >-</button>
              <input
                type="number"
                min={1}
                max={50}
                value={slideCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v)) setSlideCount(Math.max(1, Math.min(50, v)))
                }}
                disabled={isGenerating}
                className="w-10 text-center text-sm text-gray-300 bg-gray-900 border border-gray-700 rounded py-0.5
                           focus:border-indigo-500 focus:outline-none disabled:opacity-30
                           [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => setSlideCount(Math.min(50, slideCount + 1))}
                disabled={isGenerating}
                className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 text-sm flex items-center justify-center disabled:opacity-30"
              >+</button>
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <label className="text-[10px] text-gray-600 uppercase tracking-wider block mb-2">Quick templates</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Business Review', prompt: 'Quarterly business review with revenue metrics, team updates, key risks, and next quarter priorities', count: 12 },
                { label: 'Product Launch', prompt: 'Product launch presentation covering the problem, solution, market opportunity, competitive landscape, go-to-market strategy, and timeline', count: 10 },
                { label: 'Technical Architecture', prompt: 'Technical architecture deep-dive covering system design, data flow, infrastructure, scalability, security, and monitoring', count: 10 },
                { label: 'Team Standup', prompt: 'Team status update: what was done, what is in progress, blockers, and priorities for the week', count: 6 },
                { label: 'Investor Pitch', prompt: 'Startup pitch deck: problem, solution, market size, business model, traction, team, financial projections, and ask', count: 12 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => { setPrompt(preset.prompt); setSlideCount(preset.count); if (!title) setTitle(preset.label) }}
                  disabled={isGenerating}
                  className="px-2.5 py-1 text-[11px] rounded-full bg-gray-800 hover:bg-gray-700 text-gray-500
                             hover:text-gray-300 transition-colors border border-gray-700 disabled:opacity-30"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {genError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
              {genError}
            </div>
          )}

          {/* Progress */}
          {isGenerating && progress && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-gray-300">{progress.status}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress.total > 0 ? (progress.slideIndex / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || (!prompt.trim() && !sourceFile)}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500
                       disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500
                       text-white font-medium rounded-lg transition-all text-sm flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Generate Presentation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

const PROVIDER_META: Record<string, { name: string; placeholder: string; icon: string; description: string }> = {
  anthropic:   { name: 'Anthropic',    placeholder: 'sk-ant-...',  icon: 'A', description: 'Claude Sonnet 4, Opus 4, Haiku 4' },
  openai:      { name: 'OpenAI',       placeholder: 'sk-proj-...', icon: 'O', description: 'GPT-4o, o3, o4-mini' },
  google:      { name: 'Google Gemini', placeholder: 'AIza...',    icon: 'G', description: 'Gemini 2.5 Pro, Flash' },
  mistral:     { name: 'Mistral',      placeholder: 'key-...',    icon: 'M', description: 'Mistral Large, Medium, Small' },
  meta:        { name: 'Meta Llama',   placeholder: 'LA-...',     icon: 'L', description: 'Llama 4 Maverick, Scout, 3.3' },
  xai:         { name: 'xAI',          placeholder: 'xai-...',    icon: 'X', description: 'Grok 3, Grok 3 Mini' },
  perplexity:  { name: 'Perplexity',   placeholder: 'pplx-...',   icon: 'P', description: 'Sonar Pro, Sonar Reasoning' },
  ollama:      { name: 'Ollama',       placeholder: 'http://localhost:11434', icon: '🦙', description: 'Local models via Ollama' },
}

const PROVIDER_KEY_FIELDS: Record<string, string> = {
  anthropic:   'anthropicApiKey',
  openai:      'openaiApiKey',
  google:      'geminiApiKey',
  mistral:     'mistralApiKey',
  meta:        'llamaApiKey',
  xai:         'xaiApiKey',
  perplexity:  'perplexityApiKey',
  ollama:      'ollamaBaseUrl',
}

const ALL_PROVIDER_IDS = ['anthropic', 'openai', 'google', 'mistral', 'meta', 'xai', 'perplexity', 'ollama']

function SettingsPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const { theme, setTheme, palette, setPalette, fontSize, setFontSize, refreshProviderStatuses, providerStatuses, aiModel, setAiModel } = useUIStore()
  const activeProviderId = getProviderForModel(aiModel)?.id ?? 'anthropic'
  const [nativeExec, setNativeExec] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState('')
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [validating, setValidating] = useState(false)
  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [mcpRunning, setMcpRunning] = useState(false)
  const [mcpInClaude, setMcpInClaude] = useState(false)
  const [mcpMessage, setMcpMessage] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.mcpStatus().then((status) => {
      setMcpEnabled(status.enabled)
      setMcpRunning(status.running)
      setMcpInClaude(status.inClaudeDesktop)
    })
  }, [])

  useEffect(() => {
    window.electronAPI.getAppSettings().then((settings) => {
      setNativeExec((settings.nativeExecutionEnabled as boolean) || false)
      if (settings.theme === 'light' || settings.theme === 'dark') {
        setTheme(settings.theme)
      }
      if (typeof settings.fontSize === 'number') {
        setFontSize(settings.fontSize)
      }
      // Load all keys
      const loadedKeys: Record<string, string> = {}
      for (const id of ALL_PROVIDER_IDS) {
        const field = PROVIDER_KEY_FIELDS[id]
        if (field) loadedKeys[id] = (settings[field] as string) || ''
      }
      setKeys(loadedKeys)
    })
    setValidating(true)
    const timer = setTimeout(() => setValidating(false), 10000) // safety fallback
    refreshProviderStatuses().finally(() => { clearTimeout(timer); setValidating(false) })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.setAppSettings({
      theme,
      nativeExecutionEnabled: nativeExec,
      fontSize,
      palette: palette.name,
      aiModel
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveKey = async (providerId: string, key: string) => {
    const field = PROVIDER_KEY_FIELDS[providerId]
    if (!field) return
    await window.electronAPI.setAppSettings({ [field]: key })
    setKeys((prev) => ({ ...prev, [providerId]: key }))
    setEditingProvider(null)
    setEditingKey('')
    setValidating(true)
    await refreshProviderStatuses()
    setValidating(false)
  }

  const openKeyModal = (providerId: string) => {
    setEditingProvider(providerId)
    setEditingKey(keys[providerId] || '')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-12 pb-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-white">Settings</h2>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="max-w-lg mx-auto space-y-8">

          {/* Appearance */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Appearance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Theme</label>
                <div className="flex gap-1 bg-gray-800 rounded-lg p-0.5 border border-gray-800">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      theme === 'dark' ? 'bg-white text-black' : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      theme === 'light' ? 'bg-white text-black' : 'text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Accent</label>
                <div className="flex gap-2">
                  {COLOR_PALETTES.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setPalette(p)}
                      className={`w-7 h-7 rounded-full border-2 transition-colors ${
                        palette.name === p.name ? 'border-white' : 'border-gray-700 hover:border-gray-500'
                      }`}
                      style={{ backgroundColor: p.accent }}
                      title={p.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Editor font size</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                    className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 text-sm flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-sm text-gray-300 w-6 text-center">{fontSize}</span>
                  <button
                    onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                    className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-500 text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* AI Providers */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">AI Providers</h3>
            <p className="text-[10px] text-gray-600 mb-3">Configure API keys for the LLM providers you want to use. Keys can also be set per-deck via a .env file.</p>
            <div className="grid grid-cols-2 gap-3">
              {ALL_PROVIDER_IDS.map((id) => {
                const meta = PROVIDER_META[id]
                const status = providerStatuses.find((s) => s.id === id)
                const providerStatus = status?.status ?? (status?.hasKey ? 'connected' : 'not_configured')

                const dotColor = providerStatus === 'connected' ? 'bg-green-500'
                  : providerStatus === 'invalid' ? 'bg-yellow-500'
                  : 'bg-red-500'

                const labelColor = providerStatus === 'connected' ? 'text-green-400'
                  : providerStatus === 'invalid' ? 'text-yellow-400'
                  : 'text-gray-600'

                const labelText = providerStatus === 'connected' ? 'Connected'
                  : providerStatus === 'invalid' ? 'Invalid key'
                  : 'Not configured'

                const hasKey = providerStatus !== 'not_configured'
                const isActive = activeProviderId === id
                const isConnected = providerStatus === 'connected'
                const keySource = status?.keySource ?? null
                const isFromEnv = keySource === 'env-file' || keySource === 'env-var'

                const selectThisProvider = async (): Promise<void> => {
                  if (id === 'ollama') {
                    const models = await window.electronAPI.ollamaModels()
                    if (models.length > 0) {
                      setAiModel(models[0].id)
                    }
                    return
                  }
                  const providerDef = AI_PROVIDERS.find((p) => p.id === id)
                  if (providerDef && providerDef.models.length > 0) {
                    setAiModel(providerDef.models[0].id)
                  }
                }

                const handleSelectProvider = (e: React.MouseEvent): void => {
                  e.stopPropagation()
                  if (!hasKey && providerStatus === 'not_configured') return
                  selectThisProvider()
                }

                return (
                  <div
                    key={id}
                    className={`text-left p-3 rounded-xl border transition-all group cursor-pointer ${
                      isActive
                        ? 'border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20'
                        : 'border-gray-800 bg-gray-900 hover:border-gray-600 hover:bg-gray-800'
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return
                      openKeyModal(id)
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {/* Radio indicator */}
                      <button
                        onClick={handleSelectProvider}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isActive
                            ? 'border-blue-500 bg-blue-500'
                            : isConnected
                              ? 'border-gray-500 hover:border-gray-400'
                              : 'border-gray-700 opacity-40'
                        }`}
                        title={isConnected ? `Set ${meta.name} as active provider` : 'Configure API key first'}
                      >
                        {isActive && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </button>
                      <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 group-hover:bg-gray-700">
                        {meta.icon}
                      </div>
                      <span className="text-sm font-medium text-gray-200 flex-1">{meta.name}</span>
                      {(hasKey || keys[id]) && !isFromEnv && (
                        <button
                          onClick={() => handleSaveKey(id, '')}
                          className="w-5 h-5 rounded-md flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Clear key"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${validating ? 'bg-gray-500 animate-pulse' : dotColor}`} />
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">{meta.description}</p>
                    <p className={`text-[10px] mt-1 ${validating ? 'text-gray-500' : labelColor}`}>
                      {validating ? 'Validating...' : (
                        <>
                          {isActive && 'Active · '}
                          {labelText}
                          {isFromEnv && hasKey && (
                            <span className="text-gray-500 ml-1">
                              (from {keySource === 'env-file' ? '.env' : 'env var'})
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Execution */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Code Execution</h3>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300 block">Native execution</label>
                <p className="text-[10px] text-gray-600">Run code with system interpreters (Node, Python, etc.)</p>
              </div>
              <button
                onClick={() => setNativeExec(!nativeExec)}
                className={`w-10 h-6 rounded-full transition-colors relative ${
                  nativeExec ? 'bg-white' : 'bg-gray-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full transition-transform absolute top-1 ${
                  nativeExec ? 'translate-x-5 bg-black' : 'translate-x-1 bg-gray-400'
                }`} />
              </button>
            </div>
          </section>

          {/* Claude Integration (MCP) */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Claude Integration</h3>
            <div className="space-y-4">
              {/* MCP Server toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-gray-300 block">MCP Server</label>
                  <p className="text-[10px] text-gray-600">
                    Let Claude Desktop create and edit presentations
                    {mcpRunning && <span className="text-green-500 ml-1">Running</span>}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const next = !mcpEnabled
                    setMcpEnabled(next)
                    await window.electronAPI.setAppSettings({ mcpServerEnabled: next })
                    const result = await window.electronAPI.mcpToggle(next)
                    setMcpRunning(result.running)
                  }}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    mcpEnabled ? 'bg-white' : 'bg-gray-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full transition-transform absolute top-1 ${
                    mcpEnabled ? 'translate-x-5 bg-black' : 'translate-x-1 bg-gray-400'
                  }`} />
                </button>
              </div>

              {/* Add to Claude Desktop button */}
              <div>
                <button
                  onClick={async () => {
                    setMcpMessage(null)
                    if (mcpInClaude) {
                      const res = await window.electronAPI.mcpRemoveFromClaude()
                      setMcpMessage(res.message)
                      setMcpInClaude(false)
                    } else {
                      const res = await window.electronAPI.mcpAddToClaude()
                      setMcpMessage(res.message)
                      setMcpInClaude(res.success)
                    }
                  }}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                    mcpInClaude
                      ? 'bg-gray-800 text-gray-400 hover:bg-red-900/30 hover:text-red-400 border border-gray-700'
                      : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  {mcpInClaude ? 'Remove from Claude Desktop' : 'Add to Claude Desktop'}
                </button>
                {mcpMessage && (
                  <p className="text-[10px] text-gray-500 mt-2">{mcpMessage}</p>
                )}
                {!mcpInClaude && (
                  <p className="text-[10px] text-gray-600 mt-1">Writes the Lecta MCP config to Claude Desktop so you can create slides from Claude.</p>
                )}
              </div>
            </div>
          </section>

          {/* Save */}
          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={handleSave}
              className="w-full py-2.5 bg-white hover:bg-gray-200 text-black font-medium rounded-lg transition-colors text-sm"
            >
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>

      {/* API Key Modal */}
      {editingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEditingProvider(null)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div
            className="w-full max-w-md mx-4 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600">
                {PROVIDER_META[editingProvider]?.icon}
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">
                  {editingProvider === 'ollama' ? `${PROVIDER_META[editingProvider]?.name} Base URL` : `${PROVIDER_META[editingProvider]?.name} API Key`}
                </h3>
                <p className="text-[10px] text-gray-500">{PROVIDER_META[editingProvider]?.description}</p>
              </div>
            </div>

            <input
              type={editingProvider === 'ollama' ? 'url' : 'password'}
              value={editingKey}
              onChange={(e) => setEditingKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey(editingProvider, editingKey) }}
              placeholder={PROVIDER_META[editingProvider]?.placeholder}
              autoFocus
              className="w-full px-3 py-2.5 bg-gray-950 text-gray-300 text-sm rounded-lg border border-gray-700
                         focus:border-indigo-500 focus:outline-none placeholder-gray-600 mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => handleSaveKey(editingProvider, editingKey)}
                className="flex-1 py-2 bg-white hover:bg-gray-200 text-black font-medium rounded-lg transition-colors text-sm"
              >
                {editingProvider === 'ollama' ? 'Save URL' : 'Save Key'}
              </button>
              {keys[editingProvider] && (
                <button
                  onClick={() => handleSaveKey(editingProvider, '')}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg transition-colors text-sm border border-red-600/30"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setEditingProvider(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function stripMarkdown(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')       // HTML tags
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1')   // *italic*
    .replace(/__(.+?)__/g, '$1')   // __bold__
    .replace(/_(.+?)_/g, '$1')     // _italic_
    .replace(/`(.+?)`/g, '$1')     // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/^#{1,3}\s/, '')      // headings
    .replace(/^[-*+]\s/, '')       // bullets
    .trim()
}

function MiniSlidePreview({ markdown, isMdx, theme, rootPath }: { markdown: string; isMdx?: boolean; theme?: string; rootPath?: string }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.15)
  const SLIDE_W = 1280
  const SLIDE_H = 720

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setScale(el.clientWidth / SLIDE_W)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="w-full aspect-video overflow-hidden relative" style={{ pointerEvents: 'none' }}>
      <div
        data-slide-theme={theme || 'dark'}
        className="absolute top-0 left-0 overflow-hidden"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        <div className="absolute inset-0" style={{ background: 'var(--slide-bg)' }} />
        <div className={`absolute inset-0 ${isMdx ? '' : 'slide-pad'} overflow-hidden`}>
          <div style={{ width: isMdx ? SLIDE_W : SLIDE_W - 160, height: isMdx ? SLIDE_H : undefined }}>
            <ContentRenderer markdown={markdown} rootPath={rootPath} isMdx={isMdx} />
          </div>
        </div>
      </div>
    </div>
  )
}

function RecentCard({ deck, onClick, onRemove }: { deck: RecentDeck; onClick: () => void; onRemove?: () => void }): JSX.Element {
  const previewLines = (deck.firstSlidePreview || '')
    .split('\n').filter((l) => l.trim()).slice(0, 4)

  const isNotebook = deck.type === 'notebook'

  if (isNotebook) {
    return (
      <button
        onClick={onClick}
        className="group text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600
                   hover:bg-gray-800 transition-all overflow-hidden"
      >
        {/* Indigo accent top bar */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-400" />
        {/* Notebook preview */}
        <div className="h-28 px-3 pb-3 pt-6 overflow-hidden relative"
          style={{
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, rgba(255,255,255,0.04) 23px, rgba(255,255,255,0.04) 24px)',
          }}
        >
          <span className="absolute top-2 right-2 text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">
            Notebook
          </span>
          {onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove() }}
              className="absolute top-2 left-2 w-5 h-5 rounded-full bg-gray-800/80 hover:bg-red-600 text-gray-500 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
              title="Remove from recent"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {previewLines.length > 0 ? (
            <div className="space-y-1">
              {previewLines.map((line, i) => {
                const text = stripMarkdown(line)
                return (
                  <div key={i} className={`truncate ${
                    i === 0 ? 'text-[11px] font-semibold text-gray-200' : 'text-[9px] text-gray-500'
                  }`}>{text}</div>
                )
              })}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
          )}
        </div>
        <div className="border-t border-gray-800 p-3">
          <div className="text-sm text-gray-200 font-medium truncate group-hover:text-white">{deck.title}</div>
          <div className="flex items-center gap-2 mt-1.5">
            {deck.slideCount && (
              <span className="text-[10px] text-gray-500">{deck.slideCount} notes</span>
            )}
            {deck.date && (
              <span className="text-[10px] text-gray-600">
                {new Date(deck.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600
                 hover:bg-gray-800 transition-all overflow-hidden"
    >
      <div className="border-b border-gray-800 overflow-hidden relative">
        <span className="absolute top-2 right-2 z-10 text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">
          Slides
        </span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="absolute top-2 left-2 z-10 w-5 h-5 rounded-full bg-gray-800/80 hover:bg-red-600 text-gray-500 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
            title="Remove from recent"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <MiniSlidePreview
          markdown={deck.firstSlideContent || deck.firstSlidePreview || ''}
          isMdx={deck.firstSlideIsMdx}
          theme={deck.theme}
          rootPath={deck.path}
        />
      </div>
      <div className="p-3">
        <div className="text-sm text-gray-200 font-medium truncate group-hover:text-white">{deck.title}</div>
        <div className="flex items-center gap-2 mt-1.5">
          {deck.artifacts?.map((a) => (
            <span key={a} className="text-[8px] text-gray-400">
              {a === 'code' ? '{ }' : a === 'video' ? '▶' : a === 'webapp' ? '◎' : '📎'}
            </span>
          ))}
          {deck.slideCount && (
            <span className="text-[10px] text-gray-600">{deck.slideCount} slides</span>
          )}
          {deck.date && (
            <span className="text-[10px] text-gray-600">
              {new Date(deck.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Help Panel ──

function HelpPanel({ onBack }: { onBack: () => void }): JSX.Element {
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-12 pb-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-white">Help</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="max-w-lg mx-auto space-y-8">

          {/* Getting Started */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Getting Started</h3>
            <div className="space-y-3">
              <HelpStep num="1" title="Create" desc="Click New on the home screen. Give your presentation a name and pick a theme." />
              <HelpStep num="2" title="Write" desc="Add slides with Markdown or the visual editor. Attach code files, images, and PDFs." />
              <HelpStep num="3" title="Present" desc="Hit F5 to enter presenter mode. Run code live, navigate with arrow keys." />
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-1">
              <ShortcutRow keys="← / →" action="Previous / Next slide" />
              <ShortcutRow keys="⌘ + Enter" action="Run code" />
              <ShortcutRow keys="F5" action="Enter presenter mode" />
              <ShortcutRow keys="Esc" action="Exit presenter mode" />
              <ShortcutRow keys="N" action="Toggle speaker notes" />
              <ShortcutRow keys="Shift + N" action="Add new slide" />
              <ShortcutRow keys="⌘ + /" action="Toggle chat agent" />
            </div>
          </section>

          {/* Themes */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Themes</h3>
            <div className="flex flex-wrap gap-2">
              {['Dark', 'Light', 'Executive', 'Minimal', 'Corporate', 'Creative', 'Keynote Dark', 'Paper'].map(t => (
                <span key={t} className="px-3 py-1 text-xs rounded-full bg-gray-900 text-gray-300 border border-gray-700">{t}</span>
              ))}
            </div>
          </section>

          {/* Slide Layouts */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Slide Layouts</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['default', 'Standard top-down'],
                ['center', 'Centered content'],
                ['title', 'Big title + subtitle'],
                ['section', 'Section break'],
                ['two-col', 'Two equal columns'],
                ['two-col-wide-left', '60/40 split'],
                ['two-col-wide-right', '40/60 split'],
                ['three-col', 'Three columns'],
                ['top-bottom', 'Top and bottom'],
                ['big-number', 'Large stat'],
                ['quote', 'Centered quote'],
                ['blank', 'Full canvas'],
              ].map(([name, desc]) => (
                <div key={name} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
                  <div className="text-xs font-mono text-gray-300">{name}</div>
                  <div className="text-[11px] text-gray-500">{desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Use with Claude */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Use with Claude</h3>
            <p className="text-sm text-gray-400 mb-3">
              Lecta includes an MCP server that connects to Claude Desktop and Claude Code.
              Create and edit presentations just by talking to Claude.
            </p>
            <div className="space-y-2 mb-4">
              {[
                '"Create a 10-slide presentation about microservices"',
                '"Add a slide about error handling with a Python example"',
                '"Change the theme to executive"',
              ].map(ex => (
                <div key={ex} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-300 italic">{ex}</div>
              ))}
            </div>
            <div className="space-y-3">
              <HelpStep num="1" title="Enable MCP Server" desc="Go to Settings and turn on the MCP Server toggle under Claude Integration." />
              <HelpStep num="2" title="Add to Claude Desktop" desc="Click the 'Add to Claude Desktop' button in Settings. This configures Claude automatically." />
              <HelpStep num="3" title="Start using it" desc="Restart Claude Desktop. Ask Claude to create slides — changes appear live in Lecta." />
            </div>
          </section>

          {/* MCP Tools */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">MCP Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['create_presentation', 'Create a new deck'],
                ['add_slide', 'Add a slide with content & code'],
                ['edit_slide', 'Update content or layout'],
                ['delete_slide', 'Remove a slide'],
                ['list_slides', 'See all slides'],
                ['set_theme', 'Change the theme'],
                ['add_artifact', 'Attach files to a slide'],
              ].map(([name, desc]) => (
                <div key={name} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
                  <div className="text-xs font-mono text-gray-300">{name}</div>
                  <div className="text-[11px] text-gray-500">{desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* AI Providers */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">AI Providers</h3>
            <p className="text-sm text-gray-400 mb-3">Add API keys in Settings to enable AI features.</p>
            <div className="space-y-1">
              {[
                ['Anthropic', 'Claude Sonnet 4, Opus 4, Haiku 4'],
                ['OpenAI', 'GPT-4o, GPT-4o Mini, o3, o3-mini, o4-mini'],
                ['Google Gemini', 'Gemini 2.5 Pro, 2.5 Flash, 2.0 Flash'],
                ['Mistral', 'Large, Medium, Small'],
                ['Meta Llama', 'Llama 4 Maverick, Scout, 3.3 70B'],
                ['xAI', 'Grok 3, Grok 3 Fast, Mini, Mini Fast'],
                ['Perplexity', 'Sonar Pro, Sonar, Reasoning Pro, Reasoning'],
              ].map(([provider, models]) => (
                <div key={provider} className="flex items-baseline gap-3 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
                  <span className="text-xs font-mono text-gray-300 w-24 flex-shrink-0">{provider}</span>
                  <span className="text-[11px] text-gray-500">{models}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Links */}
          <section className="pb-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Links</h3>
            <div className="space-y-2">
              <a href="https://github.com/ruimachado-orbit/lecta" target="_blank" rel="noopener noreferrer"
                className="block px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors">
                GitHub Repository
              </a>
              <a href="https://github.com/ruimachado-orbit/lecta/issues" target="_blank" rel="noopener noreferrer"
                className="block px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors">
                Report an Issue
              </a>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

function HelpStep({ num, title, desc }: { num: string; title: string; desc: string }): JSX.Element {
  return (
    <div className="flex gap-3 items-start px-3 py-2.5 rounded-lg bg-gray-900 border border-gray-800">
      <span className="w-5 h-5 rounded-full bg-gray-700 text-white text-[11px] font-mono flex items-center justify-center flex-shrink-0 mt-0.5">{num}</span>
      <div>
        <div className="text-sm font-medium text-gray-200">{title}</div>
        <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
      </div>
    </div>
  )
}

function ShortcutRow({ keys, action }: { keys: string; action: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-gray-900 transition-colors">
      <kbd className="text-xs font-mono text-gray-300 bg-gray-800 px-2 py-0.5 rounded border border-gray-700 min-w-[80px] text-center">{keys}</kbd>
      <span className="text-sm text-gray-400">{action}</span>
    </div>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
    </svg>
  )
}

function PlusIcon(): JSX.Element {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  )
}

function LoadingSpinner(): JSX.Element {
  return (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
