import { useEffect, useCallback, useState, lazy, Suspense } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

const ExcalidrawWrapper = lazy(async () => {
  const mod = await import('@excalidraw/excalidraw')
  // Return a wrapper component that hides the welcome screen
  const Comp = (props: any) => {
    return (
      <mod.Excalidraw {...props}>
        {/* Pass empty children to replace the default welcome screen */}
      </mod.Excalidraw>
    )
  }
  return { default: Comp }
})

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
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const getElements = useCallback((): any[] => {
    if (!slide?.config.drawings) return []
    try { return JSON.parse(slide.config.drawings) } catch { return [] }
  }, [slide?.config.drawings])

  const handleChange = useCallback((elements: readonly any[]) => {
    if (!presentation) return
    const nonDeleted = elements.filter((e: any) => !e.isDeleted)
    const json = nonDeleted.length > 0 ? JSON.stringify(nonDeleted) : ''
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      window.electronAPI.saveDrawings(presentation.rootPath, slideIndex, json)
    }, 1000)
  }, [presentation, slideIndex])

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

  if (active) {
    return (
      <div className="absolute inset-0 z-20" style={{ width, height }}>
        <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading drawing tools...</div>}>
          <ExcalidrawWrapper
            initialData={{
              elements: getElements(),
              appState: {
                viewBackgroundColor: 'transparent',
                theme: 'dark' as const,
                showWelcomeScreen: false,
                currentItemStrokeColor: '#ffffff',
                currentItemBackgroundColor: 'transparent',
                currentItemFillStyle: 'solid',
                currentItemStrokeWidth: 2,
                currentItemRoughness: 0,
              } as any
            }}
            onChange={handleChange as any}
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                toggleTheme: false,
                clearCanvas: true
              } as any,
              tools: { image: false } as any,
              welcomeScreen: false
            }}
          />
        </Suspense>
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
