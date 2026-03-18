import { usePresentationStore } from './stores/presentation-store'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)

  return (
    <div className="h-screen w-screen bg-black p-[1px] overflow-hidden relative">
      {/* Animated glow border */}
      <div className="glow-border" />
      {/* App content */}
      <div className="relative z-10 h-full w-full rounded-[8px] overflow-hidden">
        {presentation ? <AppShell /> : <HomeScreen />}
      </div>
    </div>
  )
}
