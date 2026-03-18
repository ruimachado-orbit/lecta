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
import { useNotebookStore } from '../../stores/notebook-store'

// ---------- constants ----------

const SHAPES = [
  '\u25A0', '\u25A1', '\u25AA', '\u25AB', '\u25CF', '\u25CB', '\u25C6', '\u25C7',
  '\u25B2', '\u25B3', '\u25BC', '\u25BD', '\u25C0', '\u25B6', '\u2605', '\u2606',
  '\u2660', '\u2663', '\u2665', '\u2666', '\u2B1F', '\u2B21', '\u2B22', '\u25C9',
]

const ARROWS = [
  '\u2192', '\u2190', '\u2191', '\u2193', '\u2197', '\u2198', '\u2199', '\u2196',
  '\u27F6', '\u27F5', '\u21D2', '\u21D0', '\u21D1', '\u21D3', '\u2194', '\u2195',
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
  '\u{1F600}', '\u{1F602}', '\u{1F923}', '\u{1F60A}', '\u{1F60D}', '\u{1F914}', '\u{1F60E}', '\u{1F973}', '\u{1F92F}', '\u{1F631}',
  '\u{1F44D}', '\u{1F44E}', '\u{1F44F}', '\u{1F64C}', '\u{1F4AA}', '\u{1F91D}', '\u270C\uFE0F', '\u{1FAE1}', '\u{1F3AF}', '\u{1F525}',
  '\u2B50', '\u{1F4A1}', '\u{1F680}', '\u{1F48E}', '\u{1F3C6}', '\u{1F389}', '\u2764\uFE0F', '\u{1F4AF}', '\u2705', '\u274C',
  '\u26A1', '\u{1F511}', '\u{1F6E1}\uFE0F', '\u2699\uFE0F', '\u{1F4CA}', '\u{1F4C8}', '\u{1F4C9}', '\u{1F5C2}\uFE0F', '\u{1F4CB}', '\u{1F514}',
  '\u{1F30D}', '\u{1F31F}', '\u{1F4BB}', '\u{1F4F1}', '\u{1F5A5}\uFE0F', '\u{1F512}', '\u{1F513}', '\u{1F4E1}', '\u{1F9E0}', '\u{1F916}',
  '\u26A0\uFE0F', '\u{1F6A7}', '\u{1F4AC}', '\u{1F4CC}', '\u{1F3D7}\uFE0F', '\u{1F504}', '\u{1F4E6}', '\u{1F3AF}', '\u{1F9E9}', '\u{1F517}',
]

// ---------- turndown ----------

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced'
})

turndown.addRule('colored-text', {
  filter: (node) =>
    node.nodeName === 'SPAN' && !!(node as HTMLElement).style.color,
  replacement: (content, node) => {
    const color = (node as HTMLElement).style.color
    if (!color || !content.trim()) return content
    return `<span style="color: ${color}">${content}</span>`
  }
})

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

turndown.addRule('underline', {
  filter: ['u'],
  replacement: (content) => `<u>${content}</u>`
})

turndown.addRule('strikethrough', {
  filter: ['s', 'del', 'strike'],
  replacement: (content) => `~~${content}~~`
})

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

// ---------- markdown -> html ----------

function resolveImageSrc(src: string, rootPath?: string): string {
  if (!src) return ''
  if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('lecta-file://')) return src
  if (src.startsWith('file://')) return src.replace('file://', 'lecta-file://')
  if (rootPath) return `lecta-file://${rootPath}/${decodeURIComponent(src)}`
  return src
}

