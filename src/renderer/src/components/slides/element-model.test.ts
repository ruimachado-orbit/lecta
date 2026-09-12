import { describe, it, expect } from 'vitest'
import {
  alignToSlide,
  appendElement,
  elementBounds,
  nextZ,
  parseElements,
  parseImageElements,
  removeElement,
  replaceElement,
  serializeElement,
  snapPosition,
  stripElements,
  extractElementComments,
  zOf,
  type ImageElement,
  type ShapeElement,
  type TextElement,
} from './element-model'

/** Comments exactly as the pre-wave-2 serializers wrote them. */
const LEGACY = {
  image: '<!-- image x=10 y=20 w=200 src=images/a.png border=2px_solid_#fff radius=8 -->',
  imageMinimal: '<!-- image x=0 y=0 w=480 src=images/b.png -->',
  shape: '<!-- shape type=rect x=100 y=120 w=300 h=200 fill=#123456 stroke=#ffffff sw=2 -->',
  textbox: '<!-- textbox x=100 y=400 w=300 fs=24 fc=#ff0000 fb=1 fi=1 -->Hello<!-- /textbox -->',
  textboxMinimal: '<!-- textbox x=40 y=50 w=300 -->Plain<!-- /textbox -->',
}

const NEW = {
  image:
    '<!-- image x=64 y=48 w=520 h=300 src=images/hero.png fit=cover radius=20 opacity=90 rotate=-3 shadow=soft style=glass z=2 -->',
  shape:
    '<!-- shape type=ellipse x=10 y=10 w=200 h=200 fill=transparent stroke=#fff sw=3 opacity=60 radius=12 shadow=hard style=card z=-1 -->',
  textbox: '<!-- textbox x=10 y=10 w=400 fs=32 fc=#eeeeff fb=1 style=glass pad=24 align=center -->Glass text<!-- /textbox -->',
}

function only(md: string) {
  const els = parseElements(md)
  expect(els).toHaveLength(1)
  return els[0]
}

describe('parse → serialize identity', () => {
  it('round-trips every legacy comment byte for byte', () => {
    for (const src of Object.values(LEGACY)) {
      expect(serializeElement(only(src))).toBe(src)
    }
  })

  it('round-trips every new attribute byte for byte', () => {
    for (const src of Object.values(NEW)) {
      expect(serializeElement(only(src))).toBe(src)
    }
  })

  it('is idempotent over a whole slide', () => {
    const md = ['# Title', '', ...Object.values(LEGACY), ...Object.values(NEW)].join('\n')
    let out = md
    for (const el of parseElements(md).slice().reverse()) {
      out = replaceElement(out, el, {})
    }
    expect(out).toBe(md)
  })
})

describe('backward compatibility', () => {
  it('reads the legacy image attribute set with no new attributes invented', () => {
    const img = only(LEGACY.image) as ImageElement
    expect(img).toMatchObject({ kind: 'image', x: 10, y: 20, w: 200, src: 'images/a.png', radius: 8 })
    expect(img.border).toBe('2px_solid_#fff')
    expect(img.fit).toBeUndefined()
    expect(img.style).toBeUndefined()
    expect(img.opacity).toBeUndefined()
    expect(img.z).toBeUndefined()
  })

  it('reads the legacy shape and textbox attribute sets', () => {
    const shape = only(LEGACY.shape) as ShapeElement
    expect(shape).toMatchObject({ kind: 'shape', shape: 'rect', w: 300, h: 200, fill: '#123456', sw: 2 })
    expect(shape.style).toBeUndefined()

    const tb = only(LEGACY.textbox) as TextElement
    expect(tb).toMatchObject({ kind: 'textbox', x: 100, y: 400, w: 300, fs: 24, fc: '#ff0000', fb: true, fi: true })
    expect(tb.content).toBe('Hello')
    expect(tb.pad).toBeUndefined()
  })

  it('keeps an explicit fb=0 rather than silently dropping it', () => {
    const src = '<!-- textbox x=1 y=2 fb=0 -->t<!-- /textbox -->'
    expect(serializeElement(only(src))).toBe(src)
  })

  it('does not add defaults for attributes the source omitted', () => {
    const src = '<!-- shape type=line x=0 y=0 w=100 h=2 -->'
    const shape = only(src) as ShapeElement
    expect(shape.fill).toBeUndefined()
    expect(shape.stroke).toBeUndefined()
    expect(serializeElement(shape)).toBe(src)
  })
})

describe('unknown attributes', () => {
  it('preserves attributes this version does not know, after the known ones', () => {
    const src = '<!-- image x=1 y=2 w=3 src=a.png sparkle=yes blur=12 -->'
    const img = only(src) as ImageElement
    expect(img.extra).toEqual([
      ['sparkle', 'yes'],
      ['blur', '12'],
    ])
    expect(serializeElement(img)).toBe(src)
  })

  it('keeps unknown attributes across an edit', () => {
    const md = '<!-- shape type=rect x=0 y=0 w=10 h=10 wobble=3 -->'
    const out = replaceElement(md, parseElements(md)[0] as ShapeElement, { style: 'glass' })
    expect(out).toBe('<!-- shape type=rect x=0 y=0 w=10 h=10 style=glass wobble=3 -->')
  })

  it('ignores an unrecognised enum value instead of throwing, and keeps it as an extra', () => {
    const img = only('<!-- image x=0 y=0 w=10 src=a.png fit=squish -->') as ImageElement
    expect(img.fit).toBeUndefined()
    expect(img.extra).toEqual([])
  })
})

