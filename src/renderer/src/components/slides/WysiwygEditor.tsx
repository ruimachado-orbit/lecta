import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {}
          return { style: `font-size: ${attributes.fontSize}` }
        },
      },
    }
  },
})
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import { ResizableImage } from '../../extensions/resizable-image'
import TurndownService from 'turndown'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

const SHAPES = [
  '■', '□', '▪', '▫', '●', '○', '◆', '◇',
  '▲', '△', '▼', '▽', '◀', '▶', '★', '☆',
  '♠', '♣', '♥', '♦', '⬟', '⬡', '⬢', '◉',
]

const ARROWS = [
  '→', '←', '↑', '↓', '↗', '↘', '↙', '↖',
  '⟶', '⟵', '⇒', '⇐', '⇑', '⇓', '↔', '↕',
]

const TEXT_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Gray', value: '#a3a3a3' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
  { label: 'Cyan', value: '#06b6d4' },
]

const HIGHLIGHT_COLORS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#854d0e' },
  { label: 'Green', value: '#166534' },
  { label: 'Blue', value: '#1e3a5f' },
  { label: 'Purple', value: '#581c87' },
  { label: 'Red', value: '#7f1d1d' },
  { label: 'Gray', value: '#374151' },
]

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🤔', '😎', '🥳', '🤯', '😱',
  '👍', '👎', '👏', '🙌', '💪', '🤝', '✌️', '🫡', '🎯', '🔥',
  '⭐', '💡', '🚀', '💎', '🏆', '🎉', '❤️', '💯', '✅', '❌',
  '⚡', '🔑', '🛡️', '⚙️', '📊', '📈', '📉', '🗂️', '📋', '🔔',
  '🌍', '🌟', '💻', '📱', '🖥️', '🔒', '🔓', '📡', '🧠', '🤖',
  '⚠️', '🚧', '💬', '📌', '🏗️', '🔄', '📦', '🎯', '🧩', '🔗',
]

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})

