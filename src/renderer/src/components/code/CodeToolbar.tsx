import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useUIStore } from '../../stores/ui-store'
import { useCodeExecution } from '../../hooks/useCodeExecution'
import { requireAI, showAIError } from '../ai/AIAlert'

const FONT_SIZES = [
  { label: 'S', value: 12 },
  { label: 'M', value: 15 },
  { label: 'L', value: 18 }
]

export function CodeToolbar(): JSX.Element {
  const { slides, currentSlideIndex, updateCodeContent, saveSlideContent, presentation, removeAttachment } = usePresentationStore()
  const { isExecuting, clearOutput } = useExecutionStore()
  const { fontSize, setFontSize, aiEnabled } = useUIStore()
  const { runCode, cancelCode } = useCodeExecution()
  const [showAIPrompt, setShowAIPrompt] = useState(false)
  const [aiPrompt, setAIPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const currentSlide = slides[currentSlideIndex]
  const codeConfig = currentSlide?.config.code
  const canExecute = codeConfig && codeConfig.execution !== 'none'

  const handleRun = () => {
    if (currentSlide?.codeContent && codeConfig) {
      runCode(currentSlide.codeContent, codeConfig)
    }
  }

  const handleReset = async () => {
    if (codeConfig) {
      const { presentation, updateCodeContent } = usePresentationStore.getState()
      if (presentation) {
        const filePath = `${presentation.rootPath}/${codeConfig.file}`
        const content = await window.electronAPI.readFile(filePath)
        updateCodeContent(currentSlideIndex, content)
      }
    }
  }

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim() || !codeConfig || !presentation) return
    if (!requireAI()) return
    setIsGenerating(true)
    try {
      const code = await window.electronAPI.generateCode(
        aiPrompt,
        codeConfig.language,
        currentSlide?.codeContent || '',
        presentation.title
      )
      updateCodeContent(currentSlideIndex, code)
      saveSlideContent(currentSlideIndex)
      setAIPrompt('')
      setShowAIPrompt(false)
    } catch (err) {
      showAIError(err)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="bg-gray-900 border-b border-gray-800">
      <div className="h-10 flex items-center px-3 gap-3">
        {/* File path */}
        <span className="text-gray-500 text-xs font-mono truncate flex-1">
          {codeConfig?.file}
        </span>

        {/* Language badge */}
        {codeConfig?.language && (
          <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 bg-gray-800 text-gray-400 rounded">
            {codeConfig.language}
          </span>
        )}

        {/* Font size */}
        <div className="flex items-center gap-0.5 bg-gray-800 rounded p-0.5">
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFontSize(s.value)}
              className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
                fontSize === s.value ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300'
              }`}
              title={`Font size: ${s.value}px`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Reset */}
        <button onClick={handleReset}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Reset to file content">
          <ResetIcon />
        </button>

        {/* AI Generate Code */}
        <button
          onClick={() => setShowAIPrompt(!showAIPrompt)}
          disabled={!aiEnabled}
          className={`p-1 rounded transition-colors ${
            !aiEnabled ? 'text-gray-700 cursor-not-allowed'
            : showAIPrompt ? 'text-white font-bold'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
          title={aiEnabled ? 'Generate code with AI' : 'AI disabled — set ANTHROPIC_API_KEY'}
        >
          <SparklesIcon />
        </button>

        {/* Run / Cancel */}
        {canExecute && (
          <>
            {isExecuting ? (
              <button onClick={cancelCode}
                className="px-3 py-1 bg-gray-300 hover:bg-gray-400 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
                <StopIcon /> Stop
              </button>
            ) : (
              <button onClick={handleRun}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
                title="Run code (Cmd+Enter)">
                <RunIcon /> Run
              </button>
            )}
          </>
        )}

        {/* Remove code */}
        <button onClick={() => removeAttachment('code')}
          className="p-1 hover:bg-red-600 text-gray-500 hover:text-white rounded transition-colors"
          title="Remove code from slide">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* AI prompt bar */}
      {showAIPrompt && (
        <div className="h-9 flex items-center px-3 gap-2 border-t border-gray-800">
          <SparklesIcon />
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAIPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAIGenerate()}
            placeholder={`Generate ${codeConfig?.language} code...`}
            disabled={isGenerating}
            autoFocus
            className="flex-1 bg-transparent text-sm text-gray-300 placeholder-gray-600 focus:outline-none disabled:opacity-50"
          />
          {aiPrompt.trim() && (
            <button onClick={handleAIGenerate} disabled={isGenerating}
              className="px-3 py-1 bg-white hover:bg-gray-200 disabled:opacity-50 text-black text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5">
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function RunIcon(): JSX.Element {
  return <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
}
function StopIcon(): JSX.Element {
  return <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
}
function ResetIcon(): JSX.Element {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
}
function ClearIcon(): JSX.Element {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
}
function SparklesIcon(): JSX.Element {
  return <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></svg>
}
