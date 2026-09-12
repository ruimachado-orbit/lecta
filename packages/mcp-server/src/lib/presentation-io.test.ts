import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  toSlug,
  toSafeSlug,
  expandHome,
  escapeMdx,
  assertPresentationDir,
  customizeTheme,
  loadPresentationConfig,
  registerInRecentDecks,
  loadDesignSystem,
  saveDesignElement,
  listSlideLibrary,
  saveSlideToLibrary,
  loadPresentation,
  savePresentationYaml,
  createPresentation,
  addSlide,
  editSlide,
  deleteSlide,
  listSlides,
  setTheme,
  getDefaultPresentationsPath,
} from './presentation-io.js'
import { SLIDE_LAYOUTS, SLIDE_THEMES } from '#shared/slide-options.js'
import { resolveRelativePath } from '#shared/utils/path-resolver.js'
import { parsePresentationYaml, serializePresentation } from '#shared/utils/yaml-parser.js'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'lecta-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

// ── Pure functions ──

describe('toSlug', () => {
  it('converts text to kebab-case', () => {
    expect(toSlug('Hello World')).toBe('hello-world')
  })

  it('strips special characters', () => {
    expect(toSlug('Hello, World! #2')).toBe('hello-world-2')
  })

  it('trims leading/trailing dashes', () => {
    expect(toSlug('  --Hello--  ')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(toSlug('')).toBe('')
  })

  it('collapses multiple separators', () => {
    expect(toSlug('a   b   c')).toBe('a-b-c')
  })
})

describe('getDefaultPresentationsPath', () => {
  it('returns a path containing Documents/Lecta', () => {
    const path = getDefaultPresentationsPath()
    expect(path).toContain('Documents')
    expect(path).toContain('Lecta')
  })
})

describe('SLIDE_THEMES', () => {
  it('includes expected themes', () => {
    expect(SLIDE_THEMES).toContain('dark')
    expect(SLIDE_THEMES).toContain('light')
    expect(SLIDE_THEMES).toContain('executive')
  })
})

describe('SLIDE_LAYOUTS', () => {
  it('includes expected layouts', () => {
    expect(SLIDE_LAYOUTS).toContain('default')
    expect(SLIDE_LAYOUTS).toContain('title')
    expect(SLIDE_LAYOUTS).toContain('two-col')
    expect(SLIDE_LAYOUTS).toContain('blank')
  })
})

// ── Parse & Serialize ──

describe('parsePresentationYaml', () => {
  it('parses valid YAML', () => {
    const yaml = `
title: Test
author: Author
theme: dark
slides:
  - id: s1
    content: slides/01-s1.md
    artifacts: []
`
    const result = parsePresentationYaml(yaml, '/root')
    expect(result.title).toBe('Test')
    expect(result.rootPath).toBe('/root')
    expect(result.slides).toHaveLength(1)
  })

  it('throws on invalid YAML', () => {
    expect(() => parsePresentationYaml('invalid: [', '/root')).toThrow()
  })
})

describe('serializePresentation', () => {
  it('roundtrips through parse and serialize', () => {
    const yaml = `
title: Roundtrip
author: Test
theme: light
slides:
  - id: intro
    content: slides/01-intro.md
    artifacts: []
`
    const parsed = parsePresentationYaml(yaml, '/root')
    const serialized = serializePresentation(parsed)
    const reparsed = parsePresentationYaml(serialized, '/root')
    expect(reparsed.title).toBe('Roundtrip')
    expect(reparsed.theme).toBe('light')
    expect(reparsed.slides).toHaveLength(1)
  })

  it('omits default values in output', () => {
    const yaml = `
title: Minimal
author: Test
slides:
  - id: s1
    content: slides/s1.md
    layout: default
    transition: none
    artifacts: []
`
    const parsed = parsePresentationYaml(yaml, '/root')
    const serialized = serializePresentation(parsed)
    // default layout and none transition should be omitted
    expect(serialized).not.toContain('layout:')
    expect(serialized).not.toContain('transition:')
  })

  it('includes lastViewedIndex only when > 0', () => {
    const yaml = `
title: Test
author: A
lastViewedIndex: 0
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
`
    const parsed = parsePresentationYaml(yaml, '/root')
    const serialized = serializePresentation(parsed)
    expect(serialized).not.toContain('lastViewedIndex')
  })

  it('includes groups and AI config', () => {
    const yaml = `
title: Full
author: A
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
ai:
  model: gpt-4o
groups:
  - id: g1
    name: Group 1
    slideIds: [s1]
    color: red
`
    const parsed = parsePresentationYaml(yaml, '/root')
    const serialized = serializePresentation(parsed)
    expect(serialized).toContain('ai:')
    expect(serialized).toContain('groups:')
    expect(serialized).toContain('color: red')
  })
})

// ── File I/O operations ──

async function createTestPresentation(rootPath: string, title = 'Test Deck') {
  await mkdir(join(rootPath, 'slides'), { recursive: true })
  await mkdir(join(rootPath, 'code'), { recursive: true })
  await writeFile(join(rootPath, 'slides', '01-intro.md'), '# Introduction\n\nWelcome!\n', 'utf-8')
  await writeFile(join(rootPath, 'slides', '02-content.md'), '# Content\n\nDetails here.\n', 'utf-8')
  const yaml = `
title: "${title}"
author: Tester
theme: dark
slides:
  - id: intro
    content: slides/01-intro.md
    artifacts: []
  - id: content
    content: slides/02-content.md
    artifacts: []
`
  await writeFile(join(rootPath, 'lecta.yaml'), yaml, 'utf-8')
}

describe('loadPresentation', () => {
  it('loads a valid presentation from disk', async () => {
    await createTestPresentation(tempDir)
    const loaded = await loadPresentation(tempDir)
    expect(loaded.config.title).toBe('Test Deck')
    expect(loaded.slides).toHaveLength(2)
    expect(loaded.slides[0].markdownContent).toContain('# Introduction')
    expect(loaded.slides[1].markdownContent).toContain('# Content')
    expect(loaded.slides[0].codeContent).toBeNull()
  })

  it('falls back to default content when markdown file is missing', async () => {
    await mkdir(join(tempDir, 'slides'), { recursive: true })
    const yaml = `
title: Missing Files
author: Test
slides:
  - id: ghost
    content: slides/nonexistent.md
    artifacts: []
`
    await writeFile(join(tempDir, 'lecta.yaml'), yaml, 'utf-8')
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].markdownContent).toBe('# ghost')
  })

  it('detects MDX files', async () => {
    await mkdir(join(tempDir, 'slides'), { recursive: true })
    await writeFile(join(tempDir, 'slides', '01-mdx.mdx'), '# MDX Slide\n\n<Component />\n', 'utf-8')
    const yaml = `
title: MDX Test
author: Test
slides:
  - id: mdx-slide
    content: slides/01-mdx.mdx
    artifacts: []
`
    await writeFile(join(tempDir, 'lecta.yaml'), yaml, 'utf-8')
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].isMdx).toBe(true)
  })

  it('loads code content when code block exists', async () => {
    await mkdir(join(tempDir, 'slides'), { recursive: true })
    await mkdir(join(tempDir, 'code'), { recursive: true })
    await writeFile(join(tempDir, 'slides', '01-code.md'), '# Code\n', 'utf-8')
    await writeFile(join(tempDir, 'code', 'demo.js'), 'console.log("hello")', 'utf-8')
    const yaml = `
title: Code Test
author: Test
slides:
  - id: code-slide
    content: slides/01-code.md
    code:
      file: code/demo.js
      language: javascript
      execution: sandpack
    artifacts: []
`
    await writeFile(join(tempDir, 'lecta.yaml'), yaml, 'utf-8')
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].codeContent).toBe('console.log("hello")')
    expect(loaded.slides[0].codeLanguage).toBe('javascript')
  })

  it('throws when lecta.yaml does not exist', async () => {
    await expect(loadPresentation(tempDir)).rejects.toThrow()
  })
})