// Preserve code blocks without escaping content
turndown.addRule('fencedCodeBlock', {
  filter: (node) => {
    return node.nodeName === 'PRE' && !!node.querySelector('code')
  },
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector('code')
    const text = code?.textContent || ''
    // Detect language from class (e.g., "language-mermaid")
    const langClass = code?.className?.match(/language-(\w+)/)
    const lang = langClass ? langClass[1] : ''
    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`
  }
})

// Convert HTML tables back to markdown tables
turndown.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement
    const rows = Array.from(table.rows)
    if (rows.length === 0) return ''

    const getCellText = (cell: HTMLTableCellElement) => {
      // Get text content, preserving bold
      let text = ''
      cell.childNodes.forEach((child) => {
        if (child.nodeName === 'STRONG' || child.nodeName === 'B') {
          text += `**${child.textContent || ''}**`
        } else if (child.nodeName === 'EM' || child.nodeName === 'I') {
          text += `*${child.textContent || ''}*`
        } else {
          text += child.textContent || ''
        }
      })
      return text.trim()
    }

    const lines: string[] = []
    const headerRow = rows[0]
    const headerCells = Array.from(headerRow.cells).map(getCellText)
    lines.push('| ' + headerCells.join(' | ') + ' |')
    lines.push('| ' + headerCells.map((c) => '-'.repeat(Math.max(c.length, 3))).join(' | ') + ' |')

    for (let r = 1; r < rows.length; r++) {
      const cells = Array.from(rows[r].cells).map(getCellText)
      lines.push('| ' + cells.join(' | ') + ' |')
    }

    return '\n' + lines.join('\n') + '\n'
  }
})

// Skip table sub-elements (handled by table rule above)
turndown.addRule('tableCell', {
  filter: ['thead', 'tbody', 'tfoot', 'tr', 'th', 'td'],
  replacement: (content) => content
})

// Preserve colored text as inline HTML
turndown.addRule('colored-text', {
  filter: (node) =>
    node.nodeName === 'SPAN' && !!(node as HTMLElement).style.color,
  replacement: (content, node) => {
    const color = (node as HTMLElement).style.color
    if (!color || !content.trim()) return content
    return `<span style="color: ${color}">${content}</span>`
  }
})

// Preserve highlighted text as inline HTML
turndown.addRule('highlighted-text', {
  filter: (node) => node.nodeName === 'MARK',
  replacement: (content, node) => {
    const el = node as HTMLElement
    const color = el.getAttribute('data-color') || el.style.backgroundColor
    if (!content.trim()) return content
    return color
      ? `<mark style="background-color: ${color}">${content}</mark>`
      : `<mark>${content}</mark>`
  }
})

// Preserve underline as HTML
turndown.addRule('underline', {
  filter: ['u'],
  replacement: (content) => `<u>${content}</u>`
})

// Preserve image src
turndown.addRule('image-with-width', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    let src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    src = src.replace(/^lecta-file:\/\//, '')
    return `![${alt}](${src})`
  }
})

// Convert markdown to simple HTML for TipTap
function markdownToHtml(md: string, rootPath?: string): string {
  // Convert column blocks: each column section becomes editable content
  // separated by a visual column divider marker
  const columnRegex = /<!--\s*columns\s*-->([\s\S]*?)<!--\s*\/columns\s*-->/gi
  let processed = md

  processed = processed.replace(columnRegex, (_match, innerContent: string) => {
    const cols = innerContent.split(/<!--\s*col\s*-->/)
    const parts = cols.map((colContent: string, i: number) => {
      const label = i === 0 ? '[ Column 1 ]' : `[ Column ${i + 1} ]`
      const content = colContent.trim() || 'Type here...'
      return `<p><strong style="color:#6366f1;font-size:11px">${label}</strong></p>\n${content}`
    })
    return parts.join('\n---\n')
  })

  // Strip remaining non-structural comments (textbox, shape, etc.)
  processed = processed.replace(/<!--.*?-->/gs, '')

  return convertLinesToHtml(processed, rootPath)
}

function convertLinesToHtml(md: string, rootPath?: string): string {
  const lines = md.split('\n')
  const html: string[] = []
  let listDepth = 0
  const closeTo = (d: number) => {
    while (listDepth > d) {
      if (listDepth > 1) {
        html.push('</ul></li>')
      } else {
        html.push('</ul>')
      }
      listDepth--
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!line.trim()) {
      const next = lines.slice(i + 1).find((l) => l.trim())
      if (listDepth > 0 && next && next.match(/^\s*\\?[-*+] /)) continue
      closeTo(0)
      continue
    }

    // Pass through table HTML (from column conversion)
    if (line.includes('<table') || line.includes('</table')) { closeTo(0); html.push(line); continue }

    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) { closeTo(0); html.push(`<img alt="${imgMatch[1]}" src="${resolveImageSrc(imgMatch[2], rootPath)}" />`); continue }

    const h3 = line.match(/^### (.+)$/); if (h3) { closeTo(0); html.push(`<h3>${processInline(h3[1])}</h3>`); continue }
    const h2 = line.match(/^## (.+)$/); if (h2) { closeTo(0); html.push(`<h2>${processInline(h2[1])}</h2>`); continue }
    const h1 = line.match(/^# (.+)$/); if (h1) { closeTo(0); html.push(`<h1>${processInline(h1[1])}</h1>`); continue }
    if (line.match(/^---+$/)) { closeTo(0); html.push('<hr>'); continue }

    // Markdown table: detect lines starting with |
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      closeTo(0)
      // Collect all consecutive table lines
      const tableLines: string[] = [line]
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|') && lines[i + 1].trim().endsWith('|')) {
        i++
        tableLines.push(lines[i])
      }
      // Render table as proper HTML table (TipTap table extensions handle this)
      if (tableLines.length >= 2) {
        const parseCells = (row: string) =>
          row.split('|').slice(1, -1).map((c) => c.trim())
        const headerCells = parseCells(tableLines[0])
        const isSep = tableLines[1].match(/^\|[\s:-]+\|/)
        const bodyStart = isSep ? 2 : 1

        html.push('<table><tbody><tr>')
        headerCells.forEach((c) => html.push(`<th><p>${processInline(c)}</p></th>`))
        html.push('</tr>')
        for (let r = bodyStart; r < tableLines.length; r++) {
          const cells = parseCells(tableLines[r])
          html.push('<tr>')
          cells.forEach((c) => html.push(`<td><p>${processInline(c)}</p></td>`))
          html.push('</tr>')
        }
        html.push('</tbody></table>')
      } else {
        html.push(`<p>${processInline(line)}</p>`)
      }
      continue
    }

    // Blockquotes
    const bq = line.match(/^>\s?(.*)$/)
    if (bq) {
      closeTo(0)
      html.push(`<blockquote><p>${processInline(bq[1])}</p></blockquote>`)
      continue
    }

    // Ordered list items
    const ol = line.match(/^(\s*)(\d+)\.\s+(.+)$/)
    if (ol) {
      closeTo(0)
      html.push(`<ol><li>${processInline(ol[3])}</li></ol>`)
      continue
    }

    // Skip empty list items (just "- " or "  - " with no content)
    if (line.match(/^\s*\\?[-*+]\s*$/)) continue

    const li = line.match(/^(\s*)\\?[-*+] (.+)$/)
    if (li) {
      const target = Math.floor(li[1].length / 2) + 1
      if (target > listDepth) {
        // Going deeper — nest inside the previous <li> (remove its closing tag)
        if (listDepth > 0) {
          // Remove the last </li> so we can nest inside it
          const lastIdx = html.lastIndexOf('</li>')
          if (lastIdx >= 0) html.splice(lastIdx, 1)
        }
        while (listDepth < target) { html.push('<ul>'); listDepth++ }
      } else if (target < listDepth) {
        // Going shallower — close nested lists and their parent <li>
        while (listDepth > target) { html.push('</ul></li>'); listDepth-- }
      }
      html.push(`<li>${processInline(li[2])}</li>`)
      continue
    }

    closeTo(0)
    html.push(`<p>${processInline(line)}</p>`)
  }

  closeTo(0)
  return html.join('')
}

function processInline(text: string): string {
  return text
    // Un-escape markdown characters first
    .replace(/\\([_*`~\\>|])/g, '$1')
    // Bold (** or __)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Italic (* or _)
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

