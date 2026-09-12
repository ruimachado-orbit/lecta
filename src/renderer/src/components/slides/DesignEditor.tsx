import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TurndownService from 'turndown'
import { SlideRenderer } from './SlideRenderer'
import { SlideErrorBoundary } from './SlideErrorBoundary'
import { PinnedLayer } from './PinnedElements'
import { parseElements, stripElements, zOf } from './element-model'
import { FormatPanel } from './FormatPanel'
import {
  splitBlocks,
  patchBlock,
  moveBlock,
  insertBlock,
  deleteBlock,
  joinBlocks,
  isEditableBlock,
  type SlideBlock,
} from './block-model'

const SLIDE_W = 1280
const SLIDE_H = 720

interface DesignEditorProps {
  markdown: string
  rootPath?: string
  layout?: string
  slideId?: string
  theme?: string
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
 * Markdown stays the single source of truth; every commit rewrites it.
 */
export function DesignEditor({ markdown, rootPath, layout, slideId, theme, onCommit }: DesignEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const editRefs = useRef(new Map<string, HTMLDivElement>())
  const dragFrom = useRef<string | null>(null)

  const blocks = useMemo(() => splitBlocks(markdown), [markdown])
  const turndown = useMemo(
    () =>
      new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        emDelimiter: '*',
        codeBlockStyle: 'fenced',
      }),
    []
  )

  // Pinned elements (images/textboxes placed on the canvas) render read-only
  // above the blocks; dragging them stays in the Preview tab for now.
  const pinned = useMemo(
    () => parseElements(stripElements(markdown)).slice().sort((a, b) => zOf(a) - zOf(b) || a.index - b.index),
    [markdown]
  )

  // Fit the 16:9 canvas into the container.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const update = () => {
      const s = Math.min(container.clientWidth / SLIDE_W, container.clientHeight / SLIDE_H)
      setScale(Math.max(0.05, s))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Drop a dangling selection when the slide changes underneath us.
  useEffect(() => {
    if (selectedKey && !blocks.some((b) => b.key === selectedKey)) setSelectedKey(null)
    if (editingKey && !blocks.some((b) => b.key === editingKey)) setEditingKey(null)
  }, [blocks, selectedKey, editingKey])

  const commit = useCallback((next: string) => onCommit(next), [onCommit])

  const focusBlock = useCallback((key: string) => {
    setSelectedKey(key)
    setEditingKey(key)
    requestAnimationFrame(() => {
      const el = editRefs.current.get(key)
      if (!el) return
      el.focus()
      // Caret to the end for a click-to-type feel.
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
      // turndown drops a lone heading marker; keep the block alive.
      if (next === '') {
        commit(deleteBlock(markdown, block.key))
        return
      }
      // Normalize list continuations turndown emits as separate lines — fine as-is.
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
      const lines = block.markdown.split('\n')
      const strip = (l: string) =>
        l.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^([-*+]|\d+[.)])\s+/, '')
      let next: string
      if (style === 'p') {
        next = lines.map(strip).join('\n')
      } else if (style === 'quote') {
        next = lines.map((l) => (l.startsWith('>') ? l : `> ${strip(l)}`)).join('\n')
      } else if (style === 'bullets') {
        next = lines.map((l) => `- ${strip(l)}`).join('\n')
      } else if (style === 'numbers') {
        next = lines.map((l, i) => `${i + 1}. ${strip(l)}`).join('\n')
      } else {
        const hashes = style === 'h1' ? '# ' : style === 'h2' ? '## ' : '### '
        const first = lines[0]
        const rest = lines.slice(1).map(strip).join('\n')
        next = `${hashes}${strip(first)}${rest ? `\n${rest}` : ''}`
      }
      commit(patchBlock(markdown, block.key, next))
    },
    [markdown, commit]
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

  const selected = blocks.find((b) => b.key === selectedKey) ?? null

  return (
    <div className="flex h-full min-h-0">
      {/* ── Canvas ── */}
      <div ref={containerRef} className="relative h-full min-w-0 flex-1 overflow-auto" onClick={() => setSelectedKey(null)}>
        <div
          className="absolute overflow-hidden"
          data-slide-theme={theme}
          style={{
            width: SLIDE_W,
            height: SLIDE_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
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
                      selected={selectedKey === block.key}
                      editing={editingKey === block.key}
                      dimmed={dragKey !== null && dragKey !== block.key}
                      registerRef={(el) => {
                        if (el) editRefs.current.set(block.key, el)
                        else editRefs.current.delete(block.key)
                      }}
                      onSelect={() => setSelectedKey(block.key)}
                      onEdit={() => focusBlock(block.key)}
                      onBlur={() => commitBlock(block)}
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
                      selected={selectedKey === block.key}
                      onSelect={() => setSelectedKey(block.key)}
                      onDelete={() => commit(deleteBlock(markdown, block.key))}
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
          {/* Read-only pinned layer (images/textboxes placed on the canvas) */}
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
            <PinnedLayer elements={pinned} rootPath={rootPath} />
          </div>
        </div>
      </div>

      {/* ── Format sidebar ── */}
      <FormatPanel
        block={selected && isEditableBlock(selected.kind) ? selected : null}
        onBold={() => exec('bold')}
        onItalic={() => exec('italic')}
        onStyle={(style) => selected && setBlockStyle(selected, style)}
        onInsert={(kind) => {
          const templates: Record<string, string> = {
            heading: '# New heading',
            text: 'New text',
            bullets: '- First point\n- Second point',
            quote: '> A notable quote',
            divider: '----',
            code: '```\ncode here\n```',
          }
          const { markdown: next, key } = insertBlock(
            markdown,
            selectedKey,
            templates[kind] ?? 'New text'
          )
          commit(next)
          if (kind !== 'divider' && kind !== 'code') setTimeout(() => focusBlock(key), 50)
        }}
      />
    </div>
  )
}

/* ── Editable text block ─────────────────────────────────────────── */

function EditableBlock({
  block,
  rootPath,
  selected,
  editing,
  dimmed,
  registerRef,
  onSelect,
  onEdit,
  onBlur,
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
  registerRef: (el: HTMLDivElement | null) => void
  onSelect: () => void
  onEdit: () => void
  onBlur: () => void
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
        onSelect()
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
      <SlideErrorBoundary>
        <div
          ref={registerRef}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={editing ? 'rounded bg-white/[0.03] outline-none' : 'cursor-text'}
          title={editing ? undefined : 'Click to edit'}
          onClick={(e) => {
            if (!editing) {
              e.stopPropagation()
              onSelect()
              onEdit()
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  block: SlideBlock
  rootPath?: string
  slideId?: string
  selected: boolean
  onSelect: () => void
  onDelete: () => void
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
          onSelect()
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
        onSelect()
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
      {/* Lock badge */}
      <span
        className={`absolute right-1 top-1 flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] text-gray-400 backdrop-blur transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        🔒 {BLOCK_LABEL[block.kind] ?? block.kind} · edit in Source
      </span>
      {selected && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title={`Delete ${block.kind} block`}
          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow hover:bg-red-400"
        >
          ✕
        </button>
      )}
    </div>
  )
}