describe('savePresentationYaml', () => {
  it('writes YAML to disk', async () => {
    await createTestPresentation(tempDir)
    const loaded = await loadPresentation(tempDir)
    loaded.config.title = 'Updated Title'
    await savePresentationYaml(loaded.config)
    const content = await readFile(join(tempDir, 'lecta.yaml'), 'utf-8')
    expect(content).toContain('Updated Title')
  })
})

describe('createPresentation', () => {
  it('creates a new presentation with defaults', async () => {
    const result = await createPresentation({
      path: tempDir,
      title: 'New Deck',
    })
    expect(result.slideCount).toBe(1)
    expect(result.rootPath).toContain('new-deck')

    const loaded = await loadPresentation(result.rootPath)
    expect(loaded.config.title).toBe('New Deck')
    expect(loaded.config.theme).toBe('dark')
    expect(loaded.slides).toHaveLength(1)
    expect(loaded.slides[0].config.layout).toBe('title')
  })

  it('creates multiple slides with custom titles', async () => {
    const result = await createPresentation({
      path: tempDir,
      title: 'Multi Slide',
      slideCount: 3,
      slideTitles: ['Intro', 'Middle', 'End'],
      theme: 'light',
      author: 'Test Author',
    })
    expect(result.slideCount).toBe(3)

    const loaded = await loadPresentation(result.rootPath)
    expect(loaded.config.theme).toBe('light')
    expect(loaded.config.author).toBe('Test Author')
    expect(loaded.slides[0].markdownContent).toContain('Multi Slide')
    expect(loaded.slides[0].markdownContent).toContain('Test Author')
  })

  it('clamps slide count to valid range', async () => {
    const result = await createPresentation({
      path: tempDir,
      title: 'Clamped',
      slideCount: 100,
    })
    expect(result.slideCount).toBe(50)
  })

  it('creates MDX format slides when specified', async () => {
    const result = await createPresentation({
      path: tempDir,
      title: 'MDX Deck',
      format: 'mdx',
    })
    const loaded = await loadPresentation(result.rootPath)
    expect(loaded.slides[0].config.content).toContain('.mdx')
    expect(loaded.slides[0].isMdx).toBe(true)
  })

  it('falls back to dark theme for invalid theme', async () => {
    const result = await createPresentation({
      path: tempDir,
      title: 'Bad Theme',
      theme: 'neon-rainbow',
    })
    const loaded = await loadPresentation(result.rootPath)
    expect(loaded.config.theme).toBe('dark')
  })
})

