import { describe, it, expect } from 'vitest'
import { parseNotebookYaml, validateNotebookYaml, isNotebookYaml } from './notebook-parser'

const MINIMAL_NOTEBOOK = `
type: notebook
title: My Notebook
pages:
  - id: page-1
    content: pages/page-1.md
    artifacts: []
`

const FULL_NOTEBOOK = `
type: notebook
title: Full Notebook
author: Tester
theme: light
defaultLayout: jupyter
kernel: python
lastViewedIndex: 3
pages:
  - id: page-1
    content: pages/page-1.md
    layout: lines
    artifacts:
      - path: artifacts/data.csv
        label: Dataset
    code:
      file: code/analysis.py
      language: python
      execution: pyodide
    video:
      url: https://example.com/tutorial.mp4
      label: Tutorial
    webapp:
      url: https://example.com/app
    cellType: code
    cellIndex: 0
    outputs:
      - outputType: stream
        text: "Hello World"
      - outputType: error
        traceback:
          - "Traceback (most recent call last):"
          - "  NameError: name 'x' is not defined"
  - id: page-2
    content: pages/page-2.md
    layout: blank
    artifacts: []
    children:
      - id: child-1
        content: pages/child-1.md
        artifacts: []
`

describe('parseNotebookYaml', () => {
  it('parses minimal notebook', () => {
    const result = parseNotebookYaml(MINIMAL_NOTEBOOK, '/notebooks')
    expect(result.title).toBe('My Notebook')
    expect(result.rootPath).toBe('/notebooks')
    expect(result.theme).toBe('dark')
    expect(result.author).toBe('')
    expect(result.defaultLayout).toBe('lines')
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0].id).toBe('page-1')
  })

  it('parses full notebook with all fields', () => {
    const result = parseNotebookYaml(FULL_NOTEBOOK, '/nb')
    expect(result.title).toBe('Full Notebook')
    expect(result.author).toBe('Tester')
    expect(result.theme).toBe('light')
    expect(result.defaultLayout).toBe('jupyter')
    expect(result.kernel).toBe('python')
    expect(result.lastViewedIndex).toBe(3)
    expect(result.pages).toHaveLength(2)

    // First page with code, video, outputs
    const p1 = result.pages[0]
    expect(p1.code?.language).toBe('python')
    expect(p1.video?.url).toBe('https://example.com/tutorial.mp4')
    expect(p1.cellType).toBe('code')
    expect(p1.cellIndex).toBe(0)
    expect(p1.outputs).toHaveLength(2)
    expect(p1.outputs![0].outputType).toBe('stream')
    expect(p1.outputs![1].traceback).toHaveLength(2)

    // Second page with children
    const p2 = result.pages[1]
    expect(p2.children).toHaveLength(1)
    expect(p2.children![0].id).toBe('child-1')
  })

  it('throws on missing type field', () => {
    const yaml = `
title: No Type
pages:
  - id: p1
    content: pages/p1.md
    artifacts: []
`
    expect(() => parseNotebookYaml(yaml, '/root')).toThrow()
  })

  it('throws on wrong type value', () => {
    const yaml = `
type: presentation
title: Wrong Type
pages:
  - id: p1
    content: pages/p1.md
    artifacts: []
`
    expect(() => parseNotebookYaml(yaml, '/root')).toThrow()
  })
})

describe('validateNotebookYaml', () => {
  it('returns valid for correct notebook', () => {
    const result = validateNotebookYaml(MINIMAL_NOTEBOOK)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns errors for invalid notebook', () => {
    const result = validateNotebookYaml('title: Missing type\npages: []')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns errors for malformed YAML', () => {
    const result = validateNotebookYaml('{{invalid')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('isNotebookYaml', () => {
  it('returns true for notebook YAML', () => {
    expect(isNotebookYaml(MINIMAL_NOTEBOOK)).toBe(true)
  })

  it('returns false for presentation YAML', () => {
    const yaml = `
title: Presentation
author: Test
slides:
  - id: s1
    content: slides/s1.md
    artifacts: []
`
    expect(isNotebookYaml(yaml)).toBe(false)
  })

  it('returns false for invalid YAML', () => {
    expect(isNotebookYaml('{{bad yaml')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isNotebookYaml('')).toBe(false)
  })
})
