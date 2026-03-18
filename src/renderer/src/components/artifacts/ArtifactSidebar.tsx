import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import type { SupportedLanguage } from '../../../../../packages/shared/src/types/presentation'

interface ArtifactSidebarHeaderProps {
  onClose: () => void
}

export function ArtifactSidebarHeader({ onClose }: ArtifactSidebarHeaderProps): JSX.Element {
  const { slides, currentSlideIndex, addCodeToSlide, addArtifact, addVideo, addWebApp } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')

  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  const handleAddCode = async (lang: SupportedLanguage) => { await addCodeToSlide(lang); setShowAddMenu(false) }
  const handleAddVideo = async () => { if (!videoUrl.trim()) return; await addVideo(videoUrl.trim()); setVideoUrl(''); setShowAddMenu(false) }
  const handleAddWebApp = async () => {
    let u = webAppUrl.trim(); if (!u) return
    if (!u.match(/^https?:\/\//)) u = `https://${u}`
    await addWebApp(u); setWebAppUrl(''); setShowAddMenu(false)
  }

  // Active artifacts for current slide
  const artifacts: { type: string; label: string }[] = []
  if (currentSlide?.config.code) artifacts.push({ type: 'code', label: currentSlide.config.code.language })
  if (currentSlide?.config.video) artifacts.push({ type: 'video', label: 'Video' })
  if (currentSlide?.config.webapp) artifacts.push({ type: 'web', label: currentSlide.config.webapp.label || 'Web App' })
  currentSlide?.config.artifacts.forEach((a) => artifacts.push({ type: 'file', label: a.label }))

  return (
    <div className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
      {/* Header row */}
      <div className="h-9 flex items-center px-3 gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 flex-1">Artifacts</span>

        {/* Add button */}
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className={`p-1 rounded transition-colors ${showAddMenu ? 'bg-white text-black' : 'hover:bg-gray-800 text-gray-400'}`}
            title="Add artifact"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>

          {showAddMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-56 overflow-hidden">
                {!hasCode && (
                  <div className="px-2 pt-2 pb-1">
                    <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Code</div>
                    <select
                      onChange={(e) => { if (e.target.value) handleAddCode(e.target.value as SupportedLanguage) }}
                      defaultValue=""
                      className="w-full px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none"
                    >
                      <option value="" disabled>Select language...</option>
                      {(['markdown', 'javascript', 'python', 'sql', 'typescript', 'bash', 'go', 'rust'] as SupportedLanguage[]).map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!hasVideo && (
                  <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                    <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Video</div>
                    <div className="flex gap-1">
                      <input type="text" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddVideo() }}
                        placeholder="YouTube URL..."
                        className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                      <button onClick={handleAddVideo} disabled={!videoUrl.trim()}
                        className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                    </div>
                  </div>
                )}
                {!hasWebApp && (
                  <div className="px-2 pt-2 pb-1 border-t border-gray-800">
                    <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Web App</div>
                    <div className="flex gap-1">
                      <input type="text" value={webAppUrl} onChange={(e) => setWebAppUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddWebApp() }}
                        placeholder="https://localhost:3000"
                        className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-white focus:outline-none" />
                      <button onClick={handleAddWebApp} disabled={!webAppUrl.trim()}
                        className="px-2 py-1.5 bg-white hover:bg-gray-200 disabled:opacity-40 text-black text-[10px] rounded">Add</button>
                    </div>
                  </div>
                )}
                <button onClick={() => { addArtifact(); setShowAddMenu(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800">
                  Upload file
                </button>
              </div>
            </>
          )}
        </div>

        {/* Close button */}
        <button onClick={onClose}
          className="p-1 hover:bg-gray-800 text-gray-500 hover:text-gray-300 rounded transition-colors"
          title="Close artifacts panel">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Separator + active artifacts list */}
      {artifacts.length > 0 && (
        <div className="px-3 pb-2 flex gap-1 flex-wrap border-t border-gray-800 pt-2">
          {artifacts.map((a, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded">
              {a.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
