import { usePresentationStore } from './stores/presentation-store'
import { AppShell } from './components/layout/AppShell'
import { HomeScreen } from './components/layout/HomeScreen'

export default function App(): JSX.Element {
  const presentation = usePresentationStore((s) => s.presentation)

  if (!presentation) {
    return <HomeScreen />
  }

  return <AppShell />
}
