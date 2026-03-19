import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { useImageStore } from '../../stores/image-store'

interface AIImagePanelProps {
  editor: Editor
  rootPath: string
  onClose: () => void
}

const ASPECT_RATIOS = [
  { label: '16:9', value: '16:9' },
  { label: '1:1', value: '1:1' },
  { label: '9:16', value: '9:16' },
]

interface ProviderInfo {
  id: string
  name: string
  hasKey: boolean
}

export function AIImagePanel({ editor, rootPath, onClose }: AIImagePanelProps): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load available providers on mount
  useEffect(() => {
    Promise.all([
      window.electronAPI.getImageProviders(),
      window.electronAPI.getImageProvider(),
    ]).then(([provs, current]) => {
      setProviders(provs)
      setSelectedProvider(current)
    })
  }, [])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id)
    window.electronAPI.setImageProvider(id)
  }

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setError(null)
    setPreviewPath(null)

    try {
      const relativePath = await window.electronAPI.generateImage(
        rootPath,
        prompt.trim(),
        aspectRatio,
        undefined,
        selectedProvider
      )
      setPreviewPath(relativePath)
    } catch (err: any) {
      setError(err.message || 'Failed to generate image')
    } finally {
      setLoading(false)
    }
  }

  const handleInsert = () => {
    if (!previewPath) return
    const fullSrc = `lecta-file://${rootPath}/${previewPath}`
    editor.chain().focus().setImage({ src: fullSrc, alt: 'AI generated image' }).run()

    // Track in image store
    useImageStore.getState().addImage({
      relativePath: previewPath,
      fullSrc,
      source: 'generated',
      provider: selectedProvider,
      prompt: prompt.trim(),
    })

    onClose()
  }

  const handleRegenerate = () => {
    setPreviewPath(null)
    handleGenerate()
  }

  const currentProvider = providers.find((p) => p.id === selectedProvider)
  const hasKey = currentProvider?.hasKey ?? false

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            <h3 className="text-sm font-semibold text-white">Generate Image with AI</h3>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Provider picker */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Image Provider</label>
            <div className="flex gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    selectedProvider === p.id
                      ? 'border-purple-500 bg-purple-500/10 text-purple-300'
                      : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <div>{p.name}</div>
                  {p.hasKey ? (
                    <span className="text-[10px] text-green-400">Key configured</span>
                  ) : (
                    <span className="text-[10px] text-red-400">No API key</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* No key warning */}
          {!hasKey && (
            <div className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-3 py-2">
              Add <code className="bg-yellow-900/50 px-1 rounded">{selectedProvider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'}</code> to your deck's <code className="bg-yellow-900/50 px-1 rounded">.env</code> file.
            </div>
          )}

          {/* Prompt */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Describe the image you want</label>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A futuristic city skyline at sunset with neon lights..."
              className="w-full h-24 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-purple-500 focus:outline-none resize-none placeholder-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  if (previewPath) handleInsert()
                  else handleGenerate()
                }
              }}
              disabled={loading}
            />
          </div>

          {/* Aspect ratio (for DALL-E) */}
          {selectedProvider === 'openai' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1 font-medium">Aspect Ratio</label>
              <div className="flex gap-2">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setAspectRatio(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      aspectRatio === r.value
                        ? 'bg-purple-500/20 border-purple-500 text-purple-300 border'
                        : 'bg-gray-800 border-gray-700 text-gray-400 border hover:border-gray-600'
                    }`}
                    disabled={loading}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-purple-400 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-gray-400">Generating image with {currentProvider?.name || selectedProvider}...</span>
              </div>
            </div>
          )}

          {/* Preview */}
          {previewPath && !loading && (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <img
                src={`lecta-file://${rootPath}/${previewPath}`}
                alt="AI generated preview"
                className="w-full h-auto"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
          <span className="text-xs text-gray-500">
            {previewPath ? 'Cmd+Enter to insert' : 'Cmd+Enter to generate'}
          </span>
          <div className="flex gap-2">
            {previewPath && !loading ? (
              <>
                <button
                  onClick={handleRegenerate}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleInsert}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  Insert
                </button>
              </>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim() || !hasKey}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Generate
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
