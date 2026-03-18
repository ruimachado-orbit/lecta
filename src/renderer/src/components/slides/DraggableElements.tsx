import { useState, useRef, useCallback } from 'react'

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

function replaceTextBox(md: string, box: TextBoxData, newX: number, newY: number, newW: number): string {
  const before = md.slice(0, box.matchStart)
  const after = md.slice(box.matchEnd)
  return `${before}<!-- textbox x=${Math.round(newX)} y=${Math.round(newY)} w=${Math.round(newW)} -->${box.content}<!-- /textbox -->${after}`
}

export function DraggableElements({ markdown, canvasScale, onUpdateMarkdown, editable }: DraggableElementsProps): JSX.Element | null {
  const textBoxes = parseTextBoxes(markdown)
  const [activeBox, setActiveBox] = useState<number | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizing, setResizing] = useState<number | null>(null)
  const startRef = useRef({ x: 0, y: 0, w: 0 })

  if (!editable || textBoxes.length === 0) return null

  const handleDragStart = (e: React.MouseEvent, box: TextBoxData) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveBox(box.index)
    setDragOffset({
      x: e.clientX / canvasScale - box.x,
      y: e.clientY / canvasScale - box.y
    })

    const handleMove = (ev: MouseEvent) => {
      const newX = Math.max(0, ev.clientX / canvasScale - dragOffset.x)
      const newY = Math.max(0, ev.clientY / canvasScale - dragOffset.y)
      // Live update position via style (don't update markdown on every pixel)
      const el = document.querySelector(`[data-textbox="${box.index}"]`) as HTMLElement
      if (el) {
        el.style.left = `${newX}px`
        el.style.top = `${newY}px`
      }
    }

    const handleUp = (ev: MouseEvent) => {
      const newX = Math.max(0, ev.clientX / canvasScale - dragOffset.x)
      const newY = Math.max(0, ev.clientY / canvasScale - dragOffset.y)
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
    setResizing(box.index)
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
      setResizing(null)
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <>
      {textBoxes.map((box) => (
        <div
          key={box.index}
          data-textbox={box.index}
          className="absolute cursor-move z-20 group"
          style={{
            left: box.x,
            top: box.y,
            width: box.w,
            padding: '8px 12px',
            border: '2px dashed rgba(255,255,255,0.2)',
            borderRadius: 6,
          }}
          onMouseDown={(e) => handleDragStart(e, box)}
        >
          {/* Content (read-only overlay) */}
          <div className="text-gray-300 text-sm pointer-events-none select-none">
            {box.content}
          </div>

          {/* Resize handle — bottom right */}
          <div
            className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'white', borderRadius: 2 }}
            onMouseDown={(e) => handleResizeStart(e, box)}
          />

          {/* Selection border on hover */}
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/40 rounded pointer-events-none transition-colors" />
        </div>
      ))}
    </>
  )
}
