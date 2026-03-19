import { useState, useEffect, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { ModelSelector } from '../ai/ModelSelector'

export function AIGeneratePanel(): JSX.Element {
  const { presentation, slides, currentSlideIndex, addSlide } = usePresentationStore()
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(5)
  const [position, setPosition] = useState<'after' | 'start' | 'end'>('after')
  const [isGenerating, setIsGenerating] = useState(false)
  const [useArtifacts, setUseArtifacts] = useState(true)

  const currentSlide = slides[currentSlideIndex]

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
        const marked = generated.map((s) => ({
          ...s,
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
      console.error('Bulk generation failed:', err)
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
          title="Close">
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

export function AIImproveBar(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } =
    usePresentationStore()
  const [prompt, setPrompt] = useState('')
  const [isImproving, setIsImproving] = useState(false)

  const currentSlide = slides[currentSlideIndex]
  const isAIGenerated = currentSlide?.markdownContent?.includes('<!-- ai-generated -->')

  if (!isAIGenerated) return <></>

  const getArtifactContext = (): string | undefined => {
    if (!currentSlide) return undefined
    const parts: string[] = []
    if (currentSlide.codeContent) {
      parts.push(`Code (${currentSlide.config.code?.language}):\n${currentSlide.codeContent}`)
    }
    if (currentSlide.config.video) parts.push(`Video: ${currentSlide.config.video.url}`)
    if (currentSlide.config.webapp) parts.push(`Web App: ${currentSlide.config.webapp.url}`)
    if (currentSlide.config.artifacts.length > 0) {
      parts.push(`Artifacts: ${currentSlide.config.artifacts.map(a => a.label).join(', ')}`)
    }
    return parts.length > 0 ? parts.join('\n\n') : undefined
  }

  const handleImprove = async () => {
    if (!prompt.trim() || !presentation || !currentSlide) return
    setIsImproving(true)
    try {
      const result = await window.electronAPI.improveSlide(
        currentSlide.markdownContent,
        presentation.title,
        prompt,
        getArtifactContext()
      )
      updateMarkdownContent(currentSlideIndex, `<!-- ai-generated -->\n${result}`)
      saveSlideContent(currentSlideIndex)
      setPrompt('')
    } catch (err) {
      console.error('Improve failed:', err)
    } finally {
      setIsImproving(false)
    }
  }

  return (
    <div className="bg-white/5 border-t border-gray-700 px-4 py-2 flex items-center gap-2">
      <span className="text-white text-[10px] flex-shrink-0" title="This slide was AI-generated">✦ AI</span>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleImprove()}
        placeholder="Improve this slide... (e.g. 'make it more concise', 'add a comparison table')"
        disabled={isImproving}
        className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600
                   focus:outline-none disabled:opacity-50"
      />
      {prompt.trim() && (
        <button
          onClick={handleImprove}
          disabled={isImproving}
          className="px-3 py-1 bg-white hover:bg-gray-200 disabled:opacity-40
                     text-black text-[10px] font-medium rounded transition-colors flex items-center gap-1"
        >
          {isImproving ? <><Spinner /> Improving...</> : 'Improve'}
        </button>
      )}
    </div>
  )
}

/**
 * "Change with AI" — prompt-based slide modification with accept/reject.
 * Works on any slide. Shows inline prompt bar, generates changes, previews diff.
 */
export function AIChangeBar(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } =
    usePresentationStore()
  const [showPrompt, setShowPrompt] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [review, setReview] = useState<{ original: string; improved: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const currentSlide = slides[currentSlideIndex]

  useEffect(() => {
    if (showPrompt) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [showPrompt])

  // Reset on slide change
  useEffect(() => {
    setShowPrompt(false)
    setReview(null)
    setPrompt('')
  }, [currentSlideIndex])

  const handleSubmit = async () => {
    if (!prompt.trim() || !presentation || !currentSlide) return
    setIsProcessing(true)

    try {
      // Get artifact context
      const artifactParts: string[] = []
      if (currentSlide.codeContent) {
        artifactParts.push(`Code (${currentSlide.config.code?.language}):\n${currentSlide.codeContent}`)
      }
      if (currentSlide.config.video) artifactParts.push(`Video: ${currentSlide.config.video.url}`)
      if (currentSlide.config.webapp) artifactParts.push(`Web App: ${currentSlide.config.webapp.url}`)
      const artifactContext = artifactParts.length > 0 ? artifactParts.join('\n\n') : undefined

      const result = await window.electronAPI.improveSlide(
        currentSlide.markdownContent,
        presentation.title,
        prompt,
        artifactContext
      )

      // Preview changes on canvas immediately
      const original = currentSlide.markdownContent
      updateMarkdownContent(currentSlideIndex, result)
      // Show review bar (accept saves to disk, reject restores original)
      setReview({ original, improved: result })
    } catch (err) {
      console.error('AI change failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleAccept = () => {
    if (!review) return
    updateMarkdownContent(currentSlideIndex, review.improved)
    saveSlideContent(currentSlideIndex)
    setReview(null)
    setPrompt('')
    setShowPrompt(false)
  }

  const handleReject = () => {
    if (!review) return
    // Restore original
    updateMarkdownContent(currentSlideIndex, review.original)
    setReview(null)
  }

  // Review mode — show accept/reject bar
  if (review) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 border-t border-amber-700/30">
        <svg className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span className="text-[11px] text-amber-300 flex-shrink-0">AI changes applied</span>
        <span className="text-[10px] text-gray-500 truncate flex-1">{prompt}</span>
        <button
          onClick={handleAccept}
          className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-[10px] font-medium rounded transition-colors"
        >
          Accept
        </button>
        <button
          onClick={handleReject}
          className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-[10px] font-medium rounded transition-colors"
        >
          Reject
        </button>
      </div>
    )
  }

  // Prompt input mode
  if (showPrompt) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 w-full">
        <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
            if (e.key === 'Escape') { setShowPrompt(false); setPrompt('') }
          }}
          placeholder="Describe what to change — layout, content, diagram, restructure..."
          disabled={isProcessing}
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 focus:outline-none disabled:opacity-50"
        />
        {isProcessing ? (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Spinner /> Improving...
          </span>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              className="px-3 py-1 text-gray-400 hover:text-white disabled:opacity-20 text-xs font-medium transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => { setShowPrompt(false); setPrompt('') }}
              className="px-2 py-1 text-gray-600 hover:text-gray-400 text-xs transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    )
  }

  // Default — just the button
  return (
    <button
      onClick={() => setShowPrompt(true)}
      className="flex items-center gap-1 px-2 py-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 text-[10px] rounded transition-colors"
      title="Improve this slide with AI"
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
