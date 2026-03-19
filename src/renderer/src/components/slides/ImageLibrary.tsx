import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { useImageStore, type ImageEntry } from '../../stores/image-store'

interface ImageLibraryProps {
  editor: Editor
  rootPath: string
  onClose: () => void
}

export function ImageLibrary({ editor, rootPath, onClose }: ImageLibraryProps): JSX.Element {
  const { images, loadImagesFromWorkspace } = useImageStore()

  useEffect(() => {
    loadImagesFromWorkspace(rootPath)
  }, [rootPath])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleInsert = (image: ImageEntry) => {
    const src = image.fullSrc || `lecta-file://${rootPath}/${image.relativePath}`
    editor.chain().focus().setImage({ src, alt: image.prompt || 'image' }).run()
    onClose()
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[620px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18A2.25 2.25 0 0 1 23.25 6v12a2.25 2.25 0 0 1-2.25 2.25H3A2.25 2.25 0 0 1 .75 18V6A2.25 2.25 0 0 1 3 3.75Zm12.75 3a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
            </svg>
            <h3 className="text-sm font-semibold text-white">Image Library</h3>
            <span className="text-xs text-gray-500">{images.length} images</span>
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
        <div className="flex-1 overflow-y-auto p-4">
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3 3.75h18A2.25 2.25 0 0 1 23.25 6v12a2.25 2.25 0 0 1-2.25 2.25H3A2.25 2.25 0 0 1 .75 18V6A2.25 2.25 0 0 1 3 3.75Z" />
              </svg>
              <p className="text-sm">No images yet</p>
              <p className="text-xs mt-1">Upload or generate images to see them here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {images.map((img) => (
                <button
                  key={img.relativePath}
                  onClick={() => handleInsert(img)}
                  className="group relative rounded-lg overflow-hidden border border-gray-700 hover:border-purple-500 transition-colors bg-gray-800 aspect-video"
                  title={img.prompt || img.relativePath}
                >
                  <img
                    src={img.fullSrc || `lecta-file://${rootPath}/${img.relativePath}`}
                    alt={img.prompt || ''}
                    className="w-full h-full object-cover"
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-end">
                    <div className="w-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1">
                        {img.source === 'generated' && (
                          <span className="text-[9px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">AI</span>
                        )}
                        {img.source === 'uploaded' && (
                          <span className="text-[9px] bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded-full">Upload</span>
                        )}
                        {img.source === 'edited' && (
                          <span className="text-[9px] bg-green-500/30 text-green-300 px-1.5 py-0.5 rounded-full">Edited</span>
                        )}
                        {img.fileSize && (
                          <span className="text-[9px] text-gray-400">{formatSize(img.fileSize)}</span>
                        )}
                      </div>
                      {img.prompt && (
                        <p className="text-[10px] text-gray-300 mt-0.5 line-clamp-2 leading-tight">{img.prompt}</p>
                      )}
                      <p className="text-[9px] text-gray-500 mt-0.5">{formatDate(img.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-gray-700 shrink-0">
          <p className="text-[10px] text-gray-500">Click an image to insert it into the slide</p>
        </div>
      </div>
    </div>
  )
}
