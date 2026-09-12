/**
 * Typed parse/serialize layer for the pinned-element HTML comments that encode
 * canvas-positioned elements inside a slide's markdown.
 *
 *   <!-- image x= y= w= [h=] src= [fit=] [radius=] [border=] [opacity=] [rotate=] [shadow=] [style=] [z=] -->
 *   <!-- shape type= x= y= w= h= [fill=] [stroke=] [sw=] [opacity=] [radius=] [shadow=] [style=] [z=] -->
 *   <!-- textbox x= y= [w=] [fs=] [fc=] [fb=] [fi=] [style=] [pad=] [align=] -->…<!-- /textbox -->
 *
 * Two invariants this module exists to guarantee:
 *
 * 1. **Backward compatibility.** Only attributes actually present in the source are
 *    written back, in the same canonical order the pre-existing serializers used, so a
 *    deck authored before the new attributes existed round-trips byte-for-byte.
 * 2. **Forward compatibility.** Attributes this version does not understand are kept in
 *    `extra` and re-emitted after the known ones, so a deck written by a newer version
 *    survives an edit here.
 *
 * The module is deliberately free of React and DOM APIs: it is pure string/data code and
 * is unit-tested as such.
 */

export type ElementStyle = 'none' | 'glass' | 'card' | 'frame'
export type ElementShadow = 'none' | 'soft' | 'hard'
export type ImageFit = 'cover' | 'contain'
export type TextAlign = 'left' | 'center' | 'right'

export const ELEMENT_STYLES: readonly ElementStyle[] = ['none', 'glass', 'card', 'frame']
export const ELEMENT_SHADOWS: readonly ElementShadow[] = ['none', 'soft', 'hard']

/** The slide canvas, in px. Every coordinate in a pinned comment is in this space. */
export const CANVAS_W = 1280
export const CANVAS_H = 720

interface ElementBase {
  /** Position of this element among all pinned elements of the slide, in source order. */
  index: number
  /** Character offsets of the full comment (a textbox includes its closing tag). */
  start: number
  end: number
  /** Attributes this version does not know about, preserved verbatim on serialize. */
  extra: [string, string][]
}

export interface ImageElement extends ElementBase {
  kind: 'image'
  x: number
  y: number
  w: number
  h?: number
  src: string
  fit?: ImageFit
  radius?: number
  border?: string
  opacity?: number
  rotate?: number
  shadow?: ElementShadow
  style?: ElementStyle
  z?: number
}

export interface ShapeElement extends ElementBase {
  kind: 'shape'
  shape: string
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  sw?: number
  opacity?: number
  radius?: number
  rotate?: number
  shadow?: ElementShadow
  style?: ElementStyle
  z?: number
}

export interface TextElement extends ElementBase {
  kind: 'textbox'
  x: number
  y: number
  w?: number
  fs?: number
  fc?: string
  fb?: boolean
  fi?: boolean
  style?: ElementStyle
  pad?: number
  align?: TextAlign
  content: string
}

export type SlideElement = ImageElement | ShapeElement | TextElement

/** An element that is not yet in any markdown, so it has no source offsets. */
export type NewElement =
  | Omit<ImageElement, 'index' | 'start' | 'end'>
  | Omit<ShapeElement, 'index' | 'start' | 'end'>
  | Omit<TextElement, 'index' | 'start' | 'end'>

/* ── Regexes ─────────────────────────────────────────────────────────── */

const IMAGE_RE = /<!--\s*image\s+([^>]*?)-->/gi
const SHAPE_RE = /<!--\s*shape\s+([^>]*?)-->/gi
const TEXTBOX_RE = /<!--\s*textbox\s+([^>]*?)-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi
const ATTR_RE = /([A-Za-z_][A-Za-z0-9_-]*)=(\S+)/g

/** Every comment form that pins an element to the slide rather than to a sub-slide. */
export const PINNED_COMMENT_PATTERNS: readonly RegExp[] = [IMAGE_RE, TEXTBOX_RE, SHAPE_RE]

/* ── Attribute helpers ───────────────────────────────────────────────── */

function readAttrs(src: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of src.matchAll(ATTR_RE)) if (!out.has(m[1])) out.set(m[1], m[2])
  return out
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function flag(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined
  return v === '1' || v === 'true'
}

