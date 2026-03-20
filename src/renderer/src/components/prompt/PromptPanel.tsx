import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { usePresentationStore } from '../../stores/presentation-store'
import { showAIError } from '../ai/AIAlert'
import type { PromptConfig } from '../../../../../packages/shared/src/types/presentation'

interface PromptPanelProps {
  prompt: PromptConfig
  promptIndex: number
}

export function PromptPanel({ prompt, promptIndex }: PromptPanelProps): JSX.Element {
  const { removeAttachment, updatePrompt, presentation, slides, currentSlideIndex } = usePresentationStore()
  const [inputValue, setInputValue] = useState(prompt.prompt || '')
  const [response, setResponse] = useState(prompt.response || '')
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasRun, setHasRun] = useState(!!prompt.response)
  const responseRef = useRef<HTMLDivElement>(null)

  // Auto-scroll response area
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

  const handleRun = async () => {
    if (!inputValue.trim() || isStreaming) return

    setIsStreaming(true)
    setResponse('')
    setHasRun(true)

    const slideContent = slides[currentSlideIndex]?.markdownContent || ''
    const deckTitle = presentation?.title || ''

    let accumulated = ''
    window.electronAPI.runPrompt(
      inputValue.trim(),
      slideContent,
      deckTitle,
      (chunk: string) => {
        if (chunk === '[DONE]') {
          setIsStreaming(false)
          // Save prompt text and response to file
          updatePrompt(promptIndex, inputValue.trim(), accumulated)
          return
        }
        if (chunk.startsWith('[ERROR]')) {
          setIsStreaming(false)
          showAIError(new Error(chunk.replace('[ERROR]', '').trim()))
          return
        }
        accumulated += chunk
        setResponse(accumulated)
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleRun()
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
        <PromptIcon />
        <span className="text-gray-500 text-xs font-mono truncate flex-1">
          {prompt.label || `AI Prompt ${promptIndex + 1}`}
        </span>
        <button
          onClick={() => removeAttachment('prompt', promptIndex)}
          className="p-1 hover:bg-red-600 text-gray-500 hover:text-white rounded transition-colors"
          title="Remove prompt from slide"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Prompt input area */}
      <div className="p-3 border-b border-gray-800">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything... (Cmd+Enter to run)"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500 transition-colors"
          rows={3}
          disabled={isStreaming}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-gray-600">
            {isStreaming ? 'Generating...' : 'Cmd+Enter to run'}
          </span>
          <button
            onClick={handleRun}
            disabled={!inputValue.trim() || isStreaming}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-medium rounded-md transition-colors"
          >
            {isStreaming ? (
              <>
                <LoadingSpinner />
                Running...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                Run
              </>
            )}
          </button>
        </div>
      </div>

      {/* Response area */}
      <div ref={responseRef} className="flex-1 overflow-y-auto p-3">
        {hasRun ? (
          <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-li:my-0.5 prose-headings:my-2">
            <ReactMarkdown>{response || (isStreaming ? '...' : '')}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 text-sm">
            <svg className="w-8 h-8 mb-2 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            <p>Write a prompt and press Run</p>
            <p className="text-xs text-gray-700 mt-1">Zero-shot prompt</p>
          </div>
        )}
      </div>
    </div>
  )
}

function PromptIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
    </svg>
  )
}

function LoadingSpinner(): JSX.Element {
  return (
    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
