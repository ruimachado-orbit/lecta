import { useState, useCallback } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import ReactMarkdown from 'react-markdown'

export function SpeakerNotes(): JSX.Element {
  const { slides, currentSlideIndex, presentation, updateNotesContent, saveSlideContent } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [isGenerating, setIsGenerating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [streamedContent, setStreamedContent] = useState('')

  const notes = currentSlide?.notesContent

  const handleGenerate = useCallback(async () => {
    if (!currentSlide || !presentation) return

    setIsGenerating(true)
    setStreamedContent('')

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
          accumulated += chunk
          setStreamedContent(accumulated)
        }
      )
    } catch (err) {
      setIsGenerating(false)
    }
  }, [currentSlide, presentation, currentSlideIndex, updateNotesContent])

  const handleSave = () => {
    updateNotesContent(currentSlideIndex, editContent)
    setIsEditing(false)
    saveSlideContent(currentSlideIndex)
  }

  const handleStartEdit = () => {
    setEditContent(notes || streamedContent || '')
    setIsEditing(true)
  }

  const displayContent = isGenerating ? streamedContent : notes

  return (
    <div className="h-48 bg-gray-900 border-t border-gray-800 flex flex-col">
      {/* Header */}
      <div className="h-8 flex items-center justify-between px-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Speaker Notes
          </span>
          {notes && (
            <span className="text-[9px] px-1.5 py-0.5 bg-indigo-600/20 text-indigo-400 rounded">
              AI Generated
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="px-2 py-0.5 text-[10px] bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {displayContent && (
                <button
                  onClick={handleStartEdit}
                  className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
                >
                  Edit
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-2 py-0.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800
                           text-white rounded transition-colors flex items-center gap-1"
              >
                {isGenerating ? (
                  <>
                    <div className="w-2 h-2 border border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <SparklesIcon />
                    {displayContent ? 'Regenerate' : 'Generate with Claude'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full bg-gray-950 text-gray-300 text-sm rounded-lg p-3 resize-none
                       border border-gray-700 focus:border-indigo-500 focus:outline-none font-mono"
          />
        ) : displayContent ? (
          <div className="prose prose-sm prose-invert max-w-none text-gray-300 text-sm leading-relaxed">
            <ReactMarkdown>{displayContent}</ReactMarkdown>
          </div>
        ) : (
          <div className="text-gray-600 text-sm italic">
            No speaker notes for this slide. Click "Generate with Claude" to create them automatically.
          </div>
        )}
      </div>
    </div>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}
