import { useCallback, useRef, useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'
import { SlideRenderer } from './SlideRenderer'
import { SlideNavigator } from './SlideNavigator'
import { SlideEditToolbar } from './SlideEditToolbar'
import { AIGeneratePanel, AIImproveBar } from './AISlidePanel'
import { ArtifactBar } from '../artifacts/ArtifactBar'
import Editor, { type OnMount } from '@monaco-editor/react'

export function SlidePanel(): JSX.Element {
  const { slides, currentSlideIndex, updateMarkdownContent, saveSlideContent, presentation } = usePresentationStore()
  const { showNavigator, editingSlide } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const editorRef = useRef<any>(null)
  const [showAIGenerate, setShowAIGenerate] = useState(false)

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

      {/* AI improve bar (shown for AI-generated slides in preview mode) */}
      {!editingSlide && <AIImproveBar />}

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

      {/* AI Generate panel (toggleable) */}
      {showAIGenerate && <AIGeneratePanel />}

      {/* Slide navigator strip with AI generate toggle */}
      {showNavigator && (
        <div className="flex border-t border-gray-800">
          <div className="flex-1 overflow-hidden">
            <SlideNavigator />
          </div>
          <button
            onClick={() => setShowAIGenerate(!showAIGenerate)}
            className={`flex-shrink-0 w-12 border-l border-gray-800 flex items-center justify-center transition-colors ${
              showAIGenerate ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-500 hover:text-indigo-400'
            }`}
            title="AI slide generator"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
