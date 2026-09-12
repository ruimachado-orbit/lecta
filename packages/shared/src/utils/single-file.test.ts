import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  folderToSingleFile,
  materializeToFolder,
  parseSingleFileDeck,
  toSafeSlug,
  type MaterializedFile,
  type SingleFileSlideSource,
} from './single-file.js'
import { parsePresentationYaml } from './yaml-parser.js'
import { defaultEngineForLanguage } from '../slide-options.js'

const FULL = `---
title: My Talk
author: Me
theme: executive
---
# Slide one

Body…

---
layout: two-col
---
# Slide two

\`\`\`python file=demo.py execution=pyodide packages=[numpy]
print("hi")
\`\`\`

<!-- notes -->
Speaker notes here
`

function fileFor(files: MaterializedFile[], path: string): MaterializedFile {
  const found = files.find((f) => f.relativePath === path)
  if (!found) throw new Error(`No materialized file ${path} in ${files.map((f) => f.relativePath).join(', ')}`)
  return found
}

describe('parseSingleFileDeck — frontmatter', () => {
  it('reads title, author and theme from the first block', () => {
    const { config } = parseSingleFileDeck(FULL)
    expect(config).toMatchObject({ title: 'My Talk', author: 'Me', theme: 'executive' })
  })

  it('treats only the FIRST block as frontmatter', () => {
    const { config, slides } = parseSingleFileDeck(FULL)
    expect(config).not.toHaveProperty('layout')
    expect(slides).toHaveLength(2)
    expect(slides[1].layout).toBe('two-col')
  })

  it('falls back to the first heading and the default theme without frontmatter', () => {
    const { config, slides } = parseSingleFileDeck('# Only Slide\n\nhello\n')
    expect(config).toEqual({ title: 'Only Slide', author: '', theme: 'dark' })
    expect(slides).toHaveLength(1)
  })

  it('falls back to Untitled when there is no heading anywhere', () => {
    expect(parseSingleFileDeck('just words\n').config.title).toBe('Untitled')
  })

  it('warns and falls back for an unknown theme', () => {
    const { config, warnings } = parseSingleFileDeck('---\ntitle: T\ntheme: neon\n---\n# A\n')
    expect(config.theme).toBe('dark')
    expect(warnings.join(' ')).toMatch(/neon/)
  })

  it('carries unknown frontmatter keys through to the manifest', () => {
    const parsed = parseSingleFileDeck('---\ntitle: T\ncustomKey: keep me\n---\n# A\n')
    expect((parsed.config as unknown as Record<string, unknown>).customKey).toBe('keep me')
    const { files } = materializeToFolder('/deck', parsed)
    expect(fileFor(files, 'lecta.yaml').content).toContain('customKey: keep me')
  })

  it('ignores a frontmatter `slides` key rather than fighting the generated one', () => {
    const parsed = parseSingleFileDeck('---\ntitle: T\nslides: [nope]\n---\n# A\n')
    expect(parsed.warnings.join(' ')).toMatch(/slides/)
    expect(parsed.slides).toHaveLength(1)
  })

  it('does not treat a leading thematic break as frontmatter when nothing closes it', () => {
    const { config, slides } = parseSingleFileDeck('---\n# A\n')
    expect(config.title).toBe('A')
    expect(slides).toHaveLength(1)
  })

  it('accepts a deck that is frontmatter only', () => {
    const { config, slides } = parseSingleFileDeck('---\ntitle: Empty\n---\n')
    expect(config.title).toBe('Empty')
    expect(slides).toEqual([])
  })
})

