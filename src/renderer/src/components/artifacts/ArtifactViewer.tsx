import { useState, useEffect } from 'react'
import type { ArtifactConfig } from '../../../../../packages/shared/src/types/presentation'

interface ArtifactViewerProps {
  artifact: ArtifactConfig
  fullPath: string
  onClose: () => void
}

export function ArtifactViewer({ artifact, fullPath, onClose }: ArtifactViewerProps): JSX.Element {
  const [content, setContent] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPdf = fullPath.match(/\.pdf$/i)
  const isImage = fullPath.match(/\.(png|jpe?g|gif|svg|webp)$/i)
  const isExcel = fullPath.match(/\.xlsx?$/i) || fullPath.match(/\.csv$/i)
  const isText = fullPath.match(/\.(txt|md|json|yaml|yml)$/i)

  useEffect(() => {
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
        } else if (isText || isExcel) {
          const text = await window.electronAPI.readFile(fullPath)
          setContent(text)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-[80vw] max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-gray-200 font-medium">{artifact.label}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.electronAPI.openInSystemApp(fullPath)}
              className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            >
              Open in App
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-800 rounded transition-colors text-gray-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          {isImage && imageUrl && (
            <div className="flex items-center justify-center h-full">
              <img src={imageUrl} alt={artifact.label} className="max-w-full max-h-full object-contain rounded" />
            </div>
          )}

          {isPdf && (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-4">PDF preview</p>
              <button
                onClick={() => window.electronAPI.openInSystemApp(fullPath)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Open PDF in System Viewer
              </button>
            </div>
          )}

          {(isText || isExcel) && content && (
            <pre className="text-gray-300 text-sm font-mono whitespace-pre-wrap bg-gray-950 rounded-lg p-4">
              {content}
            </pre>
          )}

          {!isImage && !isPdf && !isText && !isExcel && (
            <div className="text-center text-gray-400 py-8">
              <p className="mb-4">Cannot preview this file type</p>
              <button
                onClick={() => window.electronAPI.openInSystemApp(fullPath)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                Open in System App
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
