import { writeFile, mkdtemp, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import {
  buildCaptureScript,
  buildExportHash,
  buildStandaloneHtml,
  collectCss,
  embedImages,
  loadExportPage,
  normalizeExportOptions,
  readLocalStylesheets,
  renderPdf,
  resolveAssetPath,
  signalRenderReady,
  PDF_PRINT_OPTIONS,
  type ExportRenderWindow
} from './export-pdf'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-export-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('buildExportHash', () => {
  it('carries the deck path, theme, slide count and trust flag', () => {
    const hash = buildExportHash({ rootPath: '/decks/my deck', theme: 'executive', slides: 12, mdxTrusted: true })
    expect(hash.startsWith('/export?')).toBe(true)
    const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
    expect(params.get('deck')).toBe('/decks/my deck')
    expect(params.get('theme')).toBe('executive')
    expect(params.get('slides')).toBe('12')
    expect(params.get('mdx')).toBe('1')
  })

  it('omits the trust flag for untrusted decks', () => {
    const hash = buildExportHash({ rootPath: '/decks/a', theme: 'dark' })
    expect(hash).not.toContain('mdx=')
    expect(hash).not.toContain('slides=')
  })

  it('percent-encodes the deck path so the hash stays parseable', () => {
    const hash = buildExportHash({ rootPath: '/decks/a&b=c' })
    expect(hash).not.toContain('a&b=c')
    const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
    expect(params.get('deck')).toBe('/decks/a&b=c')
  })
})

describe('normalizeExportOptions', () => {
  it('ignores the legacy slideHtmls array', () => {
    expect(normalizeExportOptions(['<div>slide</div>'])).toEqual({})
    expect(normalizeExportOptions(['<div>slide</div>'], 'paper')).toEqual({ theme: 'paper' })
  })

  it('ignores the legacy pre-rendered content array', () => {
    expect(normalizeExportOptions([{ content: '# hi', isPreRendered: false }], 'dark')).toEqual({ theme: 'dark' })
  })

  it('reads the new options object', () => {
    expect(normalizeExportOptions({ theme: 'creative', slides: 4, mdxTrusted: true })).toEqual({
      theme: 'creative',
      slides: 4,
      mdxTrusted: true
    })
  })

  it('falls back to the theme argument when the options carry none', () => {
    expect(normalizeExportOptions({ slides: 2 }, 'minimal')).toEqual({
      theme: 'minimal',
      slides: 2,
      mdxTrusted: false
    })
  })
})

describe('collectCss', () => {
  const sheet = (cssTexts: string[], href?: string): { href?: string; cssRules: { cssText: string }[] } => ({
    href,
    cssRules: cssTexts.map((cssText) => ({ cssText }))
  })

  it('concatenates readable rules', () => {
    const { css } = collectCss([sheet(['.a { color: red; }']), sheet(['.b { color: blue; }'])])
    expect(css).toContain('.a { color: red; }')
    expect(css).toContain('.b { color: blue; }')
  })

  it('reports stylesheets whose rules cannot be read', () => {
    const blocked = {
      href: 'file:///app/out/renderer/assets/index.css',
      get cssRules(): never {
        throw new Error('SecurityError')
      }
    }
    const { css, unreadable } = collectCss([blocked, sheet(['.a { color: red; }'])])
    expect(unreadable).toEqual(['file:///app/out/renderer/assets/index.css'])
    expect(css).toContain('.a { color: red; }')
  })

  it('drops rules that would make the exported file reach the network', () => {
    const { css } = collectCss([
      sheet([
        '@import url("https://fonts.googleapis.com/css2?family=Inter");',
        '@font-face { src: url(https://fonts.gstatic.com/inter.woff2); }',
        '.keep { color: red; }'
      ])
    ])
    expect(css).not.toContain('googleapis')
    expect(css).not.toContain('gstatic')
    expect(css).toContain('.keep { color: red; }')
  })

  it('keeps local @import rules', () => {
    const { css } = collectCss([sheet(['@import url("theme.css");'])])
    expect(css).toContain('@import url("theme.css");')
  })
})

describe('buildCaptureScript', () => {
  it('inlines the collector and counts export slides', () => {
    const script = buildCaptureScript()
    expect(script).toContain('document.styleSheets')
    expect(script).toContain(".export-slide")
    expect(script).toContain('document.documentElement.cloneNode(true)')
    // scripts and links are stripped so the captured page cannot reach the network
    expect(script).toContain("'script, style, link, noscript, template'")
  })
})

describe('resolveAssetPath', () => {
  it('resolves a lecta-file URL inside the deck', () => {
    const abs = join(tempDir, 'images', 'a.png')
    expect(resolveAssetPath(`lecta-file://${abs}`, tempDir)).toBe(abs)
  })

  it('resolves a percent-encoded lecta-file URL', () => {
    const abs = join(tempDir, 'my image.png')
    expect(resolveAssetPath(`lecta-file://${tempDir}/my%20image.png`, tempDir)).toBe(abs)
  })

  it('resolves a relative path against the deck root', () => {
    expect(resolveAssetPath('images/a.png', tempDir)).toBe(join(tempDir, 'images', 'a.png'))
  })

  it('refuses paths outside the deck', () => {
    expect(resolveAssetPath('../../etc/passwd', tempDir)).toBeNull()
    expect(resolveAssetPath('lecta-file:///etc/passwd', tempDir)).toBeNull()
  })

  it('ignores remote and inline URLs', () => {
    expect(resolveAssetPath('https://example.com/a.png', tempDir)).toBeNull()
    expect(resolveAssetPath('data:image/png;base64,abc', tempDir)).toBeNull()
    expect(resolveAssetPath('blob:http://localhost/abc', tempDir)).toBeNull()
  })
})

describe('embedImages', () => {
  it('returns html unchanged when there are no images', async () => {
    const html = '<div>No images here</div>'
    expect(await embedImages(html, tempDir)).toBe(html)
  })

  it('embeds a local PNG as a base64 data URI', async () => {
    const imgData = Buffer.from('fake-png-data')
    await writeFile(join(tempDir, 'photo.png'), imgData)

    const result = await embedImages('<img src="photo.png" />', tempDir)

    expect(result).toContain(`data:image/png;base64,${imgData.toString('base64')}`)
    expect(result).not.toContain('src="photo.png"')
  })

  it('embeds lecta-file:// URLs produced by the slide renderer', async () => {
    await writeFile(join(tempDir, 'hero.png'), Buffer.from('hero'))

    const result = await embedImages(`<img src="lecta-file://${tempDir}/hero.png" />`, tempDir)

    expect(result).toContain(`data:image/png;base64,${Buffer.from('hero').toString('base64')}`)
    expect(result).not.toContain('lecta-file://')
  })

  it('embeds CSS url() references', async () => {
    await writeFile(join(tempDir, 'bg.jpg'), Buffer.from('bg'))

    const result = await embedImages(
      `<div style="background-image:url('lecta-file://${tempDir}/bg.jpg')"></div>`,
      tempDir
    )

    expect(result).toContain('url("data:image/jpeg;base64,')
  })

  it('embeds images in nested paths', async () => {
    await mkdir(join(tempDir, 'images'), { recursive: true })
    await writeFile(join(tempDir, 'images', 'hero.jpg'), Buffer.from('fake-jpg-data'))

    const result = await embedImages('<img src="images/hero.jpg" alt="hero" />', tempDir)

    expect(result).toContain('data:image/jpeg;base64,')
    expect(result).not.toContain('src="images/hero.jpg"')
  })

  it('handles multiple images in one HTML string', async () => {
    await writeFile(join(tempDir, 'a.png'), Buffer.from('aaa'))
    await writeFile(join(tempDir, 'b.png'), Buffer.from('bbb'))

    const result = await embedImages('<img src="a.png" /><img src="b.png" />', tempDir)

    expect(result).toContain(`data:image/png;base64,${Buffer.from('aaa').toString('base64')}`)
    expect(result).toContain(`data:image/png;base64,${Buffer.from('bbb').toString('base64')}`)
  })

  it('rewrites references only, never matching prose', async () => {
    await writeFile(join(tempDir, 'a.png'), Buffer.from('aaa'))

    const result = await embedImages('<p>see a.png</p><img src="a.png" />', tempDir)

    expect(result).toContain('<p>see a.png</p>')
    expect(result).toContain('data:image/png;base64,')
  })

  it('skips http/https URLs', async () => {
    const html = '<img src="https://example.com/photo.png" />'
    expect(await embedImages(html, tempDir)).toBe(html)
  })

  it('skips data URIs', async () => {
    const html = '<img src="data:image/png;base64,abc123" />'
    expect(await embedImages(html, tempDir)).toBe(html)
  })

  it('skips blob URLs', async () => {
    const html = '<img src="blob:http://localhost/abc" />'
    expect(await embedImages(html, tempDir)).toBe(html)
  })

  it('leaves references that escape the deck root untouched', async () => {
    const html = '<img src="../secret.png" />'
    expect(await embedImages(html, tempDir)).toBe(html)
  })

  it('leaves original src when file is not found', async () => {
    const result = await embedImages('<img src="missing.png" />', tempDir)
    expect(result).toContain('src="missing.png"')
  })

  it('skips files with unsupported extensions', async () => {
    await writeFile(join(tempDir, 'doc.pdf'), Buffer.from('pdf'))
    const result = await embedImages('<img src="doc.pdf" />', tempDir)
    expect(result).toContain('src="doc.pdf"')
  })

  it('handles single-quoted src attributes', async () => {
    await writeFile(join(tempDir, 'test.webp'), Buffer.from('single-quote-test'))
    const result = await embedImages("<img src='test.webp' />", tempDir)
    expect(result).toContain('data:image/webp;base64,')
  })

  it('handles all supported MIME types', async () => {
    const types = [
      { ext: 'png', mime: 'image/png' },
      { ext: 'jpg', mime: 'image/jpeg' },
      { ext: 'jpeg', mime: 'image/jpeg' },
      { ext: 'gif', mime: 'image/gif' },
      { ext: 'webp', mime: 'image/webp' },
      { ext: 'svg', mime: 'image/svg+xml' },
      { ext: 'bmp', mime: 'image/bmp' },
      { ext: 'ico', mime: 'image/x-icon' },
    ]

    for (const { ext, mime } of types) {
      await writeFile(join(tempDir, `test.${ext}`), Buffer.from(`${ext}-data`))
      const result = await embedImages(`<img src="test.${ext}" />`, tempDir)
      expect(result).toContain(`data:${mime};base64,`)
    }
  })
})

describe('readLocalStylesheets', () => {
  it('reads app stylesheets the page could not', async () => {
    await mkdir(join(tempDir, 'assets'), { recursive: true })
    await writeFile(join(tempDir, 'assets', 'index.css'), '.from-disk { color: red; }')

    const css = await readLocalStylesheets([`file://${tempDir}/assets/index.css`], tempDir)
    expect(css).toContain('.from-disk')
  })

  it('refuses stylesheets outside the renderer directory', async () => {
    const outside = join(tempDir, 'outside.css')
    await writeFile(outside, '.nope {}')
    const rendererRoot = join(tempDir, 'renderer')
    await mkdir(rendererRoot, { recursive: true })

    expect(await readLocalStylesheets([`file://${outside}`], rendererRoot)).toBe('')
  })

  it('ignores non-file URLs and missing files', async () => {
    const css = await readLocalStylesheets(
      ['https://cdn.example.com/a.css', `file://${join(tempDir, 'gone.css')}`],
      tempDir
    )
    expect(css).toBe('')
  })
})

describe('buildStandaloneHtml', () => {
  const page = {
    title: 'My <Deck>',
    css: '.slide-content { color: red; }',
    body: '<div id="lecta-export-root"><div class="export-slide">Slide 1</div></div>',
    slideCount: 1
  }

  it('produces a complete document with the captured DOM and CSS', () => {
    const html = buildStandaloneHtml(page)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>My &lt;Deck&gt;</title>')
    expect(html).toContain('.slide-content { color: red; }')
    expect(html).toContain('class="export-slide"')
  })

  it('adds keyboard navigation, fullscreen, notes and a counter', () => {
    const html = buildStandaloneHtml(page)
    expect(html).toContain('ArrowRight')
    expect(html).toContain('ArrowLeft')
    expect(html).toContain('requestFullscreen')
    expect(html).toContain('export-show-notes')
    expect(html).toContain('data-export-counter')
  })

  it('keeps the print geometry usable and makes no external requests', () => {
    const html = buildStandaloneHtml(page)
    expect(html).toContain('@media print')
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/<link[^>]+href=/)
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
  })
})

