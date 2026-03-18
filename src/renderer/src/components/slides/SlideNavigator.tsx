import { useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

export function SlideNavigator(): JSX.Element {
  const { slides, currentSlideIndex, goToSlide, addSlide, deleteSlide, reorderSlide, renameSlide } =
    usePresentationStore()
  const { slideGroups, addSlideGroup, toggleGroupCollapsed, addSlideToGroup, removeSlideFromGroup } =
    useUIStore()

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slideIndex: number } | null>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const handleQuickAdd = async () => {
    const nextNum = slides.length + 1
    await addSlide(`slide-${nextNum}`)
  }

  const handleDelete = async (index: number) => {
    if (slides.length <= 1) return
    await deleteSlide(index)
    setContextMenu(null)
  }

  const handleContextMenu = (e: React.MouseEvent, slideIndex: number) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, slideIndex })
  }

  const handleStartRename = (index: number) => {
    setRenaming(index)
    setRenameValue(slides[index].config.id)
    setContextMenu(null)
  }

  const handleFinishRename = async () => {
    if (renaming === null) return
    const trimmed = renameValue.trim().replace(/\s+/g, '-').toLowerCase()
    if (trimmed && trimmed !== slides[renaming].config.id) {
      await renameSlide(renaming, trimmed)
    }
    setRenaming(null)
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragRef.current = index
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(index)
  }
  const handleDrop = async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const fromIndex = dragRef.current
    setDragIndex(null)
    setDropTarget(null)
    dragRef.current = null
    if (fromIndex !== null && fromIndex !== toIndex) {
      await reorderSlide(fromIndex, toIndex)
    }
  }
  const handleDragEnd = () => { setDragIndex(null); setDropTarget(null); dragRef.current = null }

  // Group which slides belong to which group
  const slideGroupMap = new Map<string, string>()
  slideGroups.forEach((g) => g.slideIds.forEach((id) => slideGroupMap.set(id, g.id)))

  // Build ordered list: ungrouped slides + groups
  const groupedSlideIds = new Set(slideGroups.flatMap((g) => g.slideIds))

  return (
    <div className="bg-gray-900 border-t border-gray-800">
      {/* Groups bar */}
      {slideGroups.length > 0 && (
        <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-800 overflow-x-auto">
          {slideGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => toggleGroupCollapsed(group.id)}
              className="flex items-center gap-1 px-2 py-0.5 text-[9px] bg-gray-800 text-gray-400
                         hover:bg-gray-700 rounded transition-colors flex-shrink-0"
            >
              <span className={`transition-transform ${group.collapsed ? '' : 'rotate-90'}`}>▸</span>
              {group.name}
              <span className="text-gray-600">({group.slideIds.length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Slides strip */}
      <div className="h-16 flex items-center px-4 gap-2 overflow-x-auto">
        {slides.map((slide, index) => {
          const isActive = index === currentSlideIndex
          const isAI = slide.markdownContent?.includes('<!-- ai-generated -->')
          const isDragging = dragIndex === index
          const isDropTarget = dropTarget === index && dragIndex !== index
          const groupId = slideGroupMap.get(slide.config.id)
          const group = groupId ? slideGroups.find((g) => g.id === groupId) : null

          // Hide slides in collapsed groups
          if (group?.collapsed) return null

          return renaming === index ? (
            <input
              key={slide.config.id}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleFinishRename(); if (e.key === 'Escape') setRenaming(null) }}
              onBlur={handleFinishRename}
              autoFocus
              className="flex-shrink-0 w-24 h-10 px-2 bg-gray-950 text-gray-300 text-[10px] rounded-md
                         border-2 border-indigo-500 focus:outline-none"
            />
          ) : (
            <div
              key={slide.config.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => goToSlide(index)}
              onContextMenu={(e) => handleContextMenu(e, index)}
              className={`group flex-shrink-0 w-20 h-10 rounded-md border-2 transition-all text-[8px] leading-tight
                          overflow-visible px-1.5 py-1 text-left relative cursor-grab active:cursor-grabbing ${
                isDragging ? 'opacity-40 border-gray-600'
                  : isDropTarget ? 'border-indigo-400 bg-indigo-950/30'
                  : isActive ? 'border-indigo-500 bg-gray-800 text-gray-300'
                  : 'border-gray-700 bg-gray-900 text-gray-500 hover:border-gray-600 hover:text-gray-400'
              }`}
              title={`Slide ${index + 1} — right-click for options`}
            >
              {/* Group indicator */}
              {group && (
                <span className="absolute -top-2 left-1 text-[7px] px-1 bg-gray-700 text-gray-400 rounded-sm">
                  {group.name}
                </span>
              )}
              <span className="block truncate font-medium">
                {index + 1}. {slide.config.id}
              </span>
              {slide.config.code && (
                <span className="block truncate text-indigo-400/60 mt-0.5">
                  {slide.config.code.language}
                </span>
              )}
              {isAI && (
                <span className="absolute top-0.5 right-0.5 text-[7px] text-indigo-400 group-hover:hidden">✦</span>
              )}
              {slides.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(index) }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 text-white
                             rounded-full hidden group-hover:flex items-center justify-center z-10"
                  title="Delete slide"
                >
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}

        {/* Add slide */}
        <button
          onClick={handleQuickAdd}
          className="flex-shrink-0 w-10 h-10 rounded-md border-2 border-dashed border-gray-700
                     hover:border-indigo-500 hover:text-indigo-400 text-gray-600
                     flex items-center justify-center transition-colors"
          title="Add slide"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>

        {/* Add group */}
        {showNewGroup ? (
          <div className="flex-shrink-0 flex items-center gap-1">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroupName.trim()) { addSlideGroup(newGroupName.trim()); setNewGroupName(''); setShowNewGroup(false) }
                if (e.key === 'Escape') { setShowNewGroup(false); setNewGroupName('') }
              }}
              placeholder="Group name"
              autoFocus
              className="w-20 px-2 py-1 bg-gray-950 text-gray-300 text-[10px] rounded border border-gray-700
                         focus:border-indigo-500 focus:outline-none"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNewGroup(true)}
            className="flex-shrink-0 h-10 px-2 rounded-md border-2 border-dashed border-gray-700
                       hover:border-indigo-500 hover:text-indigo-400 text-gray-600
                       flex items-center justify-center transition-colors text-[9px] gap-1"
            title="Create slide group"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
            Group
          </button>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1 w-48"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleStartRename(contextMenu.slideIndex)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Rename
            </button>
            {slideGroups.length > 0 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <div className="text-[9px] uppercase tracking-wider text-gray-600 px-3 py-0.5">Add to group</div>
                {slideGroups.map((g) => {
                  const slideId = slides[contextMenu.slideIndex].config.id
                  const isInGroup = g.slideIds.includes(slideId)
                  return (
                    <button
                      key={g.id}
                      onClick={() => {
                        if (isInGroup) removeSlideFromGroup(g.id, slideId)
                        else addSlideToGroup(g.id, slideId)
                        setContextMenu(null)
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] ${
                        isInGroup ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-gray-600'
                      }`}>
                        {isInGroup ? '✓' : ''}
                      </span>
                      {g.name}
                    </button>
                  )
                })}
              </>
            )}
            {slides.length > 1 && (
              <>
                <div className="border-t border-gray-800 my-1" />
                <button
                  onClick={() => handleDelete(contextMenu.slideIndex)}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 transition-colors"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
