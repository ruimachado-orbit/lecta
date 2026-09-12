/**
 * Block model for the canvas editor.
 *
 * A slide's markdown is split into blocks (heading, paragraph, list, quote,
 * code fence, image, table, html, break) so the canvas can render and edit
 * each block independently — PowerPoint-style — while markdown stays the
 * single source of truth. Pure module: no React, no stores.
 */

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'code'
  | 'image'
  | 'table'
  | 'html'
  | 'break'

export interface SlideBlock {
  /** Stable within one parse; regenerated on every split. */
  key: string
  kind: BlockKind
  /** The exact source lines for this block. */
  markdown: string
}

/** Blocks the canvas edits in place; everything else renders locked. */
export function isEditableBlock(kind: BlockKind): boolean {
  return kind === 'heading' || kind === 'paragraph' || kind === 'list' || kind === 'quote'
}

const FENCE_RE = /^(`{3,}|~{3,})/
const BREAK_RE = /^(?:-{3,}|\*{3,}|_{3,})$/
const HEADING_RE = /^#{1,6}\s/
const TABLE_ROW_RE = /^\|.*\|\s*$/
const IMAGE_ONLY_RE = /^!\[[^\]]*\]\([^)]+\)(?:\s+"[^"]*")?$/
const HTML_OPEN_RE = /^<[a-zA-Z][^>]*$/
const LIST_RE = /^(?:[-*+]|\d+[.)])\s+/
const QUOTE_RE = /^>\s?/

const BALANCED_TAGS = new Set(['div', 'section', 'figure', 'table', 'span'])

function tagBalanceDelta(line: string): number {
  let delta = 0
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    const tag = m[1].toLowerCase()
    if (!BALANCED_TAGS.has(tag)) continue
    const full = m[0]
    if (full.endsWith('/>')) continue
    delta += full.startsWith('</') ? -1 : 1
  }
  return delta
}

function classifyParagraph(lines: string[]): BlockKind {
  // Skip leading directive comments (autofit, columns, …) for classification.
  const first = lines.find((l) => !/^<!--[^<>]*-->\s*$/.test(l.trim())) ?? lines[0]
  const text = first.trim()
  if (lines.length === 1 && BREAK_RE.test(first.trim())) return 'break'
  if (HEADING_RE.test(text)) return 'heading'
  if (QUOTE_RE.test(text)) return 'quote'
  if (LIST_RE.test(text)) return 'list'
  if (TABLE_ROW_RE.test(text)) return 'table'
  if (lines.length === 1 && IMAGE_ONLY_RE.test(text)) return 'image'
  if (text.startsWith('<')) return 'html'
  return 'paragraph'
}

/**
 * Split slide markdown into blocks. Blank lines separate blocks, except
 * inside fenced code and inside unbalanced HTML containers (columns, etc.).
 * Lone HTML comments attach to the block that follows them.
 */
export function splitBlocks(markdown: string): SlideBlock[] {
  const lines = markdown.replace(/\n+$/, '').split('\n')
  const groups: string[][] = []
  let current: string[] = []
  let inFence: string | null = null
  let htmlDepth = 0
  let pendingComments: string[] = []

  const flush = () => {
    if (current.length > 0) {
      groups.push(current)
      current = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (inFence) {
      current.push(line)
      if (trimmed.startsWith(inFence)) inFence = null
      continue
    }

    const fence = FENCE_RE.exec(trimmed)
    if (fence && current.length === 0) {
      // A fence starts a locked code block of its own.
      flush()
      current.push(line)
      inFence = fence[1]
      continue
    }

    if (trimmed === '') {
      if (htmlDepth > 0) {
        // Blank line inside an open HTML container belongs to it.
        current.push(line)
      } else {
        flush()
      }
      continue
    }

    // Pure directive comments (autofit, columns, …) attach to the next block.
    // Complete element comments (a pinned textbox on one line) stand alone.
    if (/^<!--[^<>]*-->\s*$/.test(trimmed) && current.length === 0 && htmlDepth === 0) {
      pendingComments.push(line)
      htmlDepth += tagBalanceDelta(line)
      continue
    }

    if (pendingComments.length > 0) {
      current.push(...pendingComments)
      pendingComments = []
    }
    current.push(line)
    htmlDepth += tagBalanceDelta(line)
    if (htmlDepth < 0) htmlDepth = 0
  }
  if (pendingComments.length > 0) {
    current.push(...pendingComments)
  }
  flush()

  return groups
    .map((g) => g.join('\n').trim())
    .filter((md) => md.length > 0)
    .map((md, i) => ({ key: `b${i}`, kind: classifyForGroup(md), markdown: md }))
}

function classifyForGroup(md: string): BlockKind {
  const lines = md.split('\n')
  if (lines.length >= 2 && FENCE_RE.test(lines[0].trim())) return 'code'
  return classifyParagraph(lines)
}

/** Replace one block's markdown and rejoin the slide. */
export function patchBlock(markdown: string, key: string, next: string): string {
  const blocks = splitBlocks(markdown)
  const idx = blocks.findIndex((b) => b.key === key)
  if (idx < 0) return markdown
  if (next.trim() === '') {
    blocks.splice(idx, 1)
  } else {
    blocks[idx] = { ...blocks[idx], markdown: next.trim() }
  }
  return joinBlocks(blocks.map((b) => b.markdown))
}

/** Move a block one step; returns the new markdown (or the input when stuck). */
export function moveBlock(markdown: string, key: string, dir: -1 | 1): string {
  const blocks = splitBlocks(markdown)
  const idx = blocks.findIndex((b) => b.key === key)
  const to = idx + dir
  if (idx < 0 || to < 0 || to >= blocks.length) return markdown
  const [item] = blocks.splice(idx, 1)
  blocks.splice(to, 0, item)
  return joinBlocks(blocks.map((b) => b.markdown))
}

/** Insert a new paragraph block after `key` (or at the end when key is null). */
export function insertBlock(markdown: string, key: string | null, text = ''): { markdown: string; key: string } {
  const blocks = splitBlocks(markdown)
  const entry = { key: '', kind: 'paragraph' as BlockKind, markdown: text || 'New text' }
  if (key === null) {
    blocks.push(entry)
  } else {
    const idx = blocks.findIndex((b) => b.key === key)
    blocks.splice(idx < 0 ? blocks.length : idx + 1, 0, entry)
  }
  const md = joinBlocks(blocks.map((b) => b.markdown))
  // Re-split so keys are canonical, then find the inserted block by identity.
  const again = splitBlocks(md)
  const found = again.find((b) => b.markdown === entry.markdown) ?? again[again.length - 1]
  return { markdown: md, key: found.key }
}

/** Delete a block (keeps at least one empty paragraph so the slide never vanishes). */
export function deleteBlock(markdown: string, key: string): string {
  const next = patchBlock(markdown, key, '')
  return next === '' ? 'New text' : next
}

export function joinBlocks(parts: string[]): string {
  return parts.join('\n\n')
}

/* ── Sections ────────────────────────────────────────────────────────
 * A section is a heading plus the blocks that follow it, up to the next
 * heading or sub-slide break. Lets the canvas select, move and delete whole
 * content sections at once instead of block by block. */

export interface BlockSection {
  /** Index of the heading block that opens the section. */
  start: number
  /** Index one past the last block in the section. */
  end: number
  /** Plain-text heading for labels. */
  title: string
}

function headingTitle(md: string): string {
  const first = md.split('\n').find((l) => l.trim() !== '' && !/^<!--[^<>]*-->\s*$/.test(l.trim())) ?? ''
  return first.replace(/^#{1,6}\s+/, '').replace(/[*_`]/g, '').trim()
}

