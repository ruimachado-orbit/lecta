import { useEffect, useCallback, useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

interface DrawingOverlayProps {
  slideIndex: number
  active: boolean
  width: number
  height: number
}

interface DrawPoint { x: number; y: number }
interface DrawElement {
  type: 'freedraw' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text'
  points: DrawPoint[]
  color: string
  fill: string // 'transparent' or a color
  width: number
  text?: string
  fontSize?: number
}

/** Get axis-aligned bounding box for an element */
function getBounds(el: DrawElement): { x: number; y: number; w: number; h: number } {
  if (el.type === 'text' && el.points.length >= 1) {
    const fs = el.fontSize || 24
    const lines = (el.text || '').split('\n')
    const estW = Math.max(100, ...lines.map((l) => l.length * fs * 0.6))
    const estH = lines.length * fs * 1.3
    return { x: el.points[0].x - 4, y: el.points[0].y - 4, w: estW + 8, h: estH + 8 }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of el.points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const pad = Math.max(el.width, 6)
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
}

/** Check if a point is near any segment of an element */
function hitTest(el: DrawElement, px: number, py: number, threshold = 10): boolean {
  if (el.type === 'text') {
    const b = getBounds(el)
    return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h
  }
  if (el.type === 'rect') {
    if (el.points.length < 2) return false
    const [p1, p2] = [el.points[0], el.points[el.points.length - 1]]
    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x)
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y)
    // Near any edge?
    const nearH = (py >= minY - threshold && py <= maxY + threshold) && (Math.abs(px - minX) < threshold || Math.abs(px - maxX) < threshold)
    const nearV = (px >= minX - threshold && px <= maxX + threshold) && (Math.abs(py - minY) < threshold || Math.abs(py - maxY) < threshold)
    return nearH || nearV
  }
  if (el.type === 'ellipse') {
    if (el.points.length < 2) return false
    const [p1, p2] = [el.points[0], el.points[el.points.length - 1]]
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
    const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
    if (rx < 1 || ry < 1) return false
    const dist = Math.sqrt(((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2)
    return Math.abs(dist - 1) < threshold / Math.min(rx, ry)
  }
  // For freedraw, line, arrow — check distance to each segment
  const pts = el.type === 'arrow' || el.type === 'line'
    ? [el.points[0], el.points[el.points.length - 1]]
    : el.points
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(px, py, pts[i], pts[i + 1]) < threshold) return true
  }
  return false
}

function distToSegment(px: number, py: number, a: DrawPoint, b: DrawPoint): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - a.x, py - a.y)
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** Translate all points of an element by dx, dy */
function moveElement(el: DrawElement, dx: number, dy: number): DrawElement {
  return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
}

