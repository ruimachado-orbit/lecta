import { useState, useRef, useCallback } from 'react'
import { useNotebookStore } from '../../stores/notebook-store'
import type { NoteLayout } from '../../../../../packages/shared/src/types/notebook'

const NOTE_LAYOUTS: { value: NoteLayout; label: string; icon: string }[] = [
  { value: 'lines', label: 'Lines', icon: '\u2261' },
  { value: 'blank', label: 'Blank', icon: '\u25A1' },
  { value: 'agenda', label: 'Agenda', icon: '\u2630' },
  { value: 'grid', label: 'Grid', icon: '\u2591' },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function groupPagesByDate(pages: { config: { createdAt: string } }[]): [string, number[], boolean][] {
  const groups = new Map<string, { indices: number[]; isToday: boolean }>()
  pages.forEach((page, index) => {
    const dateKey = formatDate(page.config.createdAt)
    const existing = groups.get(dateKey) || { indices: [], isToday: false }
    existing.indices.push(index)
    if (isToday(page.config.createdAt)) existing.isToday = true
    groups.set(dateKey, existing)
  })
  // Sort: today first, then most recent
  const entries = Array.from(groups.entries()).map(([k, v]) => [k, v.indices, v.isToday] as [string, number[], boolean])
  entries.sort((a, b) => {
    if (a[2] && !b[2]) return -1
    if (!a[2] && b[2]) return 1
    return 0
  })
  return entries
}

export function NoteNavigator(): JSX.Element {
  const { pages, currentPageIndex, goToPage, addNote, addSubnote, deleteNote, setNoteLayout, renameNote } = useNotebookStore()

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageIndex: number } | null>(null)
  const [renaming, setRenaming] = useState<{ pageIndex: number; value: string } | null>(null)
  const renameInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.focus() }, [])

  const handleContextMenu = (e: React.MouseEvent, pageIndex: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pageIndex })
  }

  const handleAddNote = async () => {
    const noteId = `note-${Date.now()}`
    await addNote(noteId)
  }

  const handleAddSubnote = async () => {
    if (contextMenu === null) return
    const noteId = `note-${Date.now()}`
    // Navigate to the context menu page first
    goToPage(contextMenu.pageIndex)
    await addSubnote(noteId)
    setContextMenu(null)
  }

  const handleDelete = async () => {
    if (contextMenu === null) return
    goToPage(contextMenu.pageIndex)
    await deleteNote()
    setContextMenu(null)
  }

  const handleSetLayout = async (layout: NoteLayout) => {
    if (contextMenu === null) return
    goToPage(contextMenu.pageIndex)
    // Small delay to ensure the store has navigated
    setTimeout(async () => {
      await setNoteLayout(layout)
      setContextMenu(null)
    }, 50)
  }

  // Group pages by date — today first
  const dateGroups = groupPagesByDate(pages)

  // Track collapsed parent notes
  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(new Set())
  const toggleCollapse = (idx: number) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  // Determine which pages have children (subnotes directly after them)
  const hasChildren = (pageIndex: number): boolean => {
    const page = pages[pageIndex]
    if (!page) return false
    const nextPage = pages[pageIndex + 1]
    return !!nextPage && nextPage.depth > page.depth
  }

  return (
    <div className="bg-gray-900 border-t border-gray-800">
      <div className="h-16 flex items-center px-4 overflow-x-auto gap-0">
        {dateGroups.map(([dateLabel, indices, todayFlag], groupIdx) => (
          <div key={dateLabel} className="flex items-center flex-shrink-0">
            {/* Date group divider */}
            {groupIdx > 0 && <div className="w-px h-8 bg-gray-700 mx-2 flex-shrink-0" />}
            <div className="flex flex-col items-center mr-2 flex-shrink-0">
              <span className={`text-[8px] uppercase tracking-wider leading-none ${todayFlag ? 'text-white font-bold' : 'text-gray-600'}`}>
                {todayFlag ? 'Today' : dateLabel}
              </span>
              <span className="text-[7px] text-gray-700 mt-0.5">{indices.length}</span>
            </div>

            {/* Note chips */}
            {indices.map((pageIndex) => {
              const page = pages[pageIndex]
              const isActive = pageIndex === currentPageIndex
              const depth = page.depth
              const isSubnote = depth > 0
              const isParentWithChildren = hasChildren(pageIndex)
              const isCollapsed = collapsedParents.has(pageIndex)

              // Hide subnotes if their parent is collapsed
              if (isSubnote) {
                // Find parent: walk backwards to find the first page with lower depth
                let parentIdx = pageIndex - 1
                while (parentIdx >= 0 && pages[parentIdx].depth >= depth) parentIdx--
                if (parentIdx >= 0 && collapsedParents.has(parentIdx)) return null
              }

              return (
                <div
                  key={page.config.id}
                  className="flex items-center flex-shrink-0"
                  style={{ marginLeft: depth > 0 ? `${depth * 4}px` : undefined }}
                >
                  {pageIndex > indices[0] && <div className="w-1 flex-shrink-0" />}
                  {renaming?.pageIndex === pageIndex ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renaming.value}
                      onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const trimmed = renaming.value.trim().replace(/\s+/g, '-').toLowerCase()
                          if (trimmed && trimmed !== page.config.id) {
                            await renameNote(page.config.id, trimmed)
                          }
                          setRenaming(null)
                        }
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={async () => {
                        const trimmed = renaming.value.trim().replace(/\s+/g, '-').toLowerCase()
                        if (trimmed && trimmed !== page.config.id) {
                          await renameNote(page.config.id, trimmed)
                        }
                        setRenaming(null)
                      }}
                      className="flex-shrink-0 w-24 h-10 px-2 bg-gray-950 text-gray-300 text-[10px] rounded-md border-2 border-white focus:outline-none"
                    />
                  ) : (
                  <button
                    onClick={() => {
                      if (isParentWithChildren && pageIndex === currentPageIndex) {
                        toggleCollapse(pageIndex)
                      } else {
                        goToPage(pageIndex)
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, pageIndex)}
                    className={`group/card flex-shrink-0 rounded-md border-2 transition-all text-left px-2 py-1 relative ${
                      isSubnote ? 'h-8 w-16' : 'h-10 w-20'
                    } ${
                      isActive
                        ? 'border-white bg-gray-800 text-gray-200'
                        : 'border-gray-600 bg-gray-900 text-gray-400 hover:border-gray-400 hover:text-gray-200'
                    }`}
                    title={page.config.id}
                  >
                    {/* Delete button — top right on hover */}
                    {pages.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          goToPage(pageIndex)
                          deleteNote()
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity cursor-pointer hover:bg-red-400 z-10"
                        title="Delete note"
                      >
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </span>
                    )}
                    <span className={`block truncate font-medium ${isSubnote ? 'text-[7px]' : 'text-[8px]'}`}>
                      {page.markdownContent?.replace(/<[^>]+>/g, '').replace(/^#+\s*/, '').trim().split('\n')[0]?.slice(0, 30) || page.config.id}
                    </span>
                    {/* Collapse/expand indicator for parents with children */}
                    {isParentWithChildren && (
                      <span className="absolute top-0.5 right-1 text-[7px] text-gray-500">
                        {isCollapsed ? '+' : '−'}
                      </span>
                    )}
                    {!isSubnote && !isParentWithChildren && page.config.layout && (
                      <span className="block text-[6px] text-gray-600 mt-0.5">
                        {page.config.layout}
                      </span>
                    )}
                  </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="flex-shrink-0 w-3" />

        {/* Add note button */}
        <button
          onClick={handleAddNote}
          className="flex-shrink-0 w-10 h-10 rounded-md border-2 border-dashed border-gray-700 hover:border-white hover:text-white text-gray-600 flex items-center justify-center transition-colors"
          title="Add new note"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-56"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 260),
              bottom: window.innerHeight - contextMenu.y,
              maxHeight: `${contextMenu.y - 8}px`
            }}
          >
            <div className="px-3 py-1 text-[9px] text-gray-500 uppercase tracking-wider">
              {pages[contextMenu.pageIndex]?.config.id}
            </div>

            {/* Rename */}
            <button
              onClick={() => {
                const noteId = pages[contextMenu.pageIndex]?.config.id
                if (noteId) {
                  setRenaming({ pageIndex: contextMenu.pageIndex, value: noteId })
                  setContextMenu(null)
                }
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
              Rename
            </button>

            {/* Layout picker */}
            <div className="border-t border-gray-800 my-1" />
            <div className="text-[9px] uppercase tracking-wider text-gray-600 px-3 py-0.5">Layout</div>
            <div className="px-3 py-1 flex gap-1">
              {NOTE_LAYOUTS.map((l) => {
                const currentLayout = pages[contextMenu.pageIndex]?.config.layout || 'blank'
                return (
                  <button
                    key={l.value}
                    onClick={() => handleSetLayout(l.value)}
                    className={`flex-1 h-7 rounded text-[10px] flex items-center justify-center gap-1 transition-colors ${
                      currentLayout === l.value
                        ? 'bg-white text-black'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                    }`}
                    title={l.label}
                  >
                    <span>{l.icon}</span>
                    <span className="text-[8px]">{l.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="border-t border-gray-800 my-1" />

            {/* Add subnote */}
            <button
              onClick={handleAddSubnote}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add subnote
            </button>

            <div className="border-t border-gray-800 my-1" />

            {/* Archive (placeholder, just navigates away for now) */}
            <button
              onClick={() => {
                // Archive is a no-op placeholder for now — could mark as archived in metadata
                setContextMenu(null)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              Archive
            </button>

            {/* Delete */}
            {pages.length > 1 && (
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 transition-colors flex items-center gap-2"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete note
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