describe('parseSingleFileDeck — separators', () => {
  it('splits on a line that is exactly ---', () => {
    const { slides } = parseSingleFileDeck('# A\n\n---\n\n# B\n\n---\n\n# C\n')
    expect(slides.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('does NOT split on ---- (sub-slide separator) or longer runs', () => {
    const { slides } = parseSingleFileDeck('# A\n\n----\n\nstill A\n\n-----\n\nstill A\n')
    expect(slides).toHaveLength(1)
    expect(slides[0].markdown).toContain('----')
    expect(slides[0].markdown).toContain('still A')
  })

  it('does not split on an indented --- or one with other text on the line', () => {
    const { slides } = parseSingleFileDeck('# A\n\n  ---\n\n--- x\n')
    expect(slides).toHaveLength(1)
  })

  it('does not split on --- inside a fenced code block', () => {
    const source = ['# A', '', '```yaml', 'a: 1', '---', 'b: 2', '```', '', '---', '', '# B'].join('\n')
    const { slides } = parseSingleFileDeck(source)
    expect(slides).toHaveLength(2)
    expect(slides[0].markdown).toContain('---\nb: 2')
  })

  it('drops blank blocks instead of emitting empty slides', () => {
    const { slides } = parseSingleFileDeck('# A\n\n---\n\n---\n\n# B\n')
    expect(slides.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('handles CRLF line endings', () => {
    const { config, slides } = parseSingleFileDeck(
      '---\r\ntitle: CRLF\r\n---\r\n# A\r\n\r\n---\r\nlayout: center\r\n---\r\n# B\r\n'
    )
    expect(config.title).toBe('CRLF')
    expect(slides.map((s) => s.id)).toEqual(['a', 'b'])
    expect(slides[1].layout).toBe('center')
    expect(slides[0].markdown).not.toContain('\r')
  })

  it('strips a BOM', () => {
    expect(parseSingleFileDeck('﻿---\ntitle: BOM\n---\n# A\n').config.title).toBe('BOM')
  })
})

describe('parseSingleFileDeck — per-slide option blocks', () => {
  it('applies layout, transition and skip to the following slide', () => {
    const { slides } = parseSingleFileDeck(
      '# A\n\n---\nlayout: quote\ntransition: left\nskip: true\n---\n# B\n'
    )
    expect(slides).toHaveLength(2)
    expect(slides[1]).toMatchObject({ layout: 'quote', transition: 'left', skipped: true })
    expect(slides[0].layout).toBeUndefined()
  })

  it('accepts an options block before the very first slide', () => {
    const { slides } = parseSingleFileDeck('---\ntitle: T\n---\n---\nlayout: title\n---\n# Hello\n')
    expect(slides).toHaveLength(1)
    expect(slides[0]).toMatchObject({ id: 'hello', layout: 'title' })
  })

  it('takes an explicit id and title', () => {
    const { slides } = parseSingleFileDeck('---\ntitle: Deck\n---\n---\nid: custom-id\ntitle: Nice Title\n---\n# Heading\n')
    expect(slides[0]).toMatchObject({ id: 'custom-id', title: 'Nice Title' })
  })

  it('supports notes given in the options block', () => {
    const { slides } = parseSingleFileDeck('---\ntitle: Deck\n---\n---\nnotes: from options\n---\n# A\n')
    expect(slides[0].notes).toBe('from options')
  })

  it('warns about an unknown layout instead of writing it', () => {
    const { slides, warnings } = parseSingleFileDeck('---\ntitle: Deck\n---\n---\nlayout: hexagon\n---\n# A\n')
    expect(slides[0].layout).toBeUndefined()
    expect(warnings.join(' ')).toMatch(/hexagon/)
  })

  it('leaves prose alone when a key is not a known slide option', () => {
    const { slides } = parseSingleFileDeck('# A\n\n---\nnote: this is prose, not options\n---\n# B\n')
    expect(slides).toHaveLength(3)
    expect(slides[1].markdown).toContain('note: this is prose')
  })

  it('emits an empty slide for an options block with nothing after it', () => {
    const { slides } = parseSingleFileDeck('# A\n\n---\nlayout: blank\n---\n')
    expect(slides).toHaveLength(2)
    expect(slides[1]).toMatchObject({ id: 'slide-2', layout: 'blank', markdown: '' })
  })
})

describe('parseSingleFileDeck — code fences', () => {
  it('lifts a fence carrying file= out of the markdown', () => {
    const { slides } = parseSingleFileDeck(FULL)
    const slide = slides[1]
    expect(slide.markdown).toBe('# Slide two')
    expect(slide.code).toEqual({
      file: 'code/demo.py',
      language: 'python',
      execution: 'pyodide',
      packages: ['numpy'],
      source: 'print("hi")',
    })
  })

  it('leaves a fence WITHOUT file= inline and gives the slide no code', () => {
    const { slides } = parseSingleFileDeck('# A\n\n```python\nprint(1)\n```\n')
    expect(slides[0].code).toBeUndefined()
    expect(slides[0].markdown).toContain('```python')
  })

  it('keeps a bare file name under code/ and honours an explicit folder', () => {
    const bare = parseSingleFileDeck('# A\n\n```js file=hello.js\n1\n```\n')
    expect(bare.slides[0].code?.file).toBe('code/hello.js')
    const explicit = parseSingleFileDeck('# A\n\n```js file=src/hello.js\n1\n```\n')
    expect(explicit.slides[0].code?.file).toBe('src/hello.js')
  })

  it('defaults the engine per language, matching the app', () => {
    expect(defaultEngineForLanguage('javascript')).toBe('sandpack')
    expect(defaultEngineForLanguage('typescript')).toBe('sandpack')
    expect(defaultEngineForLanguage('python')).toBe('pyodide')
    expect(defaultEngineForLanguage('sql')).toBe('sql')
    expect(defaultEngineForLanguage('ruby')).toBe('native')

    const { slides } = parseSingleFileDeck('# A\n\n```js file=a.js\n1\n```\n')
    expect(slides[0].code?.execution).toBe('sandpack')
  })

  it('fills command and args for the native engine', () => {
    const { slides } = parseSingleFileDeck('# A\n\n```bash file=run.sh\necho hi\n```\n')
    expect(slides[0].code).toMatchObject({
      file: 'code/run.sh',
      language: 'bash',
      execution: 'native',
      command: 'bash',
      args: ['code/run.sh'],
    })
  })

  it('honours explicit execution, command and args', () => {
    const { slides } = parseSingleFileDeck(
      '# A\n\n```javascript file=code/server.js execution=native command=node args=[code/server.js, --port]\n1\n```\n'
    )
    expect(slides[0].code).toMatchObject({
      execution: 'native',
      command: 'node',
      args: ['code/server.js', '--port'],
    })
  })

  it('infers the language from the file extension when the fence has no tag', () => {
    const { slides } = parseSingleFileDeck('# A\n\n``` file=code/q.sql\nSELECT 1;\n```\n')
    expect(slides[0].code).toMatchObject({ language: 'sql', execution: 'sql' })
  })

  it('accepts quoted values and bracket lists with spaces', () => {
    const { slides } = parseSingleFileDeck(
      '# A\n\n```python file=code/a.py packages=[numpy, pandas] seedData=code/seed.sql\n1\n```\n'
    )
    expect(slides[0].code?.packages).toEqual(['numpy', 'pandas'])
    expect(slides[0].code?.seedData).toBe('code/seed.sql')
  })

  it('refuses a file= that escapes the deck and leaves the fence inline', () => {
    const { slides, warnings } = parseSingleFileDeck('# A\n\n```js file=../../etc/passwd\n1\n```\n')
    expect(slides[0].code).toBeUndefined()
    expect(slides[0].markdown).toContain('```js file=../../etc/passwd')
    expect(warnings.join(' ')).toMatch(/inside the deck/)
  })

  it('refuses an absolute file=', () => {
    const { slides } = parseSingleFileDeck('# A\n\n```js file=/tmp/x.js\n1\n```\n')
    expect(slides[0].code).toBeUndefined()
  })

  it('leaves the fence inline when the language cannot be worked out', () => {
    const { slides, warnings } = parseSingleFileDeck('# A\n\n``` file=code/thing.xyz\nzz\n```\n')
    expect(slides[0].code).toBeUndefined()
    expect(warnings.join(' ')).toMatch(/language/)
  })

  it('only lifts the first file= fence', () => {
    const { slides } = parseSingleFileDeck(
      '# A\n\n```py file=one.py\n1\n```\n\n```py file=two.py\n2\n```\n'
    )
    expect(slides[0].code?.file).toBe('code/one.py')
    expect(slides[0].markdown).toContain('file=two.py')
  })
})

describe('parseSingleFileDeck — notes', () => {
  it('takes everything after <!-- notes --> as speaker notes', () => {
    const { slides } = parseSingleFileDeck(FULL)
    expect(slides[1].notes).toBe('Speaker notes here')
    expect(slides[1].markdown).not.toContain('notes')
  })

  it('supports multi-line notes and stops at the slide boundary', () => {
    const { slides } = parseSingleFileDeck('# A\n\n<!-- notes -->\nline one\n\nline two\n\n---\n\n# B\n')
    expect(slides[0].notes).toBe('line one\n\nline two')
    expect(slides[1].notes).toBeUndefined()
  })

  it('ignores an empty notes block', () => {
    const { slides } = parseSingleFileDeck('# A\n\n<!-- notes -->\n\n')
    expect(slides[0].notes).toBeUndefined()
  })

  it('lets <!-- notes --> win over a notes: option', () => {
    const { slides } = parseSingleFileDeck('---\ntitle: Deck\n---\n---\nnotes: from options\n---\n# A\n\n<!-- notes -->\nfrom body\n')
    expect(slides[0].notes).toBe('from body')
  })
})

describe('parseSingleFileDeck — slide ids', () => {
  it('slugs the first heading', () => {
    const { slides } = parseSingleFileDeck('## Why *Lecta*, exactly?\n')
    expect(slides[0].id).toBe('why-lecta-exactly')
  })

  it('is Unicode-aware', () => {
    expect(parseSingleFileDeck('# Añadir código\n').slides[0].id).toBe('añadir-código')
    expect(parseSingleFileDeck('# 日本語の見出し\n').slides[0].id).toBe('日本語の見出し')
  })

  it('falls back to slide-N without a heading, and for un-sluggable headings', () => {
    const { slides } = parseSingleFileDeck('just text\n\n---\n\n# 🎉\n')
    expect(slides[0].id).toBe('slide-1')
    expect(slides[1].id).toBe(toSafeSlug('🎉', 'slide-2'))
  })

  it('dedupes repeated headings', () => {
    const { slides } = parseSingleFileDeck('# Demo\n\n---\n\n# Demo\n\n---\n\n# Demo\n')
    expect(slides.map((s) => s.id)).toEqual(['demo', 'demo-2', 'demo-3'])
  })

  it('dedupes an explicit id that collides', () => {
    const { slides } = parseSingleFileDeck('# Demo\n\n---\nid: demo\n---\n# Other\n')
    expect(slides.map((s) => s.id)).toEqual(['demo', 'demo-2'])
  })
})

describe('materializeToFolder', () => {
  const parsed = parseSingleFileDeck(FULL)
  const { manifest, files } = materializeToFolder('/decks/my-talk', parsed)

  it('writes lecta.yaml first and marks each file', () => {
    expect(files[0].relativePath).toBe('lecta.yaml')
    expect(files[0].kind).toBe('manifest')
    expect(files.map((f) => f.relativePath).sort()).toEqual(
      ['code/demo.py', 'lecta.yaml', 'slides/01-slide-one.md', 'slides/02-slide-two.md', 'slides/slide-two.notes.md'].sort()
    )
    expect(fileFor(files, 'code/demo.py').kind).toBe('code')
    expect(fileFor(files, 'slides/slide-two.notes.md').kind).toBe('notes')
  })

  it('produces a manifest the shared schema accepts', () => {
    expect(manifest.rootPath).toBe('/decks/my-talk')
    expect(manifest.title).toBe('My Talk')
    expect(manifest.slides).toHaveLength(2)
    expect(manifest.slides[0]).toMatchObject({ id: 'slide-one', content: 'slides/01-slide-one.md', artifacts: [] })
    expect(manifest.slides[1]).toMatchObject({
      id: 'slide-two',
      content: 'slides/02-slide-two.md',
      layout: 'two-col',
      notes: 'slides/slide-two.notes.md',
      code: { file: 'code/demo.py', language: 'python', execution: 'pyodide', packages: ['numpy'] },
    })
    // The yaml it hands back is exactly what the loader will parse.
    const reparsed = parsePresentationYaml(fileFor(files, 'lecta.yaml').content, '/decks/my-talk')
    expect(reparsed).toEqual(manifest)
  })

  it('writes slide, code and notes content with a trailing newline', () => {
    expect(fileFor(files, 'slides/01-slide-one.md').content).toBe('# Slide one\n\nBody…\n')
    expect(fileFor(files, 'code/demo.py').content).toBe('print("hi")\n')
    expect(fileFor(files, 'slides/slide-two.notes.md').content).toBe('Speaker notes here\n')
  })

  it('never touches the filesystem — the same input yields the same files', () => {
    const again = materializeToFolder('/decks/my-talk', parseSingleFileDeck(FULL))
    expect(again.files).toEqual(files)
  })

  it('gives colliding code paths distinct files and keeps native args pointing at them', () => {
    const deck = parseSingleFileDeck(
      '# A\n\n```bash file=run.sh\none\n```\n\n---\n\n# B\n\n```bash file=run.sh\ntwo\n```\n'
    )
    const out = materializeToFolder('/deck', deck)
    expect(out.manifest.slides[0].code?.file).toBe('code/run.sh')
    expect(out.manifest.slides[1].code?.file).toBe('code/run-2.sh')
    expect(out.manifest.slides[1].code?.args).toEqual(['code/run-2.sh'])
    expect(fileFor(out.files, 'code/run-2.sh').content).toBe('two\n')
  })

  it('writes an empty slide file for a slide with no body', () => {
    const out = materializeToFolder('/deck', parseSingleFileDeck('# A\n\n---\nlayout: blank\n---\n'))
    expect(fileFor(out.files, 'slides/02-slide-2.md').content).toBe('')
  })
})

describe('folderToSingleFile', () => {
  function exportOf(text: string): string {
    const parsed = parseSingleFileDeck(text)
    const { manifest, files } = materializeToFolder('/deck', parsed)
    const read = (path: string): string => fileFor(files, path).content
    const slides: SingleFileSlideSource[] = manifest.slides.map((config) => ({
      config,
      markdownContent: read(config.content),
      codeContent: config.code ? read(config.code.file) : null,
      notesContent: config.notes ? read(config.notes) : null,
    }))
    return folderToSingleFile(manifest, slides)
  }

  it('round-trips a deck through folder form and back', () => {
    const text = exportOf(FULL)
    const reparsed = parseSingleFileDeck(text)
    const original = parseSingleFileDeck(FULL)

    expect(reparsed.config).toEqual(original.config)
    expect(reparsed.slides).toEqual(original.slides)
  })

  it('is stable: exporting the re-imported deck gives byte-identical text', () => {
    const once = exportOf(FULL)
    expect(exportOf(once)).toBe(once)
  })

  it('starts with frontmatter and separates slides with ---', () => {
    const text = exportOf(FULL)
    expect(text.startsWith('---\ntitle: My Talk\n')).toBe(true)
    expect(text).toContain('```python file=code/demo.py execution=pyodide packages=[numpy]')
    expect(text).toContain('<!-- notes -->')
  })

  it('emits an id only when it cannot be derived from the heading', () => {
    expect(exportOf('# Kept\n')).not.toContain('id:')
    expect(exportOf('---\ntitle: Deck\n---\n---\nid: renamed\n---\n# Kept\n')).toContain('id: renamed')
  })

  it('rewrites a lone --- in the body to ---- so the slide does not re-split', () => {
    const text = exportOf('# A\n\nabove\n\n----\n\nbelow\n')
    expect(parseSingleFileDeck(text).slides).toHaveLength(1)
    expect(text).toContain('----')
  })

  it('leaves --- inside a code fence alone', () => {
    const source = '# A\n\n```yaml\na: 1\n---\nb: 2\n```\n'
    const text = exportOf(source)
    expect(text).toContain('---\nb: 2')
    expect(parseSingleFileDeck(text).slides).toHaveLength(1)
  })

  it('lengthens the fence when the code itself contains backticks', () => {
    const parsed = parseSingleFileDeck('# A\n')
    const { manifest } = materializeToFolder('/deck', parsed)
    const text = folderToSingleFile(manifest, [
      {
        config: {
          ...manifest.slides[0],
          code: { file: 'code/a.md', language: 'markdown', execution: 'none' },
        },
        markdownContent: '# A',
        codeContent: '```js\nx\n```',
      },
    ])
    expect(text).toContain('````markdown file=code/a.md execution=none')
    expect(parseSingleFileDeck(text).slides[0].code?.source).toBe('```js\nx\n```')
  })

  it('keeps layout, transition and skip', () => {
    const text = exportOf('---\ntitle: Deck\n---\n---\nlayout: quote\ntransition: left\nskip: true\n---\n# A\n')
    const slide = parseSingleFileDeck(text).slides[0]
    expect(slide).toMatchObject({ layout: 'quote', transition: 'left', skipped: true })
  })

  it('omits default layout and transition', () => {
    const parsed = parseSingleFileDeck('# A\n')
    const { manifest } = materializeToFolder('/deck', parsed)
    const text = folderToSingleFile(manifest, [
      {
        config: { ...manifest.slides[0], layout: 'default', transition: 'none' },
        markdownContent: '# A',
      },
    ])
    expect(text).not.toContain('layout:')
    expect(text).not.toContain('transition:')
  })

  it('exports an empty deck as just frontmatter', () => {
    expect(folderToSingleFile({ title: 'T', author: '', theme: 'dark' }, [])).toBe(
      '---\ntitle: T\nauthor: ""\ntheme: dark\n---\n'
    )
  })
})

describe('example-decks/single-file-demo.md', () => {
  const demoPath = join(__dirname, '../../../../example-decks/single-file-demo.md')
  const text = readFileSync(demoPath, 'utf-8')
  const parsed = parseSingleFileDeck(text)

  it('parses without warnings', () => {
    expect(parsed.warnings).toEqual([])
  })

  it('has five slides with the expected ids', () => {
    expect(parsed.slides).toHaveLength(5)
    expect(parsed.slides.map((s) => s.id)).toEqual([
      'one-file-one-deck',
      'how-it-works',
      'python-that-runs',
      'run-it-your-way',
      'back-to-one-file',
    ])
  })

  it('carries the deck frontmatter', () => {
    expect(parsed.config).toMatchObject({ title: 'One File, One Deck', theme: 'executive' })
  })

  it('exercises layouts, transitions and skip', () => {
    expect(parsed.slides[0].layout).toBe('title')
    expect(parsed.slides[1]).toMatchObject({ layout: 'two-col', transition: 'left' })
    expect(parsed.slides.some((s) => s.skipped)).toBe(true)
  })

  it('picks up the python code file and its packages', () => {
    const python = parsed.slides[2]
    expect(python.code).toMatchObject({
      file: 'code/histogram.py',
      language: 'python',
      execution: 'pyodide',
      packages: ['numpy'],
    })
    expect(python.code?.source).toContain('import numpy')
    expect(python.markdown).not.toContain('import numpy')
  })

  it('picks up a native code block with its command and args', () => {
    expect(parsed.slides[3].code).toMatchObject({
      file: 'code/report.js',
      language: 'javascript',
      execution: 'native',
      command: 'node',
      args: ['code/report.js'],
    })
  })

  it('has speaker notes on the slides that use <!-- notes -->', () => {
    expect(parsed.slides[0].notes).toBeTruthy()
    expect(parsed.slides[2].notes).toContain('Pyodide')
  })

  it('materializes into a deck the schema accepts', () => {
    const { manifest, files } = materializeToFolder('/decks/single-file-demo', parsed)
    expect(manifest.slides).toHaveLength(5)
    expect(files.filter((f) => f.kind === 'code').map((f) => f.relativePath)).toEqual([
      'code/histogram.py',
      'code/report.js',
    ])
    expect(files.filter((f) => f.kind === 'slide')).toHaveLength(5)
    expect(parsePresentationYaml(fileFor(files, 'lecta.yaml').content, '/x').slides).toHaveLength(5)
  })

  it('round-trips back to a single file', () => {
    const { manifest, files } = materializeToFolder('/decks/single-file-demo', parsed)
    const read = (path: string): string => fileFor(files, path).content
    const text2 = folderToSingleFile(
      manifest,
      manifest.slides.map((config) => ({
        config,
        markdownContent: read(config.content),
        codeContent: config.code ? read(config.code.file) : null,
        notesContent: config.notes ? read(config.notes) : null,
      }))
    )
    const reparsed = parseSingleFileDeck(text2)
    expect(reparsed.slides).toEqual(parsed.slides)
    expect(reparsed.config).toEqual(parsed.config)
  })
})