describe('addSlide', () => {
  it('appends a slide at the end', async () => {
    await createTestPresentation(tempDir)
    const result = await addSlide({
      rootPath: tempDir,
      content: '# New Slide\n\n- Point one\n',
    })
    expect(result.slideCount).toBe(3)
    expect(result.slideIndex).toBe(2)

    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[2].markdownContent).toContain('# New Slide')
  })

  it('inserts a slide at a specific index', async () => {
    await createTestPresentation(tempDir)
    const result = await addSlide({
      rootPath: tempDir,
      content: '# Middle\n',
      afterIndex: 0,
    })
    expect(result.slideIndex).toBe(1)
    expect(result.slideCount).toBe(3)
  })

  it('adds a slide with code block', async () => {
    await createTestPresentation(tempDir)
    await addSlide({
      rootPath: tempDir,
      slideId: 'code-demo',
      content: '# Code Demo\n',
      code: {
        content: 'print("hello")',
        language: 'python',
      },
    })
    const loaded = await loadPresentation(tempDir)
    const codeSlide = loaded.slides[loaded.slides.length - 1]
    expect(codeSlide.config.code?.language).toBe('python')
    expect(codeSlide.config.code?.execution).toBe('pyodide')
    expect(codeSlide.codeContent).toBe('print("hello")')
  })

  it('adds a slide with notes', async () => {
    await createTestPresentation(tempDir)
    await addSlide({
      rootPath: tempDir,
      content: '# With Notes\n',
      notes: 'Remember to mention X',
    })
    const loaded = await loadPresentation(tempDir)
    const last = loaded.slides[loaded.slides.length - 1]
    expect(last.notesContent).toBe('Remember to mention X')
  })

  it('auto-generates slug from heading', async () => {
    await createTestPresentation(tempDir)
    await addSlide({
      rootPath: tempDir,
      content: '# My Amazing Slide\n',
    })
    const loaded = await loadPresentation(tempDir)
    const last = loaded.slides[loaded.slides.length - 1]
    expect(last.config.id).toBe('my-amazing-slide')
  })
})

