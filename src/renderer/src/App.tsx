import { useEffect } from 'react'
import { usePresentationStore } from './stores/presentation-store'
import { useNotebookStore } from './stores/notebook-store'
import { useUIStore, COLOR_PALETTES } from './stores/ui-store'
import { useChatStore } from './stores/chat-store'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'
import { AudienceView } from './components/presenter/AudienceView'
import { NotebookShell } from './components/notebook/NotebookShell'
import { ChatView } from './components/chat/ChatView'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)
  const notebook = useNotebookStore((s) => s.notebook)
  const showFullChat = useChatStore((s) => s.showFullChat)
  const { setTheme, setPalette, setFontSize, checkAiEnabled } = useUIStore()

  // Load persisted settings on app start
  useEffect(() => {
    checkAiEnabled()
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

  // Audience window — separate fullscreen slide display, always dark (no chat)
  if (window.location.hash === '#/audience') {
    document.documentElement.setAttribute('data-theme', 'dark')
    document.body.style.background = '#000'
    return <AudienceView />
  }

  // Full-screen chat replaces HomeScreen
  if (!presentation && !notebook && showFullChat) {
    return <ChatView />
  }

  if (notebook) {
    return <NotebookShell />
  }

  if (presentation) {
    return <AppShell />
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ background: '#f5f1eb', color: '#1a1a1a' }}>
      <HomeScreen />
    </div>
  )
}
