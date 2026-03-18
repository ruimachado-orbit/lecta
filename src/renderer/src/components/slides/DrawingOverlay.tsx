import { useEffect, useRef, useCallback, useState } from 'react'
import { Excalidraw, exportToSvg } from '@excalidraw/excalidraw'
import { usePresentationStore } from '../../stores/presentation-store'

interface DrawingOverlayProps {
  slideIndex: number
  active: boolean // true = drawing mode, false = static display
  width: number
  height: number
}

/**
 * Interactive Excalidraw drawing overlay for a slide.
 * In active mode: full drawing tools.
 * In passive mode: renders drawings as static SVG.
 */
export function DrawingOverlay({ slideIndex, active, width, height }: DrawingOverlayProps): JSX.Element {
  const { slides, presentation } = usePresentationStore()
  const slide = slides[slideIndex]
  const excalidrawRef = useRef<any>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const [staticSvg, setStaticSvg] = useState<string>('')

  // Parse stored drawings
  const initialElements = useCallback((): any[] => {
    if (!slide?.config.drawings) return []
    try {
      return JSON.parse(slide.config.drawings)
    } catch {
      return []
    }
  }, [slide?.config.drawings])

  // Save drawings to disk
  const saveDrawings = useCallback((elements: readonly any[]) => {
    if (!presentation) return
    const nonDeleted = elements.filter((e) => !e.isDeleted)
    const json = nonDeleted.length > 0 ? JSON.stringify(nonDeleted) : ''
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI.saveDrawings(presentation.rootPath, slideIndex, json)
    }, 1000)
  }, [presentation, slideIndex])

  // Generate static SVG for passive mode
  useEffect(() => {
    if (active) return
    const elements = initialElements()
    if (elements.length === 0) { setStaticSvg(''); return }

    async function renderSvg() {
      try {
        const svg = await exportToSvg({
          elements: elements as any,
          appState: {
            exportWithDarkMode: true,
            exportBackground: false,
            viewBackgroundColor: 'transparent'
          } as any,
          files: {} as any
        })
        setStaticSvg(svg.outerHTML)
      } catch {
        setStaticSvg('')
      }
    }
    renderSvg()
  }, [active, slide?.config.drawings])

  // Active drawing mode
  if (active) {
    return (
      <div className="absolute inset-0 z-20" style={{ width, height }}>
        <Excalidraw
          ref={excalidrawRef}
          initialData={{
            elements: initialElements(),
            appState: {
              viewBackgroundColor: 'transparent',
              theme: 'dark' as const,
              gridSize: 0
            }
          }}
          onChange={(elements: readonly any[]) => {
            saveDrawings(elements)
          }}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: false,
              toggleTheme: false
            }
          }}
        />
      </div>
    )
  }

  // Passive mode — static SVG overlay
  if (!staticSvg) return <></>

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      dangerouslySetInnerHTML={{ __html: staticSvg }}
      style={{ width, height }}
    />
  )
}
