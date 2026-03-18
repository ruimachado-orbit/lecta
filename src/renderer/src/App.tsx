import { usePresentationStore } from './stores/presentation-store'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)

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
