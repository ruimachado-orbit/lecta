import { useState, useCallback, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import ReactMarkdown from 'react-markdown'

export function ArticlePanel(): JSX.Element {
  const { presentation, slides } = usePresentationStore()
  const { toggleArticlePanel } = useUIStore()

  const [rules, setRules] = useState('')
  const [articleContent, setArticleContent] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showRules, setShowRules] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleGenerate = useCallback(async () => {
    if (!presentation || slides.length === 0) return

    setIsGenerating(true)
    setArticleContent('')
    setShowRules(false)

    const slidesContent = slides.map((slide) => ({
      title: slide.config.id,
      markdown: slide.markdownContent,
      code: slide.codeContent,
      notes: slide.notesContent
    }))

    try {
      let accumulated = ''
      window.electronAPI.streamArticle(
        presentation.title,
        presentation.author,
        slidesContent,
        rules,
        (chunk: string) => {
          if (chunk === '[DONE]') {
            setIsGenerating(false)
            return
          }
          accumulated += chunk
          setArticleContent(accumulated)
          contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight })
        }
      )
    } catch {
      setIsGenerating(false)
    }
  }, [presentation, slides, rules])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(articleContent)
  }, [articleContent])

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <ArticleIcon />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Article Generator
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {articleContent && !isGenerating && (
            <>
              <button
                onClick={handleCopy}
                className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setShowRules(!showRules)}
                className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
              >
                {showRules ? 'Hide Rules' : 'Edit Rules'}
              </button>
            </>
          )}
          <button
            onClick={toggleArticlePanel}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            title="Close article panel"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Rules input */}
      {showRules && (
        <div className="px-4 py-3 border-b border-gray-800 shrink-0">
          <label className="text-[10px] font-medium uppercase tracking-wider text-gray-500 block mb-1.5">
            Article Rules & Instructions
          </label>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder={`Optional — guide the article generation:\n• Target audience (e.g. "senior engineers familiar with React")\n• Tone (e.g. "casual blog post" or "formal whitepaper")\n• Length (e.g. "keep it under 1500 words")\n• Focus areas (e.g. "emphasize the architecture decisions")\n• Anything else...`}
            className="w-full h-28 bg-gray-900 text-gray-300 text-sm rounded-lg p-3 resize-none
                       border border-gray-800 focus:border-indigo-500 focus:outline-none
                       placeholder-gray-600"
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !presentation}
            className="mt-2 w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-50
                       text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating article...
              </>
            ) : (
              <>
                <SparklesIcon />
                {articleContent ? 'Regenerate Article' : 'Generate Article'}
              </>
            )}
          </button>
        </div>
      )}

      {/* Article content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4">
        {articleContent ? (
          <div className="prose prose-invert prose-sm max-w-none
                          prose-headings:text-gray-200 prose-p:text-gray-300 prose-p:leading-relaxed
                          prose-a:text-indigo-400 prose-strong:text-gray-200
                          prose-code:text-indigo-300 prose-code:bg-gray-900 prose-code:px-1 prose-code:rounded
                          prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-800
                          prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400">
            <ReactMarkdown>{articleContent}</ReactMarkdown>
          </div>
        ) : !isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center">
              <ArticleIconLarge />
            </div>
            <div>
              <p className="text-gray-400 text-sm font-medium">Generate an article from your presentation</p>
              <p className="text-gray-600 text-xs mt-1">
                All {slides.length} slides, code, and speaker notes will be used as context
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ArticleIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
    </svg>
  )
}

function ArticleIconLarge(): JSX.Element {
  return (
    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
    </svg>
  )
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}