/**
 * The section containing block `index`. Heading-less slides are a single
 * section; breaks always bound sections. Landing on a break selects just it.
 */
export function sectionAt(blocks: SlideBlock[], index: number): BlockSection {
  if (index < 0 || index >= blocks.length) return { start: 0, end: 0, title: '' }
  if (blocks[index].kind === 'break') {
    return { start: index, end: index + 1, title: 'Break' }
  }
  let start = 0
  for (let i = index; i >= 0; i--) {
    if (blocks[i].kind === 'break') {
      start = i + 1
      break
    }
    if (blocks[i].kind === 'heading') {
      start = i
      break
    }
  }
  let end = blocks.length
  for (let i = index + 1; i < blocks.length; i++) {
    if (blocks[i].kind === 'heading' || blocks[i].kind === 'break') {
      end = i
      break
    }
  }
  const opener = blocks[start]?.kind === 'heading' ? blocks[start] : undefined
  const title = opener ? headingTitle(opener.markdown) : `Blocks ${start + 1}–${end}`
  return { start, end, title: title || `Blocks ${start + 1}–${end}` }
}

/** Delete every block in [start, end). */
export function deleteRange(markdown: string, start: number, end: number): string {
  const parts = splitBlocks(markdown).map((b) => b.markdown)
  parts.splice(start, end - start)
  return parts.length === 0 ? 'New text' : joinBlocks(parts)
}

