import { useCallback, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { usePresentationStore } from '../../stores/presentation-store'
import { useUIStore } from '../../stores/ui-store'

function getMonacoLanguage(language: string): string {
  const mapping: Record<string, string> = {
    javascript: 'javascript', typescript: 'typescript', python: 'python',
    sql: 'sql', html: 'html', css: 'css', json: 'json', bash: 'shell',
    rust: 'rust', go: 'go', java: 'java', csharp: 'csharp', ruby: 'ruby', php: 'php'
  }
  return mapping[language] || 'plaintext'
}

export function CodeEditor(): JSX.Element {
  const { slides, currentSlideIndex, updateCodeContent, saveSlideContent } = usePresentationStore()
  const { fontSize } = useUIStore()
  const currentSlide = slides[currentSlideIndex]
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const lastSavedIndex = useRef<number>(currentSlideIndex)

  const language = currentSlide?.codeLanguage
    ? getMonacoLanguage(currentSlide.codeLanguage)
    : 'plaintext'

  // Save when switching slides
  useEffect(() => {
    if (lastSavedIndex.current !== currentSlideIndex) {
      saveSlideContent(lastSavedIndex.current)
      lastSavedIndex.current = currentSlideIndex
    }
  }, [currentSlideIndex])

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveSlideContent(usePresentationStore.getState().currentSlideIndex)
    }
  }, [])

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateCodeContent(currentSlideIndex, value)

        // Debounced auto-save (1.5s after last keystroke)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          saveSlideContent(currentSlideIndex)
        }, 1500)
      }
    },
    [currentSlideIndex, updateCodeContent, saveSlideContent]
  )

  return (
    <div className="h-full">
      <Editor
        height="100%"
        language={language}
        value={currentSlide?.codeContent ?? ''}
        onChange={handleChange}
        theme="vs-dark"
        options={{
          fontSize,
          lineHeight: Math.round(fontSize * 1.5),
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 12, bottom: 12 },
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          automaticLayout: true,
          wordWrap: 'on',
          tabSize: 2,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true
          }
        }}
      />
    </div>
  )
}
