import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { ResizableImage } from '../../extensions/resizable-image'
import TurndownService from 'turndown'
import { usePresentationStore } from '../../stores/presentation-store'

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }
      }),
      ResizableImage.configure({ inline: false }),
      Placeholder.configure({
        placeholder: 'Start typing your slide content...'
      })
    ],
    content: slide ? markdownToHtml(slide.markdownContent.replace(/<!--.*?-->/gs, ''), presentation?.rootPath) : '',
    editorProps: {
      attributes: {
        class: 'wysiwyg-content outline-none min-h-full'
      }
    },
    onUpdate: ({ editor }) => {
      if (isInternalUpdate.current) return
      const html = editor.getHTML()
      const md = turndown.turndown(html)
      updateMarkdownContent(slideIndex, md)

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
        <WBtn onClick={handleImageUpload}>🖼</WBtn>
        <WBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</WBtn>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto p-6 relative" ref={editorContainerRef}>
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

function WBtn({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }): JSX.Element {
  return (
    <button
      onClick={onClick}
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
