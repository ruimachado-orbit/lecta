import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { SelectedElement } from './EditableSlideCanvas'

export interface InlineElementEditorProps {
  element: SelectedElement
  markdown: string
  onUpdate: (content: string) => void
  onClose: () => void
  theme: 'dark' | 'light'
}

/**
 * InlineElementEditor
 * 
 * Floating editor for selected slide elements.
 * Shows context-appropriate controls based on element type:
 * - Textbox: text input, font color, font size
 * - Shape: color, stroke, fill
 * - Image: dimensions, alignment
 * 
 * Floats above the selected element with a backdrop portal.
 */
export function InlineElementEditor({
  element,
  markdown,
  onUpdate,
  onClose,
  theme,
}: InlineElementEditorProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(true)
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handleClose = useCallback(() => {
    setIsOpen(false)
    setTimeout(onClose, 200) // Wait for animation
  }, [onClose])
  
  if (!isOpen) return <></>
  
  // Extract element content from markdown
  const elementMarkdown = markdown.substring(element.matchStart, element.matchEnd)
  
  return createPortal(
    <div
      ref={editorRef}
      className={`
        fixed inset-0 pointer-events-none z-50
        flex items-start justify-center pt-16
      `}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/0 pointer-events-auto"
        onClick={handleClose}
      />
      
      {/* Editor panel */}
      <div
        className={`
          relative pointer-events-auto rounded-lg shadow-2xl
          ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}
          border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-200'}
          p-6 w-96 max-w-[90vw] max-h-[80vh] overflow-y-auto
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold capitalize">
            Edit {element.type}
          </h3>
          <button
            onClick={handleClose}
            className={`
              p-1 rounded hover:bg-gray-700/50 transition-colors
              ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}
            `}
            title="Close editor (Esc)"
          >
            ✕
          </button>
        </div>
        
        {/* Editor content based on element type */}
        {element.type === 'textbox' && (
          <TextboxEditor
            element={element}
            elementMarkdown={elementMarkdown}
            onUpdate={onUpdate}
            theme={theme}
          />
        )}
        
        {element.type === 'shape' && (
          <ShapeEditor
            element={element}
            elementMarkdown={elementMarkdown}
            onUpdate={onUpdate}
            theme={theme}
          />
        )}
        
        {element.type === 'image' && (
          <ImageEditor
            element={element}
            elementMarkdown={elementMarkdown}
            onUpdate={onUpdate}
            theme={theme}
          />
        )}
      </div>
    </div>,
    document.body
  )
}

/**
 * TextboxEditor
 * 
 * Edit textbox content, color, and size
 */
function TextboxEditor({
  element,
  elementMarkdown,
  onUpdate,
  theme,
}: {
  element: SelectedElement
  elementMarkdown: string
  onUpdate: (content: string) => void
  theme: 'dark' | 'light'
}): JSX.Element {
  // Extract current content
  const contentMatch = elementMarkdown.match(
    /<!--\s*textbox[^>]*-->([\s\S]*?)<!--\s*\/textbox\s*-->/
  )
  const currentContent = contentMatch?.[1]?.trim() || ''
  
  // Extract properties
  const propsMatch = elementMarkdown.match(
    /<!--\s*textbox\s+([^>]*)-->/
  )
  const propsStr = propsMatch?.[1] || ''
  const fontSize = (propsStr.match(/fs=(\d+)/) ?? [, '18'])[1]
  const fontColor = (propsStr.match(/fc=([^\s]+)/) ?? [, '#ffffff'])[1]
  
  const [content, setContent] = useState(currentContent)
  const [size, setSize] = useState(fontSize)
  const [color, setColor] = useState(fontColor)
  
  const handleContentUpdate = useCallback((newContent: string) => {
    setContent(newContent)
    // Update markdown with new content
    const updated = elementMarkdown.replace(
      /<!--\s*textbox([^>]*)-->([\s\S]*?)<!--\s*\/textbox\s*-->/,
      `<!--\s*textbox$1-->${newContent}<!--\s*/textbox\s*-->/`
    )
    onUpdate(updated)
  }, [elementMarkdown, onUpdate])
  
  const handlePropertyUpdate = useCallback((prop: string, value: string) => {
    // Update properties in markdown
    let updated = elementMarkdown
    
    if (prop === 'fs') {
      updated = updated.replace(/fs=\d+/, `fs=${value}`)
      if (!updated.includes('fs=')) {
        updated = updated.replace(/textbox\s+/, `textbox fs=${value} `)
      }
      setSize(value)
    } else if (prop === 'fc') {
      updated = updated.replace(/fc=[^\s]+/, `fc=${value}`)
      if (!updated.includes('fc=')) {
        updated = updated.replace(/textbox\s+/, `textbox fc=${value} `)
      }
      setColor(value)
    }
    
    onUpdate(updated)
  }, [elementMarkdown, onUpdate])
  
  return (
    <div className="space-y-4">
      {/* Content editor */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Content
        </label>
        <textarea
          value={content}
          onChange={(e) => handleContentUpdate(e.target.value)}
          className={`
            w-full h-32 p-3 rounded border transition-colors
            ${theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
            }
            focus:outline-none focus:ring-2 focus:ring-blue-500/30
          `}
          placeholder="Enter text content..."
        />
      </div>
      
      {/* Font size */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Font Size: {size}px
        </label>
        <input
          type="range"
          min="12"
          max="72"
          step="2"
          value={size}
          onChange={(e) => handlePropertyUpdate('fs', e.target.value)}
          className="w-full"
        />
      </div>
      
      {/* Font color */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Text Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => handlePropertyUpdate('fc', e.target.value)}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => handlePropertyUpdate('fc', e.target.value)}
            placeholder="#ffffff"
            className={`
              flex-1 px-3 py-2 rounded border transition-colors
              ${theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
              }
              focus:outline-none focus:ring-2 focus:ring-blue-500/30
            `}
          />
        </div>
      </div>
      
      {/* Quick color palette */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Quick Colors
        </label>
        <div className="flex gap-2 flex-wrap">
          {[
            { name: 'White', value: '#ffffff' },
            { name: 'Gray', value: '#a3a3a3' },
            { name: 'Red', value: '#ef4444' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Green', value: '#22c55e' },
            { name: 'Purple', value: '#a855f7' },
          ].map(({ name, value }) => (
            <button
              key={value}
              onClick={() => handlePropertyUpdate('fc', value)}
              className="w-8 h-8 rounded border-2 transition-all hover:scale-110"
              style={{
                backgroundColor: value,
                borderColor: color === value ? '#3b82f6' : 'transparent',
              }}
              title={name}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * ShapeEditor
 * 
 * Edit shape properties (fill, stroke, stroke width)
 */
function ShapeEditor({
  element,
  elementMarkdown,
  onUpdate,
  theme,
}: {
  element: SelectedElement
  elementMarkdown: string
  onUpdate: (content: string) => void
  theme: 'dark' | 'light'
}): JSX.Element {
  const propsMatch = elementMarkdown.match(
    /<!--\s*shape\s+([^>]*)-->/
  )
  const propsStr = propsMatch?.[1] || ''
  const fill = (propsStr.match(/fill=([^\s]+)/) ?? [, 'transparent'])[1]
  const stroke = (propsStr.match(/stroke=([^\s]+)/) ?? [, '#ffffff'])[1]
  const strokeWidth = (propsStr.match(/sw=(\d+)/) ?? [, '2'])[1]
  
  const [fillColor, setFillColor] = useState(fill)
  const [strokeColor, setStrokeColor] = useState(stroke)
  const [strokeWidthVal, setStrokeWidthVal] = useState(strokeWidth)
  
  const handleUpdate = useCallback((prop: string, value: string) => {
    let updated = elementMarkdown
    
    if (prop === 'fill') {
      updated = updated.replace(/fill=[^\s]+/, `fill=${value}`)
      if (!updated.includes('fill=')) {
        updated = updated.replace(/shape\s+/, `shape fill=${value} `)
      }
      setFillColor(value)
    } else if (prop === 'stroke') {
      updated = updated.replace(/stroke=[^\s]+/, `stroke=${value}`)
      if (!updated.includes('stroke=')) {
        updated = updated.replace(/shape\s+/, `shape stroke=${value} `)
      }
      setStrokeColor(value)
    } else if (prop === 'sw') {
      updated = updated.replace(/sw=\d+/, `sw=${value}`)
      if (!updated.includes('sw=')) {
        updated = updated.replace(/shape\s+/, `shape sw=${value} `)
      }
      setStrokeWidthVal(value)
    }
    
    onUpdate(updated)
  }, [elementMarkdown, onUpdate])
  
  return (
    <div className="space-y-4">
      {/* Fill color */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Fill Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={fillColor === 'transparent' ? '#000000' : fillColor}
            onChange={(e) => handleUpdate('fill', e.target.value)}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <select
            value={fillColor}
            onChange={(e) => handleUpdate('fill', e.target.value)}
            className={`
              flex-1 px-3 py-2 rounded border transition-colors
              ${theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
              }
            `}
          >
            <option value="transparent">Transparent</option>
            <option value="#ffffff">White</option>
            <option value="#000000">Black</option>
            <option value="#ef4444">Red</option>
            <option value="#3b82f6">Blue</option>
            <option value="#22c55e">Green</option>
          </select>
        </div>
      </div>
      
      {/* Stroke color */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Stroke Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => handleUpdate('stroke', e.target.value)}
            className="w-16 h-10 rounded cursor-pointer"
          />
          <input
            type="text"
            value={strokeColor}
            onChange={(e) => handleUpdate('stroke', e.target.value)}
            className={`
              flex-1 px-3 py-2 rounded border transition-colors
              ${theme === 'dark'
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-white border-gray-300 text-gray-900'
              }
            `}
          />
        </div>
      </div>
      
      {/* Stroke width */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Stroke Width: {strokeWidthVal}px
        </label>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={strokeWidthVal}
          onChange={(e) => handleUpdate('sw', e.target.value)}
          className="w-full"
        />
      </div>
    </div>
  )
}

/**
 * ImageEditor
 * 
 * Edit image properties (dimensions, alignment)
 */
function ImageEditor({
  element,
  elementMarkdown,
  onUpdate,
  theme,
}: {
  element: SelectedElement
  elementMarkdown: string
  onUpdate: (content: string) => void
  theme: 'dark' | 'light'
}): JSX.Element {
  const propsMatch = elementMarkdown.match(
    /<!--\s*image\s+([^>]*)-->/
  )
  const propsStr = propsMatch?.[1] || ''
  const src = (propsStr.match(/src=([^\s]+)/) ?? [, ''])[1]
  const border = (propsStr.match(/border=([^\s]+)/) ?? [, ''])[1]
  const radius = (propsStr.match(/radius=(\d+)/) ?? [, '0'])[1]
  
  const [srcVal, setSrcVal] = useState(src)
  const [borderVal, setBorderVal] = useState(border)
  const [radiusVal, setRadiusVal] = useState(radius)
  
  const handleUpdate = useCallback((prop: string, value: string) => {
    let updated = elementMarkdown
    
    if (prop === 'src') {
      updated = updated.replace(/src=[^\s]+/, `src=${value}`)
      setSrcVal(value)
    } else if (prop === 'border') {
      if (value) {
        updated = updated.replace(/border=[^\s]+/, `border=${value}`)
        if (!updated.includes('border=')) {
          updated = updated.replace(/-->\s*$/, ` border=${value} -->`)
        }
      }
      setBorderVal(value)
    } else if (prop === 'radius') {
      updated = updated.replace(/radius=\d+/, `radius=${value}`)
      if (!updated.includes('radius=')) {
        updated = updated.replace(/-->\s*$/, ` radius=${value} -->`)
      }
      setRadiusVal(value)
    }
    
    onUpdate(updated)
  }, [elementMarkdown, onUpdate])
  
  return (
    <div className="space-y-4">
      {/* Image source */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Image Path
        </label>
        <input
          type="text"
          value={srcVal}
          onChange={(e) => handleUpdate('src', e.target.value)}
          placeholder="/path/to/image.png"
          className={`
            w-full px-3 py-2 rounded border transition-colors
            ${theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
            }
            focus:outline-none focus:ring-2 focus:ring-blue-500/30
          `}
        />
      </div>
      
      {/* Border */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Border
        </label>
        <input
          type="text"
          value={borderVal}
          onChange={(e) => handleUpdate('border', e.target.value)}
          placeholder="e.g., 2px solid white"
          className={`
            w-full px-3 py-2 rounded border transition-colors
            ${theme === 'dark'
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
            }
            focus:outline-none focus:ring-2 focus:ring-blue-500/30
          `}
        />
      </div>
      
      {/* Border radius */}
      <div>
        <label className={`block text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Border Radius: {radiusVal}px
        </label>
        <input
          type="range"
          min="0"
          max="50"
          step="2"
          value={radiusVal}
          onChange={(e) => handleUpdate('radius', e.target.value)}
          className="w-full"
        />
      </div>
    </div>
  )
}

export default InlineElementEditor
