import { useState } from 'react'
import { usePresentationStore } from '../../stores/presentation-store'
import { getAllThemes } from '../../themes/theme-registry'
import type { PresentationTheme } from '../../themes/types'

/** Mini slide preview for theme card */
function ThemePreview({ theme }: { theme: PresentationTheme }) {
  const { bg, text, accent, muted } = theme.previewColors
  return (
    <div
      className="w-full aspect-video rounded-md overflow-hidden relative"
      style={{ background: bg }}
    >
      {/* Simulated slide content */}
      <div className="absolute inset-0 p-3 flex flex-col">
        <div
          className="font-bold text-[8px] leading-tight mb-1"
          style={{ color: text, fontFamily: theme.fonts.heading.family }}
        >
          Presentation Title
        </div>
        <div className="flex-1 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
            <div className="h-[3px] rounded-full" style={{ background: muted, width: '60%', opacity: 0.4 }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
            <div className="h-[3px] rounded-full" style={{ background: muted, width: '45%', opacity: 0.4 }} />
          </div>
          <div className="flex items-center gap-1">
            <div className="w-1 h-1 rounded-full" style={{ background: accent }} />
            <div className="h-[3px] rounded-full" style={{ background: muted, width: '55%', opacity: 0.4 }} />
          </div>
        </div>
        {/* Accent bar at bottom */}
        <div className="h-[2px] rounded-full mt-auto" style={{ background: accent, width: '40%' }} />
      </div>
    </div>
  )
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const { presentation, setTheme } = usePresentationStore()
  const themes = getAllThemes()
  const currentThemeId = presentation?.theme || 'dark'
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full right-0 mt-2 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 w-[340px]">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-2 px-1">
          Slide Theme
        </div>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((theme) => {
            const isActive = theme.id === currentThemeId
            const isHovered = theme.id === hoveredTheme
            return (
              <button
                key={theme.id}
                className={`rounded-lg p-1.5 transition-all text-left ${
                  isActive
                    ? 'ring-2 ring-white bg-gray-800'
                    : isHovered
                    ? 'bg-gray-800/50'
                    : 'hover:bg-gray-800/30'
                }`}
                onClick={() => { setTheme(theme.id); onClose() }}
                onMouseEnter={() => setHoveredTheme(theme.id)}
                onMouseLeave={() => setHoveredTheme(null)}
              >
                <ThemePreview theme={theme} />
                <div className="mt-1 px-0.5">
                  <div className="text-[11px] font-medium text-gray-200 flex items-center gap-1">
                    {theme.name}
                    {isActive && (
                      <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="text-[9px] text-gray-500 leading-tight">{theme.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
