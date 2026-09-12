import { describe, it, expect, vi } from 'vitest'
import { parsePresentationYaml, serializePresentation, validatePresentationYaml } from './yaml-parser'
import { SLIDE_THEMES } from '../slide-options'
import { existsSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'

const MINIMAL_YAML = `
title: Test Deck
author: Tester
theme: dark
slides:
  - id: intro
    content: slides/01-intro.md
    artifacts: []
`

const FULL_YAML = `
title: Full Deck
author: Author
theme: light
lastViewedIndex: 2
slides:
  - id: title-slide
    content: slides/01-title.md
    layout: title
    transition: left
    artifacts: []
  - id: code-slide
    content: slides/02-code.md
    code:
      file: code/demo.js
      language: javascript
      execution: sandpack
      dependencies:
        - lodash
      packages:
        - react
    artifacts:
      - path: artifacts/diagram.png
        label: Architecture
    notes: slides/02-code.notes.md
  - id: video-slide
    content: slides/03-video.md
    video:
      url: https://example.com/video.mp4
      label: Demo
    webapp:
      url: https://example.com/app
      label: Live App
    prompts:
      - prompt: Explain this concept
        label: Q1
        response: It works like this...
    artifacts: []
    skipped: true
ai:
  model: claude-sonnet-4-20250514
  autoGenerateNotes: true
  context: slide+code
groups:
  - id: section-1
    name: Introduction
    slideIds: [title-slide, code-slide]
    color: "#ff0000"
presenterNotes: Some global notes
`

describe('parsePresentationYaml', () => {
  it('parses minimal valid YAML', () => {
    const result = parsePresentationYaml(MINIMAL_YAML, '/test/path')
    expect(result.title).toBe('Test Deck')
    expect(result.author).toBe('Tester')
    expect(result.theme).toBe('dark')
    expect(result.rootPath).toBe('/test/path')
    expect(result.slides).toHaveLength(1)
    expect(result.slides[0].id).toBe('intro')
    expect(result.slides[0].content).toBe('slides/01-intro.md')
    expect(result.slides[0].artifacts).toEqual([])
    expect(result.slides[0].prompts).toEqual([])
  })

  it('parses fully-featured YAML', () => {
    const result = parsePresentationYaml(FULL_YAML, '/root')
    expect(result.title).toBe('Full Deck')
    expect(result.lastViewedIndex).toBe(2)
    expect(result.slides).toHaveLength(3)

    // Title slide
    expect(result.slides[0].layout).toBe('title')
    expect(result.slides[0].transition).toBe('left')

    // Code slide
    const codeSlide = result.slides[1]
    expect(codeSlide.code?.file).toBe('code/demo.js')
    expect(codeSlide.code?.language).toBe('javascript')
    expect(codeSlide.code?.execution).toBe('sandpack')
    expect(codeSlide.code?.dependencies).toEqual(['lodash'])
    expect(codeSlide.code?.packages).toEqual(['react'])
    expect(codeSlide.artifacts).toHaveLength(1)
    expect(codeSlide.notes).toBe('slides/02-code.notes.md')

    // Video slide
    const videoSlide = result.slides[2]
    expect(videoSlide.video?.url).toBe('https://example.com/video.mp4')
    expect(videoSlide.webapp?.url).toBe('https://example.com/app')
    expect(videoSlide.prompts).toHaveLength(1)
    expect(videoSlide.skipped).toBe(true)

    // AI config
    expect(result.ai?.model).toBe('claude-sonnet-4-20250514')
    expect(result.ai?.autoGenerateNotes).toBe(true)
    expect(result.ai?.context).toBe('slide+code')

    // Groups
    expect(result.groups).toHaveLength(1)
    expect(result.groups![0].slideIds).toEqual(['title-slide', 'code-slide'])

    // Presenter notes
    expect(result.presenterNotes).toBe('Some global notes')
  })

  it('uses default theme when not specified', () => {
    const yaml = `
title: No Theme
author: Test
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
`
    const result = parsePresentationYaml(yaml, '/root')
    expect(result.theme).toBe('dark')
  })

  it('throws on missing required fields', () => {
    const yaml = `
author: Missing Title
slides: []
`
    expect(() => parsePresentationYaml(yaml, '/root')).toThrow()
  })

  it('throws on invalid language in code block', () => {
    const yaml = `
title: Bad
author: Test
slides:
  - id: s1
    content: slides/s1.md
    code:
      file: code/demo.xyz
      language: cobol
      execution: none
    artifacts: []
`
    expect(() => parsePresentationYaml(yaml, '/root')).toThrow()
  })

  it('throws on invalid layout', () => {
    const yaml = `
title: Bad
author: Test
slides:
  - id: s1
    content: slides/s1.md
    layout: fullscreen
    artifacts: []
`
    expect(() => parsePresentationYaml(yaml, '/root')).toThrow()
  })
})

describe('validatePresentationYaml', () => {
  it('returns valid for correct YAML', () => {
    const result = validatePresentationYaml(MINIMAL_YAML)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns errors for invalid YAML', () => {
    const result = validatePresentationYaml('not: valid: yaml: [')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns Zod validation errors for schema mismatches', () => {
    const yaml = `
title: 123
author: Test
slides: not-an-array
`
    const result = validatePresentationYaml(yaml)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns errors when title is missing', () => {
    const yaml = `
author: Test
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
`
    const result = validatePresentationYaml(yaml)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('title'))).toBe(true)
  })
})

describe('parsePresentationYaml — schema hardening', () => {
  const deck = (slideBody: string, extra = '') => `
title: Deck
author: Test
${extra}slides:
  - id: s1
${slideBody}
`

  it('falls back to the default theme and warns on an unknown theme', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = parsePresentationYaml(
        deck('    content: slides/s1.md\n    artifacts: []', 'theme: neon-vaporwave\n'),
        '/root'
      )
      expect(result.theme).toBe('dark')
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0][0])).toContain('neon-vaporwave')
    } finally {
      warn.mockRestore()
    }
  })

  it('accepts every known theme unchanged', () => {
    for (const theme of SLIDE_THEMES) {
      const result = parsePresentationYaml(
        deck('    content: slides/s1.md\n    artifacts: []', `theme: ${theme}\n`),
        '/root'
      )
      expect(result.theme).toBe(theme)
    }
  })

  it('rejects an empty slide id', () => {
    expect(() =>
      parsePresentationYaml(
        `
title: Deck
author: Test
slides:
  - id: ""
    content: slides/s1.md
    artifacts: []
`,
        '/root'
      )
    ).toThrow()
  })

  it('rejects a negative or fractional lastViewedIndex', () => {
    const body = '    content: slides/s1.md\n    artifacts: []'
    expect(() => parsePresentationYaml(deck(body, 'lastViewedIndex: -1\n'), '/root')).toThrow()
    expect(() => parsePresentationYaml(deck(body, 'lastViewedIndex: 1.5\n'), '/root')).toThrow()
    expect(parsePresentationYaml(deck(body, 'lastViewedIndex: 0\n'), '/root').lastViewedIndex).toBe(0)
  })

  it.each([
    ['content', '    content: ../../etc/passwd\n    artifacts: []'],
    ['absolute content', '    content: /etc/passwd\n    artifacts: []'],
    ['home-relative content', '    content: ~/secrets.md\n    artifacts: []'],
    ['notes', '    content: slides/s1.md\n    notes: ../../.zshrc\n    artifacts: []'],
    [
      'code.file',
      '    content: slides/s1.md\n    artifacts: []\n    code:\n      file: ../../.ssh/id_rsa\n      language: bash\n      execution: none',
    ],
    [
      'artifact path',
      '    content: slides/s1.md\n    artifacts:\n      - path: ../../secret.pdf\n        label: Nope',
    ],
  ])('rejects an escaping %s path', (_label, body) => {
    expect(() => parsePresentationYaml(deck(body), '/root')).toThrow()
  })

  it('accepts a file name that merely starts with dots', () => {
    const result = parsePresentationYaml(
      deck('    content: slides/s1.md\n    notes: slides/..notes.md\n    artifacts: []'),
      '/root'
    )
    expect(result.slides[0].notes).toBe('slides/..notes.md')
  })
})

