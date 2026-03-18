import { useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'

export function useFileWatcher(): void {
  const handleFileChanged = usePresentationStore((s) => s.handleFileChanged)

  useEffect(() => {
    window.electronAPI.onFileChanged((filePath, content) => {
      handleFileChanged(filePath, content)
    })

    return () => {
      window.electronAPI.removeAllListeners('fs:file-changed')
    }
  }, [handleFileChanged])
}
