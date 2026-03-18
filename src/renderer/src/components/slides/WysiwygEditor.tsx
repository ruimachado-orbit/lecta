import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import { ResizableImage } from '../../extensions/resizable-image'
import TurndownService from 'turndown'
import { usePresentationStore } from '../../stores/presentation-store'

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

// Custom rule to preserve image width in markdown
turndown.addRule('image-with-width', {
  filter: (node) => node.nodeName === 'IMG',
  replacement: (_content, node) => {
    const el = node as HTMLImageElement
    let src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    // Strip lecta-file:// prefix for storage
    src = src.replace(/^lecta-file:\/\//, '')
    return `![${alt}](${src})`
  }
})

// Convert markdown to simple HTML for TipTap
function markdownToHtml(md: string, rootPath?: string): string {
  const lines = md.split('\n')
  const html: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Skip blank lines (don't create empty elements)
    if (!line.trim()) {
      // If in a list and next line is also a list item, continue the list
      const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim())
      if (inList && nextNonEmpty && nextNonEmpty.match(/^[-*+] /)) continue
      if (inList) { html.push('</ul>'); inList = false }
      continue
    }

    // Images
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imgMatch) {
      if (inList) { html.push('</ul>'); inList = false }
      const resolved = resolveImageSrc(imgMatch[2], rootPath)
      html.push(`<img alt="${imgMatch[1]}" src="${resolved}" />`)
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)$/)
    if (h3) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h3>${processInline(h3[1])}</h3>`); continue }
    const h2 = line.match(/^## (.+)$/)
    if (h2) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h2>${processInline(h2[1])}</h2>`); continue }
    const h1 = line.match(/^# (.+)$/)
    if (h1) { if (inList) { html.push('</ul>'); inList = false }; html.push(`<h1>${processInline(h1[1])}</h1>`); continue }

    // Horizontal rule
    if (line.match(/^---+$/)) { if (inList) { html.push('</ul>'); inList = false }; html.push('<hr>'); continue }

    // List items (-, *, +)
    const li = line.match(/^[-*+] (.+)$/)
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${processInline(li[1])}</li>`)
      continue
    }

    // Paragraph
    if (inList) { html.push('</ul>'); inList = false }
    html.push(`<p>${processInline(line)}</p>`)
  }

  if (inList) html.push('</ul>')
  return html.join('')
}

function processInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
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

  // Compute visual Y positions for sub-slide break lines by measuring ProseMirror blocks
  const computeBreaks = useCallback(() => {
    if (!editorContainerRef.current) { setBreakPositions([]); return }
    const contentEl = editorContainerRef.current.querySelector('.ProseMirror')
    if (!contentEl) { setBreakPositions([]); return }

    const children = Array.from(contentEl.children) as HTMLElement[]
    if (children.length === 0) { setBreakPositions([]); return }

    const positions: number[] = []
    let accumulatedSlideHeight = 0
    const contentTop = children[0]?.offsetTop ?? 0

    for (const child of children) {
      // Approximate how much slide height this block takes up
      const blockHeight = child.offsetHeight * EDITOR_TO_SLIDE_RATIO

      if (accumulatedSlideHeight + blockHeight > SLIDE_CONTENT_HEIGHT && accumulatedSlideHeight > 0) {
        // This block would overflow — mark a break before it
        positions.push(child.offsetTop - contentTop)
        accumulatedSlideHeight = blockHeight
      } else {
        accumulatedSlideHeight += blockHeight
      }
    }

    setBreakPositions(positions)
  }, [slide?.markdownContent])

  useEffect(() => {
    computeBreaks()
    // Recompute after a short delay for async content (images etc.)
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
      ResizableImage.configure({ inline: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start typing your slide content...'
      })
    ],
    content: slide ? markdownToHtml(slide.markdownContent.replace(/<!--.*?-->/gs, ''), presentation?.rootPath) : '',
    editorProps: {
      attributes: {
        class: 'wysiwyg-content outline-none min-h-full'
      },
      handleKeyDown: (_view, event) => {
        // Block Enter when content overflows slide height
        if (event.key === 'Enter' && checkOverflow()) {
          return true // prevent
        }
        return false
      }
    },
    onUpdate: ({ editor }) => {
      if (isInternalUpdate.current) return
      const html = editor.getHTML()
      const md = turndown.turndown(html)
      updateMarkdownContent(slideIndex, md)

      // Check overflow after update
      setTimeout(checkOverflow, 50)

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => saveSlideContent(slideIndex), 1500)
    }
  })

  // Sync content when slide changes
  useEffect(() => {
    if (!editor || !slide) return
    const currentHtml = editor.getHTML()
    const newHtml = markdownToHtml(slide.markdownContent.replace(/<!--.*?-->/gs, ''), presentation?.rootPath)
    // Only update if content actually changed (avoid cursor jumping)
    if (turndown.turndown(currentHtml) !== slide.markdownContent) {
      isInternalUpdate.current = true
      editor.commands.setContent(newHtml)
      isInternalUpdate.current = false
    }
  }, [slideIndex])

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

  const closeAllPickers = () => {
    setShowEmojiPicker(false)
    setShowShapePicker(false)
    setShowTextColor(false)
    setShowHighlight(false)
  }

  const insertText = (text: string) => {
    editor.chain().focus().insertContent(text).run()
  }

  return (
    <div className="h-full flex flex-col">
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
            <span className="text-[10px] font-bold" style={{ color: editor.getAttributes('textStyle').color || '#fff' }}>A</span>
          </WBtn>
          {showTextColor && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowTextColor(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2">
                <div className="grid grid-cols-5 gap-1">
                  {TEXT_COLORS.map((c) => (
                    <button key={c.value} onClick={() => { editor.chain().focus().setColor(c.value).run(); setShowTextColor(false) }}
                      className="w-6 h-6 rounded-full border border-gray-700 hover:scale-110 transition-transform"
                      style={{ backgroundColor: c.value }} title={c.label} />
                  ))}
                </div>
                <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowTextColor(false) }}
                  className="w-full mt-1 text-[9px] text-gray-500 hover:text-gray-300 py-0.5">Reset</button>
              </div>
            </>
          )}
        </div>
        {/* Highlight color */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowHighlight(!showHighlight) }}>
            <span className="text-[10px] font-bold px-0.5 rounded" style={{ backgroundColor: editor.getAttributes('highlight').color || 'transparent' }}>H</span>
          </WBtn>
          {showHighlight && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowHighlight(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2">
                <div className="grid grid-cols-4 gap-1">
                  {HIGHLIGHT_COLORS.map((c) => (
                    <button key={c.value || 'none'} onClick={() => {
                      if (c.value) editor.chain().focus().setHighlight({ color: c.value }).run()
                      else editor.chain().focus().unsetHighlight().run()
                      setShowHighlight(false)
                    }}
                      className="w-6 h-6 rounded border border-gray-700 hover:scale-110 transition-transform flex items-center justify-center"
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
        <Sep />
        {/* Shapes picker */}
        <div className="relative">
          <WBtn onClick={() => { closeAllPickers(); setShowShapePicker(!showShapePicker) }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
            </svg>
          </WBtn>
          {showShapePicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowShapePicker(false)} />
              <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-48">
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mb-1 px-1">Shapes</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {SHAPES.map((s) => (
                    <button key={s} onClick={() => { insertText(s); setShowShapePicker(false) }}
                      className="w-6 h-6 rounded hover:bg-gray-800 flex items-center justify-center text-sm transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
                <div className="text-[8px] text-gray-500 uppercase tracking-wider mt-2 mb-1 px-1">Arrows</div>
                <div className="grid grid-cols-8 gap-0.5">
                  {ARROWS.map((s) => (
                    <button key={s} onClick={() => { insertText(s); setShowShapePicker(false) }}
                      className="w-6 h-6 rounded hover:bg-gray-800 flex items-center justify-center text-sm transition-colors">
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
      <div className="flex-1 overflow-y-auto p-12 relative" ref={editorContainerRef}>
        {isOverflow && (
          <div className="sticky top-0 z-10 -mx-12 -mt-12 mb-2 px-3 py-1 bg-red-500/10 border-b border-red-500/20 text-red-400 text-[10px] text-center">
            Slide limit reached — content exceeds visible area
          </div>
        )}
        <EditorContent editor={editor} />
        {/* Sub-slide break dividers */}
        {breakPositions.map((top, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 pointer-events-none"
            style={{ top: top + 24 }} // +24 for p-6 padding
          >
            <div className="mx-2 border-t-2 border-dashed border-gray-500 relative">
              <span className="absolute right-0 -top-4 text-[9px] text-gray-400 bg-gray-950 px-1 uppercase tracking-wider">
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
