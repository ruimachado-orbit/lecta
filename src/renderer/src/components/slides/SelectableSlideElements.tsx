import { useCallback, useMemo } from 'react'
import type { SelectedElement } from './EditableSlideCanvas'

export interface SelectableSlideElementsProps {
  markdown: string
  selectedElement: SelectedElement | null
  onSelectElement: (element: SelectedElement | null) => void
  editable: boolean
  canvasScale: number
}

/**
 * Element parsers - extract positioned elements from markdown
 */

function parseTextBoxes(md: string) {
  // Pattern: <!-- textbox x=N y=N w=N [fs=N] [fc=#hex] [fb=1] [fi=1] -->content<!-- /textbox -->
  const regex = /<!--\s*textbox\s+x=(\d+)\s+y=(\d+)(?:\s+w=(\d+))?(?:\s+fs=(\d+))?(?:\s+fc=([^\s]+))?(?:\s+fb=([01]))?(?:\s+fi=([01]))?\s*-->([\s\S]*?)<!--\s*\/textbox\s*-->/gi
  
  const boxes: SelectedElement[] = []
  let match
  let index = 0
  
  while ((match = regex.exec(md)) !== null) {
    boxes.push({
      type: 'textbox',
      index,
      x: parseInt(match[1]),
      y: parseInt(match[2]),
      w: parseInt(match[3]) || 300,
      h: parseInt(match[4]) || 50, // Use fs as height for now
      content: match[9]?.trim() || '',
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
    })
    index++
  }
  
  return boxes
}

function parseShapes(md: string) {
  // Pattern: <!-- shape type=rect|ellipse|line x=N y=N w=N h=N [fill=...] [stroke=...] [sw=N] -->
  const regex = /<!--\s*shape\s+type=(\w+)\s+x=(-?\d+)\s+y=(-?\d+)\s+w=(\d+)\s+h=(\d+)(?:\s+fill=([^\s]+))?(?:\s+stroke=([^\s]+))?(?:\s+sw=(\d+))?\s*-->/gi
  
  const shapes: SelectedElement[] = []
  let match
  let index = 0
  
  while ((match = regex.exec(md)) !== null) {
    shapes.push({
      type: 'shape',
      index,
      x: parseInt(match[2]),
      y: parseInt(match[3]),
      w: parseInt(match[4]),
      h: parseInt(match[5]),
      content: match[1], // type stored as content
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
    })
    index++
  }
  
  return shapes
}

function parseImages(md: string) {
  // Pattern: <!-- image x=N y=N w=N src=path [border=...] [radius=N] -->
  const regex = /<!--\s*image\s+x=(-?\d+)\s+y=(-?\d+)\s+w=(\d+)\s+src=([^\s]+)(?:\s+border=([^\s]+))?(?:\s+radius=(\d+))?\s*-->/gi
  
  const images: SelectedElement[] = []
  let match
  let index = 0
  
  while ((match = regex.exec(md)) !== null) {
    images.push({
      type: 'image',
      index,
      x: parseInt(match[1]),
      y: parseInt(match[2]),
      w: parseInt(match[3]),
      h: parseInt(match[3]), // Assume square for now
      content: match[4], // src
      matchStart: match.index,
      matchEnd: match.index + match[0].length,
    })
    index++
  }
  
  return images
}

/**
 * SelectableSlideElements
 * 
 * Renders clickable overlays for all positioned elements (textbox, shape, image).
 * Handles element selection and provides visual feedback.
 * Does NOT render the elements themselves - that's done by DraggableElements/ContentRenderer.
 * This component ONLY handles the selection/interaction layer.
 */
export function SelectableSlideElements({
  markdown,
  selectedElement,
  onSelectElement,
  editable,
  canvasScale,
}: SelectableSlideElementsProps): JSX.Element {
  // Parse all elements from markdown
  const elements = useMemo(() => {
    const textboxes = parseTextBoxes(markdown)
    const shapes = parseShapes(markdown)
    const images = parseImages(markdown)
    return [...textboxes, ...shapes, ...images]
  }, [markdown])
  
  // Handle element click
  const handleElementClick = useCallback((e: React.MouseEvent, element: SelectedElement) => {
    e.stopPropagation()
    if (!editable) return
    onSelectElement(selectedElement?.index === element.index && selectedElement?.type === element.type ? null : element)
  }, [editable, selectedElement, onSelectElement])
  
  if (!editable || elements.length === 0) {
    return <></>
  }
  
  return (
    <>
      {elements.map((element) => {
        const isSelected = selectedElement?.type === element.type && selectedElement?.index === element.index
        
        return (
          <ElementClickTarget
            key={`${element.type}-${element.index}`}
            element={element}
            isSelected={isSelected}
            onElementClick={handleElementClick}
            canvasScale={canvasScale}
          />
        )
      })}
    </>
  )
}

/**
 * ElementClickTarget
 * 
 * Invisible clickable overlay for each element.
 * Provides hover feedback and handles selection click.
 */
function ElementClickTarget({
  element,
  isSelected,
  onElementClick,
  canvasScale,
}: {
  element: SelectedElement
  isSelected: boolean
  onElementClick: (e: React.MouseEvent, element: SelectedElement) => void
  canvasScale: number
}): JSX.Element {
  const x = element.x * canvasScale
  const y = element.y * canvasScale
  const w = (element.w || 100) * canvasScale
  const h = (element.h || 50) * canvasScale
  
  return (
    <div
      onClick={(e) => onElementClick(e, element)}
      onContextMenu={(e) => {
        e.preventDefault()
        // Right-click could open context menu
      }}
      className={`
        absolute transition-all cursor-pointer
        ${isSelected
          ? 'bg-blue-500/20'
          : 'bg-transparent hover:bg-blue-500/10'
        }
        hover:border hover:border-blue-400/50
      `}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        zIndex: isSelected ? 20 : 10,
      }}
      title={`${element.type} (${Math.round(x)}, ${Math.round(y)})`}
    />
  )
}

export default SelectableSlideElements
