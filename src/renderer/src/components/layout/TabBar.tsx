import { useTabsStore } from '../../stores/tabs-store'
import { usePresentationStore } from '../../stores/presentation-store'

export function TabBar(): JSX.Element {
  const { tabs, activeTabId, switchTab, closeTab, newHomeTab, goHome } = useTabsStore()
  const hasPresentation = usePresentationStore((s) => !!s.presentation)

  return (
    <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-20 overflow-x-auto"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Home button — visible when a presentation is open */}
      {hasPresentation && (
        <button
          onClick={goHome}
          className="h-full px-2.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-1 border-r border-gray-800"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Back to Home"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
        </button>
      )}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        const isHome = tab.type === 'home'
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className={`group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer border-r border-gray-800
                        transition-colors max-w-[180px] ${
              isActive
                ? 'bg-gray-950 text-gray-200 border-b-2 border-b-white'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            }`}
          >
            {isHome && (
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            )}
            <span className="truncate flex-1">{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="hidden group-hover:flex w-4 h-4 items-center justify-center rounded
                           hover:bg-gray-700 text-gray-500 hover:text-gray-200 transition-colors flex-shrink-0"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      {/* New tab button */}
      <button
        onClick={newHomeTab}
        className="h-full px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title="New tab"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  )
}