describe('editSlide', () => {
  it('updates slide content', async () => {
    await createTestPresentation(tempDir)
    await editSlide({
      rootPath: tempDir,
      slideIndex: 0,
      content: '# Updated Introduction\n\nNew content here.\n',
    })
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].markdownContent).toContain('Updated Introduction')
  })

  it('updates slide layout', async () => {
    await createTestPresentation(tempDir)
    await editSlide({
      rootPath: tempDir,
      slideIndex: 0,
      layout: 'center',
    })
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].config.layout).toBe('center')
  })

  it('removes layout when set to default', async () => {
    await createTestPresentation(tempDir)
    await editSlide({ rootPath: tempDir, slideIndex: 0, layout: 'title' })
    await editSlide({ rootPath: tempDir, slideIndex: 0, layout: 'default' })
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].config.layout).toBeUndefined()
  })

  it('updates transition', async () => {
    await createTestPresentation(tempDir)
    await editSlide({
      rootPath: tempDir,
      slideIndex: 0,
      transition: 'left',
    })
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].config.transition).toBe('left')
  })

  it('adds notes to a slide that had none', async () => {
    await createTestPresentation(tempDir)
    await editSlide({
      rootPath: tempDir,
      slideIndex: 0,
      notes: 'New speaker notes',
    })
    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides[0].notesContent).toBe('New speaker notes')
  })

  it('throws for invalid slide index', async () => {
    await createTestPresentation(tempDir)
    await expect(editSlide({
      rootPath: tempDir,
      slideIndex: 99,
    })).rejects.toThrow('not found')
  })
})

describe('deleteSlide', () => {
  it('deletes a slide by index', async () => {
    await createTestPresentation(tempDir)
    const result = await deleteSlide(tempDir, 0)
    expect(result.deletedId).toBe('intro')
    expect(result.slideCount).toBe(1)

    const loaded = await loadPresentation(tempDir)
    expect(loaded.slides).toHaveLength(1)
    expect(loaded.slides[0].config.id).toBe('content')
  })

  it('cannot delete the last slide', async () => {
    await createTestPresentation(tempDir)
    await deleteSlide(tempDir, 0) // Delete first, now only 1 remains
    await expect(deleteSlide(tempDir, 0)).rejects.toThrow('last slide')
  })

  it('throws for invalid index', async () => {
    await createTestPresentation(tempDir)
    await expect(deleteSlide(tempDir, 99)).rejects.toThrow('not found')
  })
})

describe('listSlides', () => {
  it('lists slides without content', async () => {
    await createTestPresentation(tempDir)
    const result = await listSlides(tempDir)
    expect(result.title).toBe('Test Deck')
    expect(result.slideCount).toBe(2)
    expect(result.slides).toHaveLength(2)
    expect(result.slides[0].id).toBe('intro')
    expect(result.slides[0].heading).toBe('Introduction')
    expect(result.slides[0].content).toBeUndefined()
  })

  it('lists slides with content when requested', async () => {
    await createTestPresentation(tempDir)
    const result = await listSlides(tempDir, true)
    expect(result.slides[0].content).toContain('# Introduction')
    expect(result.slides[1].content).toContain('# Content')
  })
})

describe('setTheme', () => {
  it('changes the theme', async () => {
    await createTestPresentation(tempDir)
    const result = await setTheme(tempDir, 'light')
    expect(result.oldTheme).toBe('dark')
    expect(result.newTheme).toBe('light')

    const loaded = await loadPresentation(tempDir)
    expect(loaded.config.theme).toBe('light')
  })

  it('throws for invalid theme', async () => {
    await createTestPresentation(tempDir)
    await expect(setTheme(tempDir, 'neon')).rejects.toThrow('Invalid theme')
  })
})

// ── Regression tests for the review findings (A1 #13/#14, A2 #26, A3 #33/#34) ──

describe('toSlug — Unicode', () => {
  it('keeps letters and numbers from non-Latin scripts', () => {
    expect(toSlug('日本語のスライド')).toBe('日本語のスライド')
    expect(toSlug('Привет мир')).toBe('привет-мир')
    expect(toSlug('Über Café 2')).toBe('über-café-2')
  })

  it('still collapses punctuation and whitespace to single dashes', () => {
    expect(toSlug('Hello — World!!')).toBe('hello-world')
  })
})

describe('toSafeSlug', () => {
  it('returns the plain slug when there is one', () => {
    expect(toSafeSlug('Hello World')).toBe('hello-world')
  })

  it('never returns an empty string for un-sluggable text', () => {
    expect(toSafeSlug('🎉🎉🎉')).not.toBe('')
    expect(toSafeSlug('!!!')).not.toBe('')
    expect(toSafeSlug('')).toBe('untitled')
  })

  it('is deterministic for the same input', () => {
    expect(toSafeSlug('🎉')).toBe(toSafeSlug('🎉'))
  })

  it('caps very long slugs', () => {
    expect(toSafeSlug('a'.repeat(300)).length).toBeLessThanOrEqual(60)
  })
})

