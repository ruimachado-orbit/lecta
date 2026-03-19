import { useState, useRef } from 'react'

interface TextBoxData {
  index: number
  x: number; y: number; w: number
  fontSize: number
  fontColor: string
  bold: boolean
  italic: boolean
  content: string
  matchStart: number; matchEnd: number
}

interface ShapeData {
  index: number
  type: 'rect' | 'ellipse' | 'line'
  x: number; y: number; w: number; h: number
  fill: string; stroke: string; strokeWidth: number
  matchStart: number; matchEnd: number
}

interface DraggableElementsProps {
  markdown: string
  canvasScale: number
  onUpdateMarkdown: (newMd: string) => void
  editable: boolean
}

const COLORS = [
  '#ffffff', '#0f172a', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]
const SHAPE_COLORS = ['transparent', ...COLORS]
const FONT_SIZES = [14, 18, 24, 32, 40, 56]

/* ── Parsers ── */

function parseTextBoxes(md: string): TextBoxData[] {
  // Matches: <!-- textbox x=N y=N w=N [fs=N] [fc=#hex] [fb=1] [fi=1] -->content<!-- /textbox -->
  const regex = /<!--\s*textbox\s+x=(\d+)\s+y=(\d+)(?:\s+w=(\d+))?(?:\s+fs=(\d+))?(?:\s+fc=([^\s]+))?(?:\s+fb=([01]))?(?:\s+fi=([01]))?\s*-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi
  const boxes: TextBoxData[] = []
  let match, index = 0
  while ((match = regex.exec(md)) !== null) {
    boxes.push({
      index: index++,
      x: parseInt(match[1]), y: parseInt(match[2]), w: parseInt(match[3]) || 300,
      fontSize: parseInt(match[4]) || 18,
      fontColor: match[5] || '#ffffff',
      bold: match[6] === '1',
      italic: match[7] === '1',
      content: match[8].trim(),
      matchStart: match.index, matchEnd: match.index + match[0].length
    })
  }
  return boxes
}

function parseShapes(md: string): ShapeData[] {
  const regex = /<!--\s*shape\s+type=(\w+)\s+x=(-?\d+)\s+y=(-?\d+)\s+w=(\d+)\s+h=(\d+)(?:\s+fill=([^\s]+))?(?:\s+stroke=([^\s]+))?(?:\s+sw=(\d+))?\s*-->/gi
  const shapes: ShapeData[] = []
  let match, index = 0
  while ((match = regex.exec(md)) !== null) {
    shapes.push({
      index: index++, type: match[1] as ShapeData['type'],
      x: parseInt(match[2]), y: parseInt(match[3]), w: parseInt(match[4]), h: parseInt(match[5]),
      fill: match[6] || 'transparent', stroke: match[7] || '#ffffff', strokeWidth: parseInt(match[8]) || 2,
      matchStart: match.index, matchEnd: match.index + match[0].length
    })
  }
  return shapes
}

/* ── Markdown helpers ── */

function serializeTextBox(box: TextBoxData, overrides?: Partial<TextBoxData>): string {
  const b = { ...box, ...overrides }
  let attrs = `x=${Math.round(b.x)} y=${Math.round(b.y)} w=${Math.round(b.w)}`
  if (b.fontSize && b.fontSize !== 18) attrs += ` fs=${b.fontSize}`
  if (b.fontColor && b.fontColor !== '#ffffff') attrs += ` fc=${b.fontColor}`
  if (b.bold) attrs += ` fb=1`
  if (b.italic) attrs += ` fi=1`
  return `<!-- textbox ${attrs} -->${b.content}<!-- /textbox -->`
}

function replaceTextBox(md: string, box: TextBoxData, overrides: Partial<TextBoxData>): string {
  return md.slice(0, box.matchStart) + serializeTextBox(box, overrides) + md.slice(box.matchEnd)
}

function replaceShape(md: string, shape: ShapeData, updates: Partial<ShapeData>): string {
  const s = { ...shape, ...updates }
  return md.slice(0, shape.matchStart) + `<!-- shape type=${s.type} x=${Math.round(s.x)} y=${Math.round(s.y)} w=${Math.round(s.w)} h=${Math.round(s.h)} fill=${s.fill} stroke=${s.stroke} sw=${s.strokeWidth} -->` + md.slice(shape.matchEnd)
}

