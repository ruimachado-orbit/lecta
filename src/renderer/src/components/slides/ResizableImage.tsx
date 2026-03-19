import { useState, useRef, useCallback } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { usePresentationStore } from '../../stores/presentation-store'

const BORDER_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Gray', value: '#a3a3a3' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Pink', value: '#ec4899' },
]

/**
 * Custom TipTap node view for images with:
 * - Actual image rendering (resolves lecta-file:// paths)
 * - Drag-to-resize from corners
 * - Delete button on hover
 * - Click to select
 * - Border and border-radius configuration
 * - AI edit button (uses Gemini)
 */
export function ResizableImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps): JSX.Element {
  const { src, alt, width, border, borderRadius } = node.attrs
  const [isResizing, setIsResizing] = useState(false)
  const [showBorderConfig, setShowBorderConfig] = useState(false)
  const [showAIEdit, setShowAIEdit] = useState(false)
  const [aiPrompt, setAIPrompt] = useState('')
  const [aiLoading, setAILoading] = useState(false)
  const [aiError, setAIError] = useState<string | null>(null)
  const startRef = useRef<{ x: number; w: number }>({ x: 0, w: 0 })

  // Parse current border values
  const borderMatch = border?.match(/^(\d+)px\s+solid\s+(.+)$/)
  const currentBorderWidth = borderMatch ? parseInt(borderMatch[1]) : 0
  const currentBorderColor = borderMatch ? borderMatch[2] : '#ffffff'
  const currentBorderRadius = borderRadius || 0

  const handleResize = useCallback((e: React.MouseEvent, direction: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault()
    e.stopPropagation()
    const imgEl = e.currentTarget.parentElement?.querySelector('img')
    if (!imgEl) return

    const invertX = direction === 'sw' || direction === 'nw'
    startRef.current = { x: e.clientX, w: imgEl.offsetWidth }
    setIsResizing(true)

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startRef.current.x
      const newWidth = Math.max(80, startRef.current.w + (invertX ? -delta : delta))
      updateAttributes({ width: newWidth })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [updateAttributes])

  const updateBorder = (bw: number, color: string) => {
    if (bw === 0) {
      updateAttributes({ border: null })
    } else {
      updateAttributes({ border: `${bw}px solid ${color}` })
    }
  }

  const handlePinToCanvas = () => {
    // Convert inline image to positioned <!-- image --> comment in markdown
    let imgSrc = src
    if (imgSrc.startsWith('lecta-file://')) {
      imgSrc = imgSrc.replace(/^lecta-file:\/\//, '')
      const imagesIdx = imgSrc.indexOf('/images/')
      if (imagesIdx !== -1) imgSrc = imgSrc.substring(imagesIdx + 1)
    }

    const imgWidth = width || 400
    const borderAttr = border ? ` border=${border.replace(/\s+/g, '_')}` : ''
    const radiusAttr = currentBorderRadius ? ` radius=${currentBorderRadius}` : ''
    const centerX = Math.round((1280 - imgWidth) / 2 - 48)
    const centerY = Math.round((720 - 300) / 2 - 48)
    const comment = `\n<!-- image x=${centerX} y=${centerY} w=${imgWidth} src=${imgSrc}${borderAttr}${radiusAttr} -->\n`

    // Queue comment so onUpdate (fired synchronously by deleteNode) picks it up atomically
    ;(window as any).__pendingPinComments = (window as any).__pendingPinComments || []
    ;(window as any).__pendingPinComments.push(comment.trim())
    deleteNode()
  }

  const handleAIEdit = async () => {
    if (!aiPrompt.trim() || aiLoading) return
    setAILoading(true)
    setAIError(null)

    try {
      // Resolve lecta-file:// to actual file path for reading
      const actualPath = src.replace(/^lecta-file:\/\//, '')
      // Extract rootPath (everything before /images/)
      const imagesIdx = actualPath.indexOf('/images/')
      if (imagesIdx === -1) throw new Error('Cannot determine workspace path for this image')
      const rootPath = actualPath.substring(0, imagesIdx)

      const relativePath = await window.electronAPI.editImage(
        rootPath,
        actualPath,
        aiPrompt.trim()
      )

      // Update the image source to the new edited image
      const newSrc = `lecta-file://${rootPath}/${relativePath}`
      updateAttributes({ src: newSrc })
      setAIPrompt('')
      setShowAIEdit(false)
    } catch (err: any) {
      setAIError(err.message || 'Failed to edit image')
    } finally {
      setAILoading(false)
    }
  }

  return (
    <NodeViewWrapper className="relative inline-block my-2 group" data-drag-handle>
      <div
        className={`relative inline-block overflow-hidden ${
          selected ? 'ring-2 ring-white' : ''
        }`}
        style={{
          width: width ? `${width}px` : 'auto',
          maxWidth: '100%',
          border: border || 'none',
          borderRadius: currentBorderRadius ? `${currentBorderRadius}px` : undefined,
        }}
      >
        <img
          src={src}
          alt={alt || ''}
          className="block w-full h-auto"
          style={{
            borderRadius: currentBorderRadius ? `${currentBorderRadius}px` : undefined,
          }}
          draggable={false}
        />

        {/* Action buttons — top-right */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Border config button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowBorderConfig(!showBorderConfig); setShowAIEdit(false) }}
            className="w-6 h-6 bg-black/70 hover:bg-blue-600 text-white rounded-full flex items-center justify-center"
            title="Border settings"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" />
            </svg>
          </button>

          {/* Pin to canvas button */}
          <button
            onClick={(e) => { e.stopPropagation(); handlePinToCanvas() }}
            className="w-6 h-6 bg-black/70 hover:bg-green-600 text-white rounded-full flex items-center justify-center"
            title="Pin to canvas — free position"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
          </button>

          {/* AI Edit button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowAIEdit(!showAIEdit); setShowBorderConfig(false) }}
            className="w-6 h-6 bg-black/70 hover:bg-purple-600 text-white rounded-full flex items-center justify-center"
            title="Edit with AI"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </button>

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); deleteNode() }}
            className="w-6 h-6 bg-black/70 hover:bg-red-600 text-white rounded-full flex items-center justify-center"
            title="Remove image"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Resize handles — all four corners */}
        {(['nw', 'ne', 'sw', 'se'] as const).map((dir) => {
          const pos = {
            nw: 'top-0 left-0 cursor-nw-resize',
            ne: 'top-0 right-0 cursor-ne-resize',
            sw: 'bottom-0 left-0 cursor-sw-resize',
            se: 'bottom-0 right-0 cursor-se-resize',
          }[dir]
          return (
            <div
              key={dir}
              onMouseDown={(e) => handleResize(e, dir)}
              className={`absolute ${pos} w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ${
                isResizing ? 'opacity-100' : ''
              }`}
            >
              <div className="w-2.5 h-2.5 bg-white rounded-sm shadow-md border border-gray-400" />
            </div>
          )
        })}
      </div>

      {/* Border config popover */}
      {showBorderConfig && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[220px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-gray-400 mb-2 font-medium">Border</div>

          {/* Border width */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-300 w-12">Width</span>
            <input
              type="range"
              min="0"
              max="6"
              value={currentBorderWidth}
              onChange={(e) => updateBorder(parseInt(e.target.value), currentBorderColor)}
              className="flex-1 h-1 accent-blue-500"
            />
            <span className="text-xs text-gray-400 w-6 text-right">{currentBorderWidth}px</span>
          </div>

          {/* Border color */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-300 w-12">Color</span>
            <div className="flex gap-1 flex-wrap">
              {BORDER_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => updateBorder(currentBorderWidth || 2, c.value)}
                  className={`w-5 h-5 rounded-full border ${
                    currentBorderColor === c.value ? 'border-white ring-1 ring-white' : 'border-gray-600'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-400 mb-2 font-medium">Radius</div>

          {/* Border radius */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300 w-12">Round</span>
            <input
              type="range"
              min="0"
              max="50"
              value={currentBorderRadius}
              onChange={(e) => updateAttributes({ borderRadius: parseInt(e.target.value) || null })}
              className="flex-1 h-1 accent-blue-500"
            />
            <span className="text-xs text-gray-400 w-6 text-right">{currentBorderRadius}px</span>
          </div>
        </div>
      )}

      {/* AI edit prompt panel */}
      {showAIEdit && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[300px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs text-gray-400 mb-2 font-medium">Edit with AI</div>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAIPrompt(e.target.value)}
            placeholder="Describe how to edit this image..."
            className="w-full h-16 bg-gray-800 text-white text-sm rounded-md px-2 py-1.5 border border-gray-600 focus:border-purple-500 focus:outline-none resize-none"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAIEdit() } }}
            disabled={aiLoading}
          />
          {aiError && (
            <div className="text-xs text-red-400 mt-1">{aiError}</div>
          )}
          <div className="flex justify-end mt-2">
            <button
              onClick={handleAIEdit}
              disabled={aiLoading || !aiPrompt.trim()}
              className="px-3 py-1 text-xs font-medium rounded-md bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {aiLoading ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Editing...
                </>
              ) : 'Apply Edit'}
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  )
}