export function DrawingOverlay({ slideIndex, active, width, height }: DrawingOverlayProps): JSX.Element {
  const { slides, presentation } = usePresentationStore()
  const slide = slides[slideIndex]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const [elements, setElements] = useState<DrawElement[]>([])
  const [drawing, setDrawing] = useState(false)
  const [currentElement, setCurrentElement] = useState<DrawElement | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState<DrawPoint | null>(null)
  const deleteBtnRef = useRef<{ x: number; y: number; r: number } | null>(null)
  const [editingText, setEditingText] = useState<{ pos: DrawPoint; value: string; editIndex: number | null } | null>(null)

  // Save to disk and update the store so inactive overlays pick up the change immediately
  const saveDrawings = useCallback((els: DrawElement[]) => {
    if (!presentation) return
    const json = els.length > 0 ? JSON.stringify(els) : ''

    // Optimistic store update — keeps the read-mode overlay in sync without a reload
    usePresentationStore.setState((state) => {
      const slides = [...state.slides]
      if (slides[slideIndex]) {
        slides[slideIndex] = {
          ...slides[slideIndex],
          config: { ...slides[slideIndex].config, drawings: json || undefined }
        }
      }
      return { slides }
    })

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI.saveDrawings(presentation.rootPath, slideIndex, json)
    }, 1000)
  }, [presentation, slideIndex])

  // Load saved drawings
  useEffect(() => {
    if (!slide?.config.drawings) { setElements([]); return }
    try {
      const parsed = JSON.parse(slide.config.drawings)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((el: any) =>
          el && Array.isArray(el.points) && typeof el.color === 'string' &&
          ['freedraw', 'line', 'arrow', 'rect', 'ellipse', 'text'].includes(el.type)
        )
        setElements(valid)
      } else {
        setElements([])
      }
    } catch { setElements([]) }
    setSelectedIndex(null)
  }, [slide?.config.drawings, slideIndex])

  // Listen for clear event
  useEffect(() => {
    const handleClear = () => {
      setElements([])
      setCurrentElement(null)
      setSelectedIndex(null)
      saveDrawings([])
    }
    window.addEventListener('drawing-clear', handleClear)
    return () => window.removeEventListener('drawing-clear', handleClear)
  }, [saveDrawings])

  // Listen for delete-selected event
  useEffect(() => {
    const handleDelete = () => {
      if (selectedIndex === null) return
      const newElements = elements.filter((_, i) => i !== selectedIndex)
      setElements(newElements)
      setSelectedIndex(null)
      saveDrawings(newElements)
    }
    window.addEventListener('drawing-delete-selected', handleDelete)
    return () => window.removeEventListener('drawing-delete-selected', handleDelete)
  }, [selectedIndex, elements, saveDrawings])

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const toDraw = currentElement ? [...elements, currentElement] : elements
    for (let i = 0; i < toDraw.length; i++) {
      const el = toDraw[i]
      drawElement(ctx, el)

      // Selection highlight + delete button
      if (i === selectedIndex && active) {
        const b = getBounds(el)
        ctx.save()
        ctx.strokeStyle = '#6366f1'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.strokeRect(b.x, b.y, b.w, b.h)
        ctx.setLineDash([])

        // Delete button — circle with X at top-right corner
        const btnR = 10
        const btnX = b.x + b.w + 2
        const btnY = b.y - 2
        deleteBtnRef.current = { x: btnX, y: btnY, r: btnR + 4 }
        // Circle
        ctx.fillStyle = '#ef4444'
        ctx.beginPath()
        ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2)
        ctx.fill()
        // X
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        const s = 4
        ctx.beginPath()
        ctx.moveTo(btnX - s, btnY - s)
        ctx.lineTo(btnX + s, btnY + s)
        ctx.moveTo(btnX + s, btnY - s)
        ctx.lineTo(btnX - s, btnY + s)
        ctx.stroke()
        ctx.restore()
      }
    }
    if (selectedIndex === null) deleteBtnRef.current = null
  }, [elements, currentElement, selectedIndex, active])

  useEffect(() => { render() }, [render])

  const getPos = (e: React.MouseEvent): DrawPoint => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const scaleX = (canvasRef.current?.width || width) / rect.width
    const scaleY = (canvasRef.current?.height || height) / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const tool = drawingToolState.tool
  const color = drawingToolState.color
  const strokeWidth = drawingToolState.strokeWidth

  const deleteSelected = useCallback(() => {
    if (selectedIndex === null) return
    const newElements = elements.filter((_, i) => i !== selectedIndex)
    setElements(newElements)
    setSelectedIndex(null)
    deleteBtnRef.current = null
    saveDrawings(newElements)
  }, [selectedIndex, elements, saveDrawings])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!active) return
    const pos = getPos(e)

    // Check delete button click first
    if (deleteBtnRef.current && selectedIndex !== null) {
      const btn = deleteBtnRef.current
      if (Math.hypot(pos.x - btn.x, pos.y - btn.y) <= btn.r) {
        deleteSelected()
        return
      }
    }

    // Selection tool
    if (tool === 'select') {
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTest(elements[i], pos.x, pos.y)) {
          setSelectedIndex(i)
          setDragging(true)
          setDragStart(pos)
          return
        }
      }
      setSelectedIndex(null)
      return
    }

    // Text tool — click to place a text box
    if (tool === 'text') {
      setSelectedIndex(null)
      setEditingText({ pos, value: '', editIndex: null })
      return
    }

    // Drawing tools
    setSelectedIndex(null)
    if (tool === 'eraser') {
      const el: DrawElement = { type: 'freedraw', points: [pos], color: 'rgba(0,0,0,0)', width: 20 }
      setCurrentElement(el)
      setDrawing(true)
      return
    }
    const el: DrawElement = { type: tool, points: [pos], color, fill: drawingToolState.fill, width: strokeWidth }
    setCurrentElement(el)
    setDrawing(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e)

    // Dragging selected element
    if (dragging && dragStart && selectedIndex !== null) {
      const dx = pos.x - dragStart.x
      const dy = pos.y - dragStart.y
      const newElements = elements.map((el, i) => i === selectedIndex ? moveElement(el, dx, dy) : el)
      setElements(newElements)
      setDragStart(pos)
      return
    }

    if (!drawing || !currentElement) return
    if (tool === 'freedraw' || tool === 'eraser') {
      setCurrentElement({ ...currentElement, points: [...currentElement.points, pos] })
    } else {
      setCurrentElement({ ...currentElement, points: [currentElement.points[0], pos] })
    }
  }

  const handleMouseUp = () => {
    // End drag
    if (dragging && selectedIndex !== null) {
      setDragging(false)
      setDragStart(null)
      saveDrawings(elements)
      return
    }

    if (!drawing || !currentElement) return
    setDrawing(false)

    if (tool === 'eraser') {
      const eraserPath = currentElement.points
      const newElements = elements.filter((el) =>
        !el.points.some((p) => eraserPath.some((ep) => Math.hypot(p.x - ep.x, p.y - ep.y) < 15))
      )
      setElements(newElements)
      saveDrawings(newElements)
    } else if (currentElement.points.length >= 2) {
      const newElements = [...elements, currentElement]
      setElements(newElements)
      saveDrawings(newElements)
    }
    setCurrentElement(null)
  }

  // Commit text editing
  const commitText = useCallback((value: string) => {
    if (!editingText) return
    const trimmed = value.trim()
    if (trimmed) {
      if (editingText.editIndex !== null) {
        // Editing existing text element
        const newElements = elements.map((el, i) =>
          i === editingText.editIndex ? { ...el, text: trimmed } : el
        )
        setElements(newElements)
        saveDrawings(newElements)
      } else {
        // New text element
        const el: DrawElement = {
          type: 'text',
          points: [editingText.pos],
          color,
          width: 0,
          text: trimmed,
          fontSize: 24,
        }
        const newElements = [...elements, el]
        setElements(newElements)
        saveDrawings(newElements)
      }
    }
    setEditingText(null)
  }, [editingText, elements, color, saveDrawings])

  // Double-click to edit existing text
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!active) return
    const pos = getPos(e)
    for (let i = elements.length - 1; i >= 0; i--) {
      if (elements[i].type === 'text' && hitTest(elements[i], pos.x, pos.y)) {
        setEditingText({ pos: elements[i].points[0], value: elements[i].text || '', editIndex: i })
        setSelectedIndex(null)
        return
      }
    }
  }

  // Cursor
  let cursor = 'crosshair'
  if (tool === 'select') cursor = selectedIndex !== null ? 'move' : 'default'
  if (tool === 'text') cursor = 'text'

  if (!active) {
    if (elements.length === 0) return <></>
    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none z-10"
        style={{ width: '100%', height: '100%' }}
      />
    )
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 z-20"
        style={{ width: '100%', height: '100%', cursor }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
      {/* Text editing overlay */}
      {editingText && (
        <TextInput
          pos={editingText.pos}
          initialValue={editingText.value}
          color={editingText.editIndex !== null ? (elements[editingText.editIndex]?.color || color) : color}
          canvasWidth={width}
          containerRef={canvasRef}
          onCommit={commitText}
          onCancel={() => setEditingText(null)}
        />
      )}
    </>
  )
}

