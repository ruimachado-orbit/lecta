import { useUIStore } from '../../stores/ui-store'

const ONBOARDED_KEY = 'lecta.onboarded'

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return true // private mode: never nag
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch { /* ignore */ }
}

/**
 * First-run setup (Presenton onboarding style): pick how AI is powered, then
 * land in the right place. Shown once — every path dismisses it.
 */
export function OnboardingDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const dismiss = () => {
    markOnboarded()
    onClose()
  }

  const openSettings = () => {
    dismiss()
    useUIStore.getState().openSettings()
  }

  return (
    <>
      <div className="fixed inset-0 z-[9990] bg-black/60" onClick={dismiss} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Lecta"
        className="fixed z-[9991] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] max-w-[90vw] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5"
      >
        <h2 className="text-base font-medium text-white mb-1">Welcome to Lecta</h2>
        <p className="text-xs text-gray-400 mb-4">
          Lecta generates slides with your own AI provider. How do you want to power it?
        </p>
        <div className="space-y-2">
          <button
            onClick={openSettings}
            className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-700 hover:border-indigo-400 hover:bg-gray-800/60 transition-colors"
          >
            <span className="block text-sm text-gray-100 font-medium">Add an API key</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">Anthropic, OpenAI, Gemini, Mistral, xAI, Perplexity…</span>
          </button>
          <button
            onClick={openSettings}
            className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-700 hover:border-indigo-400 hover:bg-gray-800/60 transition-colors"
          >
            <span className="block text-sm text-gray-100 font-medium">Use ChatGPT via Codex CLI</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">No API key — sign in with your ChatGPT account</span>
          </button>
          <button
            onClick={openSettings}
            className="w-full text-left px-3 py-2.5 rounded-xl border border-gray-700 hover:border-indigo-400 hover:bg-gray-800/60 transition-colors"
          >
            <span className="block text-sm text-gray-100 font-medium">Run local models with Ollama</span>
            <span className="block text-[11px] text-gray-500 mt-0.5">Free, private, offline-friendly</span>
          </button>
        </div>
        <button
          onClick={dismiss}
          className="mt-3 w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </>
  )
}
