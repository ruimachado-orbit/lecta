import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SlideRenderer } from './SlideRenderer'
import { SlideErrorBoundary } from './SlideErrorBoundary'
import { DraggableElements } from './DraggableElements'
import { appendElement, CANVAS_H, CANVAS_W } from './element-model'
import { imageFilesFrom, readAsDataUrl, clampToCanvas } from './slide-utils'
import { hasBackground, applySlideBackground, slideBackground } from './slide-background'
import { SUGGESTED_GLASS_GRADIENT } from './style-presets'
import { usePresentationStore } from '../../stores/presentation-store'
import { FormatPanel } from './FormatPanel'
import {
  splitBlocks,
  patchBlock,
  moveBlock,
  insertBlock,
  insertSection,
  deleteBlock,
  joinBlocks,
  isEditableBlock,
  leadingDirectives,
  getBlockAlign,
  setBlockAlign,
  sectionAt,
  createMarkdownConverter,
  type SlideBlock,
  type BlockAlign,
} from './block-model'

const SLIDE_W = 1280
const SLIDE_H = 720

interface DesignEditorProps {
  markdown: string
  rootPath?: string
  layout?: string
  slideId?: string
  theme?: string
  slideIndex?: number
  onCommit: (fullMd: string) => void
}

const BLOCK_LABEL: Record<string, string> = {
  code: 'Code',
  image: 'Image',
  table: 'Table',
  html: 'Embed',
  break: 'Break',
}

/**
 * The canvas editor: the slide itself is the editor. Click any text block and
 * type — PowerPoint-style. Locked blocks (code, images, diagrams, tables,
 * embeds, breaks) render read-only with a label and can be deleted or moved.
 * Pinned canvas elements drag freely; images drop straight onto the canvas.
 * Markdown stays the single source of truth; every commit rewrites it.
 */