interface WysiwygEditorProps {
  slideIndex: number
  breakOffsets?: number[]
}

// Content height inside the 1280x720 slide with p-12 padding
const SLIDE_CONTENT_HEIGHT = 720 - 48 * 2 // 624px
// Scale factor: editor content is wider than the 1184px slide content area,
// so we approximate a ratio for the different text sizes
const EDITOR_TO_SLIDE_RATIO = 0.85

function resolveImageSrc(src: string, rootPath?: string): string {
  if (!src) return ''
  if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('lecta-file://')) return src
  if (src.startsWith('file://')) return src.replace('file://', 'lecta-file://')
  if (rootPath) return `lecta-file://${rootPath}/${decodeURIComponent(src)}`
  return src
}

export function WysiwygEditor({ slideIndex, breakOffsets = [] }: WysiwygEditorProps): JSX.Element {
  const { slides, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const slide = slides[slideIndex]
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isInternalUpdate = useRef(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const [breakPositions, setBreakPositions] = useState<number[]>([])

  // Inline AI state
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showAIButton, setShowAIButton] = useState(false)
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [aiPrompt, setAIPrompt] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiButtonPos, setAIButtonPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const aiPromptInputRef = useRef<HTMLInputElement>(null)

  // Check for API key on mount and when deck changes
  useEffect(() => {
    window.electronAPI.hasApiKey().then(setHasApiKey)
  }, [presentation?.rootPath])

  // Track cursor position and idle timer for AI button
  const updateCursorPosition = useCallback(() => {
    if (!editorContainerRef.current) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const containerRect = editorContainerRef.current.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      // Collapsed cursor — use the caret rect
      const caretRect = rect
      setAIButtonPos({
        top: caretRect.bottom - containerRect.top + editorContainerRef.current.scrollTop + 4,
        left: caretRect.left - containerRect.left + 16
      })
    } else {
      setAIButtonPos({
        top: rect.bottom - containerRect.top + editorContainerRef.current.scrollTop + 4,
        left: rect.right - containerRect.left + 8
      })
    }
  }, [])

  const resetIdleTimer = useCallback(() => {
    setShowAIButton(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    if (!hasApiKey || showAIPrompt) return
    idleTimerRef.current = setTimeout(() => {
      updateCursorPosition()
      setShowAIButton(true)
    }, 2000)
  }, [hasApiKey, showAIPrompt, updateCursorPosition])

  // Clean up idle timer
  useEffect(() => {
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [])

  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  // Place sub-slide break lines at fixed intervals matching actual slide height.
  // Each sub-slide is exactly SLIDE_CONTENT_HEIGHT (624px) of content, so breaks
  // are placed at multiples of that height.
  const computeBreaks = useCallback(() => {
    if (!breakOffsets || breakOffsets.length === 0) {
      setBreakPositions([])
      return
    }
    // Simple: each break is at (i+1) * slide content height
    const positions = breakOffsets.map((_, i) => (i + 1) * SLIDE_CONTENT_HEIGHT)
    setBreakPositions(positions)
  }, [breakOffsets])

  useEffect(() => {
    computeBreaks()
    const timer = setTimeout(computeBreaks, 300)
    return () => clearTimeout(timer)
  }, [computeBreaks])

  const [isOverflow, setIsOverflow] = useState(false)

  const checkOverflow = useCallback(() => {
    if (!editorContainerRef.current) return false
    const contentEl = editorContainerRef.current.querySelector('.ProseMirror')
    if (!contentEl) return false
    const contentHeight = contentEl.scrollHeight * EDITOR_TO_SLIDE_RATIO
    const over = contentHeight > SLIDE_CONTENT_HEIGHT
    setIsOverflow(over)
    return over
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      ResizableImage.configure({ inline: false }),
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start typing your slide content...'
      })
    ],
    content: slide ? markdownToHtml(slide.markdownContent, presentation?.rootPath) : '',
    editorProps: {
      attributes: {
        class: 'wysiwyg-content outline-none min-h-full'
      },
      handleKeyDown: (view, event) => {
        // Tab to indent list items, Shift+Tab to outdent
        if (event.key === 'Tab') {
          if (event.shiftKey) {
            editor?.chain().liftListItem('listItem').run()
          } else {
            editor?.chain().sinkListItem('listItem').run()
          }
          event.preventDefault()
          return true
        }
        return false
      }
    },
    onUpdate: ({ editor }) => {
      if (isInternalUpdate.current) return
      const html = editor.getHTML()
      const md = turndown.turndown(html)
        .replace(/^(\s*)\\-/gm, '$1-')
        .replace(/\\_/g, '_')
        .replace(/\\\*/g, '*')
        .replace(/\\\[/g, '[')
        .replace(/\\\]/g, ']')
        .replace(/\\`/g, '`')
        .replace(/\\\\/g, '\\')
      // Preserve textbox/shape comments from the original markdown
      const currentMd = usePresentationStore.getState().slides[slideIndex]?.markdownContent ?? ''
      const comments: string[] = []
      currentMd.replace(/<!--\s*textbox[\s\S]*?\/textbox\s*-->/gi, (m) => { comments.push(m); return '' })
      currentMd.replace(/<!--\s*shape\s[^>]*-->/gi, (m) => { comments.push(m); return '' })
      const preserved = comments.length > 0 ? md + '\n' + comments.join('\n') : md
      updateMarkdownContent(slideIndex, preserved)

      // Check overflow after update
      setTimeout(checkOverflow, 50)

      // Reset AI idle timer on typing
      resetIdleTimer()

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveSlideContent(slideIndex), 1500)
    },
    onSelectionUpdate: () => {
      resetIdleTimer()
    }
  })

  // Sync content when slide changes
  useEffect(() => {
    if (!editor || !slide) return
    const currentHtml = editor.getHTML()
    const newHtml = markdownToHtml(slide.markdownContent, presentation?.rootPath)
    // Only update if content actually changed (avoid cursor jumping)
    if (turndown.turndown(currentHtml) !== slide.markdownContent) {
      isInternalUpdate.current = true
      editor.commands.setContent(newHtml)
      isInternalUpdate.current = false
    }
  }, [slideIndex])

  // Track current text color/highlight from selection
  const [activeColor, setActiveColor] = useState('#fff')
  const [activeHighlight, setActiveHighlight] = useState('transparent')

  useEffect(() => {
    if (!editor) return
    const updateColors = () => {
      setActiveColor(editor.getAttributes('textStyle').color || '#fff')
      setActiveHighlight(editor.getAttributes('highlight').color || 'transparent')
    }
    editor.on('selectionUpdate', updateColors)
    editor.on('transaction', updateColors)
    return () => {
      editor.off('selectionUpdate', updateColors)
      editor.off('transaction', updateColors)
    }
  }, [editor])

  // Keep editor ref in sync for callbacks
  editorRef.current = editor

  const handleAIGenerate = async (): Promise<void> => {
    if (!aiPrompt.trim() || !presentation || !slide || !editorRef.current) return
    setAILoading(true)
    try {
      const result = await window.electronAPI.generateInlineText(
        aiPrompt.trim(),
        slide.markdownContent,
        presentation.config.title || 'Untitled'
      )
      if (result) {
        editorRef.current.chain().focus().insertContent(result).run()
      }
    } catch (err) {
      console.error('AI inline generation failed:', err)
    } finally {
      setAILoading(false)
      setShowAIPrompt(false)
      setShowAIButton(false)
      setAIPrompt('')
    }
  }

  if (!editor) return <div />

  const handleImageUpload = async () => {
    if (!presentation) return
    const relativePath = await window.electronAPI.uploadImage(presentation.rootPath)
    if (relativePath) {
      const encoded = relativePath.split('/').map(encodeURIComponent).join('/')
      const fullSrc = `lecta-file://${presentation.rootPath}/${relativePath}`
      editor.chain().focus().setImage({ src: fullSrc, alt: 'image' }).run()
    }
  }

  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showShapePicker, setShowShapePicker] = useState(false)
  const [showTextColor, setShowTextColor] = useState(false)
  const [showHighlight, setShowHighlight] = useState(false)

  const [showFontSize, setShowFontSize] = useState(false)

  const closeAllPickers = () => {
    setShowEmojiPicker(false)
    setShowShapePicker(false)
    setShowFontSize(false)
    setShowTextColor(false)
    setShowHighlight(false)
  }

  const insertText = (text: string) => {
    editor.chain().focus().insertContent(text).run()
  }

  return (
    <div className="flex flex-col">
      {/* WYSIWYG Toolbar */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-2 gap-0.5 flex-shrink-0">
        <WBtn
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >H1</WBtn>
        <WBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >H2</WBtn>
        <WBtn
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >H3</WBtn>
        {/* Font size picker */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowFontSize(!showFontSize) }}>
            <span className="text-[9px] flex items-center gap-0.5">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V6" />
              </svg>
            </span>
          </WBtn>
          {showFontSize && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFontSize(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-1 w-24">
                {[
                  { label: 'Small', size: '0.75em' },
                  { label: 'Normal', size: '' },
                  { label: 'Large', size: '1.25em' },
                  { label: 'XL', size: '1.5em' },
                  { label: '2XL', size: '2em' },
                  { label: '3XL', size: '3em' },
                ].map((f) => (
                  <button key={f.label} onClick={() => {
                    if (f.size) {
                      editor.chain().focus().setMark('textStyle', { fontSize: f.size }).run()
                    } else {
                      editor.chain().focus().unsetMark('textStyle').run()
                    }
                    setShowFontSize(false)
                  }}
                    className="w-full text-left px-2 py-1 text-[10px] text-gray-300 hover:bg-gray-800 rounded transition-colors"
                    style={{ fontSize: f.size || undefined }}
                  >{f.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <Sep />
        <WBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        ><b>B</b></WBtn>
        <WBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        ><i>I</i></WBtn>
        <WBtn
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        ><span className="font-mono text-[9px]">{`</>`}</span></WBtn>
        <WBtn
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        ><span className="underline text-[10px]">U</span></WBtn>
        <Sep />
        {/* Text color */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowTextColor(!showTextColor) }}>
            <span className="text-[10px] font-bold flex flex-col items-center leading-none">
              A
              <span className="w-3 h-0.5 rounded-full mt-px" style={{ backgroundColor: activeColor }} />
            </span>
          </WBtn>
          {showTextColor && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTextColor(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-40">
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_COLORS.map((c) => (
                    <button key={c.value} onClick={() => { editor.chain().focus().setColor(c.value).run(); setShowTextColor(false) }}
                      className="w-5 h-5 rounded-full border border-gray-600 hover:ring-2 hover:ring-white/50 transition-all flex-shrink-0"
                      style={{ backgroundColor: c.value }} title={c.label} />
                  ))}
                </div>
                <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowTextColor(false) }}
                  className="w-full mt-2 text-[9px] text-gray-500 hover:text-gray-300 py-0.5 border-t border-gray-800 pt-1.5">Reset color</button>
              </div>
            </>
          )}
        </div>
        {/* Highlight color */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowHighlight(!showHighlight) }}>
            <span className="text-[10px] font-bold px-0.5 rounded" style={{ backgroundColor: activeHighlight }}>H</span>
          </WBtn>
          {showHighlight && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowHighlight(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-40">
                <div className="flex flex-wrap gap-1.5">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button key={c.value || 'none'} onClick={() => {
                      if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run()
                      else editor.chain().focus().unsetHighlight().run()
                      setShowHighlight(false)
                    }}
                      className="w-5 h-5 rounded border border-gray-600 hover:ring-2 hover:ring-white/50 transition-all flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: c.value || 'transparent' }} title={c.label}>
                      {!c.value && <span className="text-[8px] text-gray-500">✕</span>}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <Sep />
        {/* Indent */}
        <WBtn onClick={() => { editor.chain().focus().sinkListItem('listItem').run() }} title="Indent">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M3 9h18M9 13.5h12M9 18h12M3 13l3 2.25L3 17.5" />
          </svg>
        </WBtn>
        <WBtn onClick={() => { editor.chain().focus().liftListItem('listItem').run() }} title="Outdent">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M3 9h18M9 13.5h12M9 18h12M6 13L3 15.25 6 17.5" />
          </svg>
        </WBtn>
        <Sep />
        <WBtn
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >•</WBtn>
        <WBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >1.</WBtn>
        <WBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >❝</WBtn>
        <WBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >{"{ }"}</WBtn>
        <Sep />
        {/* Image upload — modern icon */}
        <WBtn onClick={handleImageUpload}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18A2.25 2.25 0 0 1 23.25 6v12a2.25 2.25 0 0 1-2.25 2.25H3A2.25 2.25 0 0 1 .75 18V6A2.25 2.25 0 0 1 3 3.75Zm12.75 3a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        </WBtn>
        <WBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</WBtn>
        <WBtn title="Text box — adds a draggable text box to the slide" onClick={() => {
          const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent } = usePresentationStore.getState()
          const current = slides[currentSlideIndex]?.markdownContent ?? ''
          const textbox = '\n<!-- textbox x=100 y=300 w=300 -->Your text here<!-- /textbox -->\n'
          updateMarkdownContent(currentSlideIndex, current + textbox)
          saveSlideContent(currentSlideIndex)
        }}><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8M12 8v8" strokeLinecap="round" /></svg></WBtn>
        <Sep />
        {/* Shape insertion */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowShapePicker(!showShapePicker) }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
          </WBtn>
          {showShapePicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowShapePicker(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-36">
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-1.5 px-1">Insert Shape</div>
                {[
                  { type: 'rect', label: 'Rectangle', w: 200, h: 120, icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2" /></svg> },
                  { type: 'ellipse', label: 'Circle', w: 150, h: 150, icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><circle cx="12" cy="12" r="9" /></svg> },
                  { type: 'line', label: 'Line', w: 200, h: 10, icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" /></svg> },
                ].map((s) => (
                  <button key={s.type} onClick={() => {
                    const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent } = usePresentationStore.getState()
                    const current = slides[currentSlideIndex]?.markdownContent ?? ''
                    const shape = `\n<!-- shape type=${s.type} x=100 y=200 w=${s.w} h=${s.h} fill=transparent stroke=#ffffff sw=2 -->\n`
                    updateMarkdownContent(currentSlideIndex, current + shape)
                    saveSlideContent(currentSlideIndex)
                    setShowShapePicker(false)
                  }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-300 hover:bg-gray-800 transition-colors">
                    {s.icon}
                    {s.label}
                  </button>
                ))}
                <div className="w-full h-px bg-gray-700 my-1.5" />
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-1 px-1">Symbols</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {SHAPES.map((s) => (
                    <button key={s} onClick={() => { insertText(s); setShowShapePicker(false) }}
                      className="w-5 h-5 rounded hover:bg-gray-800 flex items-center justify-center text-[10px] transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-8 gap-0.5 mt-0.5">
                  {ARROWS.map((s) => (
                    <button key={s} onClick={() => { insertText(s); setShowShapePicker(false) }}
                      className="w-5 h-5 rounded hover:bg-gray-800 flex items-center justify-center text-[10px] transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        {/* Emoji picker */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowEmojiPicker(!showEmojiPicker) }}>
            <span className="text-[11px]">😀</span>
          </WBtn>
          {showEmojiPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-64 max-h-48 overflow-y-auto">
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-1 px-1">Emoji</div>
                <div className="grid grid-cols-10 gap-0.5">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { insertText(e); setShowEmojiPicker(false) }}
                      className="w-6 h-6 rounded hover:bg-gray-800 flex items-center justify-center text-sm transition-colors">
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="p-12 relative" ref={editorContainerRef}>
        {/* Overflow is fine — content auto-splits into sub-slides */}
        <EditorContent editor={editor} />
        {/* Inline AI button — appears after 2s idle near cursor */}
        {hasApiKey && showAIButton && !showAIPrompt && (
          <button
            onClick={() => {
              setShowAIButton(false)
              setShowAIPrompt(true)
              setTimeout(() => aiPromptInputRef.current?.focus(), 50)
            }}
            className="absolute z-20 flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-medium shadow-lg transition-all animate-fade-in"
            style={{ top: aiButtonPos.top, left: aiButtonPos.left }}
            title="Generate with AI"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            AI
          </button>
        )}
        {/* Inline AI prompt input */}
        {hasApiKey && showAIPrompt && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => { setShowAIPrompt(false); setAIPrompt('') }} />
            <div
              className="absolute z-40 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-72 animate-fade-in"
              style={{ top: aiButtonPos.top, left: Math.max(0, aiButtonPos.left - 100) }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                <span className="text-[10px] text-gray-400 font-medium">Generate with AI</span>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); handleAIGenerate() }}>
                <input
                  ref={aiPromptInputRef}
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAIPrompt(e.target.value)}
                  placeholder="Describe what to write..."
                  disabled={aiLoading}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-[11px] text-white placeholder-gray-500 outline-none focus:border-indigo-500 transition-colors"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setShowAIPrompt(false); setAIPrompt(''); editor.commands.focus() }
                  }}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[9px] text-gray-600">Enter to generate, Esc to cancel</span>
                  {aiLoading && (
                    <span className="text-[9px] text-indigo-400 animate-pulse">Generating...</span>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
        {/* Sub-slide break dividers */}
        {breakPositions.map((top, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{ top: top + 48 }} // +48 for p-12 padding
          >
            <div className="mx-0 relative" style={{ borderTop: '3px dashed rgba(99, 102, 241, 0.5)' }}>
              <span className="absolute right-2 -top-5 text-[10px] font-semibold text-indigo-400 px-2 py-0.5 rounded uppercase tracking-wider"
                style={{ background: 'var(--slide-bg, #0a0a0a)' }}>
                Sub-slide {i + 2}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WBtn({ children, onClick, active, title }: { children: React.ReactNode; onClick: () => void; active?: boolean; title?: string }): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 rounded text-[11px] transition-colors ${
        active ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Sep(): JSX.Element {
  return <div className="w-px h-4 bg-gray-700 mx-0.5" />
}
