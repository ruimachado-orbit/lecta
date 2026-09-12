import { useState, useEffect } from 'react'
import { useChatStore } from '../../stores/chat-store'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { ModelSelector } from '../ai/ModelSelector'
import { requireAI, showAIError } from '../ai/AIAlert'

export function AIGeneratePanel(): JSX.Element {
  const { presentation, slides, currentSlideIndex } = usePresentationStore()
  const pendingGeneratePrompt = useUIStore((s) => s.pendingGeneratePrompt)
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(5)
  const [position, setPosition] = useState<'after' | 'start' | 'end'>('after')
  const [isGenerating, setIsGenerating] = useState(false)
  const [useArtifacts, setUseArtifacts] = useState(true)

  const currentSlide = slides[currentSlideIndex]

  // `/deck <prompt>` in the chat opens this form with the prompt already in it.
  useEffect(() => {
    if (!pendingGeneratePrompt) return
    setPrompt(pendingGeneratePrompt)
    useUIStore.getState().setPendingGeneratePrompt(null)
  }, [pendingGeneratePrompt])

  const getArtifactContext = (): string | undefined => {
    if (!useArtifacts || !currentSlide) return undefined
    const parts: string[] = []
    if (currentSlide.codeContent) {
      parts.push(`Code (${currentSlide.config.code?.language}):\n${currentSlide.codeContent}`)
    }
    if (currentSlide.config.video) {
      parts.push(`Video: ${currentSlide.config.video.url}`)
    }
    if (currentSlide.config.webapp) {
      parts.push(`Web App: ${currentSlide.config.webapp.url}`)
    }
    if (currentSlide.config.artifacts.length > 0) {
      parts.push(`Artifacts: ${currentSlide.config.artifacts.map(a => a.label).join(', ')}`)
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || !presentation) return
    if (!requireAI()) return
    setIsGenerating(true)
    try {
      const existingContent = slides.map((s) => s.markdownContent)
      const artifactContext = getArtifactContext()

      const generated = await window.electronAPI.generateBulkSlides(
        prompt,
        presentation.title,
        existingContent,
        count,
        artifactContext
      )

      if (generated.length > 0) {
        const marked = generated.map((s: { id?: string; markdown: string }, i: number) => ({
          ...s,
          id: s.id || `ai-slide-${Date.now()}-${i + 1}`,
          markdown: `<!-- ai-generated -->\n${s.markdown}`
        }))

        const insertAfter = position === 'start' ? -1
          : position === 'end' ? slides.length - 1
          : currentSlideIndex

        const loaded = await window.electronAPI.addBulkSlides(
          presentation.rootPath,
          marked,
          insertAfter
        )

        usePresentationStore.setState({
          presentation: loaded.config,
          slides: loaded.slides,
          currentSlideIndex: insertAfter + 1,
          error: null
        })
      }

      setPrompt('')
    } catch (err) {
      showAIError(err)
    } finally {
      setIsGenerating(false)
    }
  }

  const hasArtifacts = currentSlide && (
    currentSlide.codeContent ||
    currentSlide.config.video ||
    currentSlide.config.webapp ||
    currentSlide.config.artifacts.length > 0
  )

  return (
    <div className="bg-gray-900 border-t border-gray-800 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <SparklesIcon />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex-1">AI Slide Generator</span>
        <button onClick={() => useUIStore.getState().toggleAIGenerate()}
          className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
          title="Close" aria-label="Close">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleGenerate())}
        placeholder={slides.length <= 1
          ? "Describe your presentation topic... (e.g. 'Introduction to Docker containers for beginners')"
          : "Describe what to add... (e.g. 'Add slides about deployment strategies')"
        }
        disabled={isGenerating}
        rows={2}
        className="w-full px-3 py-2 bg-gray-950 text-sm text-gray-300 rounded-lg border border-gray-700
                   focus:border-white focus:outline-none placeholder-gray-600 resize-none disabled:opacity-50"
      />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-gray-500">Slides:</label>
          <button
            onClick={() => setCount(Math.max(1, count - 1))}
            disabled={isGenerating}
            className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] flex items-center justify-center disabled:opacity-30"
          >-</button>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) setCount(Math.max(1, Math.min(50, v)))
            }}
            disabled={isGenerating}
            className="w-8 text-center text-xs text-gray-300 bg-gray-950 border border-gray-700 rounded py-0.5
                       focus:border-indigo-500 focus:outline-none disabled:opacity-30
                       [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            onClick={() => setCount(Math.min(50, count + 1))}
            disabled={isGenerating}
            className="w-5 h-5 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] flex items-center justify-center disabled:opacity-30"
          >+</button>
        </div>

        <div className="flex items-center gap-1 bg-gray-950 rounded border border-gray-700 p-0.5">
          {([
            { value: 'after' as const, label: 'After current' },
            { value: 'start' as const, label: 'Start' },
            { value: 'end' as const, label: 'End' },
          ]).map((p) => (
            <button key={p.value} onClick={() => setPosition(p.value)}
              className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                position === p.value ? 'bg-white text-black font-medium' : 'text-gray-500 hover:text-gray-300'
              }`}
            >{p.label}</button>
          ))}
        </div>

        {hasArtifacts && (
          <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={useArtifacts}
              onChange={(e) => setUseArtifacts(e.target.checked)}
              className="rounded border-gray-600"
            />
            Use artifact context
          </label>
        )}

        <ModelSelector compact />

        <div className="flex-1" />

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="px-4 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40
                     text-black text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
        >
          {isGenerating ? (
            <>
              <Spinner />
              Generating {count} slides...
            </>
          ) : (
            `Generate ${count} slides`
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * The refine bar for AI-generated slides is now one button: typing happens in the
 * chat, where `/improve` runs the very same `improveSlide` call.
 */
export function AIImproveBar(): JSX.Element {
  const slides = usePresentationStore((s) => s.slides)
  const currentSlideIndex = usePresentationStore((s) => s.currentSlideIndex)
  const openWithPrefill = useChatStore((s) => s.openWithPrefill)

  const currentSlide = slides[currentSlideIndex]
  if (!currentSlide?.markdownContent?.includes('<!-- ai-generated -->')) return <></>

  return (
    <button
      onClick={() => {
        if (!requireAI()) return
        openWithPrefill('/improve ')
      }}
      className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
      title="This slide was AI-generated — refine it in the chat"
      aria-label="Refine this AI-generated slide in the chat"
    >
      <span className="text-white">✦ AI</span>
      Refine
    </button>
  )
}

/**
 * "Improve with AI" — opens the chat with `/improve ` ready to type. The prompt
 * bar and its accept/reject preview are gone: the chat is the one place to type,
 * and undo (Cmd+Z) restores the previous content.
 */
export function AIChangeBar(): JSX.Element {
  const openWithPrefill = useChatStore((s) => s.openWithPrefill)

  return (
    <button
      onClick={() => {
        if (!requireAI()) return
        openWithPrefill('/improve ')
      }}
      className="flex items-center gap-1 px-2 py-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 text-[10px] rounded transition-colors"
      title="Improve this slide with AI"
      aria-label="Improve this slide with AI"
    >
      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
      Improve with AI
    </button>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}

function Spinner(): JSX.Element {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
