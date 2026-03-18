import { useState, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import type { ArtifactConfig, SupportedLanguage } from '../../../../../packages/shared/src/types/presentation'

export function ArtifactDrawer(): JSX.Element {
  const { slides, currentSlideIndex, presentation, addArtifact, addCodeToSlide, addVideo, addWebApp } = usePresentationStore()
  const { toggleArtifactDrawer } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const artifacts = currentSlide?.config.artifacts ?? []
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactConfig | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [webAppUrl, setWebAppUrl] = useState('')

  const hasCode = !!currentSlide?.config.code
  const hasVideo = !!currentSlide?.config.video
  const hasWebApp = !!currentSlide?.config.webapp

  // Auto-select first artifact when slide changes
  useEffect(() => {
    setSelectedArtifact(artifacts[0] ?? null)
  }, [currentSlideIndex, artifacts.length])

  const getFullPath = (artifact: ArtifactConfig): string =>
    `${presentation?.rootPath}/${artifact.path}`

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header */}
      <div className="h-9 bg-gray-900 border-b border-gray-800 flex items-center px-3 gap-2">
        <FolderIcon />
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 flex-1">
          Artifacts ({artifacts.length})
        </span>
        <div className="relative">
          <button
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
            title="Add to slide"
          >
            + Add
          </button>
          {showAddMenu && (
            <AddMenu
              hasCode={hasCode}
              hasVideo={hasVideo}
              hasWebApp={hasWebApp}
              videoUrl={videoUrl}
              webAppUrl={webAppUrl}
              onVideoUrlChange={setVideoUrl}
              onWebAppUrlChange={setWebAppUrl}
              onAddCode={(lang) => { addCodeToSlide(lang); setShowAddMenu(false) }}
              onAddVideo={() => { const url = videoUrl.trim(); if (url) { addVideo(url); setVideoUrl(''); setShowAddMenu(false) } }}
              onAddWebApp={() => { let url = webAppUrl.trim(); if (url) { if (!url.match(/^https?:\/\//)) url = `https://${url}`; addWebApp(url); setWebAppUrl(''); setShowAddMenu(false) } }}
              onAddFile={() => { addArtifact(); setShowAddMenu(false) }}
            />
          )}
        </div>
        <button
          onClick={toggleArtifactDrawer}
          className="p-0.5 hover:bg-gray-800 text-gray-500 hover:text-gray-300 rounded transition-colors"
          title="Close artifacts"
        >
          <CloseIcon />
        </button>
      </div>

      {artifacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <div className="text-gray-600 text-sm mb-3">No artifacts on this slide</div>
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors border border-gray-700"
            >
              Add to slide
            </button>
            {showAddMenu && (
              <AddMenu
                hasCode={hasCode}
                hasVideo={hasVideo}
                hasWebApp={hasWebApp}
                videoUrl={videoUrl}
                webAppUrl={webAppUrl}
                onVideoUrlChange={setVideoUrl}
                onWebAppUrlChange={setWebAppUrl}
                onAddCode={(lang) => { addCodeToSlide(lang); setShowAddMenu(false) }}
                onAddVideo={() => { const url = videoUrl.trim(); if (url) { addVideo(url); setVideoUrl(''); setShowAddMenu(false) } }}
                onAddWebApp={() => { let url = webAppUrl.trim(); if (url) { if (!url.match(/^https?:\/\//)) url = `https://${url}`; addWebApp(url); setWebAppUrl(''); setShowAddMenu(false) } }}
                onAddFile={() => { addArtifact(); setShowAddMenu(false) }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Artifact list */}
          <div className="border-b border-gray-800 px-2 py-2 flex gap-1 overflow-x-auto flex-shrink-0">
            {artifacts.map((artifact, i) => (
              <button
                key={i}
                onClick={() => setSelectedArtifact(artifact)}
                className={`flex-shrink-0 px-2.5 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                  selectedArtifact === artifact
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                <span className="text-[9px] font-bold">
                  {getTypeLabel(artifact.path)}
                </span>
                <span className="truncate max-w-[80px]">{artifact.label}</span>
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto min-h-0">
            {selectedArtifact && (
              <ArtifactPreview
                artifact={selectedArtifact}
                fullPath={getFullPath(selectedArtifact)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ArtifactPreview({ artifact, fullPath }: { artifact: ArtifactConfig; fullPath: string }): JSX.Element {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPdf = fullPath.match(/\.pdf$/i)
  const isImage = fullPath.match(/\.(png|jpe?g|gif|svg|webp)$/i)
  const isText = fullPath.match(/\.(txt|md|json|yaml|yml|csv|js|ts|py|sql|html|css)$/i)

  useEffect(() => {
    setImageUrl(null)
    setTextContent(null)
    setError(null)

    async function load() {
      try {
        if (isImage) {
          const buffer = await window.electronAPI.readArtifactAsBuffer(fullPath)
          const ext = fullPath.split('.').pop()?.toLowerCase()
          const mimeMap: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp'
          }
          const blob = new Blob([buffer], { type: mimeMap[ext || ''] || 'image/png' })
          setImageUrl(URL.createObjectURL(blob))
        } else if (isText) {
          const text = await window.electronAPI.readFile(fullPath)
          setTextContent(text)
        }
      } catch (err) {
        setError((err as Error).message)
      }
    }
    load()

    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [fullPath])

  return (
    <div className="h-full flex flex-col">
      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 truncate">{artifact.label}</span>
        <button
          onClick={() => window.electronAPI.openInSystemApp(fullPath)}
          className="px-2 py-0.5 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors flex-shrink-0"
        >
          Open in App ↗
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {error && <div className="text-red-400 text-xs">{error}</div>}

        {isImage && imageUrl && (
          <div className="flex items-center justify-center h-full">
            <img src={imageUrl} alt={artifact.label} className="max-w-full max-h-full object-contain rounded" />
          </div>
        )}

        {isPdf && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <PdfIcon />
            <span className="text-gray-500 text-sm">{artifact.label}.pdf</span>
            <button
              onClick={() => window.electronAPI.openInSystemApp(fullPath)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors"
            >
              Open PDF
            </button>
          </div>
        )}

        {isText && textContent !== null && (
          <pre className="text-gray-300 text-xs font-mono whitespace-pre-wrap bg-gray-900 rounded-lg p-3 leading-relaxed">
            {textContent}
          </pre>
        )}

        {!isImage && !isPdf && !isText && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <span className="text-gray-500 text-sm">Preview not available</span>
            <button
              onClick={() => window.electronAPI.openInSystemApp(fullPath)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition-colors"
            >
              Open in System App
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function AddMenu({
  hasCode, hasVideo, hasWebApp,
  videoUrl, webAppUrl,
  onVideoUrlChange, onWebAppUrlChange,
  onAddCode, onAddVideo, onAddWebApp, onAddFile
}: {
  hasCode: boolean
  hasVideo: boolean
  hasWebApp: boolean
  videoUrl: string
  webAppUrl: string
  onVideoUrlChange: (v: string) => void
  onWebAppUrlChange: (v: string) => void
  onAddCode: (lang: SupportedLanguage) => void
  onAddVideo: () => void
  onAddWebApp: () => void
  onAddFile: () => void
}): JSX.Element {
  return (
    <div className="absolute right-0 top-full mt-2 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-56 overflow-hidden">
      {/* Code */}
      {!hasCode && (
        <div className="px-2 pt-2 pb-1">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Code</div>
          <select
            onChange={(e) => { if (e.target.value) onAddCode(e.target.value as SupportedLanguage) }}
            defaultValue=""
            className="w-full px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="" disabled>Select language...</option>
            {(['javascript', 'python', 'sql', 'typescript', 'bash', 'go', 'rust', 'java', 'ruby'] as SupportedLanguage[]).map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>
      )}

      {/* Video */}
      {!hasVideo && (
        <div className="px-2 pt-2 pb-1 border-t border-gray-800">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Video</div>
          <div className="flex gap-1">
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => onVideoUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAddVideo() }}
              placeholder="YouTube URL..."
              className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={onAddVideo}
              disabled={!videoUrl.trim()}
              className="px-2 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-[10px] rounded transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Web App */}
      {!hasWebApp && (
        <div className="px-2 pt-2 pb-1 border-t border-gray-800">
          <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 pb-1">Web App</div>
          <div className="flex gap-1">
            <input
              type="text"
              value={webAppUrl}
              onChange={(e) => onWebAppUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAddWebApp() }}
              placeholder="https://localhost:3000"
              className="flex-1 px-2 py-1.5 bg-gray-950 text-gray-300 text-xs rounded border border-gray-700 focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={onAddWebApp}
              disabled={!webAppUrl.trim()}
              className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] rounded transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* File */}
      <button
        onClick={onAddFile}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-300 hover:bg-gray-800 transition-colors border-t border-gray-800"
      >
        <PaperclipIcon />
        Upload file
      </button>
    </div>
  )
}

function PaperclipIcon(): JSX.Element {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  )
}

function getTypeLabel(path: string): string {
  if (path.match(/\.pdf$/i)) return 'PDF'
  if (path.match(/\.xlsx?$/i) || path.match(/\.csv$/i)) return 'XLS'
  if (path.match(/\.(png|jpe?g|gif|svg|webp)$/i)) return 'IMG'
  if (path.match(/\.(txt|md)$/i)) return 'TXT'
  if (path.match(/\.(js|ts|py|sql|html|css|json)$/i)) return 'SRC'
  return 'FILE'
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function PdfIcon(): JSX.Element {
  return (
    <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}
