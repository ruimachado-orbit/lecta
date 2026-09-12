/**
 * The editable overlay for canvas-pinned elements.
 *
 * It draws the same visuals as the read-only `PinnedLayer` (so what you drag is what you
 * present) and adds selection, dragging with edge/centre snapping, resize handles, the
 * floating `Inspector` and keyboard nudging. Every edit is written through
 * `element-model` into the FULL slide markdown and handed to `onUpdateMarkdown`.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  alignToSlide,
  elementBounds,
  nextZ,
  parseElements,
  removeElement,
  replaceElement,
  snapPosition,
  zOf,
  type AlignTarget,
  type ShapeElement,
  type SlideElement,
  type TextElement,
} from './element-model'
import {
  PinnedImageContent,
  PinnedShapeContent,
  elementFrameStyle,
  textBoxContentStyle,
  textBoxPadding,
} from './PinnedElements'
import { surfacePadding } from './style-presets'
import { Inspector } from './Inspector'

interface DraggableElementsProps {
  markdown: string
  canvasScale: number
  onUpdateMarkdown: (newMd: string) => void
  editable: boolean
  rootPath?: string
  /** Whether the slide already has a backdrop — glass has nothing to refract without one. */
  hasSlideBackground?: boolean
  /** Apply the suggested gradient backdrop to this slide. */
  onApplySuggestedBackground?: () => void
}

const COLORS = [
  '#ffffff', '#0f172a', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#6366f1', '#a855f7', '#ec4899',
]
const SHAPE_COLORS = ['transparent', ...COLORS]
const FONT_SIZES = [14, 18, 24, 32, 40, 56]

type Corner = 'nw' | 'ne' | 'sw' | 'se'
const CORNER_CURSOR: Record<Corner, string> = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize' }

/** Live DOM node for an element, used to measure and to move it during a drag. */
function nodeFor(index: number): HTMLElement | null {
  return document.querySelector(`[data-slide-el="${index}"]`)
}

