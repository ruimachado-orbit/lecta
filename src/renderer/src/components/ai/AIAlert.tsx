import { useEffect } from 'react'
import { useUIStore } from '../../stores/ui-store'

export function AIAlert(): JSX.Element | null {
  const { aiAlert, setAiAlert } = useUIStore()

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!aiAlert) return
    const timer = setTimeout(() => setAiAlert(null), 8000)
    return () => clearTimeout(timer)
  }, [aiAlert, setAiAlert])

  if (!aiAlert) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999]" style={{ animation: 'aiAlertIn 0.25s ease-out' }}>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-900 border border-amber-500/30 shadow-2xl shadow-black/40 max-w-md">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-snug">{aiAlert}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure API keys in <span className="text-amber-400 font-medium">Home &gt; Settings</span>
          </p>
        </div>
        <button
          onClick={() => setAiAlert(null)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** Check if AI is enabled; if not, show alert and return false. */
export function requireAI(): boolean {
  const { aiEnabled, setAiAlert } = useUIStore.getState()
  if (!aiEnabled) {
    setAiAlert('No API key configured. AI features require at least one provider key.')
    return false
  }
  return true
}

/** Show an alert for AI errors — extracts a user-friendly message. */
export function showAIError(err: unknown): void {
  const { setAiAlert } = useUIStore.getState()
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('API key') || msg.includes('api key') || msg.includes('No Anthropic') || msg.includes('No OpenAI') || msg.includes('No Google') || msg.includes('not found')) {
    setAiAlert('No API key configured for the selected model.')
  } else if (msg.includes('credit balance') || msg.includes('too low') || msg.includes('purchase credits')) {
    setAiAlert('API credit balance is too low. Please top up your account or switch provider.')
  } else if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid')) {
    setAiAlert('API key is invalid or expired. Check your key in settings.')
  } else if (msg.includes('429') || msg.includes('rate limit')) {
    setAiAlert('Rate limit reached. Please wait a moment and try again.')
  } else if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('overloaded')) {
    setAiAlert('AI service is temporarily unavailable. Please try again shortly.')
  } else {
    setAiAlert(`AI request failed: ${msg.slice(0, 120)}`)
  }
}