describe('expandHome', () => {
  it('expands a leading ~', () => {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    expect(expandHome('~/Documents/Lecta')).toBe(join(home, 'Documents', 'Lecta'))
    expect(expandHome('~')).toBe(home)
  })

  it('leaves other paths alone', () => {
    expect(expandHome('/tmp/deck')).toBe('/tmp/deck')
    expect(expandHome('relative/deck')).toBe('relative/deck')
    expect(expandHome('~notahome/deck')).toBe('~notahome/deck')
  })
})

describe('escapeMdx', () => {
  it('escapes the characters that break MDX', () => {
    expect(escapeMdx('a {b} c')).toBe('a &#123;b&#125; c')
    expect(escapeMdx('<script>')).toBe('&lt;script&gt;')
    expect(escapeMdx('say "hi"')).toBe('say &quot;hi&quot;')
    expect(escapeMdx('A & B')).toBe('A &amp; B')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeMdx('Quarterly Review 2026')).toBe('Quarterly Review 2026')
  })
})

describe('resolveRelativePath', () => {
  it('resolves paths inside the deck', () => {
    expect(resolveRelativePath('/deck', 'slides/01.md')).toBe('/deck/slides/01.md')
  })

  it('rejects escaping paths', () => {
    expect(() => resolveRelativePath('/deck', '../../etc/passwd')).toThrow('Path traversal detected')
    expect(() => resolveRelativePath('/deck', '/etc/passwd')).toThrow('Path traversal detected')
  })

  it('allows names that merely start with dots', () => {
    expect(resolveRelativePath('/deck', 'slides/..notes.md')).toBe('/deck/slides/..notes.md')
  })
})

describe('assertPresentationDir', () => {
  it('accepts a folder containing lecta.yaml', async () => {
    await createTestPresentation(tempDir)
    await expect(assertPresentationDir(tempDir)).resolves.toBe(tempDir)
  })

  it('rejects a folder without lecta.yaml with an actionable message', async () => {
    await expect(assertPresentationDir(tempDir)).rejects.toThrow(/not a Lecta presentation/)
  })
})

describe('tools reject a path that is not a presentation', () => {
  it('addSlide, listSlides, editSlide and deleteSlide all refuse', async () => {
    await expect(addSlide({ rootPath: tempDir, content: '# Hi' })).rejects.toThrow(/not a Lecta presentation/)
    await expect(listSlides(tempDir)).rejects.toThrow(/not a Lecta presentation/)
    await expect(editSlide({ rootPath: tempDir, slideIndex: 0 })).rejects.toThrow(/not a Lecta presentation/)
    await expect(deleteSlide(tempDir, 0)).rejects.toThrow(/not a Lecta presentation/)
  })
})

describe('loadPresentation — path confinement', () => {
  it('refuses a manifest whose content path escapes the deck', async () => {
    await writeFile(join(tempDir, 'lecta.yaml'), `
title: Nosy
author: Test
slides:
  - id: leak
    content: ../../../etc/passwd
    artifacts: []
`, 'utf-8')
    await expect(loadPresentation(tempDir)).rejects.toThrow()
  })

  it('refuses a manifest whose notes path escapes the deck', async () => {
    await writeFile(join(tempDir, 'lecta.yaml'), `
title: Nosy
author: Test
slides:
  - id: leak
    content: slides/01.md
    notes: ../../.zshrc
    artifacts: []
`, 'utf-8')
    await expect(loadPresentation(tempDir)).rejects.toThrow()
  })
})

