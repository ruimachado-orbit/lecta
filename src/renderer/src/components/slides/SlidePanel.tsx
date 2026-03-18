import { useCallback, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { SlideRenderer } from './SlideRenderer'
import { SlideNavigator } from './SlideNavigator'
import { SlideEditToolbar } from './SlideEditToolbar'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const { showNavigator, editingSlide } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const editorRef = useRef<any>(null)

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateMarkdownContent(currentSlideIndex, value)
      }
    },
    [currentSlideIndex, updateMarkdownContent]
  )

  const handleEditorBlur = useCallback(() => {
    saveSlideContent(currentSlideIndex)
  }, [currentSlideIndex, saveSlideContent])

  if (!currentSlide) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        No slides loaded
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Editing toolbar */}
      {editingSlide && <SlideEditToolbar editorRef={editorRef} />}

      {/* Slide content — edit or preview */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {editingSlide ? (
          <div className="h-full" onBlur={handleEditorBlur}>
            <Editor
              height="100%"
              language="markdown"
              value={currentSlide.markdownContent}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 15,
                lineHeight: 22,
                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: 'off',
                renderLineHighlight: 'none',
                wordWrap: 'on',
                automaticLayout: true,
                tabSize: 2
              }}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-8">
            <SlideRenderer markdown={currentSlide.markdownContent} rootPath={presentation?.rootPath} />
          </div>
        )}
      </div>

      {/* Artifact chips */}
      {currentSlide.config.artifacts.length > 0 && (
        <ArtifactBar artifacts={currentSlide.config.artifacts} />
      )}

      {/* Slide navigator strip */}
      {showNavigator && <SlideNavigator />}
    </div>
  )
}
