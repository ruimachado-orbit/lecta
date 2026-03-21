import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  toSlug,
  parsePresentationYaml,
  serializePresentationYaml,
  loadPresentation,
  savePresentationYaml,
  createPresentation,
  addSlide,
  editSlide,
  deleteSlide,
  listSlides,
  setTheme,
  getDefaultPresentationsPath,
  VALID_THEMES,
  VALID_LAYOUTS,
} from './presentation-io.js'

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

describe('VALID_THEMES', () => {
  it('includes expected themes', () => {
    expect(VALID_THEMES).toContain('dark')
    expect(VALID_THEMES).toContain('light')
    expect(VALID_THEMES).toContain('executive')
  })
})

describe('VALID_LAYOUTS', () => {
  it('includes expected layouts', () => {
    expect(VALID_LAYOUTS).toContain('default')
    expect(VALID_LAYOUTS).toContain('title')
    expect(VALID_LAYOUTS).toContain('two-col')
    expect(VALID_LAYOUTS).toContain('blank')
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

describe('serializePresentationYaml', () => {
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
    const serialized = serializePresentationYaml(parsed)
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
    const serialized = serializePresentationYaml(parsed)
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
    const serialized = serializePresentationYaml(parsed)
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
    const serialized = serializePresentationYaml(parsed)
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