/** Positioned text input overlay — maps canvas coords to screen coords */
function TextInput({ pos, initialValue, color, canvasWidth, containerRef, onCommit, onCancel }: {
  pos: DrawPoint; initialValue: string; color: string; canvasWidth: number
  containerRef: React.RefObject<HTMLCanvasElement | null>
  onCommit: (value: string) => void; onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  // Convert canvas coords → screen position (percentage-based since canvas is 100% width/height)
  const leftPct = (pos.x / canvasWidth) * 100
  const canvas = containerRef.current
  const canvasHeight = canvas ? (canvas.height || 720) : 720
  const topPct = (pos.y / canvasHeight) * 100

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onCancel(); e.stopPropagation() }
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(value) }
      }}
      className="absolute z-30 bg-transparent border border-indigo-400 rounded px-1 outline-none resize-none"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        minWidth: 120,
        minHeight: 32,
        fontSize: 24 * (canvas ? canvas.getBoundingClientRect().width / canvasWidth : 1),
        lineHeight: 1.3,
        color,
        fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
      }}
      rows={1}
    />
  )
}

/** Draw a single element on the canvas */
function drawElement(ctx: CanvasRenderingContext2D, el: DrawElement): void {
  if (el.type === 'text') {
    if (!el.text || el.points.length < 1) return
    const fs = el.fontSize || 24
    ctx.font = `${fs}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`
    ctx.fillStyle = el.color
    ctx.textBaseline = 'top'
    const lines = el.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.points[0].x, el.points[0].y + i * fs * 1.3)
    }
    return
  }

  ctx.strokeStyle = el.color
  ctx.lineWidth = el.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (el.type === 'freedraw' || el.type === 'line') {
    if (el.points.length < 2) return
    ctx.beginPath()
    ctx.moveTo(el.points[0].x, el.points[0].y)
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y)
    ctx.stroke()
  } else if (el.type === 'arrow') {
    if (el.points.length < 2) return
    const start = el.points[0], end = el.points[el.points.length - 1]
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const headLen = 10 + el.width * 2
    ctx.beginPath()
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - headLen * Math.cos(angle - 0.4), end.y - headLen * Math.sin(angle - 0.4))
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - headLen * Math.cos(angle + 0.4), end.y - headLen * Math.sin(angle + 0.4))
    ctx.stroke()
  } else if (el.type === 'rect') {
    if (el.points.length < 2) return
    const [p1, p2] = [el.points[0], el.points[el.points.length - 1]]
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
    }
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y)
  } else if (el.type === 'ellipse') {
    if (el.points.length < 2) return
    const [p1, p2] = [el.points[0], el.points[el.points.length - 1]]
    const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2
    const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2
    ctx.beginPath()
    ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2)
    if (el.fill && el.fill !== 'transparent') {
      ctx.fillStyle = el.fill
      ctx.fill()
    }
    ctx.stroke()
  }
}

// Shared mutable state for toolbar ↔ overlay communication
export const drawingToolState = {
  tool: 'freedraw' as 'select' | 'freedraw' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'eraser',
  color: document.documentElement.getAttribute('data-theme') === 'light' ? '#0f172a' : '#ffffff',
  fill: 'transparent',
  strokeWidth: 2,
}

/** Minimal vertical toolbar for drawing mode */
export function DrawingToolbar(): JSX.Element {
  const [, forceUpdate] = useState(0)
  const rerender = () => forceUpdate((n) => n + 1)

  const activeTool = drawingToolState.tool
  const strokeWidth = drawingToolState.strokeWidth
  const strokeColor = drawingToolState.color

  const tools: { id: typeof drawingToolState.tool; label: string; icon: JSX.Element }[] = [
    { id: 'select', label: 'Select', icon: <CursorIcon /> },
    { id: 'freedraw', label: 'Pen', icon: <PenIcon /> },
    { id: 'line', label: 'Line', icon: <LineIcon /> },
    { id: 'arrow', label: 'Arrow', icon: <ArrowIcon /> },
    { id: 'rect', label: 'Rectangle', icon: <RectIcon /> },
    { id: 'ellipse', label: 'Circle', icon: <CircleIcon /> },
    { id: 'text', label: 'Text', icon: <TextIcon /> },
    { id: 'eraser', label: 'Eraser', icon: <EraserIcon /> },
  ]

  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  const colors = isLight
    ? ['#0f172a', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']
    : ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']
  const widths = [1, 2, 4]

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 w-8 flex-shrink-0 bg-gray-900 border-r border-gray-800">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => { drawingToolState.tool = t.id; rerender() }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            activeTool === t.id ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}

      {/* Delete selected */}
      {activeTool === 'select' && (
        <>
          <div className="w-4 h-px bg-gray-700 my-1" />
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('drawing-delete-selected'))}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
            title="Delete selected"
          >
            <TrashIcon />
          </button>
        </>
      )}

      <div className="w-4 h-px bg-gray-700 my-1" />

      {widths.map((w) => (
        <button
          key={w}
          onClick={() => { drawingToolState.strokeWidth = w; rerender() }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            strokeWidth === w ? 'bg-white/20' : 'hover:bg-gray-800'
          }`}
          title={`Width ${w}`}
        >
          <div className="rounded-full bg-gray-300" style={{ width: w + 2, height: w + 2 }} />
        </button>
      ))}

      <div className="w-4 h-px bg-gray-700 my-1" />

      {/* Stroke color */}
      <span className="text-[6px] text-gray-600">Stroke</span>
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => { drawingToolState.color = c; rerender() }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            strokeColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:bg-gray-800'
          }`}
          title={c}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
        </button>
      ))}

      <div className="w-4 h-px bg-gray-700 my-1" />

      {/* Fill color */}
      <span className="text-[6px] text-gray-600">Fill</span>
      <button
        onClick={() => { drawingToolState.fill = 'transparent'; rerender() }}
        className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
          drawingToolState.fill === 'transparent' ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:bg-gray-800'
        }`}
        title="No fill"
      >
        <div className="w-3 h-3 rounded-sm border border-gray-600" style={{ background: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 4px 4px' }} />
      </button>
      {colors.map((c) => (
        <button
          key={`fill-${c}`}
          onClick={() => { drawingToolState.fill = c; rerender() }}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            drawingToolState.fill === c ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:bg-gray-800'
          }`}
          title={`Fill: ${c}`}
        >
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />
        </button>
      ))}

      <div className="flex-1" />

      <button
        onClick={() => {
          drawingToolState.tool = 'freedraw'
          rerender()
          window.dispatchEvent(new CustomEvent('drawing-clear'))
        }}
        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
        title="Clear all"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

/* ── Icons ── */
function CursorIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" /></svg>
}
function PenIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
}
function LineIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><line x1="5" y1="19" x2="19" y2="5" strokeLinecap="round" /></svg>
}
function ArrowIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
}
function RectIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="1" /></svg>
}
function CircleIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><circle cx="12" cy="12" r="9" /></svg>
}
function TextIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5h14v3h-2V7H13v10h2v2H9v-2h2V7H7v1H5V5Z" /></svg>
}
function EraserIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.228 7.8-7.2 7.2a2 2 0 0 0 0 2.828l1.172 1.172h5.656l4.372-4.372a2 2 0 0 0 0-2.828L15.228 7.8Z" /><path strokeLinecap="round" d="M20 20H9.2" /></svg>
}
function TrashIcon() {
  return <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
}