function markdownToHtml(md: string, rootPath?: string): string {
  const lines = md.split('\n')
  const html: string[] = []
  let inList = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    if (!line.trim()) {
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

    // List items
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
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

// ---------- component ----------

interface NoteEditorProps {
  pageIndex: number
}

export function NoteEditor({ pageIndex }: NoteEditorProps): JSX.Element {
  const { pages, updateMarkdownContent, savePageContent, notebook } = useNotebookStore()
  const page = pages[pageIndex]
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const isInternalUpdate = useRef(false)
  const editorContainerRef = useRef<HTMLDivElement>(null)

  // Strikethrough hover state
  const [strikeButton, setStrikeButton] = useState<{ top: number; left: number } | null>(null)
  const strikeTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const editorRef = useRef<ReturnType<typeof useEditor>>(null)

  const resetStrikeTimer = useCallback(() => {
    setStrikeButton(null)
    if (strikeTimerRef.current) clearTimeout(strikeTimerRef.current)
    strikeTimerRef.current = setTimeout(() => {
      if (!editorContainerRef.current) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const containerRect = editorContainerRef.current.getBoundingClientRect()
      setStrikeButton({
        top: rect.top - containerRect.top + editorContainerRef.current.scrollTop - 28,
        left: rect.left - containerRect.left + rect.width / 2
      })
    }, 2000)
  }, [])

  useEffect(() => {
    return () => { if (strikeTimerRef.current) clearTimeout(strikeTimerRef.current) }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        strike: true
      }),
      ResizableImage.configure({ inline: false }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      Placeholder.configure({
        placeholder: 'Start writing your note...'
      })
    ],
    content: page ? markdownToHtml(page.markdownContent.replace(/<!--.*?-->/gs, ''), notebook?.rootPath) : '',
    editorProps: {
      attributes: {
        class: 'wysiwyg-content outline-none min-h-[200px]'
      }
    },
    onUpdate: ({ editor }) => {
      if (isInternalUpdate.current) return
      const html = editor.getHTML()
      const md = turndown.turndown(html)
      updateMarkdownContent(pageIndex, md)

      resetStrikeTimer()

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => savePageContent(pageIndex), 1500)
    },
    onSelectionUpdate: () => {
      resetStrikeTimer()
    }
  })

  // Sync content when page changes
  useEffect(() => {
    if (!editor || !page) return
    const currentHtml = editor.getHTML()
    const newHtml = markdownToHtml(page.markdownContent.replace(/<!--.*?-->/gs, ''), notebook?.rootPath)
    if (turndown.turndown(currentHtml) !== page.markdownContent) {
      isInternalUpdate.current = true
      editor.commands.setContent(newHtml)
      isInternalUpdate.current = false
    }
  }, [pageIndex])

  // Track current text color / highlight from selection
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

  editorRef.current = editor

  if (!editor) return <div />

  const handleImageUpload = async () => {
    if (!notebook) return
    const relativePath = await window.electronAPI.uploadImage(notebook.rootPath)
    if (relativePath) {
      const fullSrc = `lecta-file://${notebook.rootPath}/${relativePath}`
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
        <WBtn
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        ><span className="line-through text-[10px]">S</span></WBtn>
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
                      {!c.value && <span className="text-[8px] text-gray-500">{'\u2715'}</span>}
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
        >{'\u2022'}</WBtn>
        <WBtn
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >1.</WBtn>
        <WBtn
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >{'\u275D'}</WBtn>
        <WBtn
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >{"{ }"}</WBtn>
        <Sep />
        {/* Image upload */}
        <WBtn onClick={handleImageUpload}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18A2.25 2.25 0 0 1 23.25 6v12a2.25 2.25 0 0 1-2.25 2.25H3A2.25 2.25 0 0 1 .75 18V6A2.25 2.25 0 0 1 3 3.75Zm12.75 3a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
          </svg>
        </WBtn>
        <WBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}>{'\u2014'}</WBtn>
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
            <span className="text-[11px]">{'\u{1F600}'}</span>
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

      {/* Scrollable Editor */}
      <div className="flex-1 overflow-y-auto p-8 relative" ref={editorContainerRef}>
        <EditorContent editor={editor} />
        {/* Strikethrough button — appears after hovering 2s over selected text */}
        {strikeButton && (
          <button
            onClick={() => {
              editor.chain().focus().toggleStrike().run()
              setStrikeButton(null)
            }}
            className="absolute z-20 flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-medium shadow-lg transition-all animate-fade-in border border-gray-700"
            style={{ top: strikeButton.top, left: strikeButton.left, transform: 'translateX(-50%)' }}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- sub-components ----------

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
