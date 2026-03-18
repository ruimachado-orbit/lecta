import { useEffect, useCallback, useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

interface DrawingOverlayProps {
  slideIndex: number
  active: boolean
  width: number
  height: number
}

export function DrawingOverlay({ slideIndex, active, width, height }: DrawingOverlayProps): JSX.Element {
  const { slides, presentation } = usePresentationStore()
  const slide = slides[slideIndex]
  const [staticSvg, setStaticSvg] = useState<string>('')
  const [ExcalidrawMod, setExcalidrawMod] = useState<any>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const apiRef = useRef<any>(null)

  const getElements = useCallback((): any[] => {
    if (!slide?.config.drawings) return []
    try { return JSON.parse(slide.config.drawings) } catch { return [] }
  }, [slide?.config.drawings])

  const handleChange = useCallback((elements: readonly any[]) => {
    if (!presentation) return
    const nonDeleted = elements.filter((e: any) => !e.isDeleted)
    const json = nonDeleted.length > 0 ? JSON.stringify(nonDeleted) : ''
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.electronAPI.saveDrawings(presentation.rootPath, slideIndex, json)
    }, 1000)
  }, [presentation, slideIndex])

  const [loadError, setLoadError] = useState<string>('')

  // Lazy load Excalidraw with timeout
  useEffect(() => {
    if (active && !ExcalidrawMod) {
      setLoadError('')
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        setLoadError('Drawing tools took too long to load. Try toggling Draw mode off and on.')
      }, 10000)

      import('@excalidraw/excalidraw')
        .then((mod) => {
          clearTimeout(timeout)
          if (!timedOut) setExcalidrawMod(mod)
        })
        .catch((err) => {
          clearTimeout(timeout)
          console.error('Failed to load Excalidraw:', err)
          setLoadError(err?.message || 'Failed to load drawing tools')
        })

      return () => clearTimeout(timeout)
    }
  }, [active])

  // Generate static SVG for passive mode
  useEffect(() => {
    if (active) return
    const elements = getElements()
    if (elements.length === 0) { setStaticSvg(''); return }

    import('@excalidraw/excalidraw').then((mod) => {
      mod.exportToSvg({
        elements,
        appState: {
          exportWithDarkMode: true,
          exportBackground: false,
          viewBackgroundColor: 'transparent'
        } as any,
        files: {} as any
      }).then((svg: SVGSVGElement) => {
        svg.setAttribute('width', '100%')
        svg.setAttribute('height', '100%')
        setStaticSvg(svg.outerHTML)
      }).catch(() => setStaticSvg(''))
    })
  }, [active, slide?.config.drawings])

  if (active && ExcalidrawMod) {
    const { Excalidraw } = ExcalidrawMod

    return (
      <div className="absolute inset-0 z-20" style={{ width, height }}>
        <Excalidraw
          excalidrawAPI={(api: any) => { apiRef.current = api }}
          initialData={{
            elements: getElements(),
            appState: {
              viewBackgroundColor: 'transparent',
              theme: 'dark',
              currentItemStrokeColor: '#ffffff',
              currentItemBackgroundColor: 'transparent',
              currentItemFillStyle: 'solid',
              currentItemStrokeWidth: 2,
              currentItemRoughness: 0,
            }
          }}
          onChange={handleChange as any}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
              loadScene: false,
              export: false,
              toggleTheme: false,
              clearCanvas: true,
            }
          }}
        >
          {/* Empty children to suppress welcome screen */}
        </Excalidraw>
      </div>
    )
  }

  if (active) {
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center text-sm">
        {loadError ? (
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load drawing tools</p>
            <p className="text-gray-600 text-xs max-w-xs">{loadError}</p>
          </div>
        ) : (
          <span className="text-gray-500 animate-pulse">Loading drawing tools...</span>
        )}
      </div>
    )
  }

  if (!staticSvg) return <></>

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      dangerouslySetInnerHTML={{ __html: staticSvg }}
      style={{ width, height }}
    />
  )
}