export function DesignEditor({ markdown, rootPath, layout, slideId, theme, slideIndex, onCommit }: DesignEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [fitScale, setFitScale] = useState(0.5)
  const [zoom, setZoom] = useState<number | null>(null)
  // Multi-selection: click selects, Cmd/Ctrl+click toggles, Shift+click ranges.
  // The anchor (last key) drives the format panel.
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const [, setHistTick] = useState(0)
  const editRefs = useRef(new Map<string, HTMLDivElement>())
  const dragFrom = useRef<string | null>(null)
  const histRef = useRef<{ stack: string[]; idx: number } | null>(null)
  if (!histRef.current) histRef.current = { stack: [markdown], idx: 0 }

  const displayScale = zoom ?? fitScale
  const blocks = useMemo(() => splitBlocks(markdown), [markdown])
  const turndown = useMemo(() => createMarkdownConverter(), [])
  const background = usePresentationStore((s) =>
    typeof slideIndex === 'number' ? s.presentation?.slides[slideIndex]?.background : undefined
  )

  // Fit the 16:9 canvas into the container (when not zoomed manually).
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const s = Math.min(container.clientWidth / SLIDE_W, container.clientHeight / SLIDE_H)
      setFitScale(Math.max(0.05, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Drop dangling selection when the slide changes underneath us.
  useEffect(() => {
    setSelectedKeys((prev) => {
      const kept = prev.filter((k) => blocks.some((b) => b.key === k))
      return kept.length === prev.length ? prev : kept
    })
    if (editingKey && !blocks.some((b) => b.key === editingKey)) setEditingKey(null)
  }, [blocks, editingKey])

  /** Every committed state pushes history (cap 30); skips no-op commits. */
  const commit = useCallback(
    (next: string) => {
      if (next === markdown) return
      const h = histRef.current!
      h.stack = [...h.stack.slice(0, h.idx + 1), next].slice(-30)
      h.idx = h.stack.length - 1
      setHistTick((t) => t + 1)
      onCommit(next)
    },
    [markdown, onCommit]
  )

  const canUndo = (histRef.current?.idx ?? 0) > 0
  const canRedo = histRef.current ? histRef.current.idx < histRef.current.stack.length - 1 : false

  const undo = useCallback(() => {
    const h = histRef.current!
    if (h.idx === 0) return
    h.idx -= 1
    setHistTick((t) => t + 1)
    onCommit(h.stack[h.idx])
  }, [onCommit])

  const redo = useCallback(() => {
    const h = histRef.current!
    if (h.idx >= h.stack.length - 1) return
    h.idx += 1
    setHistTick((t) => t + 1)
    onCommit(h.stack[h.idx])
  }, [onCommit])

  const focusBlock = useCallback((key: string) => {
    setSelectedKeys([key])
    setEditingKey(key)
    requestAnimationFrame(() => {
      const el = editRefs.current.get(key)
      if (!el) return
      el.focus()
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })
  }, [])

  const commitBlock = useCallback(
    (block: SlideBlock) => {
      const el = editRefs.current.get(block.key)
      setEditingKey((cur) => (cur === block.key ? null : cur))
      if (!el) return
      let next = turndown.turndown(el.innerHTML).trim()
      // turndown drops HTML comments — re-attach leading directives (align…).
      const dirs = leadingDirectives(block.markdown)
      if (dirs.length > 0 && next !== '') next = [...dirs, next].join('\n')
      if (next === '') {
        commit(deleteBlock(markdown, block.key))
        return
      }
      if (next !== block.markdown) commit(patchBlock(markdown, block.key, next))
    },
    [markdown, commit, turndown]
  )

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
  }, [])

  /** Block-level style transform (heading / quote / list / paragraph). */
  const setBlockStyle = useCallback(
    (block: SlideBlock, style: 'p' | 'h1' | 'h2' | 'h3' | 'quote' | 'bullets' | 'numbers') => {
      const dirs = leadingDirectives(block.markdown)
      const lines = block.markdown.split('\n').slice(dirs.length)
      const strip = (l: string) =>
        l.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^([-*+]|\d+[.)])\s+/, '')
      let body: string
      if (style === 'p') {
        body = lines.map(strip).join('\n')
      } else if (style === 'quote') {
        body = lines.map((l) => (l.startsWith('>') ? l : `> ${strip(l)}`)).join('\n')
      } else if (style === 'bullets') {
        body = lines.map((l) => `- ${strip(l)}`).join('\n')
      } else if (style === 'numbers') {
        body = lines.map((l, i) => `${i + 1}. ${strip(l)}`).join('\n')
      } else {
        const hashes = style === 'h1' ? '# ' : style === 'h2' ? '## ' : '### '
        const first = lines[0] ?? ''
        const rest = lines.slice(1).map(strip).join('\n')
        body = `${hashes}${strip(first)}${rest ? `\n${rest}` : ''}`
      }
      commit(patchBlock(markdown, block.key, [...dirs, body].join('\n')))
    },
    [markdown, commit]
  )

  const setSelectedAlign = useCallback(
    (block: SlideBlock, align: BlockAlign | null) => {
      commit(patchBlock(markdown, block.key, setBlockAlign(block.markdown, align)))
    },
    [markdown, commit]
  )

  const duplicateBlock = useCallback(
    (block: SlideBlock) => {
      const { markdown: next, key } = insertBlock(markdown, block.key, block.markdown)
      commit(next)
      setSelectedKeys([key])
    },
    [markdown, commit]
  )

  const selectedKeysRef = useRef<string[]>([])
  selectedKeysRef.current = selectedKeys

  /** Click / Cmd-click / Shift-click selection. */
  const pickBlock = useCallback(
    (e: React.MouseEvent, key: string) => {
      if (e.metaKey || e.ctrlKey) {
        setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
      } else if (e.shiftKey) {
        setSelectedKeys((prev) => {
          const anchor = prev[prev.length - 1]
          const parts = splitBlocks(markdown)
          const a = parts.findIndex((b) => b.key === anchor)
          const t = parts.findIndex((b) => b.key === key)
          if (a < 0 || t < 0) return [key]
          const [from, to] = a < t ? [a, t] : [t, a]
          return parts.slice(from, to + 1).map((b) => b.key)
        })
      } else {
        setSelectedKeys([key])
      }
    },
    [markdown]
  )

  /** Select the whole section a block belongs to. */
  const selectSection = useCallback(
    (key: string) => {
      const parts = splitBlocks(markdown)
      const idx = parts.findIndex((b) => b.key === key)
      if (idx < 0) return
      const { start, end } = sectionAt(parts, idx)
      setSelectedKeys(parts.slice(start, end).map((b) => b.key))
    },
    [markdown]
  )

  /** Delete every selected block (keeps one paragraph so the slide survives). */
  const deleteSelected = useCallback(() => {
    const parts = splitBlocks(markdown)
    const keep = parts.filter((b) => !selectedKeysRef.current.includes(b.key)).map((b) => b.markdown)
    commit(keep.length === 0 ? 'New text' : joinBlocks(keep))
  }, [markdown, commit])

  /** Duplicate every selected block in place. */
  const duplicateSelected = useCallback(() => {
    const parts = splitBlocks(markdown)
    const md = parts.map((b) => b.markdown)
    const idxs = parts
      .map((b, i) => (selectedKeysRef.current.includes(b.key) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => b - a)
    if (idxs.length === 0) return
    for (const i of idxs) md.splice(i + 1, 0, md[i])
    commit(joinBlocks(md))
  }, [markdown, commit])

  // Delete / select-all shortcuts (only when not typing in a block or field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKeysRef.current.length > 0) {
        e.preventDefault()
        deleteSelected()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelectedKeys(splitBlocks(markdown).map((b) => b.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [markdown, commit, deleteSelected])

  const replaceImageSrc = useCallback(
    async (block: SlideBlock) => {
      if (!rootPath) return
      const relative = await window.electronAPI.uploadImage(rootPath)
      if (!relative) return
      const next = block.markdown.replace(/\(([^)]+)\)/, `(${relative})`)
      if (next !== block.markdown) commit(patchBlock(markdown, block.key, next))
    },
    [markdown, commit, rootPath]
  )

  const onDropOnBlock = useCallback(
    (targetKey: string) => {
      const from = dragFrom.current
      dragFrom.current = null
      setDragKey(null)
      if (!from || from === targetKey) return
      const parts = splitBlocks(markdown)
      const fromIdx = parts.findIndex((b) => b.key === from)
      const toIdx = parts.findIndex((b) => b.key === targetKey)
      if (fromIdx < 0 || toIdx < 0) return
      const md = parts.map((b) => b.markdown)
      const [item] = md.splice(fromIdx, 1)
      // Insert before the drop target (adjusting for the removal shift).
      md.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, item)
      commit(joinBlocks(md))
    },
    [markdown, commit]
  )

  /** Delete one block — or the whole selection when it belongs to one. */
  const deleteOne = useCallback(
    (key: string) => {
      if (selectedKeysRef.current.length > 1 && selectedKeysRef.current.includes(key)) {
        deleteSelected()
      } else {
        commit(deleteBlock(markdown, key))
      }
    },
    [markdown, commit, deleteSelected]
  )

  /** Insert a new section before/after the anchor block's section. */
  const addSection = useCallback(
    (position: 'before' | 'after') => {
      const anchor = selectedKeysRef.current[selectedKeysRef.current.length - 1]
        ?? splitBlocks(markdown).at(-1)?.key
        ?? null
      if (!anchor) return
      const { markdown: next, key } = insertSection(markdown, anchor, position)
      commit(next)
      setTimeout(() => focusBlock(key), 50)
    },
    [markdown, commit, focusBlock]
  )

  /** Pointer position in slide coordinates (the canvas is CSS-scaled to fit). */
  const toSlidePoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = frameRef.current?.getBoundingClientRect()
      if (!rect) return { x: CANVAS_W / 2, y: CANVAS_H / 2 }
      return { x: (clientX - rect.left) / displayScale, y: (clientY - rect.top) / displayScale }
    },
    [displayScale]
  )

  /** Drop image files onto the canvas: pin them where they land. */
  const importImages = useCallback(
    async (files: File[], point: { x: number; y: number }) => {
      if (!rootPath || files.length === 0) return
      let md = markdown
      let placed = 0
      for (const file of files) {
        try {
          const dataUrl = await readAsDataUrl(file)
          const relative = await window.electronAPI.importDroppedImage(rootPath, file.name, dataUrl)
          if (!relative) continue
          const w = 480
          const x = clampToCanvas(point.x - w / 2 + placed * 24, w, CANVAS_W)
          const y = clampToCanvas(point.y - (w * 0.66) / 2 + placed * 24, w * 0.66, CANVAS_H)
          md = appendElement(md, { kind: 'image', x, y, w, src: relative, style: 'glass', extra: [] })
          placed++
        } catch (error) {
          usePresentationStore.setState({ error: (error as Error).message })
        }
      }
      if (placed > 0) commit(md)
    },
    [markdown, commit, rootPath]
  )

  const nudgeZoom = (delta: number) =>
    setZoom(Math.max(0.2, Math.min(1.5, Math.round(((zoom ?? fitScale) + delta) * 10) / 10)))

  const selected = blocks.find((b) => b.key === selectedKeys[selectedKeys.length - 1]) ?? null
  const selectedAlign = selected ? getBlockAlign(selected.markdown) : null
  const selectedSection = (() => {
    if (!selected) return null
    const idx = blocks.findIndex((b) => b.key === selected.key)
    if (idx < 0) return null
    const s = sectionAt(blocks, idx)
    return s.end - s.start > 1 ? s : null
  })()

  const headingSection = (key: string): { title: string; count: number } | null => {
    const idx = blocks.findIndex((b) => b.key === key)
    if (idx < 0) return null
    const s = sectionAt(blocks, idx)
    return s.end - s.start > 1 ? { title: s.title, count: s.end - s.start } : null
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Canvas ── */}
      <div
        ref={containerRef}
        className="relative h-full min-w-0 flex-1 overflow-auto"
        onClick={() => setSelectedKeys([])}
        onDragOver={(e) => {
          if (!dragFrom.current && Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            setDropActive(true)
          }
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          if (dragFrom.current) return
          e.preventDefault()
          setDropActive(false)
          const files = imageFilesFrom(e.dataTransfer)
          if (files.length > 0) void importImages(files, toSlidePoint(e.clientX, e.clientY))
        }}
      >
        {/* Zoom controls */}
        <div className="sticky top-2 z-30 flex justify-end pr-3">
          <div className="flex items-center gap-0.5 rounded-full border border-gray-700/60 bg-gray-900/85 px-1.5 py-0.5 backdrop-blur">
            <ZoomBtn label="Zoom out" onClick={() => nudgeZoom(-0.1)}>−</ZoomBtn>
            <button
              onClick={() => setZoom(null)}
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition-colors ${
                zoom === null ? 'text-signal-400' : 'text-gray-400 hover:text-gray-200'
              }`}
              title="Fit slide to window"
            >
              {zoom === null ? 'Fit' : `${Math.round(displayScale * 100)}%`}
            </button>
            <ZoomBtn label="Zoom in" onClick={() => nudgeZoom(0.1)}>+</ZoomBtn>
          </div>
        </div>

        <div
          ref={frameRef}
          className="absolute overflow-hidden"
          data-slide-theme={theme}
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `translate(-50%, -50%) scale(${displayScale})`,
            transformOrigin: 'center center',
            left: '50%',
            top: '50%',
            background: 'var(--slide-bg)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
            borderRadius: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${layout && layout !== 'default' && layout !== 'blank' ? `slide-layout-${layout}` : ''}`}>
            <div className={layout === 'blank' ? '' : 'slide-pad'}>
              <div className="slide-content max-w-none relative">
                {blocks.map((block) =>
                  isEditableBlock(block.kind) ? (
                    <EditableBlock
                      key={block.key}
                      block={block}
                      rootPath={rootPath}
                      selected={selectedKeys.includes(block.key)}
                      editing={editingKey === block.key}
                      dimmed={dragKey !== null && dragKey !== block.key}
                      section={block.kind === 'heading' ? headingSection(block.key) : null}
                      registerRef={(el) => {
                        if (el) editRefs.current.set(block.key, el)
                        else editRefs.current.delete(block.key)
                      }}
                      onSelect={(e) => pickBlock(e, block.key)}
                      onSelectSection={() => selectSection(block.key)}
                      onAddSection={(position) => {
                        const { markdown: next, key } = insertSection(markdown, block.key, position)
                        commit(next)
                        setTimeout(() => focusBlock(key), 50)
                      }}
                      onDeleteOne={() => deleteOne(block.key)}
                      onEdit={() => focusBlock(block.key)}
                      onBlur={() => commitBlock(block)}
                      onUndo={undo}
                      onRedo={redo}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') (e.target as HTMLElement).blur()
                        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                          e.preventDefault()
                          commit(moveBlock(markdown, block.key, e.key === 'ArrowUp' ? -1 : 1))
                        }
                      }}
                      onDragStart={(e) => {
                        dragFrom.current = block.key
                        setDragKey(block.key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        dragFrom.current = null
                        setDragKey(null)
                      }}
                      onDragOver={(e) => {
                        if (dragFrom.current && dragFrom.current !== block.key) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        onDropOnBlock(block.key)
                      }}
                    />
                  ) : (
                    <LockedBlock
                      key={block.key}
                      block={block}
                      rootPath={rootPath}
                      slideId={slideId}
                      selected={selectedKeys.includes(block.key)}
                      onSelect={(e) => pickBlock(e, block.key)}
                      onDelete={() => deleteOne(block.key)}
                      onDuplicate={() => duplicateBlock(block)}
                      onReplaceImage={block.kind === 'image' ? () => void replaceImageSrc(block) : undefined}
                      onDragStart={(e) => {
                        dragFrom.current = block.key
                        setDragKey(block.key)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        dragFrom.current = null
                        setDragKey(null)
                      }}
                      onDragOver={(e) => {
                        if (dragFrom.current && dragFrom.current !== block.key) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        onDropOnBlock(block.key)
                      }}
                    />
                  )
                )}
                {/* End-of-slide insert */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const { markdown: next, key } = insertBlock(markdown, blocks[blocks.length - 1]?.key ?? null, '')
                    commit(next)
                    setTimeout(() => focusBlock(key), 50)
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded px-1 py-1 text-[11px] text-gray-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-gray-300 hover:opacity-100"
                  title="Add a text block"
                >
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-sm leading-none">+</span>
                  <span className="h-px flex-1 bg-white/10" />
                </button>
              </div>
            </div>
          </div>
          {/* Pinned canvas elements: drag, resize and restyle in place.
              The layer itself is click-through; each element re-enables events. */}
          <div className="absolute inset-0 slide-pad pointer-events-none" style={{ zIndex: 10 }}>
            <DraggableElements
              markdown={markdown}
              canvasScale={displayScale}
              onUpdateMarkdown={commit}
              editable={true}
              rootPath={rootPath}
              hasSlideBackground={hasBackground(background)}
              onApplySuggestedBackground={() => {
                if (typeof slideIndex === 'number') {
                  void applySlideBackground(slideIndex, { ...background, gradient: SUGGESTED_GLASS_GRADIENT.css })
                }
              }}
            />
          </div>
          {dropActive && (
            <div
              className="absolute inset-0 pointer-events-none border-2 border-dashed border-indigo-400/70 bg-indigo-500/10 flex items-center justify-center"
              style={{ zIndex: 50 }}
            >
              <span className="text-2xl font-medium text-indigo-200">Drop image to pin it here</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Format sidebar ── */}
      <FormatPanel
        block={selected && isEditableBlock(selected.kind) ? selected : null}
        align={selectedAlign}
        canUndo={canUndo}
        canRedo={canRedo}
        slideIndex={slideIndex}
        onUndo={undo}
        onRedo={redo}
        onBold={() => exec('bold')}
        onItalic={() => exec('italic')}
        onTextColor={(c) => exec('foreColor', c)}
        onHighlight={(c) => exec('hiliteColor', c)}
        onStyle={(style) => selected && setBlockStyle(selected, style)}
        onAlign={(align) => selected && setSelectedAlign(selected, align)}
        onDuplicate={duplicateSelected}
        onDeleteBlock={deleteSelected}
        selectedCount={selectedKeys.length}
        sectionLabel={selectedSection ? `${selectedSection.title} · ${selectedSection.end - selectedSection.start} blocks` : null}
        onSelectSection={() => selected && selectSection(selected.key)}
        onAddSectionBefore={() => addSection('before')}
        onAddSectionAfter={() => addSection('after')}
        onInsert={(kind) => {
          const templates: Record<string, string> = {
            heading: '# New heading',
            text: 'New text',
            bullets: '- First point\n- Second point',
            quote: '> A notable quote',
            divider: '----',
            code: '```\ncode here\n```',
            textbox: null as unknown as string,
            shape: null as unknown as string,
          }
          if (kind === 'textbox' || kind === 'shape') {
            const cx = Math.round(CANVAS_W / 2)
            const cy = Math.round(CANVAS_H / 2)
            const el =
              kind === 'textbox'
                ? { kind: 'textbox' as const, x: cx - 150, y: cy - 40, w: 300, content: 'New text', extra: [] as [string, string][] }
                : { kind: 'shape' as const, x: cx - 100, y: cy - 50, w: 200, h: 100, shape: 'rect' as const, extra: [] as [string, string][] }
            commit(appendElement(markdown, el))
            return
          }
          const { markdown: next, key } = insertBlock(markdown, selectedKeys[selectedKeys.length - 1] ?? null, templates[kind] ?? 'New text')
          commit(next)
          if (kind !== 'divider' && kind !== 'code') setTimeout(() => focusBlock(key), 50)
        }}
      />
    </div>
  )
}

function ZoomBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-700/60 hover:text-white"
    >
      {children}
    </button>
  )
}

/* ── Editable text block ─────────────────────────────────────────── */

function EditableBlock({
  block,
  rootPath,
  selected,
  editing,
  dimmed,
  section,
  registerRef,
  onSelect,
  onSelectSection,
  onAddSection,
  onDeleteOne,
  onEdit,
  onBlur,
  onUndo,
  onRedo,
  onKeyDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: SlideBlock
  rootPath?: string
  selected: boolean
  editing: boolean
  dimmed: boolean
  section: { title: string; count: number } | null
  registerRef: (el: HTMLDivElement | null) => void
  onSelect: (e: React.MouseEvent) => void
  onSelectSection: () => void
  onAddSection: (position: 'before' | 'after') => void
  onDeleteOne: () => void
  onEdit: () => void
  onBlur: () => void
  onUndo: () => void
  onRedo: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onDragStart: (e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent<HTMLElement>) => void
  onDrop: (e: React.DragEvent<HTMLElement>) => void
}): JSX.Element {
  return (
    <div
      className={`group relative rounded transition-all ${dimmed ? 'opacity-40' : ''}`}
      style={{
        outline: selected ? '2px solid rgba(99,102,241,0.9)' : '2px solid transparent',
        outlineOffset: 4,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onEdit()
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Drag handle */}
      <span
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart(e)
        }}
        onDragEnd={onDragEnd}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder (or Alt+↑/↓)"
        className={`absolute -left-7 top-1 cursor-grab select-none rounded px-1 py-0.5 text-sm text-gray-500 transition-opacity hover:bg-white/10 hover:text-gray-200 active:cursor-grabbing ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
        }`}
      >
        ⠿
      </span>
      {/* Section cluster: select / add before / add after (headings own sections) */}
      {section && (
        <span
          className={`absolute -left-7 top-7 flex flex-col gap-0.5 transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelectSection()
            }}
            title={`Select section: ${section.title} (${section.count} blocks)`}
            className="select-none rounded px-1 py-0.5 text-[10px] text-gray-500 hover:bg-white/10 hover:text-indigo-300"
          >
            §
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSection('before')
            }}
            title="Add section before"
            className="select-none rounded px-1 py-0.5 text-[10px] leading-none text-gray-500 hover:bg-white/10 hover:text-green-300"
          >
            +↑
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddSection('after')
            }}
            title="Add section after"
            className="select-none rounded px-1 py-0.5 text-[10px] leading-none text-gray-500 hover:bg-white/10 hover:text-green-300"
          >
            +↓
          </button>
        </span>
      )}
      {/* Per-block delete */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDeleteOne()
        }}
        title="Delete block (⌫)"
        className={`absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow transition-opacity hover:bg-red-400 ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        ✕
      </button>
      <SlideErrorBoundary>
        <div
          ref={registerRef}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault()
              if (e.shiftKey) onRedo()
              else onUndo()
              return
            }
            onKeyDown(e)
          }}
          className={editing ? 'rounded bg-white/[0.03] outline-none' : 'cursor-text'}
          title={editing ? undefined : 'Click to edit · ⌘-click to multi-select'}
          onClick={(e) => {
            if (!editing) {
              e.stopPropagation()
              onSelect(e)
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) onEdit()
            }
          }}
        >
          <SlideRenderer markdown={block.markdown} rootPath={rootPath} hidePinned />
        </div>
      </SlideErrorBoundary>
    </div>
  )
}

