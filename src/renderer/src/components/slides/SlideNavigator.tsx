import { useState, useRef, useCallback } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

export function SlideNavigator({ subSlideCount, currentSubSlide }: { subSlideCount?: number; currentSubSlide?: number }): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, addSlide, deleteSlide, reorderSlide, renameSlide } =
    usePresentationStore()
  const { slideGroups, addSlideGroup, removeSlideGroup, toggleGroupCollapsed, addSlideToGroup, removeSlideFromGroup } =
    useUIStore()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [dropGroupId, setDropGroupId] = useState<string | null>(null)
  const dragRef = useRef<number | null>(null)

  // Multi-select
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const lastClickedRef = useRef<number | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showNewGroupInMenu, setShowNewGroupInMenu] = useState(false)
  const [newGroupNameInMenu, setNewGroupNameInMenu] = useState('')

  const renamingInFlight = useRef(false)
  const renameInputRef = useCallback((node: HTMLInputElement | null) => { if (node) node.focus() }, [])

  // Click with shift/cmd support
  const handleSlideClick = (e: React.MouseEvent, index: number) => {
    if (e.shiftKey && lastClickedRef.current !== null) {
      const from = Math.min(lastClickedRef.current, index)
      const to = Math.max(lastClickedRef.current, index)
      const next = new Set<number>()
      for (let i = from; i <= to; i++) next.add(i)
      setSelectedIndices(next)
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIndices((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index); else next.add(index)
        return next
      })
    } else {
      setSelectedIndices(new Set())
      goToSlide(index)
    }
    lastClickedRef.current = index
  }

  const handleContextMenu = (e: React.MouseEvent, index: number) => {
    e.preventDefault()
    if (!selectedIndices.has(index)) setSelectedIndices(new Set([index]))
    setContextMenu({ x: e.clientX, y: e.clientY })
    setShowNewGroupInMenu(false)
  }

  const selectedSlideIds = Array.from(selectedIndices).map((i) => slides[i]?.config.id).filter(Boolean)

  const handleDeleteSelected = async () => {
    if (selectedIndices.size === 0 || selectedIndices.size >= slides.length) return
    const sorted = Array.from(selectedIndices).sort((a, b) => b - a)
    for (const idx of sorted) { if (slides.length > 1) await deleteSlide(idx) }
    setSelectedIndices(new Set()); setContextMenu(null)
  }

  const handleGroupSelected = (groupId: string) => {
    for (const sid of selectedSlideIds) {
      slideGroups.forEach((g) => { if (g.slideIds.includes(sid)) removeSlideFromGroup(g.id, sid) })
      addSlideToGroup(groupId, sid)
    }
    setSelectedIndices(new Set()); setContextMenu(null)
  }

  const handleCreateGroupFromSelected = () => {
    const name = newGroupNameInMenu.trim()
    if (!name) return
    addSlideGroup(name)
    setTimeout(() => {
      const groups = useUIStore.getState().slideGroups
      const ng = groups[groups.length - 1]
      if (ng) {
        for (const sid of selectedSlideIds) {
          useUIStore.getState().slideGroups.forEach((g) => {
            if (g.slideIds.includes(sid)) removeSlideFromGroup(g.id, sid)
          })
          useUIStore.getState().addSlideToGroup(ng.id, sid)
        }
      }
      setSelectedIndices(new Set()); setContextMenu(null); setShowNewGroupInMenu(false); setNewGroupNameInMenu('')
    }, 0)
  }

  const handleStartRename = (index: number) => {
    setRenaming(index); setRenameValue(slides[index].config.id); setContextMenu(null); setSelectedIndices(new Set())
  }

  const handleFinishRename = async () => {
    if (renaming === null || renamingInFlight.current) return
    const index = renaming
    const trimmed = renameValue.trim().replace(/\s+/g, '-').toLowerCase()
    setRenaming(null)
    if (trimmed && trimmed !== slides[index].config.id) {
      renamingInFlight.current = true
      try { await renameSlide(index, trimmed) } finally { renamingInFlight.current = false }
    }
  }

  // Drag
  const handleDragStart = (e: React.DragEvent, i: number) => { dragRef.current = i; setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }
  const handleDragOverSlide = (e: React.DragEvent, i: number) => { e.preventDefault(); setDropTarget(i); setDropGroupId(null) }
  const handleDropOnSlide = async (e: React.DragEvent, to: number) => { e.preventDefault(); const from = dragRef.current; resetDrag(); if (from !== null && from !== to) await reorderSlide(from, to) }
  const handleDropOnGroup = (e: React.DragEvent, gid: string) => {
    e.preventDefault(); const from = dragRef.current; resetDrag()
    if (from !== null) { const sid = slides[from].config.id; slideGroups.forEach((g) => { if (g.slideIds.includes(sid)) removeSlideFromGroup(g.id, sid) }); addSlideToGroup(gid, sid) }
  }
  const resetDrag = () => { setDragIndex(null); setDropTarget(null); setDropGroupId(null); dragRef.current = null }

  const slideGroupMap = new Map<string, string>()
  slideGroups.forEach((g) => g.slideIds.forEach((id) => slideGroupMap.set(id, g.id)))

  return (
    <div className="bg-gray-900 border-t border-gray-800">
      {slideGroups.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-800 overflow-x-auto">
          <span className="text-[8px] text-gray-600 mr-1 flex-shrink-0">GROUPS</span>
          {slideGroups.map((group) => (
            <div key={group.id}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropGroupId(group.id); setDropTarget(null) }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropGroupId(group.id) }}
              onDragLeave={(e) => { e.preventDefault(); setDropGroupId(null) }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnGroup(e, group.id) }}
              className={`group/chip flex items-center gap-1 px-2 py-1 text-[9px] rounded transition-colors flex-shrink-0 ${
                dropGroupId === group.id ? 'bg-white text-black ring-2 ring-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              <span onClick={() => toggleGroupCollapsed(group.id)} className="flex items-center gap-1 cursor-pointer" style={dragIndex !== null ? { pointerEvents: 'none' } : {}}>
                <span className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`}>▸</span>
                {group.name} <span className={dropGroupId === group.id ? 'text-gray-300' : 'text-gray-600'}>({group.slideIds.length})</span>
              </span>
              {dragIndex === null && <span onClick={() => removeSlideGroup(group.id)} className="hidden group-hover/chip:inline text-gray-500 hover:text-gray-200 ml-0.5 cursor-pointer">×</span>}
            </div>
          ))}
        </div>
      )}

      <div className="h-16 flex items-center px-4 gap-2 overflow-x-auto">
        {slides.map((slide, index) => {
          const isActive = index === currentSlideIndex
          const isSelected = selectedIndices.has(index)
          const isDragging = dragIndex === index
          const isDropTgt = dropTarget === index && dragIndex !== index
          const groupId = slideGroupMap.get(slide.config.id)
          const group = groupId ? slideGroups.find((g) => g.id === groupId) : null
          if (group?.collapsed) return null

          if (renaming === index) {
            return <input key={`ren-${index}`} ref={renameInputRef} type="text" value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setRenaming(null) }}
              onBlur={handleFinishRename}
              className="flex-shrink-0 w-24 h-10 px-2 bg-gray-950 text-gray-300 text-[10px] rounded-md border-2 border-white focus:outline-none" />
          }

          return (
            <div key={slide.config.id} draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOverSlide(e, index)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDropOnSlide(e, index)}
              onDragEnd={resetDrag}
              onClick={(e) => handleSlideClick(e, index)}
              onContextMenu={(e) => handleContextMenu(e, index)}
              className={`group flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                overflow-visible px-1.5 py-1 text-left relative cursor-grab active:cursor-grabbing ${
                isDragging ? 'opacity-40 border-gray-600'
                : isDropTgt ? 'border-gray-400 bg-white/5'
                : isSelected ? 'border-white bg-white/10 text-gray-200'
                : isActive ? 'border-white bg-gray-800 text-gray-300'
                : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600 hover:text-gray-400'
              }`}
              title="Shift+click to multi-select">
              {group && <span className="absolute -top-2 left-1 text-[7px] px-1 bg-gray-700 text-gray-400 rounded-sm leading-none">{group.name}</span>}
              {isSelected && selectedIndices.size > 1 && <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white text-black text-[8px] font-bold rounded-full flex items-center justify-center z-10">✓</span>}
              <span className="block truncate font-medium">{index + 1}. {slide.config.id}</span>
              {/* Artifact icons — bottom right */}
              <div className="absolute bottom-0.5 right-1 flex gap-0.5">
                {slide.config.code && <ArtifactDot title="Code" icon="code" />}
                {slide.config.video && <ArtifactDot title="Video" icon="video" />}
                {slide.config.webapp && <ArtifactDot title="Web" icon="web" />}
                {slide.config.artifacts.length > 0 && <ArtifactDot title={`${slide.config.artifacts.length} file(s)`} icon="file" />}
              </div>
              {slides.length > 1 && !isSelected && (
                <button onClick={(e) => { e.stopPropagation(); deleteSlide(index) }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 hover:bg-red-400 text-white rounded-full hidden group-hover:flex items-center justify-center z-10">
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          )
        })}

        <button onClick={() => addSlide(`slide-${slides.length + 1}`)}
          className="flex-shrink-0 w-10 h-10 rounded-md border-2 border-dashed border-gray-700 hover:border-white hover:text-white text-gray-600 flex items-center justify-center transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
        </button>

        {showNewGroup ? (
          <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) { addSlideGroup(newGroupName.trim()); setNewGroupName(''); setShowNewGroup(false) }; if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName('') } }}
            onBlur={() => { if (!newGroupName.trim()) setShowNewGroup(false) }} placeholder="Group name" autoFocus
            className="flex-shrink-0 w-20 px-2 py-1 bg-gray-950 text-gray-300 text-[10px] rounded border border-gray-700 focus:border-white focus:outline-none" />
        ) : (
          <button onClick={() => setShowNewGroup(true)} className="flex-shrink-0 h-10 px-2 rounded-md border-2 border-dashed border-gray-700 hover:border-white hover:text-white text-gray-600 flex items-center justify-center transition-colors text-[9px]">Group</button>
        )}
      </div>

      {/* Context menu for selection */}
      {contextMenu && selectedIndices.size > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setContextMenu(null); setSelectedIndices(new Set()); setShowNewGroupInMenu(false) }} />
          <div className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-52" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="px-3 py-1 text-[9px] text-gray-500 uppercase tracking-wider">
              {selectedIndices.size} slide{selectedIndices.size > 1 ? 's' : ''} selected
            </div>

            {selectedIndices.size === 1 && (
              <button onClick={() => handleStartRename(Array.from(selectedIndices)[0])}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors">Rename</button>
            )}

            <div className="border-t border-gray-800 my-1" />

            {slideGroups.length > 0 && (
              <>
                <div className="text-[9px] uppercase tracking-wider text-gray-600 px-3 py-0.5">Move to group</div>
                {slideGroups.map((g) => (
                  <button key={g.id} onClick={() => handleGroupSelected(g.id)}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors">{g.name}</button>
                ))}
              </>
            )}

            {showNewGroupInMenu ? (
              <div className="px-2 py-1.5 flex gap-1">
                <input type="text" value={newGroupNameInMenu} onChange={(e) => setNewGroupNameInMenu(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateGroupFromSelected() }} placeholder="Group name" autoFocus
                  className="flex-1 px-2 py-1 bg-gray-950 text-gray-300 text-[10px] rounded border border-gray-700 focus:border-white focus:outline-none" />
                <button onClick={handleCreateGroupFromSelected} disabled={!newGroupNameInMenu.trim()}
                  className="px-2 py-1 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Create</button>
              </div>
            ) : (
              <button onClick={() => setShowNewGroupInMenu(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors">Create new group...</button>
            )}

            {selectedIndices.size < slides.length && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <button onClick={handleDeleteSelected}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 transition-colors">
                  Delete {selectedIndices.size > 1 ? `${selectedIndices.size} slides` : 'slide'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ArtifactDot({ title, icon }: { title: string; icon: 'code' | 'video' | 'web' | 'file' }): JSX.Element {
  const icons: Record<string, string> = {
    code: '{ }',
    video: '▶',
    web: '◎',
    file: '📎'
  }
  return (
    <span
      className="text-gray-500 text-[6px] leading-none"
      title={title}
    >
      {icons[icon]}
    </span>
  )
}
