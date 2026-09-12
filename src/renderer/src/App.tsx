import { useEffect } from 'react'
import { usePresentationStore } from './stores/presentation-store'
import { useNotebookStore } from './stores/notebook-store'
import { useUIStore, COLOR_PALETTES } from './stores/ui-store'
import { useChatStore } from './stores/chat-store'
import { installAgentCodeRunHandler } from './components/chat/code-run-bridge'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'
import { AudienceView } from './components/presenter/AudienceView'
import { NotebookShell } from './components/notebook/NotebookShell'
import { ChatView } from './components/chat/ChatView'
import { ExportRoute } from './export/ExportRoute'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)
  const notebook = useNotebookStore((s) => s.notebook)
  const showFullChat = useChatStore((s) => s.showFullChat)
  const { setTheme, setPalette, setFontSize, checkAiEnabled } = useUIStore()

  // Answer the agent's run_code tool: run the slide's code and report back.
  useEffect(() => {
    installAgentCodeRunHandler()
  }, [])

  // Titlebar gutter: only macOS draws window controls over the page content.
  // `platform` comes from the preload bridge when it exposes it; otherwise sniff the UA.
  useEffect(() => {
    const bridge = window.electronAPI as unknown as { platform?: string }
    const platform = bridge?.platform ?? (navigator.platform || navigator.userAgent || '')
    const isMac = /darwin|mac/i.test(platform)
    document.documentElement.style.setProperty('--titlebar-inset', isMac ? '80px' : '12px')
  }, [])

  // Load persisted settings on app start
  useEffect(() => {
    checkAiEnabled()
    window.electronAPI.getAppSettings().then((settings: Record<string, any>) => {
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
      if (typeof settings.aiModel === 'string' && settings.aiModel) {
        useUIStore.getState().setAiModel(settings.aiModel)
      }
    })
  }, [])

  // Export window — hidden 1280x720 renderer that paints every slide for PDF/HTML export
  if (window.location.hash.startsWith('#/export')) {
    return <ExportRoute />
  }

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
    <div className="h-screen w-screen overflow-hidden relative bg-gray-950 text-white">
      <HomeScreen />
    </div>
  )
}
