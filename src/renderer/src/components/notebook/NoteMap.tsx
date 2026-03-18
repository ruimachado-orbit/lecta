import { useState } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import { useUIStore } from '../../stores/ui-store'

function formatDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

const LAYOUT_COLORS: Record<string, string> = {
  lines: 'bg-blue-500/20 text-blue-400',
  blank: 'bg-gray-500/20 text-gray-400',
  agenda: 'bg-green-500/20 text-green-400',
  grid: 'bg-purple-500/20 text-purple-400',
}

export function NoteMap(): JSX.Element {
  const { notebook, pages, currentPageIndex, goToPage } = useNotebookStore()
  const [searchQuery, setSearchQuery] = useState('')

  // Build tree structure for display
  // Pages are already in flat DFS order with depth — we use depth for indentation
  const filteredPages = searchQuery.trim()
    ? pages
        .map((p, i) => ({ page: p, index: i }))
        .filter(({ page }) =>
          page.config.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          page.markdownContent.toLowerCase().includes(searchQuery.toLowerCase())
        )
    : pages.map((p, i) => ({ page: p, index: i }))

  const handleClose = () => {
    useUIStore.setState({ showSlideMap: false })
  }

  const handleNavigate = (index: number) => {
    goToPage(index)
    handleClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="bg-gray-950 rounded-2xl border border-gray-800 w-[80vw] max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-black font-bold text-sm">
              {notebook?.title?.charAt(0)?.toUpperCase() || 'N'}
            </div>
            <div>
              <h2 className="text-white font-semibold">{notebook?.title || 'Notebook'}</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-gray-500 text-xs">{pages.length} notes</span>
                {notebook?.author && <span className="text-gray-600 text-xs">by {notebook.author}</span>}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-800">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter notes..."
            autoFocus
            className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 outline-none focus:border-gray-600 transition-colors"
          />
        </div>

        {/* Notes tree */}
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-1">
            {filteredPages.map(({ page, index }) => {
              const isActive = index === currentPageIndex
              const layout = page.config.layout || notebook?.defaultLayout || 'blank'
              const layoutStyle = LAYOUT_COLORS[layout] || LAYOUT_COLORS.blank

              // Extract first line of content
              const firstLine = page.markdownContent
                ?.replace(/<!--.*?-->/g, '')
                .replace(/^#+\s*/, '')
                .trim()
                .split('\n')[0]
                ?.slice(0, 80) || 'Empty note'

              return (
                <button
                  key={page.config.id}
                  onClick={() => handleNavigate(index)}
                  className={`w-full text-left rounded-lg border transition-colors ${
                    isActive
                      ? 'border-white bg-gray-900 shadow-md shadow-white/5 ring-1 ring-white/20'
                      : 'border-gray-800 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900'
                  }`}
                  style={{ marginLeft: page.depth * 24 }}
                >
                  <div className="flex items-center gap-3 px-4 py-3">
                    {/* Depth indicator */}
                    {page.depth > 0 && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {Array.from({ length: page.depth }).map((_, d) => (
                          <div key={d} className="w-0.5 h-6 bg-gray-700 rounded-full" />
                        ))}
                      </div>
                    )}

                    {/* Note info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                          {page.config.id}
                        </span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${layoutStyle}`}>
                          {layout}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">
                        {firstLine}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-[10px] text-gray-600 flex-shrink-0">
                      {formatDateShort(page.config.createdAt)}
                    </div>

                    {/* Index badge */}
                    <div className={`text-[10px] font-mono flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-600'}`}>
                      {String(index + 1).padStart(2, '0')}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {filteredPages.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-12">
              No notes match your search
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400/50" /> Lines
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-400/50" /> Blank
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400/50" /> Agenda
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-purple-400/50" /> Grid
            </span>
          </div>
          <span className="text-[10px] text-gray-600">Click a note to navigate</span>
        </div>
      </div>
    </div>
  )
}
