/**
 * SimplifiedSlideEditor
 * 
 * Sprint 1 replacement for SlidePanel.
 * Unified WYSIWYG editor with optional markdown panel.
 * No more Visual | Editor | Draw toggle - always show editable slide.
 * 
 * This is meant to eventually replace SlidePanel.tsx
 */

import { useCallback, useState, useEffect, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { EditableSlideCanvas } from './EditableSlideCanvas'
import { SlideEditToolbar } from './SlideEditToolbar'
import { SlideNavigator } from './SlideNavigator'
import { WysiwygEditor } from './WysiwygEditor'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useSubSlides } from '../../hooks/useSubSlides'
import { prefetchMdx } from './MdxRenderer'

/**
 * SimplifiedSlideEditor
 * 
 * Main slide editing interface with:
 * - EditableSlideCanvas as primary editing surface (always visible)
 * - Optional markdown editor panel (collapsible on right)
 * - Simplified toolbar (no mode toggle)
 * - Slide navigator (optional, collapsible)
 * 
 * Keyboard shortcuts:
 * - Ctrl/Cmd + S: Save
 * - Escape: Deselect element
 * - Tab: Toggle markdown panel
 */
export function SimplifiedSlideEditor(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const slideTheme = presentation?.theme || 'dark'
  const { showNavigator, editingSlide, slideGroups } = useUIStore()
  
  const currentSlide = slides[currentSlideIndex]
  const editorRef = useRef<any>(null)
  
  // UI state
  const [showMarkdownPanel, setShowMarkdownPanel] = useState(false)
  const [markdownPanelWidth, setMarkdownPanelWidth] = useState(350)
  const [isDraggingMarkdown, setIsDraggingMarkdown] = useState(false)
  
  // Prefetch MDX slides
  useEffect(() => {
    const curr = slides[currentSlideIndex]
    const prev = slides[currentSlideIndex - 1]
    const next = slides[currentSlideIndex + 1]
    if (curr?.isMdx) prefetchMdx(curr.markdownContent)
    if (prev?.isMdx) prefetchMdx(prev.markdownContent)
    if (next?.isMdx) prefetchMdx(next.markdownContent)
  }, [currentSlideIndex, slides])
  
  // Compute current group label
  const groupLabel = (() => {
    if (!currentSlide) return null
    const slideId = currentSlide.config.id
    for (const group of slideGroups) {
      const idx = group.slideIds.indexOf(slideId)
      if (idx >= 0) return { name: group.name, position: idx + 1, total: group.slideIds.length, color: group.color }
    }
    return null
  })()
  
  // Handle markdown editor mount (for syntax highlighting, etc.)
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    // Configure language features
    monaco.languages.register({ id: 'markdown' })
  }
  
  // Save slide content
  const handleSave = useCallback(async () => {
    await saveSlideContent(currentSlideIndex)
  }, [currentSlideIndex, saveSlideContent])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // Tab: Toggle markdown panel
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault()
        setShowMarkdownPanel((prev) => !prev)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])
  
  // Handle markdown panel resize
  useEffect(() => {
    if (!isDraggingMarkdown) return
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX - 10))
      setMarkdownPanelWidth(newWidth)
    }
    
    const handleMouseUp = () => {
      setIsDraggingMarkdown(false)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingMarkdown])
  
  if (!editingSlide || !currentSlide) {
    return (
      <div className={`flex items-center justify-center h-full ${slideTheme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
        <p className="text-gray-500">No slide selected</p>
      </div>
    )
  }
  
  return (
    <div className={`flex h-full flex-col ${slideTheme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Top toolbar */}
      <div className={`border-b ${slideTheme === 'dark' ? 'border-gray-800' : 'border-gray-200'} p-2`}>
        <SlideEditToolbar
          onSave={handleSave}
          onToggleMarkdown={() => setShowMarkdownPanel((prev) => !prev)}
          isMarkdownPanelOpen={showMarkdownPanel}
          groupLabel={groupLabel}
          slideTheme={slideTheme}
        />
      </div>
      
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden gap-0">
        {/* Left side: Navigator + Canvas */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Navigator (optional, collapsible) */}
          {showNavigator && (
            <div className={`border-b ${slideTheme === 'dark' ? 'border-gray-800' : 'border-gray-200'} overflow-auto`} style={{ height: '120px' }}>
              <SlideNavigator />
            </div>
          )}
          
          {/* Main editable canvas */}
          <div className="flex-1 overflow-auto">
            <EditableSlideCanvas
              slideIndex={currentSlideIndex}
              canvasWidth={1024}
              canvasHeight={576}
              scale={1}
              isDarkTheme={slideTheme === 'dark'}
              editingMode={true}
              onUpdateMarkdown={(content) => updateMarkdownContent(currentSlideIndex, content)}
            />
          </div>
        </div>
        
        {/* Right side: Markdown panel (optional) */}
        {showMarkdownPanel && (
          <>
            {/* Resize handle */}
            <div
              onMouseDown={() => setIsDraggingMarkdown(true)}
              className={`
                w-1 cursor-col-resize transition-colors
                ${slideTheme === 'dark'
                  ? 'bg-gray-800 hover:bg-gray-700'
                  : 'bg-gray-200 hover:bg-gray-300'
                }
              `}
            />
            
            {/* Markdown editor panel */}
            <div
              className={`
                flex flex-col border-l
                ${slideTheme === 'dark' ? 'border-gray-800' : 'border-gray-200'}
                overflow-hidden
              `}
              style={{ width: markdownPanelWidth }}
            >
              <div className={`px-4 py-3 border-b font-semibold text-sm ${slideTheme === 'dark' ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                Markdown
              </div>
              
              <div className="flex-1 overflow-hidden">
                <Editor
                  height="100%"
                  defaultLanguage="markdown"
                  value={currentSlide.markdownContent || ''}
                  onChange={(value) => {
                    if (value !== undefined) {
                      updateMarkdownContent(currentSlideIndex, value)
                    }
                  }}
                  onMount={handleEditorMount}
                  theme={slideTheme === 'dark' ? 'vs-dark' : 'vs'}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    fontSize: 12,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SimplifiedSlideEditor
