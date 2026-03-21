import { describe, it, expect } from 'vitest'
import { parsePresentationYaml, validatePresentationYaml } from './yaml-parser'

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
