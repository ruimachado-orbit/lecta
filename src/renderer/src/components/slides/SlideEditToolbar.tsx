import { useEffect, useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useImageStore } from '../../stores/image-store'
import { useUIStore, COLOR_PALETTES } from '../../stores/ui-store'
import { requireAI, showAIError } from '../ai/AIAlert'
import { GRADIENT_PRESETS } from './style-presets'
import { applySlideBackground, patchSlideBackground } from './slide-background'

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
    if (!requireAI()) return
    setIsGenerating(true)
    setGenLabel('Beautifying...')
    try {
      const result = await window.electronAPI.beautifySlide(
        currentSlide.markdownContent,
        presentation.title,
        currentSlide.config.layout
      )
      usePresentationStore.getState().applyAIContent(currentSlideIndex, result)
    } catch (err) {
      showAIError(err)
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
        <Btn title="Divider (horizontal rule)" onClick={() => insertAtCursor('\n---\n')}>—</Btn>
        <Btn title="Add subslide" onClick={() => {
          const current = currentSlide?.markdownContent ?? ''
          updateMarkdownContent(currentSlideIndex, current.trimEnd() + '\n\n---\n\n')
          saveSlideContent(currentSlideIndex)
          setTimeout(() => useUIStore.getState().setEditorMode('wysiwyg'), 50)
        }} accent>+ Subslide</Btn>
        <Btn title="Mermaid diagram" onClick={() => insertAtCursor('\n```mermaid\ngraph LR\n    A[Start] --> B[Process]\n    B --> C[End]\n```\n')}>◇</Btn>
        <Btn title="2 columns" onClick={() => insertAtCursor('\n<!-- columns -->\nLeft column content\n<!-- col -->\nRight column content\n<!-- /columns -->\n')}>▥</Btn>
        <Btn title="3 columns" onClick={() => insertAtCursor('\n<!-- columns -->\nColumn 1\n<!-- col -->\nColumn 2\n<!-- col -->\nColumn 3\n<!-- /columns -->\n')}>▦</Btn>
        <Btn title="Text box" onClick={() => insertAtCursor('\n<!-- textbox x=100 y=400 w=300 -->Your text here<!-- /textbox -->\n')}>T▢</Btn>
        <Btn title="Upload image" onClick={async () => {
          if (!presentation) return
          const relativePath = await window.electronAPI.uploadImage(presentation.rootPath)
          if (relativePath) {
            // Encode spaces/special chars so markdown parser doesn't break
            const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
            insertAtCursor(`\n![image](${encodedPath})\n`)
          }
        }}>🖼</Btn>
        <BackgroundPicker />
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
            aria-label="Color palette"
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
    if (!requireAI()) return
    setIsGenerating(true)
    try {
      const result = await window.electronAPI.generateSlideContent(
        prompt,
        presentation.title,
        currentSlide.markdownContent
      )
      // Replace entire slide content with AI result (refused for executable .mdx slides)
      const applied = usePresentationStore.getState().applyAIContent(currentSlideIndex, result, false)
      if (applied) setPrompt('')
    } catch (err) {
      showAIError(err)
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

/**
 * Per-slide backdrop picker: a colour, one of six gradients, or an image from the deck's
 * image library. Backdrops live in `lecta.yaml`, so the change is written straight to the
 * manifest rather than into the slide markdown.
 */
function BackgroundPicker(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const background = usePresentationStore((s) => s.presentation?.slides[s.currentSlideIndex]?.background)
  const { images, loadImagesFromWorkspace } = useImageStore()
  const [open, setOpen] = useState(false)

  const rootPath = presentation?.rootPath
  useEffect(() => {
    if (open && rootPath) void loadImagesFromWorkspace(rootPath)
  }, [open, rootPath, loadImagesFromWorkspace])

  const set = (patch: Parameters<typeof patchSlideBackground>[1]) =>
    void patchSlideBackground(currentSlideIndex, patch)

  const preview =
    background?.gradient || (background?.color ? background.color : undefined) || 'repeating-conic-gradient(#4b5563 0% 25%, #374151 0% 50%) 50% / 6px 6px'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        title="Slide background"
        aria-label="Slide background"
      >
        <span className="w-3 h-3 rounded-sm border border-gray-600" style={{ background: preview }} />
        <span className="hidden sm:inline">Background</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-gray-700 bg-gray-900 p-2.5 shadow-2xl space-y-2.5">
            <Field label="Gradient">
              <div className="grid grid-cols-6 gap-1">
                {GRADIENT_PRESETS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => set({ gradient: g.css })}
                    title={g.label}
                    aria-label={g.label}
                    className={`h-6 rounded border transition-colors ${background?.gradient === g.css ? 'border-white' : 'border-gray-700 hover:border-gray-500'}`}
                    style={{ background: g.css }}
                  />
                ))}
              </div>
            </Field>

            <Field label="Colour">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={background?.color ?? '#0f172a'}
                  onChange={(e) => set({ color: e.target.value })}
                  className="h-6 w-10 rounded border border-gray-700 bg-transparent"
                  aria-label="Background colour"
                />
                <button
                  onClick={() => set({ color: undefined })}
                  className="text-[10px] text-gray-500 hover:text-gray-300"
                >
                  Clear colour
                </button>
              </div>
            </Field>

            <Field label="Image">
              <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
                {images.slice(0, 12).map((img) => (
                  <button
                    key={img.relativePath}
                    onClick={() => set({ image: img.relativePath })}
                    title={img.relativePath}
                    aria-label={img.relativePath}
                    className={`h-9 w-12 rounded border overflow-hidden ${background?.image === img.relativePath ? 'border-white' : 'border-gray-700 hover:border-gray-500'}`}
                  >
                    <img src={img.fullSrc} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                {images.length === 0 && <span className="text-[10px] text-gray-600">No images in this deck yet.</span>}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!rootPath) return
                    const relative = await window.electronAPI.uploadImage(rootPath)
                    if (relative) set({ image: relative })
                  }}
                  className="text-[10px] text-indigo-300 hover:text-indigo-200"
                >
                  Upload…
                </button>
                {background?.image && (
                  <button onClick={() => set({ image: undefined })} className="text-[10px] text-gray-500 hover:text-gray-300">
                    Remove image
                  </button>
                )}
              </div>
            </Field>

            <Field label={`Overlay · ${background?.overlay ?? 0}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={background?.overlay ?? 0}
                onChange={(e) => set({ overlay: Number(e.target.value) || undefined })}
                className="w-full accent-indigo-500"
                aria-label="Background overlay"
              />
            </Field>

            <button
              onClick={() => { void applySlideBackground(currentSlideIndex, undefined); setOpen(false) }}
              className="w-full rounded-md border border-gray-700 py-1 text-[10px] text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            >
              Clear background
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      {children}
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
      aria-label={title}
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
