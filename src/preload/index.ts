import { contextBridge, ipcRenderer } from 'electron'
import type { ExecutionResult } from '../../packages/shared/src/types/execution'
import type { Presentation, LoadedPresentation, SupportedLanguage } from '../../packages/shared/src/types/presentation'

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
  createPresentation: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:create-presentation', name),
  createLectaFile: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:create-lecta-file', name),
  saveLecta: (rootPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:save-lecta', rootPath),
  addSlide: (rootPath: string, slideId: string, afterIndex: number): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-slide', rootPath, slideId, afterIndex),
  addCodeToSlide: (rootPath: string, slideIndex: number, language: SupportedLanguage): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-code-to-slide', rootPath, slideIndex, language),
  addArtifact: (rootPath: string, slideIndex: number): Promise<LoadedPresentation | null> =>
    ipcRenderer.invoke('fs:add-artifact', rootPath, slideIndex),
  addBulkSlides: (
    rootPath: string, slides: { id: string; markdown: string }[], afterIndex: number
  ): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-bulk-slides', rootPath, slides, afterIndex),
  deleteSlide: (rootPath: string, slideIndex: number): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:delete-slide', rootPath, slideIndex),
  renameSlide: (rootPath: string, slideIndex: number, newId: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:rename-slide', rootPath, slideIndex, newId),
  reorderSlide: (rootPath: string, fromIndex: number, toIndex: number): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:reorder-slide', rootPath, fromIndex, toIndex),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:write-file', filePath, content),
  saveNotes: (rootPath: string, slideIndex: number, content: string): Promise<string> =>
    ipcRenderer.invoke('fs:save-notes', rootPath, slideIndex, content),
  uploadImage: (rootPath: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:upload-image', rootPath),
  addVideo: (rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-video', rootPath, slideIndex, url, label),
  addWebApp: (rootPath: string, slideIndex: number, url: string, label?: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-webapp', rootPath, slideIndex, url, label),

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

  generateSlideContent: (prompt: string, deckTitle: string, existingContent: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-slide-content', prompt, deckTitle, existingContent),
  generateChart: (prompt: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-chart', prompt, deckTitle),
  beautifySlide: (slideContent: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:beautify-slide', slideContent, deckTitle),
  generateBulkSlides: (
    prompt: string, deckTitle: string, existingSlides: string[], count: number, artifactContext?: string
  ): Promise<{ id: string; markdown: string }[]> =>
    ipcRenderer.invoke('ai:generate-bulk-slides', prompt, deckTitle, existingSlides, count, artifactContext),
  improveSlide: (
    slideContent: string, deckTitle: string, userPrompt: string, artifactContext?: string
  ): Promise<string> =>
    ipcRenderer.invoke('ai:improve-slide', slideContent, deckTitle, userPrompt, artifactContext),
  streamArticle: (
    deckTitle: string,
    author: string,
    slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
    rules: string,
    callback: (chunk: string) => void
  ): void => {
    const channel = `ai:article-stream-${Date.now()}`
    ipcRenderer.on(channel, (_event, chunk: string) => callback(chunk))
    ipcRenderer.invoke('ai:stream-article', deckTitle, author, slidesContent, rules, channel)
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
