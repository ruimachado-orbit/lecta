import { useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

export function HomeScreen(): JSX.Element {
  const { openFolder, loadPresentation, isLoading, error } = usePresentationStore()
  const [recentDecks, setRecentDecks] = useState<string[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getRecentDecks().then(setRecentDecks)
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

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="max-w-lg w-full px-8" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800
                       text-white font-medium rounded-xl transition-colors text-lg
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
                           focus:border-indigo-500 focus:outline-none text-base placeholder-gray-600"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateLecta}
                  disabled={!newName.trim()}
                  className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-50
                             text-white font-medium rounded-lg transition-colors text-sm"
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
                <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
                  {createError}
                </div>
              )}
            </div>
          )}

          {(error && !createError) && (
            <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Recent Decks */}
        {recentDecks.length > 0 && (
          <div className="mt-10">
            <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-3">
              Recent
            </h3>
            <div className="space-y-1">
              {recentDecks.map((deckPath) => (
                <button
                  key={deckPath}
                  onClick={() => loadPresentation(deckPath)}
                  className="w-full text-left px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800
                             hover:text-white transition-colors text-sm truncate"
                >
                  {deckPath.split('/').pop()}
                  <span className="text-gray-600 ml-2">{deckPath}</span>
                </button>
              ))}
            </div>
          </div>
        )}
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
