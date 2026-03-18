import { useNotebookStore } from '../../stores/notebook-store'
import { NoteEditor } from './NoteEditor'

export function NotePanel(): JSX.Element {
  const { pages, currentPageIndex, notebook } = useNotebookStore()
  const currentPage = pages[currentPageIndex]

  if (!currentPage) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 bg-gray-950">
        No notes loaded
      </div>
    )
  }

  // Determine the layout class for the current page
  const layout = currentPage.config.layout || notebook?.defaultLayout || 'blank'
  const layoutClass = `note-layout-${layout}`

  return (
    <div className={`h-full flex flex-col bg-gray-950 overflow-hidden ${layoutClass}`}>
      {/* Page header — subtle note identifier */}
      <div className="h-7 bg-gray-900 border-b border-gray-800 flex items-center px-4 gap-3 flex-shrink-0">
        <span className="text-[10px] text-gray-500 font-medium">
          {currentPage.config.id}
        </span>
        {currentPage.depth > 0 && (
          <span className="text-[9px] text-gray-600 px-1.5 py-0.5 bg-gray-800 rounded">
            depth {currentPage.depth}
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[9px] text-gray-600 uppercase tracking-wider px-1.5 py-0.5 bg-gray-800/50 rounded">
          {layout}
        </span>
      </div>

      {/* Editor area — full height, scrollable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <NoteEditor key={currentPageIndex} pageIndex={currentPageIndex} />
      </div>
    </div>
  )
}