function oneOf<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return v !== undefined && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

/** Attributes lifted onto the typed element; everything else goes to `extra`. */
const KNOWN: Record<SlideElement['kind'], readonly string[]> = {
  image: ['x', 'y', 'w', 'h', 'src', 'fit', 'border', 'radius', 'opacity', 'rotate', 'shadow', 'style', 'z'],
  shape: ['type', 'x', 'y', 'w', 'h', 'fill', 'stroke', 'sw', 'opacity', 'radius', 'rotate', 'shadow', 'style', 'z'],
  textbox: ['x', 'y', 'w', 'fs', 'fc', 'fb', 'fi', 'style', 'pad', 'align'],
}

function extrasOf(kind: SlideElement['kind'], attrs: Map<string, string>): [string, string][] {
  const known = KNOWN[kind]
  return [...attrs].filter(([k]) => !known.includes(k))
}

/* ── Parsing ─────────────────────────────────────────────────────────── */

function parseImage(attrs: Map<string, string>): Omit<ImageElement, 'index' | 'start' | 'end'> {
  return {
    kind: 'image',
    x: num(attrs.get('x')) ?? 0,
    y: num(attrs.get('y')) ?? 0,
    w: num(attrs.get('w')) ?? 400,
    h: num(attrs.get('h')),
    src: attrs.get('src') ?? '',
    fit: oneOf(attrs.get('fit'), ['cover', 'contain'] as const),
    border: attrs.get('border'),
    radius: num(attrs.get('radius')),
    opacity: num(attrs.get('opacity')),
    rotate: num(attrs.get('rotate')),
    shadow: oneOf(attrs.get('shadow'), ELEMENT_SHADOWS),
    style: oneOf(attrs.get('style'), ELEMENT_STYLES),
    z: num(attrs.get('z')),
    extra: extrasOf('image', attrs),
  }
}

function parseShape(attrs: Map<string, string>): Omit<ShapeElement, 'index' | 'start' | 'end'> {
  return {
    kind: 'shape',
    shape: attrs.get('type') ?? 'rect',
    x: num(attrs.get('x')) ?? 0,
    y: num(attrs.get('y')) ?? 0,
    w: num(attrs.get('w')) ?? 200,
    h: num(attrs.get('h')) ?? 120,
    fill: attrs.get('fill'),
    stroke: attrs.get('stroke'),
    sw: num(attrs.get('sw')),
    opacity: num(attrs.get('opacity')),
    radius: num(attrs.get('radius')),
    rotate: num(attrs.get('rotate')),
    shadow: oneOf(attrs.get('shadow'), ELEMENT_SHADOWS),
    style: oneOf(attrs.get('style'), ELEMENT_STYLES),
    z: num(attrs.get('z')),
    extra: extrasOf('shape', attrs),
  }
}

function parseTextbox(attrs: Map<string, string>, content: string): Omit<TextElement, 'index' | 'start' | 'end'> {
  return {
    kind: 'textbox',
    x: num(attrs.get('x')) ?? 0,
    y: num(attrs.get('y')) ?? 0,
    w: num(attrs.get('w')),
    fs: num(attrs.get('fs')),
    fc: attrs.get('fc'),
    fb: flag(attrs.get('fb')),
    fi: flag(attrs.get('fi')),
    style: oneOf(attrs.get('style'), ELEMENT_STYLES),
    pad: num(attrs.get('pad')),
    align: oneOf(attrs.get('align'), ['left', 'center', 'right'] as const),
    content,
    extra: extrasOf('textbox', attrs),
  }
}

/**
 * Every pinned element in a slide, in source order, with the character offsets of the
 * comment that produced it. Offsets are only valid for the exact string passed in.
 */
