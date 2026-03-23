import { useCallback, useState, useRef, useEffect } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { SelectableSlideElements } from './SelectableSlideElements'
import { InlineElementEditor } from './InlineElementEditor'
import { ContentRenderer } from './ContentRenderer'

export interface SelectedElement {
  type: 'textbox' | 'shape' | 'image'
  index: number
  x: number
  y: number
  w?: number
  h?: number
  content?: string
  matchStart: number
  matchEnd: number
}

export interface EditableSlideCanvasProps {
  slideIndex: number
  canvasWidth?: number
  canvasHeight?: number
  scale?: number
  isDarkTheme?: boolean
  editingMode?: boolean
  onUpdateMarkdown?: (content: string) => void
  onUpdateNotes?: (notes: string) => void
}

/**
 * EditableSlideCanvas
 * 
 * Main WYSIWYG editing canvas that combines:
 * - Markdown content rendering (via ContentRenderer)
 * - Positioned elements (textbox, shapes, images)
 * - Element selection with visual feedback
 * - Inline editing for selected elements
 * 
 * Always visible, always editable - no mode toggle needed.
 */
export function EditableSlideCanvas({
  slideIndex,
  canvasWidth = 1024,
  canvasHeight = 576,
  scale = 1,
  isDarkTheme = true,
  editingMode = true,
  onUpdateMarkdown,
  onUpdateNotes,
}: EditableSlideCanvasProps): JSX.Element {
  const { slides, updateMarkdownContent } = usePresentationStore()
  const currentSlide = slides[slideIndex]
  
  // Element selection state
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null)
  const [isEditingElement, setIsEditingElement] = useState(false)
  
  // Canvas ref for click detection
  const canvasRef = useRef<HTMLDivElement>(null)
  
  const slideTheme = currentSlide?.config?.theme || (isDarkTheme ? 'dark' : 'light')
  const markdown = currentSlide?.markdownContent || ''
  
  // Handle markdown content changes
  const handleMarkdownUpdate = useCallback((content: string) => {
    updateMarkdownContent(slideIndex, content)
    onUpdateMarkdown?.(content)
  }, [slideIndex, updateMarkdownContent, onUpdateMarkdown])
  
  // Handle element selection
  const handleElementSelect = useCallback((element: SelectedElement | null) => {
    setSelectedElement(element)
    // Auto-open inline editor for newly selected elements
    if (element && editingMode) {
      setIsEditingElement(true)
    }
  }, [editingMode])
  
  // Handle inline element content update
  const handleElementUpdate = useCallback((updatedContent: string) => {
    if (!selectedElement) return
    
    // Reconstruct markdown with updated element
    let updatedMarkdown = markdown
    const elementMarkdown = markdown.substring(selectedElement.matchStart, selectedElement.matchEnd)
    
    // Replace element content while preserving metadata
    let newElementMarkdown = elementMarkdown
    
    if (selectedElement.type === 'textbox') {
      // Update textbox content
      const regex = /(<!--\s*textbox[^>]*-->)([\s\S]*?)(<!--\s*\/textbox\s*-->)/
      newElementMarkdown = elementMarkdown.replace(regex, `$1${updatedContent}$3`)
    } else if (selectedElement.type === 'shape') {
      // Shapes don't have editable content directly
      // This would be handled by property updates
    } else if (selectedElement.type === 'image') {
      // Image src updates would be handled separately
    }
    
    updatedMarkdown = 
      markdown.substring(0, selectedElement.matchStart) +
      newElementMarkdown +
      markdown.substring(selectedElement.matchEnd)
    
    handleMarkdownUpdate(updatedMarkdown)
  }, [selectedElement, markdown, handleMarkdownUpdate])
  
  // Click outside canvas to deselect
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedElement(null)
      setIsEditingElement(false)
    }
  }, [])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedElement(null)
        setIsEditingElement(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        // Trigger save in parent
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  if (!currentSlide) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
        No slide content
      </div>
    )
  }
  
  return (
    <div
      ref={canvasRef}
      onClick={handleCanvasClick}
      className={`
        relative w-full h-full overflow-auto
        ${slideTheme === 'dark' ? 'bg-gray-900' : 'bg-white'}
        focus:outline-none
      `}
      style={{
        aspectRatio: `${canvasWidth / canvasHeight}`,
      }}
    >
      {/* Main slide content */}
      <div
        className="relative w-full h-full"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
        {/* Markdown content background */}
        <div className="absolute inset-0 overflow-hidden">
          <ContentRenderer
            markdown={markdown}
            isMdx={currentSlide.isMdx}
            rootPath={currentSlide.config.rootPath}
            theme={slideTheme}
          />
        </div>
        
        {/* Selectable positioned elements overlay */}
        {editingMode && (
          <SelectableSlideElements
            markdown={markdown}
            selectedElement={selectedElement}
            onSelectElement={handleElementSelect}
            editable={true}
            canvasScale={scale}
          />
        )}
        
        {/* Inline element editor */}
        {selectedElement && isEditingElement && (
          <InlineElementEditor
            element={selectedElement}
            markdown={markdown}
            onUpdate={handleElementUpdate}
            onClose={() => setIsEditingElement(false)}
            theme={slideTheme}
          />
        )}
      </div>
      
      {/* Selection feedback (floating handles) */}
      {selectedElement && !isEditingElement && (
        <div className="absolute pointer-events-none">
          <SelectionHandles
            element={selectedElement}
            scale={scale}
          />
        </div>
      )}
    </div>
  )
}

/**
 * SelectionHandles
 * 
 * Visual feedback for selected elements - shows resize handles and selection border
 */
function SelectionHandles({
  element,
  scale,
}: {
  element: SelectedElement
  scale: number
}): JSX.Element {
  const handleSize = 8
  const x = element.x * scale
  const y = element.y * scale
  const w = (element.w || 100) * scale
  const h = (element.h || 50) * scale
  
  return (
    <>
      {/* Selection border */}
      <div
        className="absolute border-2 border-blue-500 pointer-events-auto"
        style={{
          left: x,
          top: y,
          width: w,
          height: h,
          boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.3)',
        }}
      />
      
      {/* Resize handles */}
      {[
        { name: 'tl', x: x - handleSize / 2, y: y - handleSize / 2, cursor: 'nwse-resize' },
        { name: 'tr', x: x + w - handleSize / 2, y: y - handleSize / 2, cursor: 'nesw-resize' },
        { name: 'bl', x: x - handleSize / 2, y: y + h - handleSize / 2, cursor: 'nesw-resize' },
        { name: 'br', x: x + w - handleSize / 2, y: y + h - handleSize / 2, cursor: 'nwse-resize' },
        { name: 'tm', x: x + w / 2 - handleSize / 2, y: y - handleSize / 2, cursor: 'ns-resize' },
        { name: 'bm', x: x + w / 2 - handleSize / 2, y: y + h - handleSize / 2, cursor: 'ns-resize' },
        { name: 'lm', x: x - handleSize / 2, y: y + h / 2 - handleSize / 2, cursor: 'ew-resize' },
        { name: 'rm', x: x + w - handleSize / 2, y: y + h / 2 - handleSize / 2, cursor: 'ew-resize' },
      ].map(({ name, x: hx, y: hy, cursor }) => (
        <div
          key={name}
          className="absolute bg-blue-500 rounded-full pointer-events-auto hover:bg-blue-600 transition-colors"
          style={{
            left: hx,
            top: hy,
            width: handleSize,
            height: handleSize,
            cursor,
          }}
        />
      ))}
    </>
  )
}

export default EditableSlideCanvas
