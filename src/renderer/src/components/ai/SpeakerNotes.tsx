import { useState, useCallback, useRef, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { requireAI, showAIError } from './AIAlert'

export function SpeakerNotes(): JSX.Element {
  const { slides, currentSlideIndex, presentation, updateNotesContent, saveSlideContent } =
    usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'speaker' | 'presenter'>('speaker')
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
      {/* Tabs: Speaker Notes / Presenter Notes */}
      <div className="h-8 flex items-center px-4 border-b border-gray-800 flex-shrink-0 gap-4">
        <button
          onClick={() => setActiveTab('speaker')}
          className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${
            activeTab === 'speaker' ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          Speaker Notes
        </button>
        <button
          onClick={() => setActiveTab('presenter')}
          className={`text-[10px] font-medium uppercase tracking-wider transition-colors flex items-center gap-1 ${
            activeTab === 'presenter' ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
          </svg>
          Action Notes
        </button>
        <div className="flex-1" />
        {activeTab === 'speaker' && (
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeTab === 'presenter' ? (
          <PresenterNotesEditor />
        ) : (
          <textarea
            value={notes}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="Type your speaker notes here..."
            className="w-full h-full bg-transparent text-gray-300 text-sm p-4 resize-none
                       focus:outline-none placeholder-gray-600 leading-relaxed"
          />
        )}
      </div>
    </div>
  )
}

function PresenterNotesEditor(): JSX.Element {
  const { presentation, updatePresenterNotes } = usePresentationStore()
  const [lines, setLines] = useState<string[]>(() => parseLines(presentation?.presenterNotes ?? ''))
  const saveRef = useRef<ReturnType<typeof setTimeout>>()
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const focusIdx = useRef<number | null>(null)

  useEffect(() => {
    setLines(parseLines(presentation?.presenterNotes ?? ''))
  }, [presentation?.presenterNotes])

  useEffect(() => {
    if (focusIdx.current !== null) {
      inputRefs.current[focusIdx.current]?.focus()
      focusIdx.current = null
    }
  })

  const persist = (newLines: string[]) => {
    setLines(newLines)
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => {
      updatePresenterNotes(newLines.filter(l => l.trim()).join('\n'))
    }, 800)
  }

  const updateLine = (i: number, text: string) => {
    const next = [...lines]
    next[i] = text
    persist(next)
  }

  const toggleCheck = (i: number) => {
    const line = lines[i]
    const next = [...lines]
    if (line.startsWith('- [x] ')) next[i] = '- [ ] ' + line.slice(6)
    else if (line.startsWith('- [ ] ')) next[i] = '- [x] ' + line.slice(6)
    persist(next)
  }

  const addLine = (prefix: string) => {
    const next = [...lines, prefix]
    focusIdx.current = next.length - 1
    persist(next)
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const line = lines[i]
    if (e.key === 'Enter') {
      e.preventDefault()
      // Continue with same prefix
      let prefix = ''
      if (line.startsWith('- [x] ') || line.startsWith('- [ ] ')) prefix = '- [ ] '
      else if (line.startsWith('- ')) prefix = '- '
      const next = [...lines]
      next.splice(i + 1, 0, prefix)
      focusIdx.current = i + 1
      persist(next)
    } else if (e.key === 'Backspace' && getContent(line) === '') {
      e.preventDefault()
      if (lines.length > 1) {
        const next = [...lines]
        next.splice(i, 1)
        focusIdx.current = Math.max(0, i - 1)
        persist(next)
      } else {
        persist([''])
      }
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      inputRefs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowDown' && i < lines.length - 1) {
      e.preventDefault()
      inputRefs.current[i + 1]?.focus()
    }
  }

  const handleContentChange = (i: number, content: string) => {
    const line = lines[i]
    let prefix = ''
    if (line.startsWith('- [x] ')) prefix = '- [x] '
    else if (line.startsWith('- [ ] ')) prefix = '- [ ] '
    else if (line.startsWith('- ')) prefix = '- '
    updateLine(i, prefix + content)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-800/30 flex-shrink-0">
        <button
          onClick={() => addLine('- [ ] ')}
          className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors flex items-center gap-1"
          title="Add checkbox"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          Todo
        </button>
        <button
          onClick={() => addLine('- ')}
          className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors flex items-center gap-1"
          title="Add bullet point"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          Bullet
        </button>
        <button
          onClick={() => addLine('')}
          className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors flex items-center gap-1"
          title="Add plain text"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Text
        </button>
      </div>

      {/* Lines */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {lines.length === 0 || (lines.length === 1 && lines[0] === '') ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 text-xs gap-2">
            <p>No action notes yet</p>
            <p className="text-gray-700">Use the buttons above to add todos or bullet points</p>
          </div>
        ) : (
          lines.map((line, i) => {
            const isChecked = line.startsWith('- [x] ')
            const isUnchecked = line.startsWith('- [ ] ')
            const isBullet = !isChecked && !isUnchecked && line.startsWith('- ')
            const content = getContent(line)

            return (
              <div key={i} className="flex items-start gap-2 py-0.5 group">
                {(isChecked || isUnchecked) && (
                  <button
                    onClick={() => toggleCheck(i)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {isChecked ? (
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-500 hover:text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    )}
                  </button>
                )}
                {isBullet && (
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                )}
                <input
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  value={content}
                  onChange={(e) => handleContentChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`flex-1 bg-transparent text-sm outline-none ${
                    isChecked ? 'text-gray-600 line-through' : 'text-gray-300'
                  } placeholder-gray-700`}
                  placeholder={isChecked || isUnchecked ? 'Action item...' : isBullet ? 'Bullet point...' : 'Note...'}
                />
                <button
                  onClick={() => {
                    const next = lines.filter((_, j) => j !== i)
                    persist(next.length ? next : [''])
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all flex-shrink-0"
                  title="Remove"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function parseLines(text: string): string[] {
  if (!text.trim()) return ['']
  return text.split('\n')
}

function getContent(line: string): string {
  if (line.startsWith('- [x] ')) return line.slice(6)
  if (line.startsWith('- [ ] ')) return line.slice(6)
  if (line.startsWith('- ')) return line.slice(2)
  return line
}

function SparklesIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
  )
}