function removeFromMd(md: string, start: number, end: number): string {
  return (md.slice(0, start) + md.slice(end)).replace(/\n{3,}/g, '\n\n').trim()
}

/* ── Main component ── */

export function DraggableElements({ markdown, canvasScale, onUpdateMarkdown, editable }: DraggableElementsProps): JSX.Element | null {
  const textBoxes = parseTextBoxes(markdown)
  const shapes = parseShapes(markdown)
  const [editingBox, setEditingBox] = useState<number | null>(null)
  const [selectedBox, setSelectedBox] = useState<number | null>(null)
  const [selectedShape, setSelectedShape] = useState<number | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<'fill' | 'stroke' | 'fontColor' | null>(null)

  if (!editable || (textBoxes.length === 0 && shapes.length === 0)) return null

  const clearSelection = () => { setSelectedBox(null); setSelectedShape(null); setShowColorPicker(null); setEditingBox(null) }

  /* ── Drag helper ── */
  const startDrag = (e: React.MouseEvent, x: number, y: number, selector: string, onDone: (newX: number, newY: number) => void) => {
    e.preventDefault(); e.stopPropagation()
    const offset = { x: e.clientX / canvasScale - x, y: e.clientY / canvasScale - y }
    const move = (ev: MouseEvent) => {
      const el = document.querySelector(selector) as HTMLElement
      if (el) { el.style.left = `${Math.max(0, ev.clientX / canvasScale - offset.x)}px`; el.style.top = `${Math.max(0, ev.clientY / canvasScale - offset.y)}px` }
    }
    const up = (ev: MouseEvent) => {
      onDone(Math.max(0, ev.clientX / canvasScale - offset.x), Math.max(0, ev.clientY / canvasScale - offset.y))
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  return (
    <>
      {/* Text Boxes */}
      {textBoxes.map((box) => {
        const isEditing = editingBox === box.index
        const isSelected = selectedBox === box.index
        const showToolbar = isEditing || isSelected

        return (
          <div
            key={`tb-${box.index}`}
            data-textbox={box.index}
            className="absolute z-20 group pointer-events-auto"
            style={{
              left: box.x, top: box.y, width: box.w, padding: '8px 12px',
              border: isEditing ? '2px solid rgba(99,102,241,0.6)' : isSelected ? '2px solid rgba(99,102,241,0.4)' : '2px dashed rgba(150,150,150,0.25)',
              borderRadius: 6, cursor: isEditing ? 'text' : 'move',
            }}
            onMouseDown={(e) => {
              if (isEditing) return
              setSelectedBox(box.index); setSelectedShape(null); setShowColorPicker(null)
              startDrag(e, box.x, box.y, `[data-textbox="${box.index}"]`, (nx, ny) => onUpdateMarkdown(replaceTextBox(markdown, box, { x: nx, y: ny })))
            }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditingBox(box.index); setSelectedBox(box.index) }}
          >
            {/* Delete */}
            <DeleteBtn onDelete={(e) => { e.preventDefault(); e.stopPropagation(); clearSelection(); onUpdateMarkdown(removeFromMd(markdown, box.matchStart, box.matchEnd)) }} />

            {/* Mini formatting toolbar */}
            {showToolbar && (
              <div className="absolute left-0 right-0 flex items-center gap-0.5 pointer-events-auto bg-gray-900 border border-gray-700 rounded-md px-1 py-0.5 shadow-lg"
                style={{ bottom: '100%', marginBottom: 4, zIndex: 50 }}
                onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                {/* Font size */}
                <select
                  value={box.fontSize}
                  onChange={(e) => onUpdateMarkdown(replaceTextBox(markdown, box, { fontSize: parseInt(e.target.value) }))}
                  className="bg-gray-800 text-gray-300 text-[10px] rounded px-1 py-0.5 border border-gray-700 outline-none w-12"
                >
                  {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
                </select>

                <div className="w-px h-4 bg-gray-700 mx-0.5" />

                {/* Bold */}
                <MiniBtn active={box.bold} onClick={() => onUpdateMarkdown(replaceTextBox(markdown, box, { bold: !box.bold }))} title="Bold">
                  <b className="text-[10px]">B</b>
                </MiniBtn>

                {/* Italic */}
                <MiniBtn active={box.italic} onClick={() => onUpdateMarkdown(replaceTextBox(markdown, box, { italic: !box.italic }))} title="Italic">
                  <i className="text-[10px]">I</i>
                </MiniBtn>

                <div className="w-px h-4 bg-gray-700 mx-0.5" />

                {/* Font color */}
                <div className="relative">
                  <MiniBtn active={showColorPicker === 'fontColor'} onClick={() => setShowColorPicker(showColorPicker === 'fontColor' ? null : 'fontColor')} title="Text color">
                    <span className="text-[10px] font-bold" style={{ color: box.fontColor }}>A</span>
                  </MiniBtn>
                  {showColorPicker === 'fontColor' && (
                    <ColorPalette
                      colors={COLORS}
                      current={box.fontColor}
                      onSelect={(c) => { onUpdateMarkdown(replaceTextBox(markdown, box, { fontColor: c })); setShowColorPicker(null) }}
                      onClose={() => setShowColorPicker(null)}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Content */}
            {isEditing ? (
              <textarea
                autoFocus defaultValue={box.content}
                onBlur={(e) => { setEditingBox(null); if (e.target.value.trim() !== box.content) onUpdateMarkdown(replaceTextBox(markdown, box, { content: e.target.value.trim() })) }}
                onKeyDown={(e) => { if (e.key === 'Escape') setEditingBox(null); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur() } e.stopPropagation() }}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full bg-transparent outline-none resize-none"
                style={{ fontSize: box.fontSize, color: box.fontColor, fontWeight: box.bold ? 'bold' : 'normal', fontStyle: box.italic ? 'italic' : 'normal', minHeight: 20 }}
                rows={Math.max(1, box.content.split('\n').length)}
              />
            ) : (
              <div className="pointer-events-none select-none whitespace-pre-wrap"
                style={{ fontSize: box.fontSize, color: box.fontColor, fontWeight: box.bold ? 'bold' : 'normal', fontStyle: box.italic ? 'italic' : 'normal' }}>
                {box.content}
              </div>
            )}

            {/* Resize handle */}
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(99,102,241,0.8)', borderRadius: 2 }}
              onMouseDown={(e) => {
                e.preventDefault(); e.stopPropagation()
                const startX = e.clientX, startW = box.w
                const move = (ev: MouseEvent) => {
                  const el = document.querySelector(`[data-textbox="${box.index}"]`) as HTMLElement
                  if (el) el.style.width = `${Math.max(80, startW + (ev.clientX - startX) / canvasScale)}px`
                }
                const up = (ev: MouseEvent) => {
                  onUpdateMarkdown(replaceTextBox(markdown, box, { w: Math.max(80, startW + (ev.clientX - startX) / canvasScale) }))
                  window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
              }}
            />
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-400/40 rounded pointer-events-none transition-colors" />
          </div>
        )
      })}

      {/* Shapes */}
      {shapes.map((shape) => {
        const isSelected = selectedShape === shape.index
        return (
          <div
            key={`sh-${shape.index}`}
            data-shape={shape.index}
            className="absolute z-20 group pointer-events-auto"
            style={{ left: shape.x, top: shape.y, width: shape.w, height: shape.h, cursor: 'move' }}
            onMouseDown={(e) => {
              setSelectedShape(shape.index); setSelectedBox(null); setEditingBox(null); setShowColorPicker(null)
              startDrag(e, shape.x, shape.y, `[data-shape="${shape.index}"]`, (nx, ny) => onUpdateMarkdown(replaceShape(markdown, shape, { x: nx, y: ny })))
            }}
          >
            <svg className="w-full h-full absolute inset-0" viewBox={`0 0 ${shape.w} ${shape.h}`} xmlns="http://www.w3.org/2000/svg">
              {shape.type === 'rect' && <rect x={shape.strokeWidth / 2} y={shape.strokeWidth / 2} width={shape.w - shape.strokeWidth} height={shape.h - shape.strokeWidth} rx={4} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />}
              {shape.type === 'ellipse' && <ellipse cx={shape.w / 2} cy={shape.h / 2} rx={shape.w / 2 - shape.strokeWidth / 2} ry={shape.h / 2 - shape.strokeWidth / 2} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />}
              {shape.type === 'line' && <line x1={shape.strokeWidth} y1={shape.h / 2} x2={shape.w - shape.strokeWidth} y2={shape.h / 2} stroke={shape.stroke} strokeWidth={shape.strokeWidth} strokeLinecap="round" />}
            </svg>

            <DeleteBtn onDelete={(e) => { e.preventDefault(); e.stopPropagation(); clearSelection(); onUpdateMarkdown(removeFromMd(markdown, shape.matchStart, shape.matchEnd)) }} />

            {isSelected && <div className="absolute inset-0 border-2 border-indigo-400 rounded pointer-events-none" style={{ margin: -2 }} />}
            <div className="absolute inset-0 border-2 border-transparent group-hover:border-indigo-400/30 rounded pointer-events-none transition-colors" />

            {/* Resize */}
            <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(99,102,241,0.8)', borderRadius: 2, zIndex: 5 }}
              onMouseDown={(e) => {
                e.preventDefault(); e.stopPropagation()
                const start = { x: e.clientX, y: e.clientY, w: shape.w, h: shape.h }
                const move = (ev: MouseEvent) => {
                  const el = document.querySelector(`[data-shape="${shape.index}"]`) as HTMLElement
                  if (el) { el.style.width = `${Math.max(30, start.w + (ev.clientX - start.x) / canvasScale)}px`; el.style.height = `${Math.max(30, start.h + (ev.clientY - start.y) / canvasScale)}px` }
                }
                const up = (ev: MouseEvent) => {
                  onUpdateMarkdown(replaceShape(markdown, shape, { w: Math.max(30, start.w + (ev.clientX - start.x) / canvasScale), h: Math.max(30, start.h + (ev.clientY - start.y) / canvasScale) }))
                  window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
              }}
            />

            {/* Color controls */}
            {isSelected && (
              <div className="absolute -bottom-8 left-0 flex gap-1 pointer-events-auto" style={{ zIndex: 50 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <MiniBtn active={showColorPicker === 'fill'} onClick={() => setShowColorPicker(showColorPicker === 'fill' ? null : 'fill')} title="Fill">
                  <span className="w-2.5 h-2.5 rounded-sm border border-gray-600 block" style={{ backgroundColor: shape.fill === 'transparent' ? undefined : shape.fill, backgroundImage: shape.fill === 'transparent' ? 'linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%), linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%)' : undefined, backgroundSize: '4px 4px', backgroundPosition: '0 0, 2px 2px' }} />
                </MiniBtn>
                <MiniBtn active={showColorPicker === 'stroke'} onClick={() => setShowColorPicker(showColorPicker === 'stroke' ? null : 'stroke')} title="Border">
                  <span className="w-2.5 h-2.5 rounded-sm block" style={{ backgroundColor: shape.stroke, border: '1px solid rgba(255,255,255,0.2)' }} />
                </MiniBtn>
                {showColorPicker && (showColorPicker === 'fill' || showColorPicker === 'stroke') && (
                  <ColorPalette
                    colors={SHAPE_COLORS}
                    current={showColorPicker === 'fill' ? shape.fill : shape.stroke}
                    onSelect={(c) => { onUpdateMarkdown(replaceShape(markdown, shape, { [showColorPicker]: c })); setShowColorPicker(null) }}
                    onClose={() => setShowColorPicker(null)}
                    style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4 }}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ── Shared sub-components ── */

function DeleteBtn({ onDelete }: { onDelete: (e: React.MouseEvent) => void }) {
  return (
    <button className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" style={{ zIndex: 30 }} onMouseDown={onDelete}>
      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
    </button>
  )
}

function MiniBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${active ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
      {children}
    </button>
  )
}

function ColorPalette({ colors, current, onSelect, onClose, style }: {
  colors: string[]; current: string; onSelect: (c: string) => void; onClose: () => void; style?: React.CSSProperties
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-1.5 flex gap-1 pointer-events-auto"
        style={style || { position: 'absolute', left: 0, top: '100%', marginTop: 4 }}
        onMouseDown={(e) => e.stopPropagation()}>
        {colors.map((c) => (
          <button key={c} onClick={() => onSelect(c)}
            className={`w-5 h-5 rounded-sm border transition-colors ${current === c ? 'border-white' : 'border-gray-600 hover:border-gray-400'}`}
            style={{
              backgroundColor: c === 'transparent' ? undefined : c,
              backgroundImage: c === 'transparent' ? 'linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%), linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%)' : undefined,
              backgroundSize: '4px 4px', backgroundPosition: '0 0, 2px 2px'
            }}
          />
        ))}
      </div>
    </>
  )
}
