import { contextBridge, ipcRenderer } from 'electron'
import type { ExecutionResult } from '../../packages/shared/src/types/execution'
import type { Presentation, LoadedPresentation, SupportedLanguage } from '../../packages/shared/src/types/presentation'
import type { PresentationSnapshot, ChatStreamEvent } from '../../packages/shared/src/types/chat'

const api = {
  // File system
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:open-folder'),
  loadPresentation: (folderPath: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:load-presentation', folderPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  getRecentDecks: (): Promise<string[]> =>
    ipcRenderer.invoke('fs:get-recent-decks'),
  removeRecentDeck: (path: string): Promise<void> =>
    ipcRenderer.invoke('fs:remove-recent-deck', path),
  createPresentation: (name: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:create-presentation', name),
  createLectaFile: (name: string, docType?: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:create-lecta-file', name, docType),
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
  saveDrawings: (rootPath: string, slideIndex: number, drawingsJson: string): Promise<void> =>
    ipcRenderer.invoke('fs:save-drawings', rootPath, slideIndex, drawingsJson),
  saveGroups: (rootPath: string, groups: { id: string; name: string; slideIds: string[]; color?: string }[]): Promise<void> =>
    ipcRenderer.invoke('fs:save-groups', rootPath, groups),
  setSlideTransition: (rootPath: string, slideIndex: number, transition: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:set-transition', rootPath, slideIndex, transition),
  setSlideLayout: (rootPath: string, slideIndex: number, layout: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:set-layout', rootPath, slideIndex, layout),
  setTheme: (rootPath: string, themeId: string): Promise<void> =>
    ipcRenderer.invoke('fs:set-theme', rootPath, themeId),
  toggleSkipSlide: (rootPath: string, slideIndex: number): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:toggle-skip', rootPath, slideIndex),
  removeAttachment: (
    rootPath: string, slideIndex: number, type: 'code' | 'video' | 'webapp' | 'prompt' | 'artifact', artifactIndex?: number
  ): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:remove-attachment', rootPath, slideIndex, type, artifactIndex),
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
  addPrompt: (rootPath: string, slideIndex: number, prompt: string, label?: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-prompt', rootPath, slideIndex, prompt, label),
  updatePrompt: (rootPath: string, slideIndex: number, promptIndex: number, promptText: string, response?: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:update-prompt', rootPath, slideIndex, promptIndex, promptText, response),

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

  generateCode: (prompt: string, language: string, existingCode: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-code', prompt, language, existingCode, deckTitle),
  generateSlideContent: (prompt: string, deckTitle: string, existingContent: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-slide-content', prompt, deckTitle, existingContent),
  generateChart: (prompt: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-chart', prompt, deckTitle),
  beautifySlide: (slideContent: string, deckTitle: string, slideLayout?: string): Promise<string> =>
    ipcRenderer.invoke('ai:beautify-slide', slideContent, deckTitle, slideLayout),
  generateBulkSlides: (
    prompt: string, deckTitle: string, existingSlides: string[], count: number, artifactContext?: string
  ): Promise<{ id: string; markdown: string }[]> =>
    ipcRenderer.invoke('ai:generate-bulk-slides', prompt, deckTitle, existingSlides, count, artifactContext),
  improveSlide: (
    slideContent: string, deckTitle: string, userPrompt: string, artifactContext?: string
  ): Promise<string> =>
    ipcRenderer.invoke('ai:improve-slide', slideContent, deckTitle, userPrompt, artifactContext),
  hasApiKey: (): Promise<boolean> =>
    ipcRenderer.invoke('ai:has-api-key'),
  getProviderStatuses: (): Promise<{ id: string; hasKey: boolean; status?: 'connected' | 'invalid' | 'not_configured' }[]> =>
    ipcRenderer.invoke('ai:get-provider-statuses'),
  setAIModel: (model: string): Promise<void> =>
    ipcRenderer.invoke('ai:set-model', model),
  generateInlineText: (prompt: string, slideContent: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-inline-text', prompt, slideContent, deckTitle),
  runPrompt: (
    prompt: string,
    slideContent: string,
    deckTitle: string,
    callback: (chunk: string) => void
  ): void => {
    const channel = `ai:prompt-stream-${Date.now()}`
    ipcRenderer.on(channel, (_event, chunk: string) => callback(chunk))
    ipcRenderer.invoke('ai:run-prompt', prompt, slideContent, deckTitle, channel)
  },
  generateFullPresentation: (
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    onProgress: (data: { status: string; slideIndex: number; total: number }) => void
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> => {
    const channel = `ai:gen-pres-progress-${Date.now()}`
    ipcRenderer.on(channel, (_event, data) => onProgress(data))
    return ipcRenderer.invoke('ai:generate-full-presentation', prompt, title, sourceContent, slideCount, channel)
  },
  readSourceFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('ai:read-source-file', filePath),
  selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('fs:select-file', filters),
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

  // AI Image Generation (multi-provider: OpenAI DALL-E, Google Gemini)
  generateImage: (
    rootPath: string,
    prompt: string,
    aspectRatio?: string,
    imageSize?: string,
    provider?: string
  ): Promise<string> =>
    ipcRenderer.invoke('gemini:generate-image', rootPath, prompt, aspectRatio, imageSize, provider),
  editImage: (
    rootPath: string,
    imagePath: string,
    prompt: string,
    aspectRatio?: string,
    imageSize?: string,
    provider?: string
  ): Promise<string> =>
    ipcRenderer.invoke('gemini:edit-image', rootPath, imagePath, prompt, aspectRatio, imageSize, provider),
  hasGeminiApiKey: (provider?: string): Promise<boolean> =>
    ipcRenderer.invoke('gemini:has-api-key', provider),
  getImageProviders: (): Promise<{ id: string; name: string; hasKey: boolean }[]> =>
    ipcRenderer.invoke('gemini:get-providers'),
  getImageProvider: (): Promise<string> =>
    ipcRenderer.invoke('gemini:get-provider'),
  setImageProvider: (provider: string): Promise<void> =>
    ipcRenderer.invoke('gemini:set-provider', provider),
  listImages: (rootPath: string): Promise<{ relativePath: string; timestamp: number; size: number }[]> =>
    ipcRenderer.invoke('gemini:list-images', rootPath),

  // Export
  exportPdf: (rootPath: string, slideHtmls: string[], title: string): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', rootPath, slideHtmls, title),

  exportHtml: (slideMarkdowns: string[], title: string, theme: string): Promise<string | null> =>
    ipcRenderer.invoke('export:html', slideMarkdowns, title, theme),

  // Presenter sync listener (for audience/presenter windows)
  onPresenterSync: (callback: (slideIndex: number) => void): void => {
    ipcRenderer.on('presenter:sync-slide', (_event, slideIndex: number) => callback(slideIndex))
  },
  onPresenterLoadPath: (callback: (rootPath: string) => void): void => {
    ipcRenderer.on('presenter:load-path', (_event, rootPath: string) => callback(rootPath))
  },
  sendPresenterPath: (rootPath: string): void => {
    ipcRenderer.send('presenter:send-path', rootPath)
  },
  syncPresenterArtifact: (artifact: string | null): void => {
    ipcRenderer.send('presenter:sync-artifact', artifact)
  },
  onPresenterArtifactSync: (callback: (artifact: string | null) => void): void => {
    ipcRenderer.on('presenter:sync-artifact', (_event, artifact: string | null) => callback(artifact))
  },
  syncPresenterMouse: (pos: { x: number; y: number; area: string } | null): void => {
    ipcRenderer.send('presenter:sync-mouse', pos)
  },
  onPresenterMouseSync: (callback: (pos: { x: number; y: number; area: string } | null) => void): void => {
    ipcRenderer.on('presenter:sync-mouse', (_event, pos: { x: number; y: number; area: string } | null) => callback(pos))
  },
  onPresenterAudienceClosed: (callback: () => void): void => {
    ipcRenderer.on('presenter:audience-closed', () => callback())
  },
  syncPresenterExecution: (output: string): void => {
    ipcRenderer.send('presenter:sync-execution', output)
  },
  onPresenterExecutionSync: (callback: (output: string) => void): void => {
    ipcRenderer.on('presenter:sync-execution', (_event, output: string) => callback(output))
  },
  syncPresenterCode: (code: string): void => {
    ipcRenderer.send('presenter:sync-code', code)
  },
  onPresenterCodeSync: (callback: (code: string) => void): void => {
    ipcRenderer.on('presenter:sync-code', (_event, code: string) => callback(code))
  },
  onPresenterArtifactFrame: (callback: (base64: string) => void): void => {
    ipcRenderer.on('presenter:artifact-frame', (_event, base64: string) => callback(base64))
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
  openAudienceWindow: (): Promise<void> =>
    ipcRenderer.invoke('presenter:open-audience'),
  closeAudienceWindow: (): Promise<void> =>
    ipcRenderer.invoke('presenter:close-audience'),
  syncPresenterSlide: (slideIndex: number): void => {
    ipcRenderer.send('presenter:sync-slide', slideIndex)
  },

  // Settings
  getAppSettings: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('settings:get'),
  setAppSettings: (settings: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('settings:set', settings),

  // Notebook
  loadNotebook: (folderPath: string): Promise<any> =>
    ipcRenderer.invoke('nb:load', folderPath),
  addNote: (rootPath: string, noteId: string, afterIndex: number): Promise<any> =>
    ipcRenderer.invoke('nb:add-note', rootPath, noteId, afterIndex),
  addSubnote: (rootPath: string, parentId: string, noteId: string): Promise<any> =>
    ipcRenderer.invoke('nb:add-subnote', rootPath, parentId, noteId),
  deleteNote: (rootPath: string, noteId: string): Promise<any> =>
    ipcRenderer.invoke('nb:delete-note', rootPath, noteId),
  setNoteLayout: (rootPath: string, noteId: string, layout: string): Promise<any> =>
    ipcRenderer.invoke('nb:set-layout', rootPath, noteId, layout),
  renameNote: (rootPath: string, noteId: string, newId: string): Promise<any> =>
    ipcRenderer.invoke('nb:rename-note', rootPath, noteId, newId),
  addCodeToNote: (rootPath: string, noteId: string, language: string): Promise<any> =>
    ipcRenderer.invoke('nb:add-code', rootPath, noteId, language),
  addVideoToNote: (rootPath: string, noteId: string, url: string): Promise<any> =>
    ipcRenderer.invoke('nb:add-video', rootPath, noteId, url),
  addWebAppToNote: (rootPath: string, noteId: string, url: string): Promise<any> =>
    ipcRenderer.invoke('nb:add-webapp', rootPath, noteId, url),
  archiveNote: (rootPath: string, noteId: string): Promise<any> =>
    ipcRenderer.invoke('nb:archive-note', rootPath, noteId),
  unarchiveNote: (rootPath: string, noteId: string): Promise<any> =>
    ipcRenderer.invoke('nb:unarchive-note', rootPath, noteId),
  saveNoteContent: (rootPath: string, contentPath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('nb:save-content', rootPath, contentPath, content),

  // Import slides from another .lecta file
  importSlides: (): Promise<{ id: string; markdown: string; layout?: string }[] | null> =>
    ipcRenderer.invoke('fs:import-slides'),

  // Slide Library
  saveSlideToLibrary: (slide: {
    name: string; markdown: string; layout?: string; codeContent?: string; codeLanguage?: string; tags?: string[]
  }): Promise<any> =>
    ipcRenderer.invoke('library:save-slide', slide),
  listLibrarySlides: (): Promise<any[]> =>
    ipcRenderer.invoke('library:list-slides'),
  deleteLibrarySlide: (id: string): Promise<void> =>
    ipcRenderer.invoke('library:delete-slide', id),
  renameLibrarySlide: (id: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('library:rename-slide', id, newName),

  // Presentation Library
  getLibrary: (): Promise<{ folders: any[]; entries: any[] }> =>
    ipcRenderer.invoke('library:get'),
  createLibraryFolder: (name: string, parentId: string | null, color?: string): Promise<any> =>
    ipcRenderer.invoke('library:create-folder', name, parentId, color),
  renameLibraryFolder: (folderId: string, name: string): Promise<void> =>
    ipcRenderer.invoke('library:rename-folder', folderId, name),
  deleteLibraryFolder: (folderId: string): Promise<void> =>
    ipcRenderer.invoke('library:delete-folder', folderId),
  setLibraryFolderColor: (folderId: string, color: string): Promise<void> =>
    ipcRenderer.invoke('library:set-folder-color', folderId, color),
  moveLibraryEntry: (entryId: string, folderId: string | null): Promise<void> =>
    ipcRenderer.invoke('library:move-entry', entryId, folderId),
  setLibraryEntryTags: (entryId: string, tags: string[]): Promise<void> =>
    ipcRenderer.invoke('library:set-tags', entryId, tags),
  addLibraryEntryTag: (entryId: string, tag: string): Promise<void> =>
    ipcRenderer.invoke('library:add-tag', entryId, tag),
  removeLibraryEntryTag: (entryId: string, tag: string): Promise<void> =>
    ipcRenderer.invoke('library:remove-tag', entryId, tag),
  deleteLibraryEntry: (entryId: string, deleteFile: boolean): Promise<void> =>
    ipcRenderer.invoke('library:delete-entry', entryId, deleteFile),
  renameLibraryEntry: (entryId: string, title: string): Promise<void> =>
    ipcRenderer.invoke('library:rename-entry', entryId, title),
  getAllLibraryTags: (): Promise<string[]> =>
    ipcRenderer.invoke('library:get-all-tags'),
  importLectaFiles: (): Promise<number> =>
    ipcRenderer.invoke('library:import-lecta-files'),
  getTagColors: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('library:get-tag-colors'),
  setTagColor: (tag: string, color: string): Promise<void> =>
    ipcRenderer.invoke('library:set-tag-color', tag, color),
  deleteFolderWithEntries: (folderId: string, deleteEntries: boolean): Promise<void> =>
    ipcRenderer.invoke('library:delete-folder-with-entries', folderId, deleteEntries),

  // Remote control
  startRemote: (): Promise<string> =>
    ipcRenderer.invoke('remote:start'),
  stopRemote: (): Promise<void> =>
    ipcRenderer.invoke('remote:stop'),

  // Chat Agent
  chatSendMessage: (
    messages: unknown[],
    snapshot: PresentationSnapshot,
    actionMode: 'auto' | 'ask',
    onEvent: (event: ChatStreamEvent) => void
  ): Promise<unknown[]> => {
    const channel = `chat:stream-${Date.now()}`
    ipcRenderer.on(channel, (_event, data: ChatStreamEvent) => onEvent(data))
    return ipcRenderer.invoke('chat:send-message', messages, snapshot, actionMode, channel)
  },
  chatConfirmAction: (toolCallId: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:confirm-action', toolCallId, approved),

  // Remove listeners
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
