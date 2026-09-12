import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import JSZip from 'jszip'
import { buildPptx, parseSlideMarkdown, splitSubSlides, inlineRuns, notesToPlain, paletteFor } from './pptx-exporter'
import { registerDeckRoot, unregisterDeckRoot } from './deck-roots'

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'lecta-pptx-'))
  await writeFile(join(root, 'logo.png'), PNG)
  registerDeckRoot(root)
})
afterAll(async () => {
  unregisterDeckRoot(root)
  await rm(root, { recursive: true, force: true })
})

async function slideTexts(buffer: Buffer): Promise<{ slides: string[]; notes: string[] }> {
  const zip = await JSZip.loadAsync(buffer)
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))
  const noteNames = Object.keys(zip.files).filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n))
  const slides = await Promise.all(slideNames.map((n) => zip.file(n)!.async('string')))
  const notes = await Promise.all(noteNames.map((n) => zip.file(n)!.async('string')))
  return { slides, notes }
}

describe('parseSlideMarkdown', () => {
  it('extracts headings, lists, code, tables, quotes and pinned elements', () => {
    const md = [
      '# Title here',
      '',
      'Intro with **bold** and `code`.',
      '',
      '- one',
      '- two',
      '  - nested',
      '',
      '```python',
      'print("hi")',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '> a quote',
      '',
      '<!-- textbox x=100 y=200 w=300 fs=24 fc=#ff0000 fb=1 -->Pinned<!-- /textbox -->',
      '<!-- image x=10 y=20 w=200 src=logo.png radius=8 -->',
      '<!-- shape type=rect x=1 y=2 w=3 h=4 fill=#123456 stroke=none sw=2 -->',
      '<!-- click -->'
    ].join('\n')
    const p = parseSlideMarkdown(md)
    const types = p.blocks.map((b) => b.type)
    expect(types).toEqual(['heading', 'paragraph', 'list', 'code', 'table', 'quote'])
    const list = p.blocks[2] as Extract<(typeof p.blocks)[number], { type: 'list' }>
    expect(list.items.map((i) => i.depth)).toEqual([0, 0, 1])
    expect(p.textboxes).toEqual([{ x: 100, y: 200, w: 300, text: 'Pinned', fontSize: 24, color: 'ff0000', bold: true, italic: false }])
    expect(p.images[0]).toMatchObject({ x: 10, y: 20, w: 200, src: 'logo.png', radius: 8 })
    expect(p.shapes[0]).toMatchObject({ type: 'rect', fill: '#123456', strokeWidth: 2 })
  })

  it('keeps column breaks and drops other comments', () => {
    const p = parseSlideMarkdown('# H\n<!-- columns -->\nleft\n<!-- col -->\nright\n<!-- /columns -->\n<!-- note -->')
    expect(p.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'col-break', 'paragraph'])
  })
})

describe('pinned element attributes', () => {
  it('reads the extended image, shape and textbox attribute sets', () => {
    const p = parseSlideMarkdown(
      [
        '<!-- image x=64 y=48 w=520 h=300 src=logo.png fit=cover radius=20 opacity=90 rotate=-3 shadow=soft style=glass z=2 -->',
        '<!-- shape type=rect x=10 y=10 w=200 h=100 fill=#123456 opacity=60 radius=12 shadow=hard style=card z=-1 -->',
        '<!-- textbox x=10 y=10 w=400 fs=32 style=glass pad=24 align=center -->Glass<!-- /textbox -->'
      ].join('\n')
    )
    expect(p.images[0]).toMatchObject({ x: 64, y: 48, w: 520, h: 300, fit: 'cover', radius: 20, opacity: 90, rotate: -3, shadow: 'soft', style: 'glass', z: 2 })
    expect(p.shapes[0]).toMatchObject({ opacity: 60, radius: 12, shadow: 'hard', style: 'card', z: -1 })
    expect(p.textboxes[0]).toMatchObject({ x: 10, y: 10, w: 400, fontSize: 32, style: 'glass', pad: 24, align: 'center', text: 'Glass' })
  })

  it('still reads decks written before the new attributes existed', () => {
    const p = parseSlideMarkdown(
      [
        '<!-- image x=10 y=20 w=200 src=logo.png border=2px_solid_#fff radius=8 -->',
        '<!-- shape type=ellipse x=1 y=2 w=3 h=4 fill=#123456 stroke=none sw=2 -->',
        '<!-- textbox x=100 y=200 w=300 fs=24 fc=#ff0000 fb=1 -->Pinned<!-- /textbox -->'
      ].join('\n')
    )
    expect(p.images[0]).toMatchObject({ x: 10, y: 20, w: 200, radius: 8, border: '2px solid #fff' })
    expect(p.images[0].style).toBeUndefined()
    expect(p.images[0].fit).toBeUndefined()
    expect(p.shapes[0]).toMatchObject({ type: 'ellipse', strokeWidth: 2 })
    expect(p.shapes[0].opacity).toBeUndefined()
    expect(p.textboxes[0]).toMatchObject({ text: 'Pinned', fontSize: 24, color: 'ff0000', bold: true, italic: false })
    expect(p.textboxes[0].style).toBeUndefined()
  })

  it('ignores unknown enum values rather than passing them to PowerPoint', () => {
    const p = parseSlideMarkdown('<!-- image x=0 y=0 w=10 src=logo.png fit=squish style=neon shadow=glow -->')
    expect(p.images[0]).toMatchObject({ fit: undefined, style: undefined, shadow: undefined })
  })

  it('renders glass and card as a rounded translucent backing shape', async () => {
    const res = await buildPptx({
      title: 'Glass',
      rootPath: root,
      slides: [
        {
          id: 'glass',
          layout: 'blank',
          markdownContent: [
            '<!-- image x=100 y=100 w=400 h=250 src=logo.png fit=cover radius=20 opacity=80 rotate=6 shadow=soft style=glass -->',
            '<!-- shape type=rect x=700 y=100 w=300 h=200 fill=#123456 radius=16 style=card -->'
          ].join('\n')
        }
      ]
    })
    expect(res.warnings).toEqual([])
    const { slides } = await slideTexts(res.buffer)
    // Two backing surfaces, both rounded, both translucent.
    expect(slides[0].match(/roundRect/g)?.length).toBeGreaterThanOrEqual(2)
    expect(slides[0]).toContain('alpha')
    // Rotation is emitted on the picture (pptxgenjs writes rot in 60000ths of a degree).
    expect(slides[0]).toContain('rot="360000"')
  })

  it('honours z-order when placing pinned shapes', async () => {
    const res = await buildPptx({
      title: 'Z',
      rootPath: root,
      slides: [
        {
          id: 'z',
          layout: 'blank',
          markdownContent: [
            '<!-- shape type=rect x=0 y=0 w=10 h=10 fill=#aa0000 z=5 -->',
            '<!-- shape type=rect x=0 y=0 w=10 h=10 fill=#00bb00 z=1 -->'
          ].join('\n')
        }
      ]
    })
    const { slides } = await slideTexts(res.buffer)
    expect(slides[0].indexOf('00BB00')).toBeLessThan(slides[0].indexOf('AA0000'))
  })
})

