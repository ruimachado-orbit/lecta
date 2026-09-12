/**
 * PPTX export — renders a Lecta deck to an editable PowerPoint file with
 * pptxgenjs. Runs entirely in the main process: no network, no binaries.
 *
 * Fidelity goals (in order): every slide and sub-slide present, text and
 * structure editable, theme colours and type applied, code blocks kept as
 * monospace boxes, images embedded, speaker notes attached, pinned elements
 * (textbox / image / shape comments) placed at their canvas positions.
 *
 * The slide canvas in the editor is 1280 x 720 px; the PowerPoint layout is
 * 10 x 5.625 in, so 1 px = 1/128 in.
 */
import PptxGenJS from 'pptxgenjs'
import { readFile } from 'fs/promises'
import { extname, isAbsolute } from 'path'
import { resolveInsideDeck } from './deck-roots'

// ── Public types ─────────────────────────────────────────────────────────

export interface PptxSlideInput {
  id: string
  layout?: string
  markdownContent: string
  codeContent?: string | null
  codeLanguage?: string | null
  codeFile?: string | null
  notesContent?: string | null
  isMdx?: boolean
  skip?: boolean
}

export interface PptxDeckInput {
  title: string
  author?: string
  theme?: string
  rootPath: string
  slides: PptxSlideInput[]
}

export interface PptxExportResult {
  buffer: Buffer
  slideCount: number
  warnings: string[]
}

// ── Theme palette (mirrors src/renderer/src/styles/themes/*.css) ─────────

interface Palette {
  bg: string
  h1: string
  h2: string
  body: string
  muted: string
  accent: string
  preBg: string
  code: string
  headingFont: string
  bodyFont: string
  monoFont: string
  dark: boolean
}

const MONO = 'Consolas'

const PALETTES: Record<string, Palette> = {
  dark: { bg: '08081a', h1: 'eeeeff', h2: 'd8d8f0', body: 'a8a8c8', muted: '7878a0', accent: '6366f1', preBg: '04040e', code: 'c7d2fe', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: true },
  light: { bg: 'ffffff', h1: '111827', h2: '1f2937', body: '4b5563', muted: '6b7280', accent: '4f46e5', preBg: 'f9fafb', code: '312e81', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: false },
  executive: { bg: '07070a', h1: 'f5f5f0', h2: 'e0e0d8', body: '95958d', muted: '686862', accent: 'c4a035', preBg: '040408', code: 'dab84a', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: true },
  minimal: { bg: 'ffffff', h1: '000000', h2: '171717', body: '404040', muted: '737373', accent: '171717', preBg: 'fafafa', code: '171717', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: false },
  corporate: { bg: 'ffffff', h1: '0c1a3a', h2: '1e293b', body: '334155', muted: '64748b', accent: '1d4ed8', preBg: 'f8fafc', code: '1e3a8a', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: false },
  creative: { bg: '0a0a14', h1: 'ffffff', h2: 'e4e4f4', body: 'b8b8d4', muted: '808098', accent: '8b5cf6', preBg: '060610', code: 'c4b5fd', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: true },
  'keynote-dark': { bg: '000000', h1: 'ffffff', h2: 'e5e5e5', body: '909090', muted: '606060', accent: '00d4ff', preBg: '050505', code: '40e8ff', headingFont: 'Calibri', bodyFont: 'Calibri', monoFont: MONO, dark: true },
  paper: { bg: 'faf7f0', h1: '1c110a', h2: '2e1f14', body: '3d2c1e', muted: '6a5545', accent: '8a3a10', preBg: 'f0ebe2', code: '4a3525', headingFont: 'Georgia', bodyFont: 'Georgia', monoFont: 'Courier New', dark: false }
}

export function paletteFor(theme: string | undefined): Palette {
  return PALETTES[theme || 'dark'] || PALETTES.dark
}

// ── Geometry ─────────────────────────────────────────────────────────────

const SLIDE_W_IN = 10
const SLIDE_H_IN = 5.625
const PX_PER_IN = 128
const MARGIN = 0.5
const CONTENT_W = SLIDE_W_IN - MARGIN * 2
const px = (v: number): number => v / PX_PER_IN

// ── Inline markdown → pptxgenjs text runs ────────────────────────────────