describe('addSlide — ids and file names', () => {
  it('names the code file after the generated slide id, not "undefined"', async () => {
    await createTestPresentation(tempDir)
    await addSlide({
      rootPath: tempDir,
      content: '# Demo Slide\n',
      format: 'md',
      code: { content: 'console.log(1)', language: 'javascript' },
    })
    const config = await loadPresentation(tempDir)
    const added = config.config.slides[2]
    expect(added.code?.file).toBe('code/demo-slide.js')
    expect(added.code?.file).not.toContain('undefined')
    expect(await readFile(join(tempDir, added.code!.file), 'utf-8')).toBe('console.log(1)')
  })

  it('gives two same-language code slides distinct files', async () => {
    await createTestPresentation(tempDir)
    await addSlide({ rootPath: tempDir, content: '# One\n', format: 'md', code: { content: 'a', language: 'python' } })
    await addSlide({ rootPath: tempDir, content: '# Two\n', format: 'md', code: { content: 'b', language: 'python' } })
    const { config } = await loadPresentation(tempDir)
    const files = config.slides.slice(2).map((s) => s.code!.file)
    expect(new Set(files).size).toBe(2)
    expect(await readFile(join(tempDir, files[0]), 'utf-8')).toBe('a')
    expect(await readFile(join(tempDir, files[1]), 'utf-8')).toBe('b')
  })

  it('dedupes slide ids instead of overwriting an existing slide', async () => {
    await createTestPresentation(tempDir)
    await addSlide({ rootPath: tempDir, content: '# Introduction\n', format: 'md' })
    await addSlide({ rootPath: tempDir, content: '# Introduction\n', format: 'md' })
    const { config } = await loadPresentation(tempDir)
    const ids = config.slides.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('introduction')
    expect(ids).toContain('introduction-2')
  })

  it('does not reuse a slide file name after a delete', async () => {
    await createTestPresentation(tempDir)
    await addSlide({ rootPath: tempDir, content: '# Third\n', format: 'md' })
    await deleteSlide(tempDir, 2)
    // The manifest is back to 2 slides, so the naive `slides/03-…` name is free again —
    // but the file from the deleted slide is still on disk and must not be clobbered.
    const before = await readFile(join(tempDir, 'slides', '03-third.md'), 'utf-8')
    await addSlide({ rootPath: tempDir, content: '# Third\n', format: 'md' })
    expect(await readFile(join(tempDir, 'slides', '03-third.md'), 'utf-8')).toBe(before)
    const { config } = await loadPresentation(tempDir)
    expect(config.slides[2].content).not.toBe('slides/03-third.md')
  })

  it('gives a non-Latin title a usable id and file', async () => {
    await createTestPresentation(tempDir)
    await addSlide({ rootPath: tempDir, content: '# 日本語のスライド\n', format: 'md' })
    const { config } = await loadPresentation(tempDir)
    const added = config.slides[2]
    expect(added.id).toBe('日本語のスライド')
    expect(added.content).toContain('日本語のスライド')
  })
})

describe('createPresentation — folder naming', () => {
  it('refuses a title that slugs to nothing rather than writing into the parent', async () => {
    const { rootPath } = await createPresentation({ path: tempDir, title: '!!!  ' })
    // The deck must land in a subfolder, never turn the parent into the deck.
    expect(rootPath).not.toBe(tempDir)
    const entries = await readdir(tempDir)
    expect(entries).toEqual([rootPath.split('/').pop()])
    expect((await stat(rootPath)).isDirectory()).toBe(true)
    expect(await readFile(join(rootPath, 'lecta.yaml'), 'utf-8')).toContain('title:')
  })

  it('escapes MDX-hostile characters in the generated title slide', async () => {
    const { rootPath } = await createPresentation({
      path: tempDir,
      title: 'A <b> {x} "quoted" talk',
      author: 'Ada & Co <ada@example.com>',
      format: 'mdx',
    })
    const first = await readFile(join(rootPath, 'slides', '01-a-b-x-quoted-talk.mdx'), 'utf-8')
    expect(first).toContain('&lt;b&gt;')
    expect(first).toContain('&#123;x&#125;')
    expect(first).toContain('&quot;quoted&quot;')
    expect(first).toContain('Ada &amp; Co')
    // The only remaining braces are the JSX style expressions the template writes itself.
    expect(first).not.toMatch(/>[^<]*\{x\}/)
  })
})

describe('editSlide — code_content without a code block', () => {
  it('errors instead of silently dropping the edit', async () => {
    await createTestPresentation(tempDir)
    await expect(
      editSlide({ rootPath: tempDir, slideIndex: 0, codeContent: 'print(1)' })
    ).rejects.toThrow(/no code block/)
  })

  it('still writes code_content when the slide has a code block', async () => {
    await createTestPresentation(tempDir)
    await addSlide({ rootPath: tempDir, content: '# Coded\n', format: 'md', code: { content: 'old', language: 'python' } })
    await editSlide({ rootPath: tempDir, slideIndex: 2, codeContent: 'new' })
    const { config } = await loadPresentation(tempDir)
    expect(await readFile(join(tempDir, config.slides[2].code!.file), 'utf-8')).toBe('new')
  })
})