export function parseElements(md: string): SlideElement[] {
  const found: { start: number; end: number; el: NewElement }[] = []

  for (const m of md.matchAll(IMAGE_RE)) {
    found.push({ start: m.index!, end: m.index! + m[0].length, el: parseImage(readAttrs(m[1])) })
  }
  for (const m of md.matchAll(SHAPE_RE)) {
    found.push({ start: m.index!, end: m.index! + m[0].length, el: parseShape(readAttrs(m[1])) })
  }
  for (const m of md.matchAll(TEXTBOX_RE)) {
    found.push({
      start: m.index!,
      end: m.index! + m[0].length,
      el: parseTextbox(readAttrs(m[1]), m[2].trim()),
    })
  }

  return found
    .sort((a, b) => a.start - b.start)
    .map(({ start, end, el }, index) => ({ ...el, index, start, end }) as SlideElement)
}

/** The slide markdown with every pinned-element comment removed. */
export function stripElements(md: string): string {
  return PINNED_COMMENT_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, ''), md)
}

/** Every pinned-element comment in a slide, de-duplicated and in source order. */
export function extractElementComments(md: string): string[] {
  return [...new Set(parseElements(md).map((el) => md.slice(el.start, el.end)))]
}

/** Only the images — the read-only renderers care about nothing else. */
export function parseImageElements(md: string): ImageElement[] {
  return parseElements(md).filter((e): e is ImageElement => e.kind === 'image')
}

/* ── Serializing ─────────────────────────────────────────────────────── */

type Attr = [string, string | number | undefined]

function attrString(pairs: Attr[], extra: [string, string][]): string {
  const parts: string[] = []
  for (const [k, v] of pairs) if (v !== undefined && v !== '') parts.push(`${k}=${v}`)
  for (const [k, v] of extra) parts.push(`${k}=${v}`)
  return parts.join(' ')
}

const round = (v: number | undefined): number | undefined => (v === undefined ? undefined : Math.round(v))
const bit = (v: boolean | undefined): number | undefined => (v === undefined ? undefined : v ? 1 : 0)

export function serializeElement(el: NewElement): string {
  if (el.kind === 'image') {
    const attrs: Attr[] = [
      ['x', round(el.x)],
      ['y', round(el.y)],
      ['w', round(el.w)],
      ['h', round(el.h)],
      ['src', el.src],
      ['fit', el.fit],
      ['border', el.border],
      ['radius', round(el.radius)],
      ['opacity', round(el.opacity)],
      ['rotate', round(el.rotate)],
      ['shadow', el.shadow],
      ['style', el.style],
      ['z', round(el.z)],
    ]
    return `<!-- image ${attrString(attrs, el.extra)} -->`
  }
  if (el.kind === 'shape') {
    const attrs: Attr[] = [
      ['type', el.shape],
      ['x', round(el.x)],
      ['y', round(el.y)],
      ['w', round(el.w)],
      ['h', round(el.h)],
      ['fill', el.fill],
      ['stroke', el.stroke],
      ['sw', round(el.sw)],
      ['opacity', round(el.opacity)],
      ['radius', round(el.radius)],
      ['rotate', round(el.rotate)],
      ['shadow', el.shadow],
      ['style', el.style],
      ['z', round(el.z)],
    ]
    return `<!-- shape ${attrString(attrs, el.extra)} -->`
  }
  const attrs: Attr[] = [
    ['x', round(el.x)],
    ['y', round(el.y)],
    ['w', round(el.w)],
    ['fs', round(el.fs)],
    ['fc', el.fc],
    ['fb', bit(el.fb)],
    ['fi', bit(el.fi)],
    ['style', el.style],
    ['pad', round(el.pad)],
    ['align', el.align],
  ]
  return `<!-- textbox ${attrString(attrs, el.extra)} -->${el.content}<!-- /textbox -->`
}

/* ── Editing ─────────────────────────────────────────────────────────── */

type Patch<T extends SlideElement> = Partial<Omit<T, 'kind' | 'index' | 'start' | 'end'>>

/** Full slide markdown with `el` replaced by `el` + `patch`. */
export function replaceElement<T extends SlideElement>(md: string, el: T, patch: Patch<T>): string {
  const next = { ...el, ...patch } as SlideElement
  return md.slice(0, el.start) + serializeElement(next) + md.slice(el.end)
}

/** Full slide markdown with `el`'s comment removed and blank-line runs collapsed. */
export function removeElement(md: string, el: SlideElement): string {
  return (md.slice(0, el.start) + md.slice(el.end)).replace(/\n{3,}/g, '\n\n').trim()
}

