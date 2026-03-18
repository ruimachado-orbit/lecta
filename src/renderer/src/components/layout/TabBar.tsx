import { useTabsStore } from '../../stores/tabs-store'
import { usePresentationStore } from '../../stores/presentation-store'

export function TabBar(): JSX.Element {
  const { tabs, activeTabId, switchTab, closeTab, openInNewTab } = useTabsStore()
  const { openFolder } = usePresentationStore()

  if (tabs.length <= 1) return <></>

  const handleOpenNew = async () => {
    const folderPath = await window.electronAPI.openFolder()
    if (folderPath) {
      await openInNewTab(folderPath)
    }
  }

  return (
    <div className="h-8 bg-gray-900 border-b border-gray-800 flex items-center px-20 overflow-x-auto"
         style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`group flex items-center gap-1.5 px-3 h-full text-[11px] cursor-pointer border-r border-gray-800
                        transition-colors max-w-[180px] ${
              isActive
                ? 'bg-gray-950 text-gray-200 border-b-2 border-b-white'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            }`}
          >
            <span className="truncate flex-1">{tab.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
              className="hidden group-hover:flex w-4 h-4 items-center justify-center rounded
                         hover:bg-gray-700 text-gray-500 hover:text-gray-200 transition-colors flex-shrink-0"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })}

      {/* New tab button */}
      <button
        onClick={handleOpenNew}
        className="h-full px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors flex items-center"
        title="Open another presentation"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </div>
  )
}