describe('customizeTheme', () => {
  it('reports that the app does not support it instead of pretending success', async () => {
    await createTestPresentation(tempDir)
    await expect(customizeTheme({ rootPath: tempDir, accentColor: '#ff0000' }))
      .rejects.toThrow(/not supported by the Lecta app yet/)
    // Nothing was written to the manifest.
    expect(await readFile(join(tempDir, 'lecta.yaml'), 'utf-8')).not.toContain('customStyles')
  })
})

describe('serializePresentation — unknown keys', () => {
  it('round-trips top-level keys the schema does not know', async () => {
    await writeFile(join(tempDir, 'lecta.yaml'), `
title: Extras
author: Test
theme: dark
customBranding:
  logo: images/logo.png
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
`, 'utf-8')
    const config = await loadPresentationConfig(tempDir)
    const yaml = serializePresentation(config)
    expect(yaml).toContain('customBranding')
    expect(yaml).toContain('images/logo.png')
    expect(yaml).not.toContain('rootPath')
  })
})

/** Same layout as getLectaSettingsPath()/getDesignSystemPath() in presentation-io.ts. */
function lectaDataDir(home: string): string {
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Lecta')
  if (process.platform === 'win32') return join(home, 'AppData', 'Roaming', 'Lecta')
  return join(home, '.config', 'Lecta')
}

describe('JSON side-cars never rewrite a file they could not parse', () => {
  let realHome: string | undefined
  let realAppData: string | undefined
  let dataDir: string

  beforeEach(async () => {
    realHome = process.env.HOME
    realAppData = process.env.APPDATA
    process.env.HOME = tempDir
    process.env.APPDATA = join(tempDir, 'AppData', 'Roaming')
    dataDir = lectaDataDir(tempDir)
    await mkdir(dataDir, { recursive: true })
  })

  afterEach(() => {
    if (realHome === undefined) delete process.env.HOME
    else process.env.HOME = realHome
    if (realAppData === undefined) delete process.env.APPDATA
    else process.env.APPDATA = realAppData
  })

  it('leaves a corrupt settings.json alone instead of wiping the user\'s keys', async () => {
    const settingsPath = join(dataDir, 'settings.json')
    const corrupt = '{ "anthropicApiKey": "sk-secret", "recentDecks": [ '
    await writeFile(settingsPath, corrupt, 'utf-8')

    await expect(registerInRecentDecks(tempDir, 'Deck', 1, '# Deck')).rejects.toThrow(/not valid JSON/)
    expect(await readFile(settingsPath, 'utf-8')).toBe(corrupt)
  })

  it('starts fresh when settings.json does not exist yet', async () => {
    await registerInRecentDecks(join(tempDir, 'deck'), 'Deck', 1, '# Deck')
    const written = JSON.parse(await readFile(join(dataDir, 'settings.json'), 'utf-8'))
    expect(written.recentDecks).toHaveLength(1)
    expect(written.recentDecks[0].title).toBe('Deck')
  })

  it('preserves unrelated settings keys when appending a recent deck', async () => {
    await writeFile(
      join(dataDir, 'settings.json'),
      JSON.stringify({ anthropicApiKey: 'sk-secret', theme: 'light' }),
      'utf-8'
    )
    await registerInRecentDecks(join(tempDir, 'deck'), 'Deck', 1, '# Deck')
    const written = JSON.parse(await readFile(join(dataDir, 'settings.json'), 'utf-8'))
    expect(written.anthropicApiKey).toBe('sk-secret')
    expect(written.theme).toBe('light')
    expect(written.recentDecks).toHaveLength(1)
  })

  it('leaves a corrupt design-system.json alone', async () => {
    const dsPath = join(dataDir, 'design-system.json')
    const corrupt = '{ "elements": [ {'
    await writeFile(dsPath, corrupt, 'utf-8')

    await expect(loadDesignSystem()).rejects.toThrow(/not valid JSON/)
    await expect(saveDesignElement({
      name: 'Card', category: 'component', description: 'x', content: '<div/>', tags: [],
    })).rejects.toThrow(/not valid JSON/)
    expect(await readFile(dsPath, 'utf-8')).toBe(corrupt)
  })

  it('leaves a corrupt slide-library.json alone', async () => {
    const libPath = join(dataDir, 'slide-library.json')
    const corrupt = '[ { "id": "s1"'
    await writeFile(libPath, corrupt, 'utf-8')

    await expect(listSlideLibrary()).rejects.toThrow(/not valid JSON/)
    await expect(saveSlideToLibrary({ name: 'S', markdown: '# S' })).rejects.toThrow(/not valid JSON/)
    expect(await readFile(libPath, 'utf-8')).toBe(corrupt)
  })

  it('writes side-cars without leaving temp files behind', async () => {
    await saveSlideToLibrary({ name: 'S', markdown: '# S' })
    const files = await readdir(dataDir)
    expect(files).toEqual(['slide-library.json'])
  })
})

