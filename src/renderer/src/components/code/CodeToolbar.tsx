import { usePresentationStore } from '../../stores/presentation-store'
import { useExecutionStore } from '../../stores/execution-store'
import { useCodeExecution } from '../../hooks/useCodeExecution'

export function CodeToolbar(): JSX.Element {
  const { slides, currentSlideIndex } = usePresentationStore()
  const { isExecuting, clearOutput } = useExecutionStore()
  const { runCode, cancelCode } = useCodeExecution()

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

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-3">
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

      {/* Reset button */}
      <button
        onClick={handleReset}
        className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
        title="Reset to file content"
      >
        <ResetIcon />
      </button>

      {/* Clear output */}
      <button
        onClick={clearOutput}
        className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
        title="Clear output"
      >
        <ClearIcon />
      </button>

      {/* Run / Cancel button */}
      {canExecute && (
        <>
          {isExecuting ? (
            <button
              onClick={cancelCode}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-medium
                         rounded transition-colors flex items-center gap-1.5"
            >
              <StopIcon />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-medium
                         rounded transition-colors flex items-center gap-1.5"
              title="Run code (Cmd+Enter)"
            >
              <RunIcon />
              Run
            </button>
          )}
        </>
      )}
    </div>
  )
}

function RunIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h12v12H6z" />
    </svg>
  )
}

function ResetIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
    </svg>
  )
}

function ClearIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
    </svg>
  )
}