describe('parseElements ordering and offsets', () => {
  it('returns elements in source order with usable offsets', () => {
    const md = `intro\n${LEGACY.shape}\nmiddle\n${LEGACY.image}\n${LEGACY.textbox}\n`
    const els = parseElements(md)
    expect(els.map((e) => e.kind)).toEqual(['shape', 'image', 'textbox'])
    expect(els.map((e) => e.index)).toEqual([0, 1, 2])
    for (const el of els) expect(md.slice(el.start, el.end)).toBe(serializeElement(el))
  })

  it('filters images for the read-only renderers', () => {
    const md = `${LEGACY.shape}\n${LEGACY.image}\n${LEGACY.imageMinimal}`
    expect(parseImageElements(md).map((i) => i.src)).toEqual(['images/a.png', 'images/b.png'])
  })

  it('finds nothing in a slide with no pinned elements', () => {
    expect(parseElements('# Just a heading\n\nSome text.')).toEqual([])
  })
})

describe('stripping', () => {
  it('removes every pinned comment and leaves the prose alone', () => {
    const md = `# T\n${LEGACY.image}\ntext\n${NEW.textbox}\n${LEGACY.shape}\n`
    expect(stripElements(md)).toBe('# T\n\ntext\n\n\n')
  })

  it('collects the comments verbatim, de-duplicated', () => {
    const md = `${LEGACY.image}\n${LEGACY.image}\n${LEGACY.shape}`
    expect(extractElementComments(md)).toEqual([LEGACY.image, LEGACY.shape])
  })
})

describe('editing helpers', () => {
  it('replaces an element in place', () => {
    const md = `a\n${LEGACY.imageMinimal}\nb`
    const out = replaceElement(md, parseElements(md)[0] as ImageElement, { x: 120, style: 'glass' })
    expect(out).toBe('a\n<!-- image x=120 y=0 w=480 src=images/b.png style=glass -->\nb')
  })

  it('rounds fractional geometry produced by dragging', () => {
    const md = LEGACY.imageMinimal
    const out = replaceElement(md, parseElements(md)[0] as ImageElement, { x: 12.7, y: 4.2, w: 480.6 })
    expect(out).toBe('<!-- image x=13 y=4 w=481 src=images/b.png -->')
  })

  it('removes an element and collapses the blank-line run it leaves behind', () => {
    const md = `# T\n\n${LEGACY.image}\n\nbody`
    expect(removeElement(md, parseElements(md)[0])).toBe('# T\n\nbody')
  })

  it('appends a new element on its own line', () => {
    const out = appendElement('# T', {
      kind: 'image',
      x: 100,
      y: 200,
      w: 480,
      src: 'images/dropped.png',
      extra: [],
    })
    expect(out).toBe('# T\n<!-- image x=100 y=200 w=480 src=images/dropped.png -->\n')
    expect(parseElements(out)).toHaveLength(1)
  })
})

describe('geometry', () => {
  it('derives bounds, preferring explicit height', () => {
    expect(elementBounds(only(LEGACY.shape))).toEqual({ x: 100, y: 120, w: 300, h: 200 })
    expect(elementBounds(only(NEW.image))).toEqual({ x: 64, y: 48, w: 520, h: 300 })
    expect(elementBounds(only(LEGACY.imageMinimal)).h).toBe(317) // 480 * 0.66
    expect(elementBounds(only(LEGACY.image), { h: 133 }).h).toBe(133)
  })

  it('aligns to the slide edges and centre lines', () => {
    const b = { x: 40, y: 40, w: 480, h: 200 }
    expect(alignToSlide(b, 'left')).toEqual({ x: 0, y: 40 })
    expect(alignToSlide(b, 'center')).toEqual({ x: 400, y: 40 })
    expect(alignToSlide(b, 'right')).toEqual({ x: 800, y: 40 })
    expect(alignToSlide(b, 'top')).toEqual({ x: 40, y: 0 })
    expect(alignToSlide(b, 'middle')).toEqual({ x: 40, y: 260 })
    expect(alignToSlide(b, 'bottom')).toEqual({ x: 40, y: 520 })
  })
})

describe('snapping', () => {
  it('snaps a near-centred element onto the centre lines and reports the guides', () => {
    const r = snapPosition(402, 258, 480, 200)
    expect(r).toEqual({ x: 400, y: 260, guideX: 640, guideY: 360 })
  })

  it('snaps a leading edge to the slide edge', () => {
    expect(snapPosition(4, 3, 100, 100)).toMatchObject({ x: 0, y: 0, guideX: 0, guideY: 0 })
  })

  it('snaps a trailing edge to the far slide edge', () => {
    expect(snapPosition(1178, 618, 100, 100)).toMatchObject({ x: 1180, y: 620, guideX: 1280, guideY: 720 })
  })

  it('leaves a position outside the threshold untouched and draws no guide', () => {
    expect(snapPosition(300, 200, 100, 100)).toEqual({ x: 300, y: 200, guideX: undefined, guideY: undefined })
  })
})

describe('z-order', () => {
  it('reads z, defaulting to 0, and never for textboxes', () => {
    expect(zOf(only(NEW.image))).toBe(2)
    expect(zOf(only(LEGACY.imageMinimal))).toBe(0)
    expect(zOf(only(NEW.textbox))).toBe(0)
  })

  it('computes the z that puts an element in front of or behind every sibling', () => {
    const all = parseElements(`${NEW.image}\n${NEW.shape}`)
    expect(nextZ(all, 'forward')).toBe(3)
    expect(nextZ(all, 'backward')).toBe(-2)
    expect(nextZ([], 'forward')).toBe(1)
  })
})