/**
 * Insert a new section (heading + starter paragraph) before or after the
 * section containing `key`. Returns the updated markdown and the new
 * heading's key so the caller can focus it.
 */
export function insertSection(
  markdown: string,
  key: string,
  position: 'before' | 'after',
  title = 'New section'
): { markdown: string; key: string } {
  const parts = splitBlocks(markdown)
  const idx = parts.findIndex((b) => b.key === key)
  const at = idx < 0 ? (position === 'before' ? 0 : parts.length) : (() => {
    const { start, end } = sectionAt(parts, idx)
    return position === 'before' ? start : end
  })()
  const md = parts.map((b) => b.markdown)
  md.splice(at, 0, `# ${title}`, 'New text')
  const next = joinBlocks(md)
  // Re-split so keys are canonical, then locate the inserted heading.
  const again = splitBlocks(next)
  const found = again.find((b) => b.markdown === `# ${title}`) ?? again[Math.min(at, again.length - 1)]
  return { markdown: next, key: found.key }
}

/* ── Alignment directives ────────────────────────────────────────────
 * A leading `<!-- align:center -->` (or left/right) aligns a block.
 * The comment rides along inside block markdown, so blocks stay editable;
 * renderers expand it with applyAlignDirectives. */

export type BlockAlign = 'left' | 'center' | 'right'

const ALIGN_RE = /^<!--\s*align:(left|center|right)\s*-->\s*\n?/

/** Alignment declared by a block's leading directive, if any. */
export function getBlockAlign(blockMd: string): BlockAlign | null {
  const m = ALIGN_RE.exec(blockMd)
  return m ? (m[1] as BlockAlign) : null
}

/** Set (or clear, with null) a block's alignment directive. */
export function setBlockAlign(blockMd: string, align: BlockAlign | null): string {
  const stripped = blockMd.replace(ALIGN_RE, '')
  return align ? `<!-- align:${align} -->\n${stripped}` : stripped
}

/** Leading directive comments (align, autofit, …) preserved across edits. */
export function leadingDirectives(blockMd: string): string[] {
  const out: string[] = []
  for (const line of blockMd.split('\n')) {
    if (/^<!--[^<>]*-->\s*$/.test(line.trim())) out.push(line)
    else break
  }
  return out
}

/**
 * Expand align directives for rendering: wrap each aligned block in a
 * text-align div. Operates per block so pins, breaks and fences pass through.
 */
export function applyAlignDirectives(markdown: string): string {
  return joinBlocks(
    splitBlocks(markdown).map((b) => {
      const align = getBlockAlign(b.markdown)
      if (!align || b.kind === 'break') return b.markdown
      return `<div style="text-align:${align}">\n\n${b.markdown}\n\n</div>`
    })
  )
}

/* ── HTML → markdown converter ───────────────────────────────────────
 * Shared by the canvas editor: converts edited block HTML back to markdown,
 * preserving the styling the editor produces (execCommand colors, spans)
 * that stock turndown would silently drop. */

import TurndownService from 'turndown'

export function createMarkdownConverter(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    codeBlockStyle: 'fenced',
  })
  // execCommand('foreColor') emits <font color="…"> — keep it as a span.
  td.addRule('fontColor', {
    filter: (node) => node.nodeName === 'FONT' && !!(node as unknown as HTMLElement).getAttribute?.('color'),
    replacement: (content, node) => {
      const color = (node as unknown as HTMLElement).getAttribute('color')
      return content.trim() === '' ? '' : `<span style="color:${color}">${content}</span>`
    },
  })
  // Preserve explicitly styled spans (text color, highlight) verbatim.
  td.addRule('styledSpan', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = (node as unknown as HTMLElement).getAttribute?.('style') ?? ''
      return /color|background/.test(style)
    },
    replacement: (content, node) => {
      if (content.trim() === '') return ''
      const style = (node as unknown as HTMLElement).getAttribute('style')
      return `<span style="${style}">${content}</span>`
    },
  })
  return td
}
