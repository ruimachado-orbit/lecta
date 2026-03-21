import { useState, useRef, useCallback } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

export function SlideNavigator({ subSlideCount, currentSubSlide }: { subSlideCount?: number; currentSubSlide?: number }): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, addSlide, deleteSlide, reorderSlide, renameSlide, setSlideTransition, setSlideLayout, toggleSkipSlide, updateMarkdownContent, saveSlideContent, presentation } =
    usePresentationStore()
  const { slideGroups, addSlideGroup, removeSlideGroup, toggleGroupCollapsed, addSlideToGroup, removeSlideFromGroup, setGroupColor } =
    useUIStore()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [groupContextMenu, setGroupContextMenu] = useState<{ x: number; y: number; groupId: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [dropGroupId, setDropGroupId] = useState<string | null>(null)
  const dragRef = useRef<number | null>(null)

  const [showAddSlideMenu, setShowAddSlideMenu] = useState(false)
  const [isBeautifying, setIsBeautifying] = useState(false)
  const [beautifyReview, setBeautifyReview] = useState<{
    slideIndex: number
    original: string
    proposed: string
  } | null>(null)

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
    <div className="bg-gray-900 border-t border-gray-800 relative">
      {/* Beautify review bar */}
      {beautifyReview && (
        <div className="bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            <span className="text-xs text-white font-medium">Review beautified slide</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { updateMarkdownContent(beautifyReview.slideIndex, beautifyReview.original); setBeautifyReview(null) }}
              className="px-3 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors">
              Reject
            </button>
            <button onClick={() => { saveSlideContent(beautifyReview.slideIndex); setBeautifyReview(null) }}
              className="px-3 py-1 text-[11px] bg-white hover:bg-gray-200 text-black font-medium rounded transition-colors">
              Accept
            </button>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {isBeautifying && !beautifyReview && (
        <div className="bg-gray-800 border-b border-gray-700 flex items-center gap-2 px-4 py-2">
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-xs text-gray-400">Beautifying slide with AI...</span>
        </div>
      )}

      {slideGroups.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-800 overflow-x-auto">
          <span className="text-[8px] text-gray-600 mr-1 flex-shrink-0">GROUPS</span>
          {slideGroups.map((group) => (
            <div key={group.id}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropGroupId(group.id); setDropTarget(null) }}
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDropGroupId(group.id) }}
              onDragLeave={(e) => { e.preventDefault(); setDropGroupId(null) }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleDropOnGroup(e, group.id) }}
              onContextMenu={(e) => { e.preventDefault(); setGroupContextMenu({ x: e.clientX, y: e.clientY, groupId: group.id }) }}
              className={`group/chip flex items-center gap-1 px-2 py-1 text-[9px] rounded transition-colors flex-shrink-0 ${
                dropGroupId === group.id ? 'bg-white text-black ring-2 ring-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              style={group.color ? { borderLeft: `3px solid ${group.color}` } : undefined}>
              <span onClick={() => toggleGroupCollapsed(group.id)} className="flex items-center gap-1 cursor-pointer" style={dragIndex !== null ? { pointerEvents: 'none' } : {}}>
                <span className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`}>▸</span>
                {group.name} <span className={dropGroupId === group.id ? 'text-gray-300' : 'text-gray-600'}>({group.slideIds.length})</span>
              </span>
              {dragIndex === null && <span onClick={() => removeSlideGroup(group.id)} className="hidden group-hover/chip:inline text-gray-500 hover:text-gray-200 ml-0.5 cursor-pointer">×</span>}
            </div>
          ))}
        </div>
      )}

      <div className="h-16 flex items-center px-4 overflow-x-auto">
        {slides.map((slide, index) => {
          const isActive = index === currentSlideIndex
          const isSelected = selectedIndices.has(index)
          const isSkipped = !!slide.config.skipped
          const isDragging = dragIndex === index
          const isDropTgt = dropTarget === index && dragIndex !== index
          const groupId = slideGroupMap.get(slide.config.id)
          const group = groupId ? slideGroups.find((g) => g.id === groupId) : null

          // Collapsed group: show a group chip for the first slide, hide the rest
          if (group?.collapsed) {
            const isFirstInGroup = group.slideIds[0] === slide.config.id
            if (!isFirstInGroup) return null
            return (
              <div key={`grp-${group.id}`} className="flex items-center flex-shrink-0">
                {index > 0 && <div className="w-2 flex-shrink-0" />}
                <button
                  onClick={() => toggleGroupCollapsed(group.id)}
                  className="flex-shrink-0 h-10 px-3 rounded-md border-2 border-dashed
                             bg-gray-900 hover:text-gray-300
                             transition-colors text-[9px] flex items-center gap-1.5"
                  style={{
                    borderColor: group.color ? `${group.color}60` : '#4b5563',
                    color: group.color || '#9ca3af'
                  }}
                  title={`${group.name} — ${group.slideIds.length} slides (click to expand)`}
                >
                  {group.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />}
                  <span>▸</span>
                  <span className="font-medium">{group.name}</span>
                  <span style={{ opacity: 0.5 }}>{group.slideIds.length}</span>
                </button>
              </div>
            )
          }

          // Check if previous visible slide is in the same group
          const prevSlide = slides[index - 1]
          const prevGroupId = prevSlide ? slideGroupMap.get(prevSlide.config.id) : null
          const prevGroup = prevGroupId ? slideGroups.find((g) => g.id === prevGroupId) : null
          const sameGroupAsPrev = groupId && prevGroupId === groupId && !prevGroup?.collapsed

          if (renaming === index) {
            return <input key={`ren-${index}`} ref={renameInputRef} type="text" value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setRenaming(null) }}
              onBlur={handleFinishRename}
              className="flex-shrink-0 w-24 h-10 px-2 bg-gray-950 text-gray-300 text-[10px] rounded-md border-2 border-white focus:outline-none" />
          }

          return (
            <div key={slide.config.id} className="flex items-center flex-shrink-0">
              {/* Group connector line */}
              {sameGroupAsPrev && (
                <div className="w-3 h-px bg-gray-600 flex-shrink-0" />
              )}
              {!sameGroupAsPrev && index > 0 && (
                <div className="w-2 flex-shrink-0" />
              )}
            <div draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOverSlide(e, index)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDropOnSlide(e, index)}
              onDragEnd={resetDrag}
              onClick={(e) => handleSlideClick(e, index)}
              onContextMenu={(e) => handleContextMenu(e, index)}
              className={`group flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                overflow-visible px-1.5 py-1 text-left relative cursor-grab active:cursor-grabbing ${
                isDragging ? 'opacity-40 border-gray-500'
                : isDropTgt ? 'border-gray-400 bg-white/5'
                : isSkipped ? 'opacity-30 border-gray-700 border-dashed bg-gray-900/50 text-gray-600 [filter:blur(0.5px)]'
                : isSelected ? 'border-white bg-white/10 text-gray-200'
                : isActive ? 'border-white bg-gray-800 text-gray-200'
                : 'border-gray-500 bg-gray-900 text-gray-300 hover:border-gray-400 hover:text-gray-200'
              }`}
              title="Shift+click to multi-select">
              {group && <span className="absolute -top-2.5 left-1 text-[7px] px-1.5 py-px rounded leading-none font-medium" style={{ backgroundColor: group.color || '#4b5563', color: '#fff' }}>{group.name}</span>}
              {isSelected && selectedIndices.size > 1 && <span className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-white text-black text-[8px] font-bold rounded-full flex items-center justify-center z-10">✓</span>}
              <span className="block truncate font-medium">{index + 1}. {slide.config.id}</span>
              {/* Transition arrow — top right */}
              {slide.config.transition && slide.config.transition !== 'none' && (
                <span className="absolute top-0.5 right-1 text-[7px] text-gray-300" title={`Transition: from ${slide.config.transition}`}>
                  {slide.config.transition === 'left' ? '←' : slide.config.transition === 'right' ? '→' : slide.config.transition === 'top' ? '↑' : '↓'}
                </span>
              )}
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
            </div>
          )
        })}

        <div className="flex-shrink-0 w-4" />
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowAddSlideMenu(!showAddSlideMenu)}
            className="w-10 h-10 rounded-md border-2 border-dashed border-gray-700 hover:border-white hover:text-white text-gray-600 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          </button>
          {showAddSlideMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAddSlideMenu(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 w-40 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1">
                <button
                  onClick={() => { addSlide(`slide-${slides.length + 1}`); setShowAddSlideMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  Markdown (.md)
                </button>
                <button
                  onClick={() => { addSlide(`slide-${slides.length + 1}`, 'mdx'); setShowAddSlideMenu(false) }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  MDX (.mdx)
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-shrink-0 w-2" />

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
          <div className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-64 max-h-[85vh] overflow-y-auto"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 270),
              bottom: window.innerHeight - contextMenu.y,
              maxHeight: `${contextMenu.y - 8}px`
            }}>
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
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2">
                    {g.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />}
                    {g.name}
                  </button>
                ))}
                {/* Remove from group — only if selected slides are in a group */}
                {selectedSlideIds.some((sid) => slideGroups.some((g) => g.slideIds.includes(sid))) && (
                  <button onClick={() => {
                    for (const sid of selectedSlideIds) {
                      slideGroups.forEach((g) => {
                        if (g.slideIds.includes(sid)) removeSlideFromGroup(g.id, sid)
                      })
                    }
                    setSelectedIndices(new Set()); setContextMenu(null)
                  }}
                    className="w-full text-left px-3 py-1.5 text-xs text-orange-400 hover:bg-gray-800 transition-colors">
                    Remove from group
                  </button>
                )}
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

            {/* Transition direction */}
            {selectedIndices.size === 1 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <div className="text-[9px] uppercase tracking-wider text-gray-600 px-3 py-0.5">Transition</div>
                <div className="px-3 py-1 flex gap-1">
                  {([
                    { value: 'none', label: '·' },
                    { value: 'left', label: '←' },
                    { value: 'right', label: '→' },
                    { value: 'top', label: '↑' },
                    { value: 'bottom', label: '↓' }
                  ] as const).map((t) => {
                    const idx = Array.from(selectedIndices)[0]
                    const current = slides[idx]?.config.transition || 'none'
                    return (
                      <button
                        key={t.value}
                        onClick={() => {
                          // Navigate to the slide first so setSlideTransition targets it
                          goToSlide(idx)
                          setTimeout(() => {
                            usePresentationStore.getState().setSlideTransition(t.value)
                            setContextMenu(null)
                            setSelectedIndices(new Set())
                          }, 50)
                        }}
                        className={`w-7 h-6 rounded text-[11px] flex items-center justify-center transition-colors ${
                          current === t.value ? 'bg-white text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                        title={t.value === 'none' ? 'No transition' : `From ${t.value}`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Layout picker */}
            {selectedIndices.size === 1 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <div className="text-[9px] uppercase tracking-wider text-gray-600 px-3 py-0.5">Layout</div>
                <div className="px-2 py-1 grid grid-cols-3 gap-1.5">
                  {SLIDE_LAYOUTS.map((l) => {
                    const idx = Array.from(selectedIndices)[0]
                    const current = slides[idx]?.config.layout || 'default'
                    return (
                      <button
                        key={l.value}
                        onClick={(e) => {
                          e.stopPropagation()
                          // Optimistic update — apply layout immediately in state
                          const state = usePresentationStore.getState()
                          if (!state.presentation) return
                          const updatedSlides = state.slides.map((s, i) =>
                            i === idx ? { ...s, config: { ...s.config, layout: l.value === 'default' ? undefined : l.value as any } } : s
                          )
                          const updatedPresentation = {
                            ...state.presentation,
                            slides: state.presentation.slides.map((s, i) =>
                              i === idx ? { ...s, layout: l.value === 'default' ? undefined : l.value as any } : s
                            )
                          }
                          usePresentationStore.setState({
                            presentation: updatedPresentation,
                            slides: updatedSlides,
                            currentSlideIndex: idx
                          })
                          // Persist to disk in background
                          window.electronAPI.setSlideLayout(
                            state.presentation.rootPath, idx, l.value
                          ).catch((err) => console.error('setSlideLayout save failed:', err))
                        }}
                        className={`group/layout rounded-md p-1.5 transition-colors ${
                          current === l.value
                            ? 'bg-indigo-500/20 ring-1 ring-indigo-400/50'
                            : 'hover:bg-gray-800'
                        }`}
                        title={l.label}
                      >
                        <LayoutThumbnail layout={l.value} active={current === l.value} />
                        <span className={`block text-[9px] mt-1 text-center truncate ${
                          current === l.value ? 'text-indigo-300 font-medium' : 'text-gray-500 group-hover/layout:text-gray-300'
                        }`}>{l.label}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Beautify with AI */}
            {selectedIndices.size === 1 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <button
                  disabled={isBeautifying}
                  onClick={async () => {
                    const idx = Array.from(selectedIndices)[0]
                    const slide = slides[idx]
                    if (!slide || !presentation) return
                    setIsBeautifying(true)
                    setContextMenu(null)
                    setSelectedIndices(new Set())
                    try {
                      const result = await window.electronAPI.beautifySlide(
                        slide.markdownContent,
                        presentation.title,
                        slide.config.layout
                      )
                      // Show review — don't apply yet
                      goToSlide(idx)
                      updateMarkdownContent(idx, result)
                      setBeautifyReview({
                        slideIndex: idx,
                        original: slide.markdownContent,
                        proposed: result
                      })
                    } catch (err) {
                      console.error('Beautify failed:', err)
                    } finally {
                      setIsBeautifying(false)
                    }
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  {isBeautifying ? 'Beautifying...' : 'Beautify with AI'}
                </button>
              </>
            )}

            {/* Save to Slide Store */}
            {selectedIndices.size === 1 && (() => {
              const idx = Array.from(selectedIndices)[0]
              const slide = slides[idx]
              return slide ? (
                <>
                  <div className="border-t border-gray-800 my-1" />
                  <button onClick={async () => {
                    const name = slide.config.id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
                    await window.electronAPI.saveSlideToLibrary({
                      name,
                      markdown: slide.markdownContent,
                      layout: slide.config.layout,
                      codeContent: slide.codeContent || undefined,
                      codeLanguage: slide.codeLanguage || undefined
                    })
                    setContextMenu(null); setSelectedIndices(new Set())
                  }}
                    className="w-full text-left px-3 py-1.5 text-xs text-indigo-400 hover:bg-gray-800 transition-colors flex items-center gap-2">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                    </svg>
                    Save to Slide Store
                  </button>
                </>
              ) : null
            })()}

            {selectedIndices.size < slides.length && (
              <>
                <div className="border-t border-gray-800 my-1" />
                {/* Skip slide */}
                <button onClick={() => {
                  Array.from(selectedIndices).forEach((idx) => toggleSkipSlide(idx))
                  setContextMenu(null); setSelectedIndices(new Set())
                }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors">
                  {Array.from(selectedIndices).every((idx) => slides[idx]?.config.skipped) ? 'Unskip' : 'Skip'} {selectedIndices.size > 1 ? `${selectedIndices.size} slides` : 'slide'}
                </button>
                <button onClick={handleDeleteSelected}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 transition-colors">
                  Delete {selectedIndices.size > 1 ? `${selectedIndices.size} slides` : 'slide'}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Group context menu — color picker */}
      {groupContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setGroupContextMenu(null)} />
          <div className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-2 px-3 w-44"
            style={{ left: groupContextMenu.x, bottom: window.innerHeight - groupContextMenu.y, maxHeight: `${groupContextMenu.y - 8}px` }}>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Group Color</div>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_COLORS.map((c) => {
                const group = slideGroups.find((g) => g.id === groupContextMenu.groupId)
                const isActive = group?.color === c.value
                return (
                  <button key={c.value} onClick={() => { setGroupColor(groupContextMenu.groupId, c.value); setGroupContextMenu(null) }}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c.value, borderColor: isActive ? c.value : 'transparent' }}
                    title={c.label} />
                )
              })}
              {/* Reset / no color */}
              <button onClick={() => { setGroupColor(groupContextMenu.groupId, ''); setGroupContextMenu(null) }}
                className="w-6 h-6 rounded-full border-2 border-gray-600 hover:border-gray-400 transition-all flex items-center justify-center text-gray-500 text-[8px]"
                title="No color">✕</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const GROUP_COLORS = [
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
]

const SLIDE_LAYOUTS = [
  { value: 'default', label: 'Default' },
  { value: 'center', label: 'Center' },
  { value: 'title', label: 'Title' },
  { value: 'section', label: 'Section' },
  { value: 'two-col', label: '2 Columns' },
  { value: 'two-col-wide-left', label: 'Wide Left' },
  { value: 'two-col-wide-right', label: 'Wide Right' },
  { value: 'three-col', label: '3 Columns' },
  { value: 'top-bottom', label: 'Top / Bot' },
  { value: 'big-number', label: 'Big Number' },
  { value: 'quote', label: 'Quote' },
  { value: 'blank', label: 'Blank' },
]

/** SVG thumbnail that visually represents each layout — always on dark bg for visibility */
function LayoutThumbnail({ layout, active }: { layout: string; active: boolean }): JSX.Element {
  const fill = active ? '#e2e8f0' : '#94a3b8'
  const accent = active ? '#818cf8' : '#64748b'
  const bg = active ? '#1e1b4b' : '#111827'
  const w = 56; const h = 34

  const rects: Record<string, JSX.Element> = {
    'default': <>
      <rect x="5" y="4" width="24" height="4" rx="1" fill={accent} />
      <rect x="5" y="11" width="46" height="3" rx="1" fill={fill} opacity="0.5" />
      <rect x="5" y="17" width="40" height="3" rx="1" fill={fill} opacity="0.4" />
      <rect x="5" y="23" width="43" height="3" rx="1" fill={fill} opacity="0.35" />
      <rect x="5" y="29" width="28" height="2" rx="0.5" fill={fill} opacity="0.2" />
    </>,
    'center': <>
      <rect x="12" y="10" width="32" height="4" rx="1" fill={accent} />
      <rect x="14" y="17" width="28" height="3" rx="1" fill={fill} opacity="0.5" />
      <rect x="18" y="23" width="20" height="3" rx="1" fill={fill} opacity="0.35" />
    </>,
    'title': <>
      <rect x="8" y="8" width="40" height="7" rx="1.5" fill={accent} />
      <rect x="14" y="19" width="28" height="3" rx="1" fill={fill} opacity="0.35" />
      <rect x="18" y="25" width="20" height="2" rx="0.5" fill={fill} opacity="0.2" />
    </>,
    'section': <>
      <rect x="4" y="10" width="3" height="14" rx="1" fill={accent} />
      <rect x="11" y="11" width="36" height="6" rx="1.5" fill={accent} />
      <rect x="11" y="21" width="24" height="3" rx="1" fill={fill} opacity="0.3" />
    </>,
    'two-col': <>
      <rect x="4" y="4" width="23" height="3" rx="1" fill={accent} />
      <rect x="4" y="10" width="23" height="20" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="29" y="4" width="23" height="3" rx="1" fill={accent} />
      <rect x="29" y="10" width="23" height="20" rx="1.5" fill={fill} opacity="0.15" />
    </>,
    'two-col-wide-left': <>
      <rect x="4" y="4" width="31" height="3" rx="1" fill={accent} />
      <rect x="4" y="10" width="31" height="20" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="37" y="4" width="15" height="3" rx="1" fill={accent} />
      <rect x="37" y="10" width="15" height="20" rx="1.5" fill={fill} opacity="0.15" />
    </>,
    'two-col-wide-right': <>
      <rect x="4" y="4" width="15" height="3" rx="1" fill={accent} />
      <rect x="4" y="10" width="15" height="20" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="21" y="4" width="31" height="3" rx="1" fill={accent} />
      <rect x="21" y="10" width="31" height="20" rx="1.5" fill={fill} opacity="0.15" />
    </>,
    'three-col': <>
      <rect x="3" y="4" width="16" height="26" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="21" y="4" width="15" height="26" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="38" y="4" width="15" height="26" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="5" y="7" width="12" height="3" rx="1" fill={accent} />
      <rect x="23" y="7" width="11" height="3" rx="1" fill={accent} />
      <rect x="40" y="7" width="11" height="3" rx="1" fill={accent} />
    </>,
    'top-bottom': <>
      <rect x="4" y="3" width="48" height="13" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="7" y="6" width="28" height="3" rx="1" fill={accent} />
      <rect x="4" y="18" width="48" height="13" rx="1.5" fill={fill} opacity="0.15" />
      <rect x="7" y="21" width="28" height="3" rx="1" fill={accent} />
    </>,
    'big-number': <>
      <rect x="10" y="5" width="36" height="14" rx="2" fill={accent} opacity="0.8" />
      <rect x="16" y="22" width="24" height="3" rx="1" fill={fill} opacity="0.4" />
      <rect x="20" y="28" width="16" height="2" rx="0.5" fill={fill} opacity="0.25" />
    </>,
    'quote': <>
      <rect x="6" y="6" width="6" height="10" rx="1.5" fill={accent} opacity="0.5" />
      <rect x="15" y="9" width="34" height="4" rx="1" fill={fill} opacity="0.5" />
      <rect x="15" y="16" width="28" height="3" rx="1" fill={fill} opacity="0.35" />
      <rect x="30" y="24" width="16" height="3" rx="1" fill={fill} opacity="0.25" />
    </>,
    'blank': <>
      <rect x="3" y="3" width="50" height="28" rx="2" fill={fill} opacity="0.06" stroke={fill} strokeWidth="0.7" strokeDasharray="3 3" />
    </>,
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block mx-auto rounded">
      <rect width={w} height={h} rx="3" fill={bg} />
      {rects[layout] ?? rects['default']}
    </svg>
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
