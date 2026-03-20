import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useUIStore } from '../../stores/ui-store'
import { AI_PROVIDERS, getProviderForModel, getModelDef } from '../../../../../packages/shared/src/constants'
import type { AIModelDef } from '../../../../../packages/shared/src/constants'

/**
 * Compact model selector dropdown. Shows current model with provider icon.
 * Only shows models from providers that have API keys configured.
 * Uses a portal so the dropdown escapes overflow:hidden containers.
 */
export function ModelSelector({ compact = false }: { compact?: boolean; direction?: 'up' | 'down' }): JSX.Element {
  const { aiModel, setAiModel, providerStatuses } = useUIStore()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const [ollamaModels, setOllamaModels] = useState<AIModelDef[]>([])

  // Fetch Ollama models when Ollama is configured
  const ollamaConfigured = providerStatuses.some((s) => s.id === 'ollama' && s.hasKey)
  useEffect(() => {
    if (!ollamaConfigured) { setOllamaModels([]); return }
    window.electronAPI.ollamaModels().then((models: { id: string; name: string }[]) => {
      setOllamaModels(models.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name, provider: 'ollama' as const, capabilities: ['text' as const, 'code' as const] })))
    })
  }, [ollamaConfigured])

  // Compute position when opening — auto-detect best direction
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const dropdownHeight = 288 // max-h-72 = 18rem = 288px
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const gap = 4

    // Prefer opening upward; fall back to downward if not enough space
    const openUp = spaceAbove >= dropdownHeight || spaceAbove > spaceBelow

    // Clamp left so the dropdown doesn't go off-screen right
    const left = Math.min(rect.left, window.innerWidth - 260)

    if (openUp) {
      setStyle({
        position: 'fixed',
        left,
        bottom: window.innerHeight - rect.top + gap,
        maxHeight: Math.min(dropdownHeight, spaceAbove - gap),
      })
    } else {
      setStyle({
        position: 'fixed',
        left,
        top: rect.bottom + gap,
        maxHeight: Math.min(dropdownHeight, spaceBelow - gap),
      })
    }
  }, [])

  useEffect(() => {
    if (open) updatePosition()
  }, [open, updatePosition])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const currentModel = getModelDef(aiModel) ?? ollamaModels.find((m) => m.id === aiModel)
  const currentProvider = getProviderForModel(aiModel) ?? (ollamaModels.some((m) => m.id === aiModel) ? AI_PROVIDERS.find((p) => p.id === 'ollama') : undefined)

  const configuredProviderIds = new Set(
    providerStatuses.filter((s) => s.hasKey).map((s) => s.id)
  )

  // Build available providers, injecting dynamic Ollama models
  const availableProviders = AI_PROVIDERS.filter((p) => configuredProviderIds.has(p.id)).map((p) => {
    if (p.id === 'ollama' && ollamaModels.length > 0) {
      return { ...p, models: ollamaModels }
    }
    return p
  })
  const noProviders = availableProviders.length === 0

  const displayName = noProviders ? 'No AI configured' : (currentModel?.name ?? aiModel)
  const providerIcon = noProviders ? '—' : (currentProvider?.icon ?? '?')

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[9999]"
      style={{ ...style, overflowY: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {availableProviders.length === 0 ? (
        <div className="p-3 text-xs text-gray-500 text-center">
          No providers configured. Add API keys in Settings.
        </div>
      ) : (
        availableProviders.map((provider) => (
          <div key={provider.id}>
            <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-gray-800 flex items-center justify-center text-[9px] font-bold text-gray-400">
                {provider.icon}
              </span>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{provider.name}</span>
            </div>
            {provider.models.length === 0 && provider.id === 'ollama' ? (
              <div className="px-3 py-1.5 pl-8 text-[10px] text-gray-500 italic">
                No models found. Is Ollama running?
              </div>
            ) : (
              provider.models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => { setAiModel(model.id); setOpen(false) }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors flex items-center gap-2 ${
                    model.id === aiModel
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="flex-1 pl-5">{model.name}</span>
                  {model.id === aiModel && (
                    <svg className="w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))
            )}
          </div>
        ))
      )}

      {/* Show unconfigured providers as disabled */}
      {AI_PROVIDERS.filter((p) => !configuredProviderIds.has(p.id)).length > 0 && (
        <>
          <div className="border-t border-gray-800 mx-2 my-1" />
          <div className="px-3 py-1.5 text-[10px] text-gray-600">
            Not configured:
          </div>
          {AI_PROVIDERS.filter((p) => !configuredProviderIds.has(p.id)).map((provider) => (
            <div key={provider.id} className="px-3 py-1.5 flex items-center gap-2 opacity-40">
              <span className="w-4 h-4 rounded bg-gray-800 flex items-center justify-center text-[9px] font-bold text-gray-500">
                {provider.icon}
              </span>
              <span className="text-[10px] text-gray-500">{provider.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
            </div>
          ))}
        </>
      )}
    </div>,
    document.body
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !noProviders && setOpen(!open)}
        disabled={noProviders}
        className={`flex items-center gap-1.5 rounded-lg border transition-colors ${
          noProviders
            ? 'border-gray-800 bg-gray-900 cursor-not-allowed opacity-50'
            : 'border-gray-700 hover:border-gray-500 bg-gray-900 hover:bg-gray-800'
        } ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'}`}
        title={noProviders ? 'No AI providers configured — add API keys in Settings' : 'Select AI model'}
      >
        <span className="w-4 h-4 rounded bg-gray-800 flex items-center justify-center text-[9px] font-bold text-gray-400 flex-shrink-0">
          {providerIcon}
        </span>
        <span className={`truncate max-w-[120px] ${noProviders ? 'text-gray-500' : 'text-gray-300'}`}>{displayName}</span>
        {!noProviders && (
          <svg className={`w-3 h-3 text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>
      {dropdown}
    </>
  )
}
