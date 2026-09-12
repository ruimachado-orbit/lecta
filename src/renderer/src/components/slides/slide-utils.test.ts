import { describe, it, expect, beforeEach } from 'vitest'
import { resolveImageSrc, queuePinComment, drainPinComments } from './slide-utils'

// Both helpers are pure (the pin queue is a module-level array) — no DOM needed.

beforeEach(() => {
  drainPinComments()
})

describe('resolveImageSrc', () => {
  it('returns an empty string for missing src', () => {
    expect(resolveImageSrc(undefined)).toBe('')
    expect(resolveImageSrc('')).toBe('')
    expect(resolveImageSrc(undefined, '/decks/talk')).toBe('')
  })

  it('passes remote and inline sources through untouched', () => {
    const untouched = [
      'https://example.com/a.png',
      'http://example.com/a.png',
      'data:image/png;base64,AAAA',
      'lecta-file:///decks/talk/img/a.png'
    ]
    for (const src of untouched) {
      expect(resolveImageSrc(src, '/decks/talk')).toBe(src)
    }
  })

  it('rewrites file:// to the app protocol', () => {
    expect(resolveImageSrc('file:///decks/talk/img/a.png')).toBe('lecta-file:///decks/talk/img/a.png')
    // The root is irrelevant for an already-absolute file URL.
    expect(resolveImageSrc('file:///elsewhere/a.png', '/decks/talk')).toBe('lecta-file:///elsewhere/a.png')
  })

  it('resolves a deck-relative path against the deck root', () => {
    expect(resolveImageSrc('images/diagram.png', '/decks/talk')).toBe('lecta-file:///decks/talk/images/diagram.png')
  })

  it('decodes percent-encoded relative paths so spaces survive', () => {
    expect(resolveImageSrc('images/my%20diagram.png', '/decks/talk')).toBe(
      'lecta-file:///decks/talk/images/my diagram.png'
    )
  })

  it('leaves a relative path alone when no deck root is known', () => {
    expect(resolveImageSrc('images/diagram.png')).toBe('images/diagram.png')
  })
})

describe('pin comment queue', () => {
  it('starts empty and drains to an empty array', () => {
    expect(drainPinComments()).toEqual([])
  })

  it('returns queued comments in order', () => {
    queuePinComment('<!-- pin: a -->')
    queuePinComment('<!-- pin: b -->')
    expect(drainPinComments()).toEqual(['<!-- pin: a -->', '<!-- pin: b -->'])
  })

  it('empties the queue so a second drain yields nothing', () => {
    queuePinComment('<!-- pin: a -->')
    expect(drainPinComments()).toEqual(['<!-- pin: a -->'])
    expect(drainPinComments()).toEqual([])
  })

  it('does not hand back a live reference to the internal queue', () => {
    queuePinComment('<!-- pin: a -->')
    const drained = drainPinComments()
    queuePinComment('<!-- pin: b -->')
    expect(drained).toEqual(['<!-- pin: a -->'])
    expect(drainPinComments()).toEqual(['<!-- pin: b -->'])
  })
})

describe('preprocessImageGrids', () => {
  it('leaves a single image line untouched', async () => {
    const { preprocessImageGrids } = await import('./slide-utils')
    const md = `# Title\n\nSome text.\n\n![solo](images/a.png)\n\nMore text.`
    expect(preprocessImageGrids(md, '/decks/talk')).toBe(md)
  })

  it('groups consecutive images into a glass grid with resolved sources', async () => {
    const { preprocessImageGrids } = await import('./slide-utils')
    const md = `# Gallery\n\n![Alpha](images/a.png)\n![Beta](images/b.png)\n![image](images/c.png)`
    const out = preprocessImageGrids(md, '/decks/talk')
    expect(out).toContain('<div class="slide-img-grid">')
    expect(out).toContain('src="lecta-file:///decks/talk/images/a.png"')
    expect(out).toContain('<figcaption>Alpha</figcaption>')
    expect(out).toContain('<figcaption>Beta</figcaption>')
    // The default uploader alt is noise, not a caption.
    expect(out).not.toContain('<figcaption>image</figcaption>')
    expect(out).not.toContain('![Alpha]')
  })

  it('breaks runs on text, HTML, quotes and fences', async () => {
    const { preprocessImageGrids } = await import('./slide-utils')
    const md = [
      '![a](x/1.png)',
      '',
      '![b](x/2.png)',
      '![c](x/3.png)',
      '<div data-click-step="1">',
      '![d](x/4.png)',
      '![e](x/5.png)',
      '</div>',
      '> ![f](x/6.png)',
      '```',
      '![g](x/7.png)',
      '![h](x/8.png)',
      '```'
    ].join('\n')
    const out = preprocessImageGrids(md, '/root')
    // a is single (blank line breaks the run); b+c grid; d+e grid inside the click div.
    expect(out).toContain('![a](x/1.png)')
    expect(out.match(/slide-img-grid/g)?.length ?? 0).toBe(2)
    expect(out).toContain('> ![f](x/6.png)')
    expect(out).toContain('![g](x/7.png)')
  })

  it('escapes attribute characters in alt and src', async () => {
    const { preprocessImageGrids } = await import('./slide-utils')
    const out = preprocessImageGrids('![A"B&<>C](images/a.png)\n![two](images/b.png)', '/r')
    expect(out).toContain('alt="A&quot;B&amp;&lt;&gt;C"')
    expect(out).toContain('<figcaption>A&quot;B&amp;&lt;&gt;C</figcaption>')
  })
})

describe('pinned image glass default', () => {
  it('renders glass unless the author overrides the style', async () => {
    const { imageStyle } = await import('./PinnedElements')
    const { parseElements } = await import('./element-model')
    const [plain, none, card] = parseElements(
      [
        '<!-- image x=0 y=0 w=400 src=images/a.png -->',
        '<!-- image x=0 y=0 w=400 src=images/a.png style=none -->',
        '<!-- image x=0 y=0 w=400 src=images/a.png style=card -->'
      ].join('\n')
    )
    if (plain?.kind !== 'image' || none?.kind !== 'image' || card?.kind !== 'image') {
      throw new Error('test fixture failed to parse as images')
    }
    expect(imageStyle(plain)).toBe('glass')
    expect(imageStyle(none)).toBe('none')
    expect(imageStyle(card)).toBe('card')
  })
})
