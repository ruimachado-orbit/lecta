import { useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

export function HomeScreen(): JSX.Element {
  const { openFolder, loadPresentation, isLoading, error } = usePresentationStore()
  const [recentDecks, setRecentDecks] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.getRecentDecks().then(setRecentDecks)
  }, [])

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-lg w-full px-8">
        {/* Logo / Title */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
            Lec<span className="text-indigo-400">ta</span>
          </h1>
          <p className="text-gray-400 text-lg">
            Technical presentations with live code execution
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-4">
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

          {error && (
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

        {/* Footer */}
        <p className="text-center text-gray-700 text-xs mt-12">
          Create a <code className="text-gray-500">lecta.yaml</code> in any folder to get started
        </p>
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

function LoadingSpinner(): JSX.Element {
  return (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