type Run = PptxGenJS.TextProps

interface InlineStyle {
  color: string
  fontFace: string
  fontSize: number
  monoFace: string
  codeColor: string
  accent: string
}

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|~~[^~]+~~|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))/g

export function inlineRuns(text: string, style: InlineStyle, extra: Partial<Run['options']> = {}): Run[] {
  const runs: Run[] = []
  const base = { color: style.color, fontFace: style.fontFace, fontSize: style.fontSize, ...extra }
  let last = 0
  const cleaned = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  for (const m of cleaned.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0
    if (idx > last) runs.push({ text: cleaned.slice(last, idx), options: { ...base } })
    const tok = m[0]
    if (tok.startsWith('**') || tok.startsWith('__')) {
      runs.push({ text: tok.slice(2, -2), options: { ...base, bold: true } })
    } else if (tok.startsWith('`')) {
      runs.push({ text: tok.slice(1, -1), options: { ...base, fontFace: style.monoFace, color: style.codeColor } })
    } else if (tok.startsWith('~~')) {
      runs.push({ text: tok.slice(2, -2), options: { ...base, strike: 'sngStrike' } })
    } else if (tok.startsWith('![')) {
      const alt = /!\[([^\]]*)\]/.exec(tok)?.[1] || 'image'
      runs.push({ text: `[${alt}]`, options: { ...base, italic: true, color: style.accent } })
    } else if (tok.startsWith('[')) {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)
      if (mm) runs.push({ text: mm[1], options: { ...base, color: style.accent, underline: { style: 'sng' }, hyperlink: /^https?:/.test(mm[2]) ? { url: mm[2] } : undefined } })
    } else {
      runs.push({ text: tok.slice(1, -1), options: { ...base, italic: true } })
    }
    last = idx + tok.length
  }
  if (last < cleaned.length) runs.push({ text: cleaned.slice(last), options: { ...base } })
  if (runs.length === 0) runs.push({ text: '', options: { ...base } })
  return runs
}

// ── Block parser ─────────────────────────────────────────────────────────

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: { text: string; depth: number }[] }
  | { type: 'code'; lang: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'table'; rows: string[][]; header: boolean }
  | { type: 'image'; src: string; alt: string }
  | { type: 'hr' }
  | { type: 'col-break' }

type HeadingBlock = Extract<Block, { type: 'heading' }>

export interface PinnedText { x: number; y: number; w: number; text: string; fontSize?: number; color?: string; bold?: boolean; italic?: boolean }
export interface PinnedImage { x: number; y: number; w: number; src: string; radius?: number; border?: string }
export interface PinnedShape { type: string; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; strokeWidth?: number }

export interface ParsedSlide {
  blocks: Block[]
  textboxes: PinnedText[]
  images: PinnedImage[]
  shapes: PinnedShape[]
}

const TEXTBOX_RE = /<!--\s*textbox\s+x=(\d+)\s+y=(\d+)(?:\s+w=(\d+))?(?:\s+fs=(\d+))?(?:\s+fc=([^\s]+))?(?:\s+fb=([01]))?(?:\s+fi=([01]))?\s*-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi
const IMAGE_RE = /<!--\s*image\s+([^>]*?)-->/gi
const SHAPE_RE = /<!--\s*shape\s+([^>]*?)-->/gi

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/(\w+)=(\S+)/g)) out[m[1]] = m[2]
  return out
}

