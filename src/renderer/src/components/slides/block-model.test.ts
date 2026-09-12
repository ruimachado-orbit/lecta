import { describe, expect, it } from 'vitest'
import { splitBlocks, patchBlock, moveBlock, insertBlock, deleteBlock, isEditableBlock } from './block-model'

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