describe('helpers', () => {
  it('splits sub-slides cumulatively', () => {
    expect(splitSubSlides('a\n----\nb\n----\nc')).toEqual(['a', 'a\n\nb', 'a\n\nb\n\nc'])
    expect(splitSubSlides('only')).toEqual(['only'])
  })
  it('builds inline runs', () => {
    const runs = inlineRuns('x **b** `c` [l](https://e.x) y', { color: '000000', fontFace: 'Calibri', fontSize: 12, monoFace: 'Consolas', codeColor: '111111', accent: '2222ff' })
    expect(runs.map((r) => r.text)).toEqual(['x ', 'b', ' ', 'c', ' ', 'l', ' y'])
    expect(runs[1].options?.bold).toBe(true)
    expect(runs[3].options?.fontFace).toBe('Consolas')
    expect(runs[5].options?.hyperlink).toEqual({ url: 'https://e.x' })
  })
  it('strips markdown for notes and resolves palettes', () => {
    expect(notesToPlain('# Open\n**Say** this <!-- hidden -->')).toBe('Open\nSay this')
    expect(paletteFor('paper').bodyFont).toBe('Georgia')
    expect(paletteFor('nope').bg).toBe(paletteFor('dark').bg)
  })
})

describe('buildPptx', () => {
  it('produces one slide per sub-slide with text, code, notes and images', async () => {
    const res = await buildPptx({
      title: 'Test Deck',
      author: 'Tester',
      theme: 'executive',
      rootPath: root,
      slides: [
        { id: 'intro', layout: 'title', markdownContent: '# Hello World\n\nA subtitle line', notesContent: '# Notes\nRemember **this**' },
        { id: 'demo', layout: 'default', markdownContent: '# Demo\n\n- point one\n- point two\n\n![logo](logo.png)', codeContent: 'console.log(1)\nconsole.log(2)', codeLanguage: 'javascript', codeFile: 'code/demo.js' },
        { id: 'steps', markdownContent: '# Steps\n\nfirst\n----\nsecond' },
        { id: 'skipped', markdownContent: '# Nope', skip: true }
      ]
    })
    expect(res.slideCount).toBe(4)
    expect(res.warnings).toEqual([])
    const { slides, notes } = await slideTexts(res.buffer)
    expect(slides).toHaveLength(4)
    expect(slides[0]).toContain('Hello World')
    expect(slides[1]).toContain('console.log(1)')
    expect(slides[1]).toContain('code/demo.js')
    expect(slides[2]).toContain('first')
    expect(slides[2]).not.toContain('second')
    expect(slides[3]).toContain('second')
    expect(slides.join('')).not.toContain('Nope')
    expect(notes.join('')).toContain('Remember this')
    const zip = await JSZip.loadAsync(res.buffer)
    expect(Object.keys(zip.files).some((n) => n.startsWith('ppt/media/'))).toBe(true)
  })

  it('refuses images outside the deck and reports a warning', async () => {
    const res = await buildPptx({ title: 'X', rootPath: root, slides: [{ id: 'a', markdownContent: '# A\n\n![x](../../etc/passwd)' }] })
    expect(res.warnings.some((w) => w.includes('etc/passwd'))).toBe(true)
    const { slides } = await slideTexts(res.buffer)
    expect(slides[0]).toContain('[image:')
  })

  it('handles every layout without throwing', async () => {
    const layouts = ['default', 'center', 'title', 'section', 'two-col', 'two-col-wide-left', 'two-col-wide-right', 'three-col', 'top-bottom', 'big-number', 'quote', 'blank']
    const res = await buildPptx({
      title: 'Layouts', rootPath: root,
      slides: layouts.map((l) => ({ id: l, layout: l, markdownContent: `# ${l}\n\npara\n<!-- col -->\n- a\n- b\n<!-- col -->\n> q`, codeContent: l === 'two-col' ? 'x = 1' : null }))
    })
    expect(res.slideCount).toBe(layouts.length)
    const { slides } = await slideTexts(res.buffer)
    // two-col with code gets a follow-up code slide
    expect(slides.length).toBe(layouts.length + 1)
  })
})