/* ── Locked block (code, image, table, html, break) ──────────────── */

function LockedBlock({
  block,
  rootPath,
  slideId,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onReplaceImage,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: SlideBlock
  rootPath?: string
  slideId?: string
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onDelete: () => void
  onDuplicate: () => void
  onReplaceImage?: () => void
  onDragStart: (e: React.DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent<HTMLElement>) => void
  onDrop: (e: React.DragEvent<HTMLElement>) => void
}): JSX.Element {
  if (block.kind === 'break') {
    return (
      <div
        className="group relative my-1 flex items-center gap-2"
        onClick={(e) => {
          e.stopPropagation()
          onSelect(e)
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span className="h-px flex-1 bg-indigo-400/30" />
        <span className="rounded-full border border-indigo-400/30 px-2 py-0.5 text-[10px] text-indigo-300/80">
          sub-slide break
        </span>
        <span className="h-px flex-1 bg-indigo-400/30" />
        {selected && (
          <span className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
              title="Duplicate"
              className="rounded px-1 text-[10px] text-gray-500 hover:bg-white/10 hover:text-gray-200"
            >
              ⧉
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Remove break"
              className="rounded px-1 text-[10px] text-gray-500 hover:bg-red-500/20 hover:text-red-300"
            >
              ✕
            </button>
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="group relative rounded transition-all"
      style={{
        outline: selected ? '2px solid rgba(99,102,241,0.9)' : '2px solid transparent',
        outlineOffset: 4,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(e)
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart(e)
        }}
        onDragEnd={onDragEnd}
        onClick={(e) => e.stopPropagation()}
        title="Drag to reorder"
        className={`absolute -left-7 top-1 z-10 cursor-grab select-none rounded px-1 py-0.5 text-sm text-gray-500 transition-opacity hover:bg-white/10 hover:text-gray-200 active:cursor-grabbing ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
        }`}
      >
        ⠿
      </span>
      <SlideErrorBoundary label={slideId}>
        <div className="pointer-events-none">
          <SlideRenderer markdown={block.markdown} rootPath={rootPath} hidePinned />
        </div>
      </SlideErrorBoundary>
      {/* Lock badge + actions */}
      <span
        className={`absolute right-1 top-1 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] text-gray-400 backdrop-blur transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        🔒 {BLOCK_LABEL[block.kind] ?? block.kind} · edit in Source
      </span>
      {selected ? (
        <span className="absolute -right-2 -top-2 z-10 flex items-center gap-1">
          {onReplaceImage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onReplaceImage()
              }}
              title="Replace image"
              className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-200 shadow hover:bg-gray-700 border border-white/10"
            >
              Replace
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate()
            }}
            title="Duplicate block"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] text-gray-200 shadow hover:bg-gray-700 border border-white/10"
          >
            ⧉
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title={`Delete ${block.kind} block`}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow hover:bg-red-400"
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={`Delete ${block.kind} block`}
          className="absolute -right-2 -top-2 z-10 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow hover:bg-red-400 group-hover:flex"
        >
          ✕
        </button>
      )}
    </div>
  )
}