describe('serializePresentation', () => {
  const YAML_WITH_EXTRAS = `
title: Round Trip
author: Test
theme: paper
lastViewedIndex: 3
customBranding:
  logo: images/logo.png
  accent: "#ff6b35"
sponsors:
  - Acme
  - Globex
slides:
  - id: s1
    title: One
    content: slides/s1.md
    layout: title
    artifacts: []
  - id: s2
    content: slides/s2.md
    notes: slides/s2.notes.md
    artifacts:
      - path: artifacts/deck.pdf
        label: Handout
`

  it('round-trips known and unknown top-level keys', () => {
    const parsed = parsePresentationYaml(YAML_WITH_EXTRAS, '/root')
    const reparsed = parsePresentationYaml(serializePresentation(parsed), '/root')

    expect(reparsed.title).toBe('Round Trip')
    expect(reparsed.theme).toBe('paper')
    expect(reparsed.lastViewedIndex).toBe(3)
    expect(reparsed.slides).toHaveLength(2)
    expect(reparsed.slides[0].layout).toBe('title')
    expect(reparsed.slides[1].notes).toBe('slides/s2.notes.md')
    expect(reparsed.slides[1].artifacts[0]).toEqual({ path: 'artifacts/deck.pdf', label: 'Handout' })

    const extras = reparsed as unknown as Record<string, unknown>
    expect(extras.customBranding).toEqual({ logo: 'images/logo.png', accent: '#ff6b35' })
    expect(extras.sponsors).toEqual(['Acme', 'Globex'])
  })

  it('is stable across two serialize passes', () => {
    const parsed = parsePresentationYaml(YAML_WITH_EXTRAS, '/root')
    const once = serializePresentation(parsed)
    const twice = serializePresentation(parsePresentationYaml(once, '/root'))
    expect(twice).toBe(once)
  })

  it('never writes the runtime-only rootPath back to disk', () => {
    const parsed = parsePresentationYaml(YAML_WITH_EXTRAS, '/some/where')
    expect(serializePresentation(parsed)).not.toContain('rootPath')
  })
})

describe('shipped example decks', () => {
  it('example-decks/hello-world/lecta.yaml satisfies the schema', () => {
    const yamlPath = resolve(__dirname, '../../../../example-decks/hello-world/lecta.yaml')
    const result = validatePresentationYaml(readFileSync(yamlPath, 'utf-8'))
    expect(result.errors).toEqual([])

    const parsed = parsePresentationYaml(readFileSync(yamlPath, 'utf-8'), '/decks/hello-world')
    expect(parsed.slides[0]).toMatchObject({ id: 'welcome', content: 'slides/01-welcome.md', layout: 'title' })
    // Every referenced file must actually exist in the shipped deck.
    for (const slide of parsed.slides) {
      for (const path of [slide.content, slide.code?.file, slide.notes].filter(Boolean) as string[]) {
        expect(existsSync(resolve(dirname(yamlPath), path)), `missing ${path}`).toBe(true)
      }
    }
  })
})

// ── The lecta.yaml contract ──
//
// The MCP server writes decks with this same serializer (it imports it as
// `#shared/utils/yaml-parser.js`) and carries a byte-for-byte copy of this fixture in
// `packages/mcp-server/src/lib/presentation-io.test.ts`. A deck written by the server and
// a deck written by the app have to be indistinguishable, so if one of the two copies
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