// ── The lecta.yaml contract ──
//
// This server writes decks with the app's serializer — `serializePresentation` from
// packages/shared — and this fixture is a byte-for-byte copy of the one in
// `packages/shared/src/utils/yaml-parser.test.ts`. A deck written by the server and a
// deck written by the app have to be indistinguishable, so if one of the two copies
// starts failing, the packages have forked again — fix the fork, do not fork the fixture.

/** Exercises every branch of the serializer: defaults, extras and every optional block. */
const CONTRACT_YAML = `title: Shared Contract
author: Lecta
theme: executive
lastViewedIndex: 2
customBranding:
  logo: images/logo.png
slides:
  - id: intro
    title: Intro
    content: slides/01-intro.mdx
    layout: title
    transition: left
    artifacts: []
  - id: demo
    content: slides/02-demo.md
    layout: default
    transition: none
    prompts: []
    notes: slides/02-demo.notes.md
    skipped: true
    background:
      color: "#0a0e1a"
      overlay: 40
    code:
      file: code/demo.py
      language: python
      execution: pyodide
    artifacts:
      - path: artifacts/handout.pdf
        label: Handout
ai:
  model: claude-sonnet-4
groups:
  - id: g1
    name: Act I
    slideIds:
      - intro
    color: "#ff6b35"
presenterNotes: Breathe.
`

/**
 * What `serializePresentation` must produce for `CONTRACT_YAML`. Note the second slide:
 * `layout: default`, `transition: none` and the empty `prompts` list are dropped, while
 * the unknown top-level `customBranding` survives, moved below the keys the serializer
 * writes itself.
 */
const CONTRACT_YAML_SERIALIZED = `title: Shared Contract
author: Lecta
theme: executive
lastViewedIndex: 2
slides:
  - id: intro
    title: Intro
    content: slides/01-intro.mdx
    artifacts: []
    transition: left
    layout: title
  - id: demo
    content: slides/02-demo.md
    code:
      file: code/demo.py
      language: python
      execution: pyodide
    artifacts:
      - path: artifacts/handout.pdf
        label: Handout
    notes: slides/02-demo.notes.md
    skipped: true
    background:
      color: "#0a0e1a"
      overlay: 40
ai:
  model: claude-sonnet-4
groups:
  - id: g1
    name: Act I
    slideIds:
      - intro
    color: "#ff6b35"
presenterNotes: Breathe.
customBranding:
  logo: images/logo.png
`

describe('lecta.yaml contract (byte-identical in the app and the MCP server)', () => {
  it('serializes the fixture deck byte for byte', () => {
    const parsed = parsePresentationYaml(CONTRACT_YAML, '/decks/contract')
    expect(serializePresentation(parsed)).toBe(CONTRACT_YAML_SERIALIZED)
  })

  it('drops slide keys that carry their default value', () => {
    const parsed = parsePresentationYaml(CONTRACT_YAML, '/decks/contract')
    const [, demo] = serializePresentation(parsed).split('  - id: demo')
    // The unknown-key passthrough must not put the omitted defaults back.
    expect(demo).not.toContain('layout: default')
    expect(demo).not.toContain('transition: none')
    expect(demo).not.toContain('prompts:')
  })

  it('is idempotent — serializing the output again changes nothing', () => {
    const once = serializePresentation(parsePresentationYaml(CONTRACT_YAML, '/decks/contract'))
    expect(serializePresentation(parsePresentationYaml(once, '/decks/contract'))).toBe(once)
  })
})