describe('PDF_PRINT_OPTIONS', () => {
  it('prints 13.333in x 7.5in landscape pages with backgrounds and no margins', () => {
    expect(PDF_PRINT_OPTIONS).toMatchObject({
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: { width: 13.333, height: 7.5 },
      margins: { marginType: 'none' }
    })
  })
})

/** Fake BrowserWindow: `mode` decides how the load resolves. */
let nextWebContentsId = 1
function fakeWindow(
  mode: 'ready' | 'finish' | 'fail' | 'hang',
  status: unknown = { ready: true, slideCount: 1 }
): ExportRenderWindow & { destroyed: boolean; printed: boolean; loaded: string | null; id: number } {
  const emitter = new EventEmitter()
  const id = nextWebContentsId++
  const win = {
    destroyed: false,
    printed: false,
    loaded: null as string | null,
    id,
    webContents: {
      id,
      once: (event: string, listener: (...args: any[]) => void) => emitter.once(event, listener),
      removeListener: (event: string, listener: (...args: any[]) => void) => emitter.removeListener(event, listener),
      printToPDF: async () => {
        win.printed = true
        return Buffer.from('%PDF-fake')
      },
      executeJavaScript: async () => status
    },
    loadFile: async (path: string, options?: { hash?: string }) => {
      win.loaded = `${path}${options?.hash ? `#${options.hash}` : ''}`
      finishLoad()
    },
    loadURL: async (url: string) => {
      win.loaded = url
      finishLoad()
    },
    destroy: () => { win.destroyed = true }
  }
  function finishLoad(): void {
    if (mode === 'fail') {
      setTimeout(() => emitter.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND'), 2)
      return
    }
    if (mode === 'hang') return
    setTimeout(() => emitter.emit('did-finish-load'), 2)
    // The export route signals once it has painted every slide.
    if (mode === 'ready') setTimeout(() => signalRenderReady(id), 6)
  }
  return win
}

const loadOptions = { rootPath: '/decks/demo', theme: 'dark', indexFile: '/app/out/renderer/index.html' }

describe('loadExportPage', () => {
  it('resolves as soon as the route signals export:render-ready', async () => {
    const win = fakeWindow('ready')
    await loadExportPage(win, { ...loadOptions, settleMs: 1, readyGraceMs: 5_000 })
    expect(win.loaded).toContain('/app/out/renderer/index.html')
    expect(win.loaded).toContain('#/export?deck=')
  })

  it('loads the dev server URL when one is configured', async () => {
    const win = fakeWindow('ready')
    await loadExportPage(win, { ...loadOptions, devUrl: 'http://localhost:5173', settleMs: 1, readyGraceMs: 5_000 })
    expect(win.loaded).toBe(`http://localhost:5173/#${buildExportHash(loadOptions)}`)
  })

  it('falls back to did-finish-load when the page never signals', async () => {
    const win = fakeWindow('finish')
    await loadExportPage(win, { ...loadOptions, settleMs: 1, readyGraceMs: 10 })
    expect(win.loaded).not.toBeNull()
  })

  it('rejects on did-fail-load', async () => {
    const win = fakeWindow('fail')
    await expect(
      loadExportPage(win, { ...loadOptions, settleMs: 1, readyGraceMs: 10 })
    ).rejects.toThrow(/failed to load slides \(-6: ERR_FILE_NOT_FOUND\)/)
  })

  it('rejects when the load never finishes within the timeout', async () => {
    const win = fakeWindow('hang')
    await expect(
      loadExportPage(win, { ...loadOptions, loadTimeoutMs: 20, settleMs: 1, readyGraceMs: 10 })
    ).rejects.toThrow(/timed out after 20 ms/)
  })

  it('ignores a render-ready signal for another window', async () => {
    const other = fakeWindow('hang')
    const win = fakeWindow('hang')
    signalRenderReady(other.webContents.id)
    await expect(
      loadExportPage(win, { ...loadOptions, loadTimeoutMs: 20, settleMs: 1, readyGraceMs: 10 })
    ).rejects.toThrow(/timed out/)
  })
})

describe('renderPdf', () => {
  it('prints after render-ready and destroys the window', async () => {
    const win = fakeWindow('ready')
    const pdf = await renderPdf(win, { ...loadOptions, settleMs: 1, readyGraceMs: 5_000 })
    expect(pdf.toString()).toBe('%PDF-fake')
    expect(win.printed).toBe(true)
    expect(win.destroyed).toBe(true)
  })

  it('rejects on did-fail-load and still destroys the window', async () => {
    const win = fakeWindow('fail')
    await expect(
      renderPdf(win, { ...loadOptions, settleMs: 1, readyGraceMs: 10 })
    ).rejects.toThrow(/failed to load slides \(-6: ERR_FILE_NOT_FOUND\)/)
    expect(win.printed).toBe(false)
    expect(win.destroyed).toBe(true)
  })

  it('rejects on timeout and still destroys the window', async () => {
    const win = fakeWindow('hang')
    await expect(
      renderPdf(win, { ...loadOptions, loadTimeoutMs: 20, settleMs: 1, readyGraceMs: 10 })
    ).rejects.toThrow(/timed out after 20 ms/)
    expect(win.printed).toBe(false)
    expect(win.destroyed).toBe(true)
  })

  it('surfaces a render failure reported by the export route', async () => {
    const win = fakeWindow('ready', { ready: true, slideCount: 0, error: 'No lecta.yaml found' })
    await expect(
      renderPdf(win, { ...loadOptions, settleMs: 1, readyGraceMs: 5_000 })
    ).rejects.toThrow(/No lecta.yaml found/)
    expect(win.printed).toBe(false)
    expect(win.destroyed).toBe(true)
  })

  it('refuses to print an empty deck', async () => {
    const win = fakeWindow('ready', { ready: true, slideCount: 0 })
    await expect(
      renderPdf(win, { ...loadOptions, settleMs: 1, readyGraceMs: 5_000 })
    ).rejects.toThrow(/no slides/i)
  })
})
