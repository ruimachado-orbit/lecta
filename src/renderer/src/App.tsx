import { useEffect } from 'react'
import { usePresentationStore } from './stores/presentation-store'
import { useUIStore, COLOR_PALETTES } from './stores/ui-store'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)
  const { setTheme, setPalette, setFontSize } = useUIStore()

  // Load persisted settings on app start
  useEffect(() => {
    window.electronAPI.getAppSettings().then((settings) => {
      if (settings.theme === 'light' || settings.theme === 'dark') {
        setTheme(settings.theme)
      }
      if (typeof settings.fontSize === 'number') {
        setFontSize(settings.fontSize)
      }
      if (typeof settings.palette === 'string') {
        const found = COLOR_PALETTES.find((p) => p.name === settings.palette)
        if (found) setPalette(found)
      }
    })
  }, [])

  if (presentation) {
    return <AppShell />
  }

  return (
    <div className="h-screen w-screen bg-black p-[1px] overflow-hidden relative">
      <div className="glow-border" />
      <div className="relative z-10 h-full w-full rounded-[8px] overflow-hidden">
        <HomeScreen />
      </div>
    </div>
  )
}
