import { describe, expect, it } from 'vitest'
import {
  splitBlocks,
  patchBlock,
  moveBlock,
  insertBlock,
  deleteBlock,
  isEditableBlock,
  getBlockAlign,
  setBlockAlign,
  leadingDirectives,
  applyAlignDirectives,
  createMarkdownConverter,
  sectionAt,
  deleteRange,
  insertSection,
} from './block-model'

const MD = `# Title

A paragraph with **bold**.

- one
- two

> A quote

\`\`\`js
const x = 1
\`\`\`

![alt](img.png)

| a | b |
|---|---|
| 1 | 2 |

<!-- textbox x=10 y=10 w=200 -->hi<!-- /textbox -->

----
`

describe('splitBlocks', () => {
  it('splits a mixed slide into typed blocks', () => {
    const kinds = splitBlocks(MD).map((b) => b.kind)
    expect(kinds).toEqual(['heading', 'paragraph', 'list', 'quote', 'code', 'image', 'table', 'html', 'break'])
  })

  it('keeps fences with blank lines inside intact', () => {
    const md = '```\n\n\n```\n\nAfter'
    const blocks = splitBlocks(md)
    expect(blocks.map((b) => b.kind)).toEqual(['code', 'paragraph'])
  })

  it('keeps multi-line HTML columns together across blank lines', () => {
    const md = '<!-- columns -->\n<div>\n\nLeft\n\nRight\n</div>\n<!-- /columns -->'
    const blocks = splitBlocks(md)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('html')
  })

  it('attaches lone comments to the next block', () => {
    const blocks = splitBlocks('<!-- autofit -->\n# Big')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('heading')
  })
})

describe('patchBlock', () => {
  it('replaces one block and rejoins', () => {
    const next = patchBlock('# A\n\n# B', 'b1', '# B2')
    expect(next).toBe('# A\n\n# B2')
  })

  it('deletes on empty replacement', () => {
    expect(patchBlock('# A\n\n# B', 'b0', '  ')).toBe('# B')
  })
})

describe('moveBlock', () => {
  it('moves blocks up and down', () => {
    expect(moveBlock('# A\n\n# B', 'b1', -1)).toBe('# B\n\n# A')
    expect(moveBlock('# A\n\n# B', 'b0', -1)).toBe('# A\n\n# B')
  })
})

describe('insertBlock / deleteBlock', () => {
  it('inserts after a key', () => {
    const { markdown, key } = insertBlock('# A\n\n# B', 'b0', 'Mid')
    expect(markdown).toBe('# A\n\nMid\n\n# B')
    expect(key).toBe('b1')
  })

  it('never deletes the last block entirely', () => {
    expect(deleteBlock('# Only', 'b0')).toBe('New text')
  })
})

describe('isEditableBlock', () => {
  it('marks text blocks editable and the rest locked', () => {
    expect(isEditableBlock('paragraph')).toBe(true)
    expect(isEditableBlock('code')).toBe(false)
    expect(isEditableBlock('image')).toBe(false)
    expect(isEditableBlock('break')).toBe(false)
  })
})

describe('alignment directives', () => {
  it('reads and writes a leading align directive', () => {
    expect(getBlockAlign('<!-- align:center -->\nHello')).toBe('center')
    expect(getBlockAlign('Hello')).toBeNull()
    expect(setBlockAlign('Hello', 'right')).toBe('<!-- align:right -->\nHello')
    expect(setBlockAlign('<!-- align:center -->\nHello', null)).toBe('Hello')
    expect(setBlockAlign('<!-- align:center -->\nHello', 'left')).toBe('<!-- align:left -->\nHello')
  })

  it('collects leading directives', () => {
    expect(leadingDirectives('<!-- align:center -->\n<!-- autofit -->\n# Big')).toEqual([
      '<!-- align:center -->',
      '<!-- autofit -->',
    ])
    expect(leadingDirectives('# Big')).toEqual([])
  })

  it('wraps aligned blocks for rendering, leaves the rest alone', () => {
    const out = applyAlignDirectives('# A\n\n<!-- align:center -->\nB\n\n----')
    expect(out).toContain('<div style="text-align:center">')
    expect(out).toContain('<!-- align:center -->\nB')
    expect(out).not.toContain('text-align:center">\n\n# A')
    expect(out).toContain('----')
  })
})

describe('createMarkdownConverter', () => {  it('round-trips basic formatting', () => {
    const td = createMarkdownConverter()
    expect(td.turndown('<h1>Title</h1>').trim()).toBe('# Title')
    expect(td.turndown('<ul><li>a</li><li>b</li></ul>').trim()).toBe('-   a\n-   b')
  })

  it('preserves text color and highlight spans', () => {
    const td = createMarkdownConverter()
    expect(td.turndown('<p><span style="color:#ef4444">red</span></p>').trim()).toBe(
      '<span style="color:#ef4444">red</span>'
    )
    expect(td.turndown('<p><span style="background-color:#fef08a">mark</span></p>').trim()).toBe(
      '<span style="background-color:#fef08a">mark</span>'
    )
    expect(td.turndown('<p><font color="red">old</font></p>').trim()).toBe('<span style="color:red">old</span>')
  })
})

describe('sectionAt', () => {
  const md = '# A\n\ntext a\n\n## B\n\n- x\n\n----\n\n# C\n\ntail'
  const blocks = splitBlocks(md)

  it('selects a heading with its following blocks', () => {
    const s = sectionAt(blocks, 0)
    expect(s).toEqual({ start: 0, end: 2, title: 'A' })
  })

  it('resolves a body block to its section', () => {
    expect(sectionAt(blocks, 1)).toEqual({ start: 0, end: 2, title: 'A' })
    expect(sectionAt(blocks, 3)).toEqual({ start: 2, end: 4, title: 'B' })
  })

  it('bounds sections at breaks', () => {
    expect(sectionAt(blocks, 4)).toEqual({ start: 4, end: 5, title: 'Break' })
    expect(sectionAt(blocks, 6)).toEqual({ start: 5, end: 7, title: 'C' })
  })

  it('treats heading-less slides as one section', () => {
    const b = splitBlocks('Just text\n\nMore text')
    expect(sectionAt(b, 1)).toEqual({ start: 0, end: 2, title: 'Blocks 1–2' })
  })
})

describe('deleteRange', () => {
  it('removes a whole section', () => {
    expect(deleteRange('# A\n\ntext a\n\n## B\n\n- x', 0, 2)).toBe('## B\n\n- x')
  })

  it('never empties the slide', () => {
    expect(deleteRange('# Only', 0, 1)).toBe('New text')
  })
})

describe('insertSection', () => {
  const md = '# A\n\ntext a\n\n## B\n\n- x'

  it('inserts a section after the one containing the key', () => {
    const { markdown, key } = insertSection(md, 'b1', 'after')
    expect(markdown).toBe('# A\n\ntext a\n\n# New section\n\nNew text\n\n## B\n\n- x')
    expect(key).toBe('b2')
  })

  it('inserts a section before the one containing the key', () => {
    const { markdown } = insertSection(md, 'b3', 'before', 'Intro')
    expect(markdown).toBe('# A\n\ntext a\n\n# Intro\n\nNew text\n\n## B\n\n- x')
  })

  it('appends/prepends when the key is unknown', () => {
    expect(insertSection(md, 'zzz', 'after').markdown.endsWith('# New section\n\nNew text')).toBe(true)
    expect(insertSection(md, 'zzz', 'before').markdown.startsWith('# New section\n\nNew text')).toBe(true)
  })
})
