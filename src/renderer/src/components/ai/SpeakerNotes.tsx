import { useState, useCallback, useRef, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { requireAI, showAIError } from './AIAlert'

export function SpeakerNotes(): JSX.Element {
  const { slides, currentSlideIndex, presentation, updateNotesContent, saveSlideContent } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [isGenerating, setIsGenerating] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const notes = currentSlide?.notesContent ?? ''

  const handleChange = (value: string) => {
    updateNotesContent(currentSlideIndex, value)

    // Debounced save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveSlideContent(currentSlideIndex)
    }, 1500)
  }

  // Save on slide change
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [currentSlideIndex])

  const handleGenerate = useCallback(async () => {
    if (!currentSlide || !presentation) return
    if (!requireAI()) return

    setIsGenerating(true)

    try {
      let accumulated = ''
      window.electronAPI.streamNotes(
        currentSlide.markdownContent,
        currentSlide.codeContent,
        presentation.title,
        currentSlideIndex,
        (chunk: string) => {
          if (chunk === '[DONE]') {
            updateNotesContent(currentSlideIndex, accumulated)
            setIsGenerating(false)
            saveSlideContent(currentSlideIndex)
            return
          }
          if (chunk.startsWith('[ERROR]')) {
            setIsGenerating(false)
            showAIError(new Error(chunk.replace('[ERROR]', '').trim()))
            return
          }
          accumulated += chunk
          updateNotesContent(currentSlideIndex, accumulated)
        }
      )
    } catch (err) {
      setIsGenerating(false)
      showAIError(err)
    }
  }, [currentSlide, presentation, currentSlideIndex, updateNotesContent, saveSlideContent])

  return (
    <div className="h-48 bg-gray-900 border-t border-gray-800 flex flex-col">
      {/* Header */}
      <div className="h-8 flex items-center justify-between px-4 border-b border-gray-800 flex-shrink-0">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Speaker Notes
        </span>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-2 py-0.5 text-[10px] bg-white hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-400
                     text-black rounded transition-colors flex items-center gap-1"
        >
          {isGenerating ? (
            <>
              <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <SparklesIcon />
              {notes.trim() ? 'Regenerate' : 'Generate'}
            </>
          )}
        </button>
      </div>

      {/* Editable textarea — always visible */}
      <div className="flex-1 min-h-0">
        <textarea
          value={notes}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Type your speaker notes here..."
          className="w-full h-full bg-transparent text-gray-300 text-sm p-4 resize-none
                     focus:outline-none placeholder-gray-600 leading-relaxed"
        />
      </div>
    </div>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}
