import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore, COLOR_PALETTES } from '../../stores/ui-store'

interface SlideEditToolbarProps {
  editorRef: React.RefObject<any>
}

export function SlideEditToolbar({ editorRef }: SlideEditToolbarProps): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } =
    usePresentationStore()
  const { palette, setPalette } = useUIStore()
  const [showPalette, setShowPalette] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [genLabel, setGenLabel] = useState('')

  const currentSlide = slides[currentSlideIndex]

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current
    if (!editor) {
      const current = currentSlide?.markdownContent ?? ''
      updateMarkdownContent(currentSlideIndex, current + '\n' + text)
      return
    }
    const selection = editor.getSelection()
    if (selection) {
      editor.executeEdits('toolbar', [{
        range: selection,
        text,
        forceMoveMarkers: true
      }])
      editor.focus()
    }
  }

  const wrapSelection = (before: string, after: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (selection && model) {
      const selectedText = model.getValueInRange(selection)
      editor.executeEdits('toolbar', [{
        range: selection,
        text: `${before}${selectedText || 'text'}${after}`,
        forceMoveMarkers: true
      }])
      editor.focus()
    }
  }

  const handleBeautify = async () => {
    if (!presentation || !currentSlide) return
    setIsGenerating(true)
    setGenLabel('Beautifying...')
    try {
      const result = await window.electronAPI.beautifySlide(
        currentSlide.markdownContent,
        presentation.title
      )
      updateMarkdownContent(currentSlideIndex, result)
      saveSlideContent(currentSlideIndex)
    } catch (err) {
      console.error('Beautify failed:', err)
    } finally {
      setIsGenerating(false)
      setGenLabel('')
    }
  }

  return (
    <div className="bg-gray-900 border-b border-gray-800">
      {/* Format bar */}
      <div className="h-8 flex items-center px-2 gap-0.5">
        <Btn title="Heading 1" onClick={() => insertAtCursor('\n# ')}>H1</Btn>
        <Btn title="Heading 2" onClick={() => insertAtCursor('\n## ')}>H2</Btn>
        <Btn title="Heading 3" onClick={() => insertAtCursor('\n### ')}>H3</Btn>
        <Sep />
        <Btn title="Bold" onClick={() => wrapSelection('**', '**')}><b>B</b></Btn>
        <Btn title="Italic" onClick={() => wrapSelection('*', '*')}><i>I</i></Btn>
        <Btn title="Code" onClick={() => wrapSelection('`', '`')}><span className="font-mono text-[9px]">{`</>`}</span></Btn>
        <Sep />
        <Btn title="Bullet list" onClick={() => insertAtCursor('\n- ')}>•</Btn>
        <Btn title="Numbered list" onClick={() => insertAtCursor('\n1. ')}>1.</Btn>
        <Btn title="Table" onClick={() => insertAtCursor('\n| Col 1 | Col 2 |\n|-------|-------|\n| data  | data  |\n')}>⊞</Btn>
        <Btn title="Code block" onClick={() => insertAtCursor('\n```\n\n```\n')}>{"{ }"}</Btn>
        <Btn title="Blockquote" onClick={() => insertAtCursor('\n> ')}>❝</Btn>
        <Btn title="Divider" onClick={() => insertAtCursor('\n---\n')}>—</Btn>
        <Btn title="Mermaid diagram" onClick={() => insertAtCursor('\n```mermaid\ngraph LR\n    A[Start] --> B[Process]\n    B --> C[End]\n```\n')}>◇</Btn>
        <Btn title="Upload image" onClick={async () => {
          if (!presentation) return
          const relativePath = await window.electronAPI.uploadImage(presentation.rootPath)
          if (relativePath) {
            // Encode spaces/special chars so markdown parser doesn't break
            const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
            insertAtCursor(`\n![image](${encodedPath})\n`)
          }
        }}>🖼</Btn>
        <Sep />
        <Btn
          title="Beautify with AI — clean up and professionalize this slide"
          onClick={handleBeautify}
          disabled={isGenerating}
          accent
        >
          {isGenerating ? genLabel : '✨ Beautify'}
        </Btn>
        <Sep />
        {/* Color palette picker */}
        <div className="relative">
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            title="Color palette"
          >
            <span
              className="w-3 h-3 rounded-full border border-gray-600"
              style={{ backgroundColor: palette.accent }}
            />
            <span className="hidden sm:inline">{palette.name}</span>
          </button>
          {showPalette && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2 w-36">
              {COLOR_PALETTES.map((p) => (
                <button
                  key={p.name}
                  onClick={() => { setPalette(p); setShowPalette(false) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    p.name === palette.name ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.accent }} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI prompt bar */}
      <AIPromptBar
        editorRef={editorRef}
        currentSlide={currentSlide}
        presentation={presentation}
        updateMarkdownContent={updateMarkdownContent}
        currentSlideIndex={currentSlideIndex}
      />
    </div>
  )
}

function AIPromptBar({
  editorRef,
  currentSlide,
  presentation,
  updateMarkdownContent,
  currentSlideIndex
}: {
  editorRef: React.RefObject<any>
  currentSlide: any
  presentation: any
  updateMarkdownContent: (i: number, c: string) => void
  currentSlideIndex: number
}): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!prompt.trim() || !presentation || !currentSlide) return
    setIsGenerating(true)
    try {
      const result = await window.electronAPI.generateSlideContent(
        prompt,
        presentation.title,
        currentSlide.markdownContent
      )
      // Replace entire slide content with AI result
      updateMarkdownContent(currentSlideIndex, result)
      setPrompt('')
    } catch (err) {
      console.error('AI generation failed:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="h-9 flex items-center px-2 gap-2 border-t border-gray-800/50">
      <SparklesIcon />
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        placeholder="Describe what you want... (Enter to generate)"
        disabled={isGenerating}
        className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600
                   focus:outline-none disabled:opacity-50"
      />
      {prompt.trim() && (
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-3 py-1 bg-white hover:bg-gray-200 disabled:opacity-50
                     text-black text-[11px] font-medium rounded-md transition-colors
                     flex items-center gap-1.5"
        >
          {isGenerating ? (
            <>
              <Spinner />
              Generating...
            </>
          ) : (
            'Generate'
          )}
        </button>
      )}
    </div>
  )
}

function Btn({
  children,
  title,
  onClick,
  disabled,
  accent
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  accent?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`px-1.5 py-0.5 rounded text-[11px] transition-colors disabled:opacity-40 ${
        accent
          ? 'bg-white/10 text-gray-300 hover:bg-white/20'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function Sep(): JSX.Element {
  return <div className="w-px h-4 bg-gray-700 mx-0.5" />
}

function Spinner(): JSX.Element {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}
