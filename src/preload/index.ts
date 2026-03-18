import { contextBridge, ipcRenderer } from 'electron'
import type { ExecutionResult } from '../../packages/shared/src/types/execution'
import type { Presentation } from '../../packages/shared/src/types/presentation'

const api = {
  // File system
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:open-folder'),
  loadPresentation: (folderPath: string): Promise<Presentation> =>
    ipcRenderer.invoke('fs:load-presentation', folderPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  getRecentDecks: (): Promise<string[]> =>
    ipcRenderer.invoke('fs:get-recent-decks'),

  // Code execution
  executeNative: (
    command: string,
    args: string[],
    cwd: string
  ): Promise<ExecutionResult> =>
    ipcRenderer.invoke('exec:native', command, args, cwd),
  cancelExecution: (): Promise<void> =>
    ipcRenderer.invoke('exec:cancel'),

  // AI
  generateNotes: (
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number
  ): Promise<string> =>
    ipcRenderer.invoke('ai:generate-notes', slideContent, codeContent, deckTitle, slideIndex),
  streamNotes: (
    slideContent: string,
    codeContent: string | null,
    deckTitle: string,
    slideIndex: number,
    callback: (chunk: string) => void
  ): void => {
    const channel = `ai:notes-stream-${Date.now()}`
    ipcRenderer.on(channel, (_event, chunk: string) => callback(chunk))
    ipcRenderer.invoke('ai:stream-notes', slideContent, codeContent, deckTitle, slideIndex, channel)
  },

  // File watcher
  onFileChanged: (callback: (filePath: string, content: string) => void): void => {
    ipcRenderer.on('fs:file-changed', (_event, filePath: string, content: string) => {
      callback(filePath, content)
    })
  },

  // Native execution streaming
  onExecutionOutput: (callback: (data: string) => void): void => {
    ipcRenderer.on('exec:output', (_event, data: string) => callback(data))
  },
  onExecutionError: (callback: (data: string) => void): void => {
    ipcRenderer.on('exec:error', (_event, data: string) => callback(data))
  },
  onExecutionDone: (callback: (result: ExecutionResult) => void): void => {
    ipcRenderer.on('exec:done', (_event, result: ExecutionResult) => callback(result))
  },

  // Artifacts
  openInSystemApp: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('artifacts:open-system', filePath),
  readArtifactAsBuffer: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('artifacts:read-buffer', filePath),

  // Presenter window
  openPresenterWindow: (): Promise<void> =>
    ipcRenderer.invoke('presenter:open'),
  syncPresenterSlide: (slideIndex: number): void => {
    ipcRenderer.send('presenter:sync-slide', slideIndex)
  },

  // Settings
  getAppSettings: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('settings:get'),
  setAppSettings: (settings: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('settings:set', settings),

  // Remove listeners
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
