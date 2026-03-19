import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

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
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-gray-500">Slides:</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 px-2 py-1
                       focus:border-white focus:outline-none"
          >
            {[1, 3, 5, 8, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
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
