import { useState, useRef, useCallback } from 'react'

/**
 * Spotlight overlay — wraps children with a dark overlay + transparent circle
 * that follows the mouse cursor. Toggle on/off with the returned controls.
 */

interface SpotlightProps {
  enabled: boolean
  children: React.ReactNode
}

export function SpotlightContainer({ enabled, children }: SpotlightProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
  }, [enabled])

  const radius = containerRef.current
    ? Math.min(containerRef.current.clientWidth, containerRef.current.clientHeight) * 0.25
    : 100

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseEnter={() => { if (enabled) setMousePos({ x: 0, y: 0 }) }}
      onMouseLeave={() => setMousePos(null)}
    >
      {children}
      {enabled && mousePos && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundColor: 'rgba(0,0,0,0.6)',
            mask: `radial-gradient(circle ${radius}px at ${mousePos.x}px ${mousePos.y}px, transparent 80%, black 100%)`,
            WebkitMask: `radial-gradient(circle ${radius}px at ${mousePos.x}px ${mousePos.y}px, transparent 80%, black 100%)`
          }}
        />
      )}
    </div>
  )
}

export function SpotlightToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button
      onClick={onToggle}
      className={`p-1 rounded transition-colors ${
        enabled ? 'bg-white text-black' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
      title={enabled ? 'Disable spotlight' : 'Enable spotlight'}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    </button>
  )
}