export function DraggableElements({
  markdown,
  canvasScale,
  onUpdateMarkdown,
  editable,
  rootPath = '',
  hasSlideBackground = false,
  onApplySuggestedBackground,
}: DraggableElementsProps): JSX.Element | null {
  const elements = parseElements(markdown)
  const [selected, setSelected] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<number | null>(null)
  const [showColorPicker, setShowColorPicker] = useState<'fill' | 'stroke' | 'fontColor' | null>(null)
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({})
  const [aspectLock, setAspectLock] = useState(true)
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null)

  // Keyboard handling reads the freshest markdown/elements without re-binding on each edit.
  const latest = useRef({ markdown, elements })
  latest.current = { markdown, elements }

  const clearSelection = useCallback(() => {
    setSelected(null)
    setEditingText(null)
    setShowColorPicker(null)
  }, [])

  const update = useCallback(
    (el: SlideElement, patch: Record<string, unknown>) => {
      onUpdateMarkdown(replaceElement(latest.current.markdown, el, patch))
    },
    [onUpdateMarkdown]
  )

  const remove = useCallback(
    (el: SlideElement) => {
      clearSelection()
      onUpdateMarkdown(removeElement(latest.current.markdown, el))
    },
    [clearSelection, onUpdateMarkdown]
  )

  // Selected element's real on-screen size, for the inspector and for snapping.
  useLayoutEffect(() => {
    if (selected === null) {
      setMeasured(null)
      return
    }
    const node = nodeFor(selected)
    setMeasured(node ? { w: node.offsetWidth, h: node.offsetHeight } : null)
  }, [selected, markdown])

  // Arrows nudge, Delete removes — but never while the caret is in a field.
  useEffect(() => {
    if (!editable || selected === null) return
    const onKey = (e: KeyboardEvent): void => {
      const active = document.activeElement
      const typing =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      if (typing) return

      const el = latest.current.elements.find((x) => x.index === selected)
      if (!el) return
      const step = e.shiftKey ? 10 : 1

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault(); update(el, { x: el.x - step }); break
        case 'ArrowRight':
          e.preventDefault(); update(el, { x: el.x + step }); break
        case 'ArrowUp':
          e.preventDefault(); update(el, { y: el.y - step }); break
        case 'ArrowDown':
          e.preventDefault(); update(el, { y: el.y + step }); break
        case 'Delete':
        case 'Backspace':
          e.preventDefault(); remove(el); break
        case 'Escape':
          clearSelection(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, selected, update, remove, clearSelection])

  /* ── Pointer interactions ── */

  const startDrag = (e: React.MouseEvent, el: SlideElement): void => {
    e.preventDefault()
    e.stopPropagation()
    const node = nodeFor(el.index)
    if (!node) return
    const size = { w: node.offsetWidth, h: node.offsetHeight }
    const offset = { x: e.clientX / canvasScale - el.x, y: e.clientY / canvasScale - el.y }
    let last = { x: el.x, y: el.y }
    let moved = false

    const move = (ev: MouseEvent): void => {
      const rawX = ev.clientX / canvasScale - offset.x
      const rawY = ev.clientY / canvasScale - offset.y
      // Alt bypasses snapping for fine placement near a guide.
      const snapped = ev.altKey
        ? { x: rawX, y: rawY, guideX: undefined, guideY: undefined }
        : snapPosition(rawX, rawY, size.w, size.h)
      last = { x: snapped.x, y: snapped.y }
      moved = true
      node.style.left = `${snapped.x}px`
      node.style.top = `${snapped.y}px`
      setGuides({ x: snapped.guideX, y: snapped.guideY })
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      setGuides({})
      if (moved) update(el, { x: Math.round(last.x), y: Math.round(last.y) })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const startResize = (e: React.MouseEvent, el: SlideElement, corner: Corner): void => {
    e.preventDefault()
    e.stopPropagation()
    const node = nodeFor(el.index)
    if (!node) return
    const start = { mx: e.clientX, my: e.clientY, w: node.offsetWidth, h: node.offsetHeight, x: el.x, y: el.y }
    const ratio = start.h > 0 ? start.w / start.h : 1
    const west = corner === 'nw' || corner === 'sw'
    const north = corner === 'nw' || corner === 'ne'
    const minW = el.kind === 'textbox' ? 80 : 24
    let next = { w: start.w, h: start.h, x: start.x, y: start.y }

    const move = (ev: MouseEvent): void => {
      const dx = ((ev.clientX - start.mx) / canvasScale) * (west ? -1 : 1)
      const dy = ((ev.clientY - start.my) / canvasScale) * (north ? -1 : 1)
      let w = Math.max(minW, start.w + dx)
      let h = Math.max(16, start.h + dy)
      // Images and shapes keep their ratio while locked; a text box is width-only.
      if (el.kind !== 'shape' && aspectLock) h = Math.round(w / (ratio || 1))
      else if (el.kind === 'shape' && ev.shiftKey) h = Math.round(w / (ratio || 1))
      if (el.kind === 'textbox') h = start.h
      w = Math.round(w)
      h = Math.round(h)
      next = {
        w,
        h,
        x: west ? start.x + (start.w - w) : start.x,
        y: north ? start.y + (start.h - h) : start.y,
      }
      node.style.width = `${w}px`
      node.style.left = `${next.x}px`
      node.style.top = `${next.y}px`
      if (el.kind !== 'textbox') node.style.height = `${h}px`
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (next.w === start.w && next.h === start.h) return
      if (el.kind === 'textbox') update(el, { w: next.w, x: next.x })
      else if (el.kind === 'shape') update(el, { w: next.w, h: next.h, x: next.x, y: next.y })
      else update(el, { w: next.w, h: next.h, x: next.x, y: next.y })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const select = (index: number): void => {
    setSelected(index)
    setShowColorPicker(null)
    if (editingText !== index) setEditingText(null)
  }

  if (elements.length === 0) return null

  const painted = [...elements].sort((a, b) => zOf(a) - zOf(b) || a.index - b.index)
  const selectedEl = selected === null ? null : elements.find((e) => e.index === selected) ?? null

  return (
    <>
      {painted.map((el) => {
        const isSelected = selected === el.index
        const frame = elementFrameStyle(el)

        return (
          <div
            key={`el-${el.index}`}
            data-slide-el={el.index}
            className={`group ${editable ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={{
              ...frame,
              zIndex: 20 + zOf(el),
              cursor: editable ? 'move' : 'default',
              outline: isSelected ? '2px solid rgba(99,102,241,0.9)' : undefined,
              outlineOffset: 2,
              padding: el.kind === 'textbox' ? textBoxPadding(el) : surfacePadding(el.style) || undefined,
              overflow: el.kind === 'image' ? 'hidden' : undefined,
            }}
            onMouseDown={
              editable
                ? (e) => {
                    if (editingText === el.index) return
                    select(el.index)
                    startDrag(e, el)
                  }
                : undefined
            }
            onDoubleClick={
              el.kind === 'textbox'
                ? (e) => {
                    e.stopPropagation()
                    setEditingText(el.index)
                    setSelected(el.index)
                  }
                : undefined
            }
          >
            {el.kind === 'image' && <PinnedImageContent el={el} rootPath={rootPath} />}
            {el.kind === 'shape' && <PinnedShapeContent el={el} />}
            {el.kind === 'textbox' && (
              <TextBoxBody
                el={el}
                editing={editingText === el.index}
                onCommit={(content) => {
                  setEditingText(null)
                  if (content !== el.content) update(el, { content })
                }}
                onCancel={() => setEditingText(null)}
              />
            )}

            {editable && (
              <>
                <DeleteBtn onDelete={(e) => { e.preventDefault(); e.stopPropagation(); remove(el) }} />

                {el.kind === 'image' && (
                  <UnpinBtn
                    onUnpin={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      clearSelection()
                      onUpdateMarkdown(`${removeElement(markdown, el)}\n![image](${el.src})\n`)
                    }}
                  />
                )}

                {(['nw', 'ne', 'sw', 'se'] as Corner[])
                  .filter((c) => el.kind !== 'textbox' || c === 'se')
                  .map((corner) => (
                    <ResizeHandle key={corner} corner={corner} onMouseDown={(e) => startResize(e, el, corner)} />
                  ))}

                {el.kind === 'textbox' && (isSelected || editingText === el.index) && (
                  <TextToolbar
                    el={el}
                    picker={showColorPicker}
                    setPicker={setShowColorPicker}
                    onChange={(patch) => update(el, patch)}
                  />
                )}

                {el.kind === 'shape' && isSelected && (
                  <ShapeToolbar
                    el={el}
                    picker={showColorPicker}
                    setPicker={setShowColorPicker}
                    onChange={(patch) => update(el, patch)}
                  />
                )}
              </>
            )}
          </div>
        )
      })}

      {/* Snap guides */}
      {guides.x !== undefined && <div className="slide-snap-guide slide-snap-guide-v" style={{ left: guides.x }} />}
      {guides.y !== undefined && <div className="slide-snap-guide slide-snap-guide-h" style={{ top: guides.y }} />}

      {editable && selectedEl && (
        <Inspector
          el={selectedEl}
          bounds={elementBounds(selectedEl, measured ?? undefined)}
          aspectLock={aspectLock}
          onAspectLock={setAspectLock}
          onChange={(patch) => update(selectedEl, patch)}
          onAlign={(target: AlignTarget) =>
            update(selectedEl, alignToSlide(elementBounds(selectedEl, measured ?? undefined), target))
          }
          onZ={(direction) => update(selectedEl, { z: nextZ(elements, direction) })}
          onDelete={() => remove(selectedEl)}
          onClose={clearSelection}
          glassNeedsBackground={!hasSlideBackground}
          onAddSuggestedBackground={() => onApplySuggestedBackground?.()}
        />
      )}
    </>
  )
}

/* ── Sub-components ── */

function TextBoxBody({ el, editing, onCommit, onCancel }: {
  el: TextElement
  editing: boolean
  onCommit: (content: string) => void
  onCancel: () => void
}): JSX.Element {
  const style = textBoxContentStyle(el)
  if (!editing) {
    return <div className="select-none pointer-events-none" style={style}>{el.content}</div>
  }
  return (
    <textarea
      autoFocus
      defaultValue={el.content}
      onBlur={(e) => onCommit(e.target.value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
        e.stopPropagation()
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-full bg-transparent outline-none resize-none"
      style={{ ...style, minHeight: 20 }}
      rows={Math.max(1, el.content.split('\n').length)}
    />
  )
}

function TextToolbar({ el, picker, setPicker, onChange }: {
  el: TextElement
  picker: 'fill' | 'stroke' | 'fontColor' | null
  setPicker: (p: 'fill' | 'stroke' | 'fontColor' | null) => void
  onChange: (patch: Record<string, unknown>) => void
}): JSX.Element {
  return (
    <div
      className="absolute left-0 flex items-center gap-0.5 pointer-events-auto bg-gray-900 border border-gray-700 rounded-md px-1 py-0.5 shadow-lg"
      style={{ bottom: '100%', marginBottom: 6, zIndex: 50 }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={el.fs ?? 18}
        onChange={(e) => onChange({ fs: parseInt(e.target.value, 10) })}
        className="bg-gray-800 text-gray-300 text-[10px] rounded px-1 py-0.5 border border-gray-700 outline-none w-12"
        aria-label="Font size"
      >
        {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
      </select>
      <div className="w-px h-4 bg-gray-700 mx-0.5" />
      <MiniBtn active={el.fb} onClick={() => onChange({ fb: el.fb ? undefined : true })} title="Bold"><b className="text-[10px]">B</b></MiniBtn>
      <MiniBtn active={el.fi} onClick={() => onChange({ fi: el.fi ? undefined : true })} title="Italic"><i className="text-[10px]">I</i></MiniBtn>
      <div className="w-px h-4 bg-gray-700 mx-0.5" />
      {(['left', 'center', 'right'] as const).map((a) => (
        <MiniBtn key={a} active={el.align === a} onClick={() => onChange({ align: el.align === a ? undefined : a })} title={`Align ${a}`}>
          <span className="text-[9px] uppercase">{a[0]}</span>
        </MiniBtn>
      ))}
      <div className="w-px h-4 bg-gray-700 mx-0.5" />
      <div className="relative">
        <MiniBtn active={picker === 'fontColor'} onClick={() => setPicker(picker === 'fontColor' ? null : 'fontColor')} title="Text color">
          <span className="text-[10px] font-bold" style={{ color: el.fc }}>A</span>
        </MiniBtn>
        {picker === 'fontColor' && (
          <ColorPalette
            colors={COLORS}
            current={el.fc ?? ''}
            onSelect={(c) => { onChange({ fc: c }); setPicker(null) }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  )
}

function ShapeToolbar({ el, picker, setPicker, onChange }: {
  el: ShapeElement
  picker: 'fill' | 'stroke' | 'fontColor' | null
  setPicker: (p: 'fill' | 'stroke' | 'fontColor' | null) => void
  onChange: (patch: Record<string, unknown>) => void
}): JSX.Element {
  return (
    <div
      className="absolute left-0 flex gap-1 pointer-events-auto"
      style={{ top: '100%', marginTop: 8, zIndex: 50 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MiniBtn active={picker === 'fill'} onClick={() => setPicker(picker === 'fill' ? null : 'fill')} title="Fill">
        <Swatch color={el.fill ?? 'transparent'} />
      </MiniBtn>
      <MiniBtn active={picker === 'stroke'} onClick={() => setPicker(picker === 'stroke' ? null : 'stroke')} title="Border">
        <Swatch color={el.stroke ?? '#ffffff'} />
      </MiniBtn>
      {(picker === 'fill' || picker === 'stroke') && (
        <ColorPalette
          colors={SHAPE_COLORS}
          current={(picker === 'fill' ? el.fill : el.stroke) ?? ''}
          onSelect={(c) => { onChange({ [picker]: c }); setPicker(null) }}
          onClose={() => setPicker(null)}
          style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4 }}
        />
      )}
    </div>
  )
}

function ResizeHandle({ corner, onMouseDown }: { corner: Corner; onMouseDown: (e: React.MouseEvent) => void }): JSX.Element {
  const north = corner === 'nw' || corner === 'ne'
  const west = corner === 'nw' || corner === 'sw'
  return (
    <div
      className="absolute w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
      style={{
        [north ? 'top' : 'bottom']: 0,
        [west ? 'left' : 'right']: 0,
        transform: `translate(${west ? '-50%' : '50%'}, ${north ? '-50%' : '50%'})`,
        background: 'rgba(99,102,241,0.9)',
        borderRadius: 2,
        cursor: CORNER_CURSOR[corner],
        zIndex: 20,
      }}
      onMouseDown={onMouseDown}
    />
  )
}

function DeleteBtn({ onDelete }: { onDelete: (e: React.MouseEvent) => void }): JSX.Element {
  return (
    <button
      className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
      style={{ zIndex: 30 }}
      onMouseDown={onDelete}
      title="Delete element"
      aria-label="Delete element"
    >
      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  )
}

function UnpinBtn({ onUnpin }: { onUnpin: (e: React.MouseEvent) => void }): JSX.Element {
  return (
    <button
      className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-green-600 hover:bg-green-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ zIndex: 30 }}
      title="Unpin — return to document flow"
      aria-label="Unpin — return to document flow"
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
      onClick={onUnpin}
    >
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
      </svg>
    </button>
  )
}

function MiniBtn({ active, onClick, title, children }: {
  active?: boolean; onClick: () => void; title: string; children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${active ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
    >
      {children}
    </button>
  )
}

const CHECKER =
  'linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%), linear-gradient(45deg, #666 25%, transparent 25%, transparent 75%, #666 75%)'

function Swatch({ color }: { color: string }): JSX.Element {
  const clear = color === 'transparent' || color === ''
  return (
    <span
      className="w-2.5 h-2.5 rounded-sm border border-gray-600 block"
      style={{
        backgroundColor: clear ? undefined : color,
        backgroundImage: clear ? CHECKER : undefined,
        backgroundSize: '4px 4px',
        backgroundPosition: '0 0, 2px 2px',
      }}
    />
  )
}

function ColorPalette({ colors, current, onSelect, onClose, style }: {
  colors: string[]; current: string; onSelect: (c: string) => void; onClose: () => void; style?: React.CSSProperties
}): JSX.Element {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-1.5 flex gap-1 pointer-events-auto"
        style={style || { position: 'absolute', left: 0, top: '100%', marginTop: 4 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onSelect(c)}
            title={c}
            aria-label={c}
            className={`w-5 h-5 rounded-sm border transition-colors ${current === c ? 'border-white' : 'border-gray-600 hover:border-gray-400'}`}
            style={{
              backgroundColor: c === 'transparent' ? undefined : c,
              backgroundImage: c === 'transparent' ? CHECKER : undefined,
              backgroundSize: '4px 4px',
              backgroundPosition: '0 0, 2px 2px',
            }}
          />
        ))}
      </div>
    </>
  )
}