export function parseSlideMarkdown(md: string): ParsedSlide {
  const textboxes: PinnedText[] = []
  const images: PinnedImage[] = []
  const shapes: PinnedShape[] = []

  let src = md.replace(/\r\n/g, '\n')
  src = src.replace(TEXTBOX_RE, (_m, x, y, w, fs, fc, fb, fi, content) => {
    textboxes.push({ x: +x, y: +y, w: w ? +w : 320, text: String(content).trim(), fontSize: fs ? +fs : undefined, color: fc ? String(fc).replace('#', '') : undefined, bold: fb === '1', italic: fi === '1' })
    return ''
  })
  src = src.replace(IMAGE_RE, (_m, attrs) => {
    const a = parseAttrs(attrs)
    if (a.src) images.push({ x: +(a.x || 0), y: +(a.y || 0), w: +(a.w || 400), src: a.src, radius: a.radius ? +a.radius : undefined, border: a.border?.replace(/_/g, ' ') })
    return ''
  })
  src = src.replace(SHAPE_RE, (_m, attrs) => {
    const a = parseAttrs(attrs)
    shapes.push({ type: a.type || 'rect', x: +(a.x || 0), y: +(a.y || 0), w: +(a.w || 200), h: +(a.h || 120), fill: a.fill, stroke: a.stroke, strokeWidth: a.sw ? +a.sw : undefined })
    return ''
  })
  // Column markers become col-break blocks; every other HTML comment is dropped.
  src = src.replace(/<!--\s*columns\s*-->/gi, '\n').replace(/<!--\s*\/columns\s*-->/gi, '\n').replace(/<!--\s*col\s*-->/gi, '\n@@COL@@\n')
  src = src.replace(/<!--[\s\S]*?-->/g, '')

  const lines = src.split('\n')
  const blocks: Block[] = []
  let i = 0
  const flushPara = (buf: string[]): void => {
    const text = buf.join(' ').trim()
    if (text) blocks.push({ type: 'paragraph', text })
  }
  let para: string[] = []
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()
    if (t === '@@COL@@') { flushPara(para); para = []; blocks.push({ type: 'col-break' }); i++; continue }
    if (t.startsWith('```')) {
      flushPara(para); para = []
      const lang = t.slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++ }
      i++
      blocks.push({ type: 'code', lang, code: buf.join('\n') })
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) { flushPara(para); para = []; blocks.push({ type: 'heading', level: h[1].length, text: h[2].replace(/\s#+$/, '') }); i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(para); para = []; blocks.push({ type: 'hr' }); i++; continue }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(t)
    if (img) { flushPara(para); para = []; blocks.push({ type: 'image', alt: img[1], src: img[2] }); i++; continue }
    if (t.startsWith('>')) {
      flushPara(para); para = []
      const buf: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      blocks.push({ type: 'quote', text: buf.join(' ').trim() })
      continue
    }
    if (t.startsWith('|')) {
      flushPara(para); para = []
      const rows: string[][] = []
      let header = false
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim()
        if (/^\|?\s*:?-{2,}/.test(row.replace(/\|/g, '').trim()) || /^\|[\s:|-]+\|$/.test(row)) { header = rows.length === 1; i++; continue }
        rows.push(row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
        i++
      }
      if (rows.length) blocks.push({ type: 'table', rows, header })
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara(para); para = []
      const ordered = /\d/.test(li[2])
      const items: { text: string; depth: number }[] = []
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!m) {
          // continuation line of the previous item
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue }
          break
        }
        items.push({ text: m[3].replace(/^\[[ xX]\]\s*/, (c) => (c.includes('x') || c.includes('X') ? '☑ ' : '☐ ')), depth: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)) })
        i++
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }
    if (!t) { flushPara(para); para = []; i++; continue }
    para.push(t)
    i++
  }
  flushPara(para)
  return { blocks, textboxes, images, shapes }
}

/** Split a slide into sub-slides on `----` lines (incremental reveal steps). */
export function splitSubSlides(md: string): string[] {
  const parts = md.replace(/\r\n/g, '\n').split(/^----\s*$/m).map((s) => s.trim())
  const nonEmpty = parts.filter((p) => p.length > 0)
  if (nonEmpty.length <= 1) return [md]
  // Each step shows the cumulative content, like the app does.
  const out: string[] = []
  let acc = ''
  for (const p of nonEmpty) { acc = acc ? `${acc}\n\n${p}` : p; out.push(acc) }
  return out
}

/** Strip markdown for speaker notes (keep line structure). */
export function notesToPlain(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

// ── Rendering ────────────────────────────────────────────────────────────

interface Ctx {
  pres: PptxGenJS
  pal: Palette
  rootPath: string
  warnings: string[]
  slideNo: number
}

interface Region { x: number; y: number; w: number; h: number }

function textStyle(pal: Palette, size: number, color = pal.body): InlineStyle {
  return { color, fontFace: pal.bodyFont, fontSize: size, monoFace: pal.monoFont, codeColor: pal.code, accent: pal.accent }
}

function estimateChars(blocks: Block[]): number {
  return blocks.reduce((n, b) => {
    if (b.type === 'paragraph' || b.type === 'quote' || b.type === 'heading') return n + b.text.length
    if (b.type === 'list') return n + b.items.reduce((m, it) => m + it.text.length + 20, 0)
    if (b.type === 'code') return n + b.code.length
    if (b.type === 'table') return n + b.rows.flat().join('').length
    return n
  }, 0)
}

function bodySizeFor(blocks: Block[], region: Region): number {
  const chars = estimateChars(blocks)
  const area = region.w * region.h
  const density = chars / Math.max(area, 1)
  if (density > 140) return 11
  if (density > 100) return 12
  if (density > 70) return 14
  if (density > 45) return 16
  return 18
}

async function resolveImage(ctx: Ctx, src: string): Promise<{ path?: string; data?: string } | null> {
  try {
    if (src.startsWith('data:')) return { data: src }
    if (/^https?:\/\//i.test(src)) { ctx.warnings.push(`Remote image skipped: ${src}`); return null }
    let rel = src
    if (rel.startsWith('lecta-file://')) rel = decodeURIComponent(rel.replace('lecta-file://', ''))
    const abs = isAbsolute(rel) ? resolveInsideDeck(ctx.rootPath, rel.slice(ctx.rootPath.length).replace(/^[\\/]+/, '')) : resolveInsideDeck(ctx.rootPath, rel)
    const ext = extname(abs).toLowerCase()
    if (ext === '.svg') {
      const svg = await readFile(abs, 'utf-8')
      return { data: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
    }
    await readFile(abs) // existence check
    return { path: abs }
  } catch (err) {
    ctx.warnings.push(`Image not exported (${src}): ${(err as Error).message}`)
    return null
  }
}

/** Render a list of blocks into a region as flowing text plus separate code/table/image boxes. */
async function renderBlocks(ctx: Ctx, slide: PptxGenJS.Slide, blocks: Block[], region: Region, opts: { align?: 'left' | 'center'; skipFirstHeading?: boolean } = {}): Promise<void> {
  const { pal } = ctx
  const bodySize = bodySizeFor(blocks, region)
  let y = region.y
  const remaining = (): number => Math.max(0.3, region.y + region.h - y)
  let textRuns: Run[] = []
  let textLines = 0

  const flushText = (): void => {
    if (!textRuns.length) return
    const h = Math.min(remaining(), Math.max(0.4, textLines * (bodySize / 72) * 1.45 + 0.15))
    slide.addText(textRuns, { x: region.x, y, w: region.w, h, valign: 'top', align: opts.align || 'left', margin: 2, fontFace: pal.bodyFont, color: pal.body, paraSpaceAfter: bodySize * 0.35 })
    y += h
    textRuns = []
    textLines = 0
  }
  const pushPara = (runs: Run[], approxChars: number): void => {
    if (textRuns.length) textRuns[textRuns.length - 1] = { ...textRuns[textRuns.length - 1], options: { ...textRuns[textRuns.length - 1].options, breakLine: true } }
    textRuns.push(...runs)
    const charsPerLine = Math.max(20, (region.w * 72) / (bodySize * 0.5))
    textLines += Math.max(1, Math.ceil(approxChars / charsPerLine))
  }

  let firstHeadingSkipped = !opts.skipFirstHeading
  for (const b of blocks) {
    if (b.type === 'col-break' || b.type === 'hr') continue
    if (b.type === 'heading') {
      if (!firstHeadingSkipped) { firstHeadingSkipped = true; continue }
      const size = b.level === 1 ? bodySize + 12 : b.level === 2 ? bodySize + 6 : bodySize + 2
      const color = b.level === 1 ? pal.h1 : pal.h2
      pushPara(inlineRuns(b.text, { ...textStyle(pal, size, color), fontFace: pal.headingFont }, { bold: true, paraSpaceBefore: 6 }), b.text.length * (size / bodySize))
      continue
    }
    if (b.type === 'paragraph') { pushPara(inlineRuns(b.text, textStyle(pal, bodySize)), b.text.length); continue }
    if (b.type === 'quote') { pushPara(inlineRuns(b.text, textStyle(pal, bodySize, pal.muted), { italic: true, indentLevel: 1 }), b.text.length); continue }
    if (b.type === 'list') {
      for (const it of b.items) {
        pushPara(inlineRuns(it.text, textStyle(pal, bodySize), { bullet: b.ordered ? { type: 'number' } : { code: '2022' }, indentLevel: it.depth }), it.text.length + 10)
      }
      continue
    }
    if (b.type === 'code') {
      flushText()
      const lines = b.code.split('\n')
      const codeSize = lines.length > 24 ? 8 : lines.length > 16 ? 9 : lines.length > 10 ? 10 : 11
      const h = Math.min(remaining(), lines.length * (codeSize / 72) * 1.3 + 0.25)
      slide.addText(b.code || ' ', { x: region.x, y, w: region.w, h, fontFace: pal.monoFont, fontSize: codeSize, color: pal.code, fill: { color: pal.preBg }, valign: 'top', align: 'left', margin: 6, line: { color: pal.accent, width: 0.5, transparency: 70 } })
      y += h + 0.1
      continue
    }
    if (b.type === 'table') {
      flushText()
      const cols = Math.max(...b.rows.map((r) => r.length))
      const rows = b.rows.map((r, ri) => Array.from({ length: cols }, (_, ci) => ({
        text: r[ci] ?? '',
        options: { bold: b.header && ri === 0, color: b.header && ri === 0 ? pal.h2 : pal.body, fontSize: Math.max(9, bodySize - 4), fontFace: pal.bodyFont, fill: { color: b.header && ri === 0 ? pal.preBg : pal.bg } }
      })))
      const h = Math.min(remaining(), b.rows.length * 0.32 + 0.1)
      slide.addTable(rows as PptxGenJS.TableRow[], { x: region.x, y, w: region.w, h, border: { type: 'solid', color: pal.muted, pt: 0.5 }, autoPage: false })
      y += h + 0.1
      continue
    }
    if (b.type === 'image') {
      flushText()
      const img = await resolveImage(ctx, b.src)
      const h = Math.min(remaining(), region.w * 0.5625)
      if (img) {
        slide.addImage({ ...img, x: region.x, y, w: region.w, h, sizing: { type: 'contain', w: region.w, h } })
      } else {
        slide.addText(`[image: ${b.alt || b.src}]`, { x: region.x, y, w: region.w, h: 0.4, fontSize: bodySize - 2, italic: true, color: pal.muted })
      }
      y += (img ? h : 0.4) + 0.1
      continue
    }
  }
  flushText()
}

function addTitle(ctx: Ctx, slide: PptxGenJS.Slide, text: string, region: Region, o: { size: number; align?: 'left' | 'center'; color?: string; valign?: 'top' | 'middle' }): void {
  const { pal } = ctx
  slide.addText(inlineRuns(text, { ...textStyle(pal, o.size, o.color || pal.h1), fontFace: pal.headingFont }, { bold: true }), { x: region.x, y: region.y, w: region.w, h: region.h, align: o.align || 'left', valign: o.valign || 'top', margin: 2, fit: 'shrink' })
}

function splitColumns(blocks: Block[], n: number): { head: HeadingBlock | null; cols: Block[][] } {
  let head: HeadingBlock | null = null
  let rest = blocks
  const first = blocks[0]
  if (first && first.type === 'heading' && first.level <= 2) { head = first; rest = blocks.slice(1) }
  const hasMarkers = rest.some((b) => b.type === 'col-break')
  const cols: Block[][] = Array.from({ length: n }, () => [])
  if (hasMarkers) {
    let c = 0
    for (const b of rest) { if (b.type === 'col-break') { c = Math.min(n - 1, c + 1); continue } cols[c].push(b) }
  } else {
    const per = Math.ceil(rest.length / n)
    rest.forEach((b, idx) => cols[Math.min(n - 1, Math.floor(idx / Math.max(per, 1)))].push(b))
  }
  return { head, cols }
}

async function renderPinned(ctx: Ctx, slide: PptxGenJS.Slide, parsed: ParsedSlide): Promise<void> {
  const { pal } = ctx
  for (const s of parsed.shapes) {
    const shapeType = s.type === 'ellipse' || s.type === 'circle' ? ctx.pres.ShapeType.ellipse : s.type === 'line' ? ctx.pres.ShapeType.line : ctx.pres.ShapeType.rect
    slide.addShape(shapeType, { x: px(s.x), y: px(s.y), w: px(s.w), h: px(s.h), fill: s.fill && s.fill !== 'none' ? { color: s.fill.replace('#', '') } : { type: 'none' }, line: s.stroke && s.stroke !== 'none' ? { color: s.stroke.replace('#', ''), width: s.strokeWidth || 1 } : undefined })
  }
  for (const im of parsed.images) {
    const img = await resolveImage(ctx, im.src)
    if (!img) continue
    const opts: PptxGenJS.ImageProps = { ...img, x: px(im.x), y: px(im.y), w: px(im.w), h: px(im.w) * 0.66 }
    if (im.radius) opts.rounding = true
    slide.addImage(opts)
  }
  for (const tb of parsed.textboxes) {
    const size = tb.fontSize ? Math.round(tb.fontSize * 0.75) : 16
    slide.addText(inlineRuns(tb.text, textStyle(pal, size, tb.color || pal.body), { bold: tb.bold, italic: tb.italic }), { x: px(tb.x), y: px(tb.y), w: px(tb.w), h: Math.max(0.35, (tb.text.split('\n').length * size) / 72 * 1.5), valign: 'top', margin: 2 })
  }
}

async function renderSlide(ctx: Ctx, input: PptxSlideInput, md: string): Promise<void> {
  const { pres, pal } = ctx
  const slide = pres.addSlide()
  ctx.slideNo++
  slide.background = { color: pal.bg }
  const parsed = parseSlideMarkdown(md)
  const layout = input.layout || 'default'
  const blocks = parsed.blocks
  const firstHeading = blocks.find((b) => b.type === 'heading') as Extract<Block, { type: 'heading' }> | undefined
  const hasCode = !!(input.codeContent && input.codeContent.trim())

  const full: Region = { x: MARGIN, y: MARGIN, w: CONTENT_W, h: SLIDE_H_IN - MARGIN * 2 }
  const titleH = 0.9
  const bodyRegion: Region = { x: MARGIN, y: MARGIN + titleH + 0.1, w: CONTENT_W, h: SLIDE_H_IN - MARGIN * 2 - titleH - 0.1 }
  const bodyBlocks = firstHeading ? blocks.filter((b) => b !== firstHeading) : blocks

  const codeBox = async (region: Region): Promise<void> => {
    if (!hasCode) return
    const code = input.codeContent || ''
    const lines = code.split('\n')
    const size = lines.length > 28 ? 7 : lines.length > 20 ? 8 : lines.length > 14 ? 9 : 10
    const label = input.codeFile ? `${input.codeFile}${input.codeLanguage ? ` · ${input.codeLanguage}` : ''}` : input.codeLanguage || 'code'
    slide.addText(label, { x: region.x, y: region.y, w: region.w, h: 0.28, fontSize: 9, color: pal.muted, fontFace: pal.monoFont, margin: 2 })
    slide.addText(code, { x: region.x, y: region.y + 0.3, w: region.w, h: region.h - 0.3, fontFace: pal.monoFont, fontSize: size, color: pal.code, fill: { color: pal.preBg }, valign: 'top', align: 'left', margin: 6, line: { color: pal.accent, width: 0.5, transparency: 70 } })
  }

  switch (layout) {
    case 'title': {
      if (firstHeading) addTitle(ctx, slide, firstHeading.text, { x: MARGIN, y: 1.4, w: CONTENT_W, h: 1.4 }, { size: 40, align: 'center', valign: 'middle' })
      await renderBlocks(ctx, slide, bodyBlocks, { x: MARGIN + 0.5, y: 2.9, w: CONTENT_W - 1, h: 2 }, { align: 'center' })
      slide.addShape(pres.ShapeType.rect, { x: SLIDE_W_IN / 2 - 0.4, y: 2.75, w: 0.8, h: 0.04, fill: { color: pal.accent }, line: { type: 'none' } })
      break
    }
    case 'section': {
      slide.addShape(pres.ShapeType.rect, { x: MARGIN, y: 2.0, w: 0.08, h: 1.6, fill: { color: pal.accent }, line: { type: 'none' } })
      if (firstHeading) addTitle(ctx, slide, firstHeading.text, { x: MARGIN + 0.3, y: 1.9, w: CONTENT_W - 0.3, h: 1.1 }, { size: 36, valign: 'middle' })
      await renderBlocks(ctx, slide, bodyBlocks, { x: MARGIN + 0.3, y: 3.05, w: CONTENT_W - 0.3, h: 1.6 })
      break
    }
    case 'center': {
      if (firstHeading) addTitle(ctx, slide, firstHeading.text, { x: MARGIN, y: 0.9, w: CONTENT_W, h: 1.0 }, { size: 32, align: 'center', valign: 'middle' })
      await renderBlocks(ctx, slide, bodyBlocks, { x: MARGIN + 0.5, y: firstHeading ? 2.0 : 1.2, w: CONTENT_W - 1, h: firstHeading ? 2.8 : 3.4 }, { align: 'center' })
      break
    }
    case 'quote': {
      const q = blocks.find((b) => b.type === 'quote') as Extract<Block, { type: 'quote' }> | undefined
      const text = q?.text || firstHeading?.text || bodyBlocks.map((b) => (b.type === 'paragraph' ? b.text : '')).join(' ')
      slide.addText('“', { x: MARGIN, y: 0.8, w: 1, h: 1, fontSize: 72, color: pal.accent, fontFace: pal.headingFont })
      slide.addText(inlineRuns(text, { ...textStyle(pal, 26, pal.h1), fontFace: pal.headingFont }, { italic: true }), { x: MARGIN + 0.6, y: 1.4, w: CONTENT_W - 1.2, h: 2.4, valign: 'middle', align: 'center', fit: 'shrink' })
      const attribution = bodyBlocks.filter((b) => b !== q && b.type === 'paragraph').map((b) => (b as Extract<Block, { type: 'paragraph' }>).text).join(' · ')
      if (attribution) slide.addText(inlineRuns(attribution, textStyle(pal, 14, pal.muted)), { x: MARGIN, y: 3.9, w: CONTENT_W, h: 0.5, align: 'center' })
      break
    }
    case 'big-number': {
      if (firstHeading) slide.addText(firstHeading.text, { x: MARGIN, y: 0.9, w: CONTENT_W, h: 2.0, fontSize: 88, bold: true, color: pal.accent, fontFace: pal.headingFont, align: 'center', valign: 'middle', fit: 'shrink' })
      await renderBlocks(ctx, slide, bodyBlocks, { x: MARGIN + 0.5, y: 3.0, w: CONTENT_W - 1, h: 2.0 }, { align: 'center' })
      break
    }
    case 'two-col':
    case 'two-col-wide-left':
    case 'two-col-wide-right':
    case 'three-col': {
      const n = layout === 'three-col' ? 3 : 2
      const { head, cols } = splitColumns(blocks, n)
      let top = MARGIN
      if (head) { addTitle(ctx, slide, head.text, { x: MARGIN, y: MARGIN, w: CONTENT_W, h: titleH }, { size: 30 }); top = MARGIN + titleH + 0.1 }
      const gap = 0.3
      const widths = layout === 'two-col-wide-left' ? [0.6, 0.4] : layout === 'two-col-wide-right' ? [0.4, 0.6] : Array.from({ length: n }, () => 1 / n)
      let x = MARGIN
      const availW = CONTENT_W - gap * (n - 1)
      for (let c = 0; c < n; c++) {
        const w = availW * widths[c]
        await renderBlocks(ctx, slide, cols[c], { x, y: top, w, h: SLIDE_H_IN - top - MARGIN })
        x += w + gap
      }
      break
    }
    case 'top-bottom': {
      const { head, cols } = splitColumns(blocks, 2)
      let top = MARGIN
      if (head) { addTitle(ctx, slide, head.text, { x: MARGIN, y: MARGIN, w: CONTENT_W, h: titleH }, { size: 30 }); top = MARGIN + titleH + 0.1 }
      const h = (SLIDE_H_IN - top - MARGIN - 0.2) / 2
      await renderBlocks(ctx, slide, cols[0], { x: MARGIN, y: top, w: CONTENT_W, h })
      await renderBlocks(ctx, slide, cols[1], { x: MARGIN, y: top + h + 0.2, w: CONTENT_W, h })
      break
    }
    case 'blank': {
      await renderBlocks(ctx, slide, blocks, { x: 0.25, y: 0.25, w: SLIDE_W_IN - 0.5, h: SLIDE_H_IN - 0.5 })
      break
    }
    default: {
      if (firstHeading) addTitle(ctx, slide, firstHeading.text, { x: MARGIN, y: MARGIN, w: CONTENT_W, h: titleH }, { size: 30 })
      const region = firstHeading ? bodyRegion : full
      if (hasCode) {
        const textW = region.w * 0.52
        await renderBlocks(ctx, slide, bodyBlocks, { ...region, w: textW })
        await codeBox({ x: region.x + textW + 0.25, y: region.y, w: region.w - textW - 0.25, h: region.h })
      } else {
        await renderBlocks(ctx, slide, bodyBlocks, region)
      }
    }
  }

  if (hasCode && layout !== 'default') {
    // Layouts with their own composition get the code on a follow-up slide so nothing overlaps.
    const codeSlide = pres.addSlide()
    ctx.slideNo++
    codeSlide.background = { color: pal.bg }
    const label = firstHeading?.text ? `${firstHeading.text} — code` : 'Code'
    codeSlide.addText(label, { x: MARGIN, y: MARGIN, w: CONTENT_W, h: 0.6, fontSize: 22, bold: true, color: pal.h1, fontFace: pal.headingFont })
    const subCtx: Ctx = ctx
    const region: Region = { x: MARGIN, y: MARGIN + 0.7, w: CONTENT_W, h: SLIDE_H_IN - MARGIN * 2 - 0.7 }
    const code = input.codeContent || ''
    const lines = code.split('\n')
    const size = lines.length > 34 ? 7 : lines.length > 24 ? 8 : lines.length > 16 ? 9 : 11
    codeSlide.addText(code, { x: region.x, y: region.y, w: region.w, h: region.h, fontFace: subCtx.pal.monoFont, fontSize: size, color: pal.code, fill: { color: pal.preBg }, valign: 'top', margin: 6 })
    if (input.notesContent) codeSlide.addNotes(notesToPlain(input.notesContent))
  }

  await renderPinned(ctx, slide, parsed)

  // Footer: deck title + slide number, like the in-app renderer.
  slide.addText(`${ctx.pres.title || ''}`, { x: MARGIN, y: SLIDE_H_IN - 0.4, w: 5, h: 0.3, fontSize: 9, color: pal.muted, fontFace: pal.bodyFont, margin: 0 })
  slide.addText(String(ctx.slideNo), { x: SLIDE_W_IN - MARGIN - 1, y: SLIDE_H_IN - 0.4, w: 1, h: 0.3, fontSize: 9, color: pal.muted, align: 'right', margin: 0 })

  if (input.notesContent) slide.addNotes(notesToPlain(input.notesContent))
}

// ── Entry point ──────────────────────────────────────────────────────────

export async function buildPptx(deck: PptxDeckInput): Promise<PptxExportResult> {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.title = deck.title
  if (deck.author) pres.author = deck.author
  pres.company = 'Lecta'
  const pal = paletteFor(deck.theme)
  const ctx: Ctx = { pres, pal, rootPath: deck.rootPath, warnings: [], slideNo: 0 }

  let count = 0
  for (const s of deck.slides) {
    if (s.skip) continue
    let md = s.markdownContent || ''
    if (s.isMdx) {
      // MDX is not executed on export; keep its markdown-compatible text.
      md = md.replace(/^(import|export)\s.*$/gm, '').replace(/<[A-Z][^>]*\/>/g, '').replace(/\{[^}]*\}/g, '')
      ctx.warnings.push(`Slide "${s.id}" is MDX; only its plain text was exported.`)
    }
    const steps = splitSubSlides(md)
    for (const step of steps) {
      await renderSlide(ctx, s, step)
      count++
    }
  }
  if (count === 0) {
    const slide = pres.addSlide()
    slide.background = { color: pal.bg }
    slide.addText(deck.title || 'Untitled', { x: MARGIN, y: 2, w: CONTENT_W, h: 1.2, fontSize: 36, bold: true, color: pal.h1, align: 'center' })
    count = 1
  }
  const buffer = (await pres.write({ outputType: 'nodebuffer' })) as Buffer
  return { buffer, slideCount: count, warnings: ctx.warnings }
}