/** Full slide markdown with a new element appended on its own line. */
export function appendElement(md: string, el: NewElement): string {
  return `${md.trimEnd()}\n${serializeElement(el)}\n`
}

/* ── Geometry ────────────────────────────────────────────────────────── */

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** Default height used when an element has no explicit one (images keep 3:2, text ~1 line). */
export function elementBounds(el: SlideElement, measured?: { w?: number; h?: number }): Bounds {
  if (el.kind === 'shape') return { x: el.x, y: el.y, w: el.w, h: el.h }
  if (el.kind === 'image') {
    return { x: el.x, y: el.y, w: el.w, h: el.h ?? measured?.h ?? Math.round(el.w * 0.66) }
  }
  const w = el.w ?? measured?.w ?? 300
  const lines = el.content.split('\n').length
  const h = measured?.h ?? Math.round(lines * (el.fs ?? 18) * 1.5 + (el.pad ?? 12) * 2)
  return { x: el.x, y: el.y, w, h }
}

export type AlignTarget = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** Top-left position that aligns `bounds` to the slide edge or centre line named by `target`. */
export function alignToSlide(bounds: Bounds, target: AlignTarget): { x: number; y: number } {
  switch (target) {
    case 'left':
      return { x: 0, y: bounds.y }
    case 'center':
      return { x: Math.round((CANVAS_W - bounds.w) / 2), y: bounds.y }
    case 'right':
      return { x: CANVAS_W - bounds.w, y: bounds.y }
    case 'top':
      return { x: bounds.x, y: 0 }
    case 'middle':
      return { x: bounds.x, y: Math.round((CANVAS_H - bounds.h) / 2) }
    case 'bottom':
      return { x: bounds.x, y: CANVAS_H - bounds.h }
  }
}

/* ── Snapping ────────────────────────────────────────────────────────── */

export const SNAP_THRESHOLD = 6

/** Slide guide lines elements snap to: both edges and the centre line, per axis. */
export const SNAP_X: readonly number[] = [0, CANVAS_W / 2, CANVAS_W]
export const SNAP_Y: readonly number[] = [0, CANVAS_H / 2, CANVAS_H]

export interface SnapResult {
  x: number
  y: number
  /** Slide-space x of the vertical guide to draw, if the move snapped horizontally. */
  guideX?: number
  /** Slide-space y of the horizontal guide to draw, if the move snapped vertically. */
  guideY?: number
}

function snapAxis(pos: number, size: number, lines: readonly number[]): { pos: number; guide?: number } {
  let best: { pos: number; guide: number; dist: number } | null = null
  // An element can snap by its leading edge, its centre, or its trailing edge.
  const offsets = [0, size / 2, size]
  for (const line of lines) {
    for (const off of offsets) {
      const candidate = line - off
      const dist = Math.abs(candidate - pos)
      if (dist <= SNAP_THRESHOLD && (!best || dist < best.dist)) best = { pos: candidate, guide: line, dist }
    }
  }
  return best ? { pos: best.pos, guide: best.guide } : { pos }
}

/** Snap a dragged element's top-left to the slide's edges and centre lines. */
export function snapPosition(x: number, y: number, w: number, h: number): SnapResult {
  const sx = snapAxis(x, w, SNAP_X)
  const sy = snapAxis(y, h, SNAP_Y)
  return { x: sx.pos, y: sy.pos, guideX: sx.guide, guideY: sy.guide }
}

/* ── Z-order ─────────────────────────────────────────────────────────── */

/** Elements that carry an explicit `z` attribute. Textboxes stack by source order only. */
export function hasZ(el: SlideElement): el is ImageElement | ShapeElement {
  return el.kind === 'image' || el.kind === 'shape'
}

/** Effective paint-order key: the explicit `z`, or 0 when the element has none. */
export function zOf(el: SlideElement): number {
  return hasZ(el) ? (el.z ?? 0) : 0
}

/** The `z` value that puts an element in front of, or behind, every sibling. */
export function nextZ(all: SlideElement[], direction: 'forward' | 'backward'): number {
  const zs = all.map(zOf)
  if (zs.length === 0) return direction === 'forward' ? 1 : -1
  return direction === 'forward' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
}
