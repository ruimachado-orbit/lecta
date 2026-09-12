import { useEffect } from 'react'
import { usePresentationStore } from '../stores/presentation-store'

export function useFileWatcher(): void {
  const handleFileChanged = usePresentationStore((s) => s.handleFileChanged)

  useEffect(() => {
    window.electronAPI.onFileChanged((filePath: string, content: string, relativePath?: string) => {
      handleFileChanged(filePath, content, relativePath)
    })

    return () => {
      window.electronAPI.removeAllListeners('fs:file-changed')
    }
  }, [handleFileChanged])
}
