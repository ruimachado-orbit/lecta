import { useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { usePresentationStore } from '../../stores/presentation-store'

function getMonacoLanguage(language: string): string {
  const mapping: Record<string, string> = {
    javascript: 'javascript', typescript: 'typescript', python: 'python',
    sql: 'sql', html: 'html', css: 'css', json: 'json', bash: 'shell',
    rust: 'rust', go: 'go', java: 'java', csharp: 'csharp', ruby: 'ruby', php: 'php'
  }
  return mapping[language] || 'plaintext'
}

export function CodeEditor(): JSX.Element {
  const { slides, currentSlideIndex, updateCodeContent } = usePresentationStore()
  const currentSlide = slides[currentSlideIndex]

  const language = currentSlide?.codeLanguage
    ? getMonacoLanguage(currentSlide.codeLanguage)
    : 'plaintext'

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        updateCodeContent(currentSlideIndex, value)
      }
    },
    [currentSlideIndex, updateCodeContent]
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
          fontSize: 15,
          lineHeight: 22,
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
