import { useState } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'
import { useTabsStore } from '../../stores/tabs-store'
import type { NoteLayout } from '../../../../../packages/shared/src/types/notebook'

const NOTE_LAYOUTS: { value: NoteLayout; label: string; icon: string }[] = [
  { value: 'lines', label: 'Lines', icon: '\u2261' },
  { value: 'blank', label: 'Blank', icon: '\u25A1' },
  { value: 'agenda', label: 'Agenda', icon: '\u2630' },
  { value: 'grid', label: 'Grid', icon: '\u2591' },
]

export function NotebookToolbar(): JSX.Element {
  const { notebook, pages, currentPageIndex, nextPage, prevPage, savePageContent, hasUnsavedChanges, setNoteLayout } =
    useNotebookStore()
  const { theme, setTheme } = useUIStore()
  const { activeTabId, closeTab } = useTabsStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const { goToPage } = useNotebookStore()

  const currentPage = pages[currentPageIndex]
  const currentLayout = currentPage?.config.layout || notebook?.defaultLayout || 'blank'

  // Filter pages by search
  const filteredPages = searchQuery.trim()
    ? pages
        .map((p, i) => ({ page: p, index: i }))
        .filter(({ page }) =>
          page.config.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          page.markdownContent.toLowerCase().includes(searchQuery.toLowerCase())
        )
    : []

  const handleClose = async () => {
    if (hasUnsavedChanges) {
      await savePageContent(currentPageIndex)
    }
    if (activeTabId) {
      closeTab(activeTabId)
    }
    // Always reset notebook store to return to HomeScreen
    useNotebookStore.getState().reset()
  }

  return (
    <div className="h-12 bg-gray-900 border-b border-gray-800 flex items-center pl-20 pr-4 gap-4 select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Close notebook */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          title="Close notebook"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={prevPage}
          disabled={currentPageIndex === 0}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous note"
        >
          <ChevronLeftIcon />
        </button>

        <span className="text-gray-400 text-sm font-mono min-w-[60px] text-center">
          {currentPageIndex + 1} / {pages.length}
        </span>

        <button
          onClick={nextPage}
          disabled={currentPageIndex === pages.length - 1}
          className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next note"
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-800" />

      {/* Title */}
      <div className="flex-1 min-w-0">
        <span className="text-gray-300 text-sm font-medium truncate block">
          {notebook?.title}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Search */}
        <div className="relative">
          <button
            onClick={() => { setShowSearch(!showSearch); setShowLayoutPicker(false) }}
            className={`p-1.5 rounded transition-colors ${
              showSearch ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
            }`}
            title="Search notes"
          >
            <SearchIcon />
          </button>
          {showSearch && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setShowSearch(false); setSearchQuery('') }} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-72">
                <div className="p-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    autoFocus
                    className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-white placeholder-gray-500 outline-none focus:border-gray-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') }
                    }}
                  />
                </div>
                {searchQuery.trim() && (
                  <div className="max-h-64 overflow-y-auto border-t border-gray-800">
                    {filteredPages.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-gray-500 text-center">No matching notes</div>
                    ) : (
                      filteredPages.map(({ page, index }) => {
                        // Find matching context snippet
                        const q = searchQuery.toLowerCase()
                        const plainText = page.markdownContent.replace(/<[^>]+>/g, '').replace(/^#+\s*/gm, '')
                        const matchIdx = plainText.toLowerCase().indexOf(q)
                        let snippet = ''
                        if (matchIdx >= 0) {
                          const start = Math.max(0, matchIdx - 20)
                          const end = Math.min(plainText.length, matchIdx + q.length + 40)
                          snippet = (start > 0 ? '...' : '') + plainText.slice(start, end) + (end < plainText.length ? '...' : '')
                        }

                        return (
                        <button
                          key={page.config.id}
                          onClick={() => {
                            const query = searchQuery
                            goToPage(index)
                            setShowSearch(false)
                            setSearchQuery('')
                            // After navigation, highlight the match in the editor
                            setTimeout(() => {
                              const editorEl = document.querySelector('.ProseMirror')
                              if (!editorEl || !query) return
                              // Use browser's built-in find
                              const sel = window.getSelection()
                              if (!sel) return
                              const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT)
                              const lowerQ = query.toLowerCase()
                              let node: Text | null
                              while ((node = walker.nextNode() as Text | null)) {
                                const idx = node.textContent?.toLowerCase().indexOf(lowerQ) ?? -1
                                if (idx >= 0) {
                                  const range = document.createRange()
                                  range.setStart(node, idx)
                                  range.setEnd(node, idx + query.length)
                                  sel.removeAllRanges()
                                  sel.addRange(range)
                                  // Scroll into view
                                  const rect = range.getBoundingClientRect()
                                  const container = editorEl.closest('.overflow-y-auto')
                                  if (container && rect) {
                                    const containerRect = container.getBoundingClientRect()
                                    if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
                                      node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }
                                  }
                                  break
                                }
                              }
                            }, 200)
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${
                            index === currentPageIndex ? 'text-white bg-gray-800/50' : 'text-gray-400'
                          }`}
                        >
                          <div className="font-medium truncate">
                            {page.markdownContent.replace(/<[^>]+>/g, '').replace(/^#+\s*/gm, '').trim().split('\n')[0]?.slice(0, 40) || page.config.id}
                          </div>
                          {snippet && (
                            <div className="text-gray-600 truncate mt-0.5" dangerouslySetInnerHTML={{
                              __html: snippet.replace(
                                new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                                '<span class="text-white bg-gray-700 px-0.5 rounded">\$1</span>'
                              )
                            }} />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Layout picker */}
        <div className="relative">
          <button
            onClick={() => { setShowLayoutPicker(!showLayoutPicker); setShowSearch(false) }}
            className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
              showLayoutPicker ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'
            }`}
            title="Change layout"
          >
            <LayoutIcon />
            <span className="text-[10px] capitalize">{currentLayout}</span>
          </button>
          {showLayoutPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowLayoutPicker(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-1.5 flex gap-1">
                {NOTE_LAYOUTS.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => { setNoteLayout(l.value); setShowLayoutPicker(false) }}
                    className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded transition-colors ${
                      currentLayout === l.value
                        ? 'bg-white text-black'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                    title={l.label}
                  >
                    <span className="text-lg">{l.icon}</span>
                    <span className="text-[9px]">{l.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-gray-800" />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </div>
  )
}

// ---------- icons ----------

function ChevronLeftIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  )
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  )
}

function SearchIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  )
}

function LayoutIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    </svg>
  )
}

function SunIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  )
}
