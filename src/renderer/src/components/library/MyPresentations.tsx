import { useState, useEffect, useCallback, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useNotebookStore } from '../../stores/notebook-store'
import { ContentRenderer } from '../slides/ContentRenderer'

interface LibraryFolder {
  id: string
  name: string
  parentId: string | null
  color?: string
}

interface LibraryEntry {
  id: string
  path: string
  title: string
  type: 'presentation' | 'notebook'
  folderId: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
  slideCount: number
  firstSlidePreview: string
  firstSlideContent?: string
  firstSlideIsMdx?: boolean
  theme?: string
}

interface LibraryData {
  folders: LibraryFolder[]
  entries: LibraryEntry[]
}

const TAG_PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6b7280', '#ffffff',
]

function LibMiniSlide({ markdown, isMdx, theme, rootPath }: { markdown: string; isMdx?: boolean; theme?: string; rootPath?: string }): JSX.Element {
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

export function MyPresentations({ onBack }: { onBack: () => void }): JSX.Element {
  const { loadPresentation } = usePresentationStore()
  const { loadNotebook } = useNotebookStore()

  const [library, setLibrary] = useState<LibraryData>({ folders: [], entries: [] })
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; entry?: LibraryEntry; folder?: LibraryFolder } | null>(null)

  // Tag editing
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_PALETTE[0])
  const [colorPickerTag, setColorPickerTag] = useState<string | null>(null)

  // New folder
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Folder delete confirmation
  const [deletingFolder, setDeletingFolder] = useState<LibraryFolder | null>(null)

  // Drag and drop
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await window.electronAPI.getLibrary()
    setLibrary(data)
    const tags = await window.electronAPI.getAllLibraryTags()
    setAllTags(tags)
    const colors = await window.electronAPI.getTagColors()
    setTagColors(colors)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [contextMenu])

  // ── Filters ──

  const filtered = library.entries.filter((e) => {
    if (selectedFolderId === '__unfiled__' && e.folderId !== null) return false
    if (selectedFolderId && selectedFolderId !== '__unfiled__' && e.folderId !== selectedFolderId) return false
    if (selectedTag && !e.tags.includes(selectedTag)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!e.title.toLowerCase().includes(q) && !e.tags.some((t) => t.toLowerCase().includes(q))) return false
    }
    return true
  }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const rootFolders = library.folders.filter((f) => !f.parentId)

  // ── Actions ──

  const handleOpen = async (entry: LibraryEntry) => {
    try {
      // If path is a .lecta file, extract it to a workspace first
      let loadPath = entry.path
      if (loadPath.endsWith('.lecta')) {
        loadPath = await window.electronAPI.openLectaPath(loadPath)
      }
      if (entry.type === 'notebook') {
        await loadNotebook(loadPath)
      } else {
        await loadPresentation(loadPath)
      }
    } catch (err: any) {
      if (err?.message?.startsWith('NOTEBOOK:')) {
        await loadNotebook(err.message.replace('NOTEBOOK:', ''))
      }
    }
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await window.electronAPI.createLibraryFolder(newFolderName.trim(), null)
    setNewFolderName('')
    setShowNewFolder(false)
    await refresh()
  }

  const handleDeleteEntry = async (entryId: string, deleteFile: boolean) => {
    await window.electronAPI.deleteLibraryEntry(entryId, deleteFile)
    setContextMenu(null)
    await refresh()
  }

  const handleMoveEntry = async (entryId: string, folderId: string | null) => {
    await window.electronAPI.moveLibraryEntry(entryId, folderId)
    setContextMenu(null)
    await refresh()
  }

  const handleAddTag = async (entryId: string, tag: string, color?: string) => {
    if (!tag.trim()) return
    const t = tag.trim()
    await window.electronAPI.addLibraryEntryTag(entryId, t)
    // Set color for new tag if one was chosen and tag doesn't have a color yet
    if (color && !tagColors[t]) {
      await window.electronAPI.setTagColor(t, color)
      setTagColors((prev) => ({ ...prev, [t]: color }))
    }
    setNewTag('')
    setNewTagColor(TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)])
    await refresh()
  }

  const handleRemoveTag = async (entryId: string, tag: string) => {
    await window.electronAPI.removeLibraryEntryTag(entryId, tag)
    await refresh()
  }

  const handleConfirmDeleteFolder = async (deleteEntries: boolean) => {
    if (!deletingFolder) return
    await window.electronAPI.deleteFolderWithEntries(deletingFolder.id, deleteEntries)
    if (selectedFolderId === deletingFolder.id) setSelectedFolderId(null)
    setDeletingFolder(null)
    await refresh()
  }

  const handleRenameEntry = async (entryId: string) => {
    if (!renameValue.trim()) return
    await window.electronAPI.renameLibraryEntry(entryId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
    await refresh()
  }

  const handleRenameFolder = async (folderId: string) => {
    if (!renameValue.trim()) return
    await window.electronAPI.renameLibraryFolder(folderId, renameValue.trim())
    setRenamingId(null)
    setRenameValue('')
    await refresh()
  }

  const handleSetTagColor = async (tag: string, color: string) => {
    await window.electronAPI.setTagColor(tag, color)
    setTagColors((prev) => ({ ...prev, [tag]: color }))
    setColorPickerTag(null)
  }

  const handleDrop = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    setDragOverFolderId(null)
    const entryId = e.dataTransfer.getData('text/entry-id')
    if (!entryId) return
    await handleMoveEntry(entryId, folderId)
  }

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverFolderId(folderId)
  }

  const getTagColor = (tag: string) => tagColors[tag] || '#6366f1'

  const folderEntryCount = (folderId: string) => library.entries.filter((e) => e.folderId === folderId).length

  return (
    <div className="h-screen bg-gray-950 flex flex-col" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-12 pb-4 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={onBack} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="text-lg font-medium text-white flex-1">My Presentations</h2>
        <span className="text-xs text-gray-500 mr-2">{library.entries.length} items</span>
        <button
          onClick={async () => {
            const count = await window.electronAPI.importLectaFiles()
            if (count > 0) await refresh()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors border border-gray-700"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          Import .lecta
        </button>
      </div>

      <div className="flex-1 flex min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* ── Sidebar: Folders + Tags ── */}
        <div className="w-52 flex-shrink-0 border-r border-gray-800 flex flex-col p-3 gap-4 overflow-y-auto">
          {/* Folders */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Folders</span>
              <button onClick={() => setShowNewFolder(true)} className="text-gray-600 hover:text-gray-300 transition-colors" title="New folder">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            {/* All */}
            <button
              onClick={() => { setSelectedFolderId(null); setSelectedTag(null) }}
              className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                !selectedFolderId && !selectedTag ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              All
              <span className="text-[10px] text-gray-600 ml-auto">{library.entries.length}</span>
            </button>

            {/* Folder list */}
            {rootFolders.map((folder) => {
              const count = folderEntryCount(folder.id)
              return (
                <div
                  key={folder.id}
                  className="group flex items-center"
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(e) => handleDrop(e, folder.id)}
                >
                  <button
                    onClick={() => { setSelectedFolderId(folder.id); setSelectedTag(null) }}
                    className={`flex-1 text-left px-2 py-1.5 rounded-l text-xs transition-colors flex items-center gap-2 min-w-0 ${
                      dragOverFolderId === folder.id ? 'bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500' :
                      selectedFolderId === folder.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: folder.color || '#6366f1' }} />
                    {renamingId === folder.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRenameFolder(folder.id); if (e.key === 'Escape') setRenamingId(null) }}
                        onBlur={() => setRenamingId(null)}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none min-w-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="truncate flex-1">{folder.name}</span>
                    )}
                    <span className="text-[10px] text-gray-600">{count}</span>
                  </button>
                  {/* Edit/delete on hover */}
                  <div className="hidden group-hover:flex items-center flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingId(folder.id); setRenameValue(folder.name) }}
                      className="p-1 text-gray-600 hover:text-gray-300 transition-colors" title="Rename folder"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingFolder(folder) }}
                      className="p-1 text-gray-600 hover:text-red-400 transition-colors" title="Delete folder"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              )
            })}

            {/* Unfiled */}
            {(() => {
              const unfiledCount = library.entries.filter((e) => !e.folderId).length
              return (
                <button
                  onClick={() => { setSelectedFolderId('__unfiled__'); setSelectedTag(null) }}
                  onDragOver={(e) => handleDragOver(e, '__unfiled__')}
                  onDragLeave={() => setDragOverFolderId(null)}
                  onDrop={(e) => handleDrop(e, null)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center gap-2 ${
                    dragOverFolderId === '__unfiled__' ? 'bg-indigo-600/30 text-indigo-300 ring-1 ring-indigo-500' :
                    selectedFolderId === '__unfiled__' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                  }`}
                >
                  <svg className="w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  Unfiled
                  <span className="text-[10px] text-gray-600 ml-auto">{unfiledCount}</span>
                </button>
              )
            })()}

            {/* New folder input */}
            {showNewFolder && (
              <div className="flex items-center gap-1 mt-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
                  placeholder="Folder name"
                  className="flex-1 px-2 py-1 bg-gray-900 text-xs text-white rounded border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-600"
                />
              </div>
            )}
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 mb-2 block">Tags</span>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => { setSelectedTag(selectedTag === tag ? null : tag); setSelectedFolderId(null) }}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                      selectedTag === tag
                        ? 'text-white border-transparent'
                        : 'text-gray-200 border-transparent hover:brightness-110'
                    }`}
                    style={{
                      backgroundColor: selectedTag === tag ? getTagColor(tag) : getTagColor(tag) + '30',
                      borderColor: selectedTag === tag ? getTagColor(tag) : 'transparent',
                      color: selectedTag === tag ? '#fff' : getTagColor(tag)
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search bar */}
          <div className="px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-colors">
              <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search presentations..."
                className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-600 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-500 hover:text-gray-300">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-600">
                <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
                <p className="text-sm">No presentations found</p>
                <p className="text-[10px] mt-1">Open or create a presentation and it will appear here</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((entry) => {
                  const folder = library.folders.find((f) => f.id === entry.folderId)
                  const isPresentation = entry.type !== 'notebook'

                  return (
                    <div
                      key={entry.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/entry-id', entry.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={() => handleOpen(entry)}
                      onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, entry }) }}
                      className="group cursor-pointer rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600
                                 hover:bg-gray-800 transition-all overflow-hidden"
                    >
                      {/* Preview */}
                      <div className="border-b border-gray-800 overflow-hidden relative">
                        <span className="absolute top-1.5 right-1.5 z-10 text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800/80 text-gray-400">
                          {isPresentation ? 'Slides' : 'Notebook'}
                        </span>
                        <LibMiniSlide
                          markdown={entry.firstSlideContent || entry.firstSlidePreview || ''}
                          isMdx={entry.firstSlideIsMdx}
                          theme={entry.theme}
                          rootPath={entry.path}
                        />
                      </div>

                      {/* Info */}
                      <div className="p-2.5">
                        <div className="text-xs font-medium text-gray-200 truncate mb-1">{entry.title}</div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                          {folder && (
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: folder.color || '#6366f1' }} />
                              {folder.name}
                            </span>
                          )}
                          <span>{entry.slideCount} slides</span>
                          <span>{new Date(entry.updatedAt).toLocaleDateString()}</span>
                        </div>
                        {/* Tags — colorful pills */}
                        {entry.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {entry.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{
                                  backgroundColor: getTagColor(tag) + '25',
                                  color: getTagColor(tag),
                                  border: `1px solid ${getTagColor(tag)}40`
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                            {entry.tags.length > 4 && (
                              <span className="text-[9px] text-gray-600 self-center">+{entry.tags.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="fixed z-[9999] w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 text-xs"
          style={{ top: contextMenu.y, left: contextMenu.x, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {contextMenu.entry && (
            <>
              <button
                onClick={() => { handleOpen(contextMenu.entry!); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-800 transition-colors"
              >Open</button>
              <button
                onClick={() => { setRenamingId(contextMenu.entry!.id); setRenameValue(contextMenu.entry!.title); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-800 transition-colors"
              >Rename</button>
              <button
                onClick={() => { setEditingTagsFor(contextMenu.entry!.id); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-800 transition-colors"
              >Edit Tags</button>

              <div className="border-t border-gray-800 my-1" />
              <div className="px-3 py-1 text-[10px] text-gray-600">Move to</div>
              <button
                onClick={() => handleMoveEntry(contextMenu.entry!.id, null)}
                className="w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-800 transition-colors"
              >Unfiled</button>
              {library.folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleMoveEntry(contextMenu.entry!.id, f.id)}
                  className="w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: f.color || '#6366f1' }} />
                  {f.name}
                </button>
              ))}

              <div className="border-t border-gray-800 my-1" />
              <button
                onClick={() => handleDeleteEntry(contextMenu.entry!.id, false)}
                className="w-full text-left px-3 py-1.5 text-gray-400 hover:bg-gray-800 transition-colors"
              >Remove from Library</button>
              <button
                onClick={() => handleDeleteEntry(contextMenu.entry!.id, true)}
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-600/20 transition-colors"
              >Delete File</button>
            </>
          )}

          {contextMenu.folder && (
            <>
              <button
                onClick={() => { setRenamingId(contextMenu.folder!.id); setRenameValue(contextMenu.folder!.name); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-800 transition-colors"
              >Rename Folder</button>
              <button
                onClick={() => { setDeletingFolder(contextMenu.folder!); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-600/20 transition-colors"
              >Delete Folder</button>
            </>
          )}
        </div>
      )}

      {/* ── Folder Delete Confirmation ── */}
      {deletingFolder && (() => {
        const count = folderEntryCount(deletingFolder.id)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDeletingFolder(null)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-medium text-white mb-1">Delete folder "{deletingFolder.name}"?</h3>
              {count > 0 ? (
                <>
                  <p className="text-[11px] text-gray-400 mb-4">
                    This folder contains <span className="text-white font-medium">{count} presentation{count !== 1 ? 's' : ''}</span>. What would you like to do with them?
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleConfirmDeleteFolder(false)}
                      className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      Move presentations to root and delete folder
                    </button>
                    <button
                      onClick={() => handleConfirmDeleteFolder(true)}
                      className="w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium rounded-lg transition-colors border border-red-500/30"
                    >
                      Delete folder and all {count} presentation{count !== 1 ? 's' : ''}
                    </button>
                    <button
                      onClick={() => setDeletingFolder(null)}
                      className="w-full py-2 text-gray-500 text-xs hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-gray-400 mb-4">This folder is empty.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConfirmDeleteFolder(false)}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >Delete Folder</button>
                    <button
                      onClick={() => setDeletingFolder(null)}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
                    >Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Tag Editor Modal ── */}
      {editingTagsFor && (() => {
        const entry = library.entries.find((e) => e.id === editingTagsFor)
        if (!entry) return null
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setEditingTagsFor(null); setColorPickerTag(null) }}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-medium text-white mb-1">Tags for "{entry.title}"</h3>
              <p className="text-[10px] text-gray-500 mb-3">Click a tag's color dot to change its color</p>

              {/* Current tags */}
              <div className="flex flex-wrap gap-1.5 mb-3 min-h-[28px]">
                {entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                    style={{
                      backgroundColor: getTagColor(tag) + '25',
                      color: getTagColor(tag),
                      border: `1px solid ${getTagColor(tag)}40`
                    }}
                  >
                    {/* Color dot — click to pick color */}
                    <button
                      onClick={() => setColorPickerTag(colorPickerTag === tag ? null : tag)}
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 hover:ring-2 ring-white/30 transition-all"
                      style={{ backgroundColor: getTagColor(tag) }}
                      title="Change tag color"
                    />
                    {tag}
                    <button onClick={() => handleRemoveTag(entry.id, tag)} className="hover:brightness-150 transition-colors ml-0.5">
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                {entry.tags.length === 0 && <span className="text-[10px] text-gray-600">No tags yet</span>}
              </div>

              {/* Color picker */}
              {colorPickerTag && (
                <div className="mb-3 p-2.5 bg-gray-950 rounded-lg border border-gray-800">
                  <div className="text-[10px] text-gray-500 mb-1.5">Color for "{colorPickerTag}"</div>
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleSetTagColor(colorPickerTag, c)}
                        className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${
                          getTagColor(colorPickerTag) === c ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-950' : ''
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Add tag */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { handleAddTag(entry.id, newTag, newTagColor); } }}
                    placeholder="Add a tag..."
                    className="flex-1 px-3 py-2 bg-gray-950 text-sm text-gray-300 rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none placeholder-gray-600"
                  />
                  <button
                    onClick={() => handleAddTag(entry.id, newTag, newTagColor)}
                    disabled={!newTag.trim()}
                    className="px-3 py-2 hover:brightness-110 disabled:opacity-30 text-white text-xs font-medium rounded-lg transition-colors"
                    style={{ backgroundColor: newTagColor }}
                  >Add</button>
                </div>
                {/* Color picker for new tag */}
                {newTag.trim() && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Color:</span>
                    <div className="flex flex-wrap gap-1">
                      {TAG_PALETTE.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewTagColor(c)}
                          className={`w-4 h-4 rounded-full transition-transform hover:scale-125 ${
                            newTagColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : ''
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Suggested tags */}
              {allTags.filter((t) => !entry.tags.includes(t)).length > 0 && (
                <div className="mt-3">
                  <span className="text-[10px] text-gray-600 block mb-1">Existing tags:</span>
                  <div className="flex flex-wrap gap-1">
                    {allTags.filter((t) => !entry.tags.includes(t)).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(entry.id, tag)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors hover:brightness-125"
                        style={{
                          backgroundColor: getTagColor(tag) + '20',
                          color: getTagColor(tag),
                          border: `1px solid ${getTagColor(tag)}30`
                        }}
                      >{tag}</button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => { setEditingTagsFor(null); setColorPickerTag(null) }}
                className="w-full mt-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              >Done</button>
            </div>
          </div>
        )
      })()}

      {/* ── Inline rename for entries in grid ── */}
      {renamingId && library.entries.find((e) => e.id === renamingId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRenamingId(null)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-white mb-3">Rename</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameEntry(renamingId!); if (e.key === 'Escape') setRenamingId(null) }}
              className="w-full px-3 py-2 bg-gray-950 text-sm text-gray-300 rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => handleRenameEntry(renamingId!)} className="flex-1 py-2 bg-white hover:bg-gray-200 text-black text-sm font-medium rounded-lg transition-colors">Save</button>
              <button onClick={() => setRenamingId(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
