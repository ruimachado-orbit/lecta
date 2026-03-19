import { useState, useRef } from 'react'

interface TextBoxData {
  index: number
  x: number
  y: number
  w: number
  content: string
  matchStart: number
  matchEnd: number
}

interface DraggableElementsProps {
  markdown: string
  canvasScale: number
  onUpdateMarkdown: (newMd: string) => void
  editable: boolean
}

/** Parse textbox comments from markdown */
function parseTextBoxes(md: string): TextBoxData[] {
  const regex = /<!--\s*textbox\s+x=(\d+)\s+y=(\d+)(?:\s+w=(\d+))?\s*-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi
  const boxes: TextBoxData[] = []
  let match
  let index = 0
  while ((match = regex.exec(md)) !== null) {
    boxes.push({
      index: index++,
      x: parseInt(match[1]),
      y: parseInt(match[2]),
      w: parseInt(match[3]) || 300,
      content: match[4].trim(),
      matchStart: match.index,
      matchEnd: match.index + match[0].length
    })
  }
  return boxes
}

function replaceTextBox(md: string, box: TextBoxData, newX: number, newY: number, newW: number, newContent?: string): string {
  const before = md.slice(0, box.matchStart)
  const after = md.slice(box.matchEnd)
  const content = newContent !== undefined ? newContent : box.content
  return `${before}<!-- textbox x=${Math.round(newX)} y=${Math.round(newY)} w=${Math.round(newW)} -->${content}<!-- /textbox -->${after}`
}

function removeTextBox(md: string, box: TextBoxData): string {
  const before = md.slice(0, box.matchStart)
  const after = md.slice(box.matchEnd)
  return (before + after).replace(/\n{3,}/g, '\n\n').trim()
}

export function DraggableElements({ markdown, canvasScale, onUpdateMarkdown, editable }: DraggableElementsProps): JSX.Element | null {
  const textBoxes = parseTextBoxes(markdown)
  const [activeBox, setActiveBox] = useState<number | null>(null)
  const [editingBox, setEditingBox] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const startRef = useRef({ x: 0, y: 0, w: 0 })

  if (!editable || textBoxes.length === 0) return null

  const handleDelete = (e: React.MouseEvent, box: TextBoxData) => {
    e.preventDefault()
    e.stopPropagation()
    onUpdateMarkdown(removeTextBox(markdown, box))
  }

  const handleDragStart = (e: React.MouseEvent, box: TextBoxData) => {
    // Don't start drag if we're editing text
    if (editingBox === box.index) return
    e.preventDefault()
    e.stopPropagation()
    setActiveBox(box.index)
    const offset = {
      x: e.clientX / canvasScale - box.x,
      y: e.clientY / canvasScale - box.y
    }
    setDragOffset(offset)

    const handleMove = (ev: MouseEvent) => {
      const newX = Math.max(0, ev.clientX / canvasScale - offset.x)
      const newY = Math.max(0, ev.clientY / canvasScale - offset.y)
      const el = document.querySelector(`[data-textbox="${box.index}"]`) as HTMLElement
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }
    }

    const handleUp = (ev: MouseEvent) => {
      const newX = Math.max(0, ev.clientX / canvasScale - offset.x)
      const newY = Math.max(0, ev.clientY / canvasScale - offset.y)
      onUpdateMarkdown(replaceTextBox(markdown, box, newX, newY, box.w))
      setActiveBox(null)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleResizeStart = (e: React.MouseEvent, box: TextBoxData) => {
    e.preventDefault()
    e.stopPropagation()
    startRef.current = { x: e.clientX, y: 0, w: box.w }

    const handleMove = (ev: MouseEvent) => {
      const deltaX = (ev.clientX - startRef.current.x) / canvasScale
      const newW = Math.max(100, startRef.current.w + deltaX)
      const el = document.querySelector(`[data-textbox="${box.index}"]`) as HTMLElement
      if (el) el.style.width = `${newW}px`
    }

    const handleUp = (ev: MouseEvent) => {
      const deltaX = (ev.clientX - startRef.current.x) / canvasScale
      const newW = Math.max(100, startRef.current.w + deltaX)
      onUpdateMarkdown(replaceTextBox(markdown, box, box.x, box.y, newW))
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  const handleTextCommit = (box: TextBoxData, newText: string) => {
    setEditingBox(null)
    const trimmed = newText.trim()
    if (trimmed !== box.content) {
      onUpdateMarkdown(replaceTextBox(markdown, box, box.x, box.y, box.w, trimmed))
    }
  }

  return (
    <>
      {textBoxes.map((box) => (
        <div
          key={box.index}
          data-textbox={box.index}
          className="absolute z-20 group pointer-events-auto"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            padding: '8px 12px',
            border: editingBox === box.index ? '2px solid rgba(99,102,241,0.6)' : '2px dashed rgba(150,150,150,0.25)',
            borderRadius: 6,
            cursor: editingBox === box.index ? 'text' : 'move',
          }}
          onMouseDown={(e) => handleDragStart(e, box)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditingBox(box.index)
          }}
        >
          {/* Delete button — top right */}
          <button
            className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{ zIndex: 30 }}
            onMouseDown={(e) => handleDelete(e, box)}
          >
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Editable content */}
          {editingBox === box.index ? (
            <textarea
              autoFocus
              defaultValue={box.content}
              onBlur={(e) => handleTextCommit(box, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditingBox(null); e.stopPropagation() }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextCommit(box, (e.target as HTMLTextAreaElement).value) }
                e.stopPropagation()
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full bg-transparent text-gray-300 text-sm outline-none resize-none"
              style={{ minHeight: 20 }}
              rows={Math.max(1, box.content.split('\n').length)}
            />
          ) : (
            <div className="text-gray-300 text-sm pointer-events-none select-none whitespace-pre-wrap">
              {box.content}
            </div>
          )}

          {/* Resize handle — bottom right */}
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(99,102,241,0.8)', borderRadius: 2 }}
            onMouseDown={(e) => handleResizeStart(e, box)}
          />

          {/* Hover border */}
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-400/40 rounded pointer-events-none transition-colors" />
        </div>
      ))}
    </>
  )
}
