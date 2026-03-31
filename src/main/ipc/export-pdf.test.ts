import { writeFile, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildPdfHtml, buildSpaHtml, embedImages } from './export-pdf'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-export-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('buildPdfHtml', () => {
  it('wraps slides in a valid HTML document', () => {
    const html = buildPdfHtml(['<div>Slide 1</div>'], 'Test Deck')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>Test Deck</title>')
    expect(html).toContain('<div>Slide 1</div>')
  })

  it('sets page size to 1280x720', () => {
    const html = buildPdfHtml([], 'Test')
    expect(html).toContain('size: 1280px 720px')
  })

  it('enables print-color-adjust', () => {
    const html = buildPdfHtml([], 'Test')
    expect(html).toContain('print-color-adjust: exact')
    expect(html).toContain('-webkit-print-color-adjust: exact')
  })

  it('does not hardcode background or text colors', () => {
    const html = buildPdfHtml(['<div>Content</div>'], 'Test')
    // body and .slide should not force colors
    expect(html).not.toMatch(/body\s*\{[^}]*background:\s*#000/)
    expect(html).not.toMatch(/body\s*\{[^}]*color:\s*#fff/)
    expect(html).not.toMatch(/\.slide\s*\{[^}]*background:\s*#000/)
  })

  it('does not add padding to .slide (inline styles handle it)', () => {
    const html = buildPdfHtml(['<div>Content</div>'], 'Test')
    expect(html).not.toMatch(/\.slide\s*\{[^}]*padding/)
  })

  it('preserves inline styles from slide content', () => {
    const slideHtml = '<div style="background:#EEEEEE;color:#434343;">Styled content</div>'
    const html = buildPdfHtml([slideHtml], 'Test')
    expect(html).toContain('background:#EEEEEE')
    expect(html).toContain('color:#434343')
  })

  it('adds page-break-before on second slide onwards', () => {
    const html = buildPdfHtml(['<div>S1</div>', '<div>S2</div>', '<div>S3</div>'], 'Test')
    const slides = html.match(/<div class="slide"/g)
    expect(slides).toHaveLength(3)
    // First slide: no page-break
    expect(html).toMatch(/<div class="slide" >/)
    // Subsequent slides: page-break
    expect(html).toContain('page-break-before: always;')
  })
})

describe('buildSpaHtml', () => {
  it('produces a valid HTML SPA with title', () => {
    const html = buildSpaHtml([{ content: '# Hello', isPreRendered: false }], 'My Deck', 'dark')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>My Deck</title>')
  })

  it('embeds slide data as JSON in a script tag', () => {
    const slides = [{ content: '<div>Pre-rendered</div>', isPreRendered: true }]
    const html = buildSpaHtml(slides, 'Test', 'dark')
    expect(html).toContain(JSON.stringify(slides))
  })

  it('applies light theme styles', () => {
    const html = buildSpaHtml([], 'Test', 'light')
    expect(html).toContain('background: #f8fafc')
    expect(html).toContain('background: #ffffff')
  })

  it('applies dark theme styles', () => {
    const html = buildSpaHtml([], 'Test', 'dark')
    expect(html).toContain('background: #0a0a0a')
    expect(html).toContain('background: #0f172a')
  })

  it('includes navigation controls', () => {
    const html = buildSpaHtml([], 'Test', 'dark')
    expect(html).toContain('onclick="prev()"')
    expect(html).toContain('onclick="next()"')
  })

  it('includes keyboard navigation', () => {
    const html = buildSpaHtml([], 'Test', 'dark')
    expect(html).toContain('ArrowRight')
    expect(html).toContain('ArrowLeft')
  })
})

describe('embedImages', () => {
  it('returns html unchanged when there are no images', async () => {
    const html = '<div>No images here</div>'
    const result = await embedImages(html, tempDir)
    expect(result).toBe(html)
  })

  it('embeds a local PNG as a base64 data URI', async () => {
    const imgData = Buffer.from('fake-png-data')
    await writeFile(join(tempDir, 'photo.png'), imgData)

    const html = '<img src="photo.png" />'
    const result = await embedImages(html, tempDir)

    const expected = `data:image/png;base64,${imgData.toString('base64')}`
    expect(result).toContain(expected)
    expect(result).not.toContain('src="photo.png"')
  })

  it('embeds images in nested paths', async () => {
    const { mkdir } = await import('fs/promises')
    await mkdir(join(tempDir, 'images'), { recursive: true })
    const imgData = Buffer.from('fake-jpg-data')
    await writeFile(join(tempDir, 'images', 'hero.jpg'), imgData)

    const html = '<img src="images/hero.jpg" alt="hero" />'
    const result = await embedImages(html, tempDir)

    expect(result).toContain('data:image/jpeg;base64,')
    expect(result).not.toContain('src="images/hero.jpg"')
  })

  it('handles multiple images in one HTML string', async () => {
    await writeFile(join(tempDir, 'a.png'), Buffer.from('aaa'))
    await writeFile(join(tempDir, 'b.png'), Buffer.from('bbb'))

    const html = '<img src="a.png" /><img src="b.png" />'
    const result = await embedImages(html, tempDir)

    expect(result).toContain(`data:image/png;base64,${Buffer.from('aaa').toString('base64')}`)
    expect(result).toContain(`data:image/png;base64,${Buffer.from('bbb').toString('base64')}`)
  })

  it('skips http/https URLs', async () => {
    const html = '<img src="https://example.com/photo.png" />'
    const result = await embedImages(html, tempDir)
    expect(result).toBe(html)
  })

  it('skips data URIs', async () => {
    const html = '<img src="data:image/png;base64,abc123" />'
    const result = await embedImages(html, tempDir)
    expect(result).toBe(html)
  })

  it('skips blob URLs', async () => {
    const html = '<img src="blob:http://localhost/abc" />'
    const result = await embedImages(html, tempDir)
    expect(result).toBe(html)
  })

  it('leaves original src when file is not found', async () => {
    const html = '<img src="missing.png" />'
    const result = await embedImages(html, tempDir)
    expect(result).toContain('src="missing.png"')
  })

  it('skips files with unsupported extensions', async () => {
    await writeFile(join(tempDir, 'doc.pdf'), Buffer.from('pdf'))

    const html = '<img src="doc.pdf" />'
    const result = await embedImages(html, tempDir)
    expect(result).toContain('src="doc.pdf"')
  })

  it('handles single-quoted src attributes', async () => {
    const imgData = Buffer.from('single-quote-test')
    await writeFile(join(tempDir, 'test.webp'), imgData)

    const html = "<img src='test.webp' />"
    const result = await embedImages(html, tempDir)

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
      const html = `<img src="test.${ext}" />`
      const result = await embedImages(html, tempDir)
      expect(result).toContain(`data:${mime};base64,`)
    }
  })
})
