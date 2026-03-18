import { useEffect, useCallback, useState, useRef } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'

interface DrawingOverlayProps {
  slideIndex: number
  active: boolean
  width: number
  height: number
}

// Shared ref so the toolbar can access the Excalidraw API
let sharedApiRef: any = null
export function getExcalidrawApi() { return sharedApiRef }

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

  // Clear shared ref when deactivated
  useEffect(() => {
    if (!active) { sharedApiRef = null }
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
      <div className="absolute inset-0 z-20 excalidraw-minimal" style={{ width, height }}>
        <Excalidraw
          excalidrawAPI={(api: any) => { apiRef.current = api; sharedApiRef = api }}
          initialData={{
            elements: getElements(),
            appState: {
              viewBackgroundColor: 'transparent',
              theme: 'dark',
              showWelcomeScreen: false,
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
              clearCanvas: false,
            },
            tools: { image: false },
          }}
        />
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

/** Minimal vertical toolbar for drawing mode — rendered outside the slide canvas */
export function DrawingToolbar(): JSX.Element {
  const [activeTool, setActiveTool] = useState('freedraw')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [strokeColor, setStrokeColor] = useState('#ffffff')

  const tools: { id: string; label: string; icon: JSX.Element }[] = [
    { id: 'selection', label: 'Select', icon: <CursorIcon /> },
    { id: 'freedraw', label: 'Pen', icon: <PenIcon /> },
    { id: 'line', label: 'Line', icon: <LineIcon /> },
    { id: 'arrow', label: 'Arrow', icon: <ArrowIcon /> },
    { id: 'rectangle', label: 'Rectangle', icon: <RectIcon /> },
    { id: 'ellipse', label: 'Circle', icon: <CircleIcon /> },
    { id: 'text', label: 'Text', icon: <TextIcon /> },
    { id: 'eraser', label: 'Eraser', icon: <EraserIcon /> },
  ]

  const colors = ['#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7']

  const widths = [1, 2, 4]

  const selectTool = (id: string) => {
    setActiveTool(id)
    const api = getExcalidrawApi()
    if (api) {
      api.setActiveTool({ type: id })
    }
  }

  const selectColor = (color: string) => {
    setStrokeColor(color)
    const api = getExcalidrawApi()
    if (api) {
      api.updateScene({
        appState: { currentItemStrokeColor: color }
      })
    }
  }

  const selectWidth = (w: number) => {
    setStrokeWidth(w)
    const api = getExcalidrawApi()
    if (api) {
      api.updateScene({
        appState: { currentItemStrokeWidth: w }
      })
    }
  }

  const clearAll = () => {
    const api = getExcalidrawApi()
    if (api) {
      api.resetScene()
    }
  }

  return (
    <div className="flex flex-col items-center py-2 gap-0.5 w-8 flex-shrink-0 bg-gray-900 border-r border-gray-800">
      {/* Tools */}
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => selectTool(t.id)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            activeTool === t.id ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          }`}
          title={t.label}
        >
          {t.icon}
        </button>
      ))}

      {/* Separator */}
      <div className="w-4 h-px bg-gray-700 my-1" />

      {/* Stroke width */}
      {widths.map((w) => (
        <button
          key={w}
          onClick={() => selectWidth(w)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            strokeWidth === w ? 'bg-white/20' : 'hover:bg-gray-800'
          }`}
          title={`Width ${w}`}
        >
          <div className="rounded-full bg-gray-300" style={{ width: w + 2, height: w + 2 }} />
        </button>
      ))}

      {/* Separator */}
      <div className="w-4 h-px bg-gray-700 my-1" />

      {/* Colors */}
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => selectColor(c)}
          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
            strokeColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900' : 'hover:bg-gray-800'
          }`}
          title={c}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Clear */}
      <button
        onClick={clearAll}
        className="w-6 h-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
        title="Clear all"
      >
        <TrashIcon />
      </button>
    </div>
  )
}

/* ── Minimal SVG icons (3.5×3.5) ── */
function CursorIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243-1.59-1.59" /></svg>
}
function PenIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
}
function LineIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><line x1="5" y1="19" x2="19" y2="5" strokeLinecap="round" /></svg>
}
function ArrowIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
}
function RectIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><rect x="4" y="4" width="16" height="16" rx="1" /></svg>
}
function CircleIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><circle cx="12" cy="12" r="9" /></svg>
}
function TextIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12M12 4v16m-4 0h8" /></svg>
}
function EraserIcon() {
  return <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15.228 7.8-7.2 7.2a2 2 0 0 0 0 2.828l1.172 1.172h5.656l4.372-4.372a2 2 0 0 0 0-2.828L15.228 7.8Z" /><path strokeLinecap="round" d="M20 20H9.2" /></svg>
}
function TrashIcon() {
  return <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
}
