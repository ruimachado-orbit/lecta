import { useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore, COLOR_PALETTES } from '../../stores/ui-store'

interface RecentDeck {
  path: string
  title: string
  date: string
}

export function HomeScreen(): JSX.Element {
  const { openFolder, loadPresentation, isLoading, error } = usePresentationStore()
  const [recentDecks, setRecentDecks] = useState<RecentDeck[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getRecentDecks().then((decks: any[]) => {
      // Handle both old string[] and new object[] formats
      setRecentDecks(decks.map((d) =>
        typeof d === 'string'
          ? { path: d, title: d.split('/').pop()?.replace(/^lecta-workspace-/, '').replace(/-[A-Za-z0-9]{6,}$/, '').replace(/-/g, ' ') || d, date: '' }
          : d
      ))
    })
  }, [])

  const handleCreateLecta = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return

    setCreateError(null)
    try {
      const workspaceDir = await window.electronAPI.createLectaFile(trimmed)
      if (workspaceDir) {
        await loadPresentation(workspaceDir)
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

  if (showSettings) {
    return <SettingsPanel onBack={() => setShowSettings(false)} />
  }

  return (
    <div className="h-screen flex items-start justify-center bg-gray-950 relative overflow-y-auto pt-20" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="max-w-xl w-full px-8 pb-16" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <h1
            className="text-5xl text-white tracking-tight mb-3"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: 'italic', fontWeight: 700 }}
          >
            lecta
          </h1>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={openFolder}
            disabled={isLoading}
            className="w-full py-4 px-6 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-400
                       text-black font-medium rounded-xl transition-colors text-lg
                       flex items-center justify-center gap-3"
          >
            {isLoading ? (
              <>
                <LoadingSpinner />
                Loading...
              </>
            ) : (
              <>
                <FolderIcon />
                Open Presentation
              </>
            )}
          </button>
          <p className="text-center text-gray-600 text-xs">
            Open a folder, <code className="text-gray-500">.lecta</code> file, or import a <code className="text-gray-500">.pptx</code>
          </p>

          {!showCreate ? (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-4 px-6 bg-gray-800 hover:bg-gray-700
                         text-gray-300 font-medium rounded-xl transition-colors text-lg
                         flex items-center justify-center gap-3 border border-gray-700"
            >
              <PlusIcon />
              Create New Presentation
            </button>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 space-y-3">
              <label className="text-sm text-gray-400 block">Presentation name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateLecta()}
                placeholder="My Awesome Talk"
                autoFocus
                className="w-full px-4 py-3 bg-gray-950 text-white rounded-lg border border-gray-700
                           focus:border-white focus:outline-none text-base placeholder-gray-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateLecta}
                  disabled={!newName.trim()}
                  className="flex-1 py-2.5 px-4 bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-400 disabled:opacity-50
                             text-black font-medium rounded-lg transition-colors text-sm"
                >
                  Save as .lecta
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newName.trim()}
                  className="flex-1 py-2.5 px-4 bg-gray-700 hover:bg-gray-600 disabled:opacity-50
                             text-gray-300 font-medium rounded-lg transition-colors text-sm"
                >
                  Save as Folder
                </button>
              </div>
              <button
                onClick={() => { setShowCreate(false); setNewName(''); setCreateError(null) }}
                className="w-full py-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors"
              >
                Cancel
              </button>
              {createError && (
                <div className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-4 py-3 text-sm">
                  {createError}
                </div>
              )}
            </div>
          )}

          {(error && !createError) && (
            <div className="bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Recent Presentations */}
        {recentDecks.length > 0 && (
          <div className="mt-10">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-4">
              Recent Presentations
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {recentDecks.map((deck) => (
                <button
                  key={deck.path}
                  onClick={() => loadPresentation(deck.path)}
                  className="group text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600
                             hover:bg-gray-800 transition-all overflow-hidden"
                >
                  {/* Thumbnail area */}
                  <div className="h-24 bg-black flex items-center justify-center border-b border-gray-800">
                    <span className="text-white text-lg font-bold opacity-20 truncate px-4">
                      {deck.title.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <div className="text-sm text-gray-200 font-medium truncate group-hover:text-white">
                      {deck.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      {deck.date ? (
                        <span className="text-[10px] text-gray-500">
                          {new Date(deck.date).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-600">—</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Settings gear — bottom left */}
      <button
        onClick={() => setShowSettings(true)}
        className="absolute bottom-6 left-6 p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      </button>
    </div>
  )
}

function SettingsPanel({ onBack }: { onBack: () => void }): JSX.Element {
  const { theme, setTheme, palette, setPalette, fontSize, setFontSize } = useUIStore()
  const [apiKey, setApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [nativeExec, setNativeExec] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load settings from disk on mount
  useEffect(() => {
    window.electronAPI.getAppSettings().then((settings) => {
      setApiKey((settings.anthropicApiKey as string) || '')
      setAiModel((settings.aiModel as string) || 'claude-sonnet-4-20250514')
      setNativeExec((settings.nativeExecutionEnabled as boolean) || false)
      // Sync UI store from persisted settings
      if (settings.theme === 'light' || settings.theme === 'dark') {
        setTheme(settings.theme)
      }
      if (typeof settings.fontSize === 'number') {
        setFontSize(settings.fontSize)
      }
    })
  }, [])

  const handleSave = async () => {
    await window.electronAPI.setAppSettings({
      theme,
      anthropicApiKey: apiKey,
      aiModel,
      nativeExecutionEnabled: nativeExec,
      fontSize,
      palette: palette.name
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="h-screen bg-gray-950 flex flex-col" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-12 pb-6" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onBack}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
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
              {/* Theme */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Theme</label>
                <div className="flex gap-1 bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      theme === 'dark' ? 'bg-white text-black' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      theme === 'light' ? 'bg-white text-black' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>

              {/* Accent color */}
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

              {/* Font size */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-300">Editor font size</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFontSize(Math.max(12, fontSize - 1))}
                    className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-sm text-gray-300 w-6 text-center">{fontSize}</span>
                  <button
                    onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                    className="w-7 h-7 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* AI */}
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">AI</h3>
            <div className="space-y-4">
              {/* API Key */}
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Anthropic API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 bg-gray-900 text-gray-300 text-sm rounded-lg border border-gray-700
                             focus:border-white focus:outline-none placeholder-gray-600"
                />
                <p className="text-[10px] text-gray-600 mt-1">Can also be set per-deck via a .env file</p>
              </div>

              {/* Model */}
              <div>
                <label className="text-sm text-gray-300 block mb-1.5">Model</label>
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 text-gray-300 text-sm rounded-lg border border-gray-700
                             focus:border-white focus:outline-none"
                >
                  <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                  <option value="claude-opus-4-20250514">Claude Opus 4</option>
                  <option value="claude-haiku-4-20250414">Claude Haiku 4</option>
                </select>
              </div>
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
