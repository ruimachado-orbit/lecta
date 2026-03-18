import { useState, useRef, useCallback } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'

/**
 * Custom TipTap node view for images with:
 * - Actual image rendering (resolves lecta-file:// paths)
 * - Drag-to-resize from corners
 * - Delete button on hover
 * - Click to select
 */
export function ResizableImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps): JSX.Element {
  const { src, alt, width } = node.attrs
  const [isResizing, setIsResizing] = useState(false)
  const startRef = useRef<{ x: number; w: number }>({ x: 0, w: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const imgEl = e.currentTarget.parentElement?.querySelector('img')
    if (!imgEl) return

    startRef.current = { x: e.clientX, w: imgEl.offsetWidth }
    setIsResizing(true)

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startRef.current.x
      const newWidth = Math.max(80, startRef.current.w + delta)
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

  return (
    <NodeViewWrapper className="relative inline-block my-2 group" data-drag-handle>
      <div
        className={`relative inline-block rounded-lg overflow-hidden ${
          selected ? 'ring-2 ring-white' : ''
        }`}
        style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
      >
        <img
          src={src}
          alt={alt || ''}
          className="block w-full h-auto rounded-lg"
          draggable={false}
        />

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); deleteNode() }}
          className="absolute top-2 right-2 w-6 h-6 bg-black/70 hover:bg-red-600 text-white rounded-full
                     flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove image"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Resize handle — bottom-right corner */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize
                      opacity-0 group-hover:opacity-100 transition-opacity ${
            isResizing ? 'opacity-100' : ''
          }`}
        >
          <svg className="w-4 h-4 text-white drop-shadow-lg" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 14H10V12H12V10H14V14Z" />
            <path d="M14 8H12V6H14V8Z" opacity="0.5" />
            <path d="M8 14H6V12H8V14Z" opacity="0.5" />
          </svg>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
