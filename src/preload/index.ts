import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ExecutionResult } from '../../packages/shared/src/types/execution'
import type { Presentation, LoadedPresentation, SupportedLanguage } from '../../packages/shared/src/types/presentation'
import type { PresentationSnapshot, ChatStreamEvent } from '../../packages/shared/src/types/chat'

/**
 * Response channels must be unique per call: `Date.now()` alone collides when
 * two streams start in the same millisecond, and the second listener then also
 * receives the first stream's chunks.
 */
let channelSeq = 0
function makeChannel(prefix: string): string {
  channelSeq += 1
  return `${prefix}${Date.now()}-${channelSeq}-${Math.random().toString(36).slice(2, 10)}`
}

/** Subscribe to a main-process channel and return an unsubscribe function. */
function subscribe(
  channel: string,
  handler: (...args: unknown[]) => void
): () => void {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]): void => handler(...args)
  ipcRenderer.on(channel, listener)
  return () => { ipcRenderer.removeListener(channel, listener) }
}

/**
 * Run a text stream: chunks are forwarded to `callback` until the terminal
 * `[DONE]` / `[ERROR]…` marker, at which point the listener is removed. The
 * listener is also removed if the invoke rejects, so a failed call cannot leak
 * a listener for a channel nobody will ever use again.
 */
function streamText(
  channelPrefix: string,
  callback: (chunk: string) => void,
  invoke: (channel: string) => Promise<void>
): Promise<void> {
  const channel = makeChannel(channelPrefix)
  let unsubscribed = false
  const unsubscribe = subscribe(channel, (chunk) => {
    const text = String(chunk)
    callback(text)
    if (text === '[DONE]' || text.startsWith('[ERROR]')) cleanup()
  })
  const cleanup = (): void => {
    if (unsubscribed) return
    unsubscribed = true
    unsubscribe()
  }

  return invoke(channel).then(
    (result) => {
      // The terminal marker is sent before the handler returns; give it one
      // task to be dispatched before dropping the listener.
      setTimeout(cleanup, 0)
      return result
    },
    (err) => {
      cleanup()
      throw err
    }
  )
}

/** Render options for the hidden export window (see src/renderer/src/export/ExportRoute.tsx). */
export interface ExportRenderOptions {
  theme?: string
  slides?: number
  mdxTrusted?: boolean
}

const api = {
  // File system
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:open-folder'),
  openLectaPath: (lectaFilePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:open-lecta-path', lectaFilePath),
  /** Materialize a single-file (`.md`) deck into a sibling folder and return that folder. */
  openSingleFile: (mdPath: string): Promise<string> =>
    ipcRenderer.invoke('fs:open-single-file', mdPath),
  /** Export an open deck back to one markdown file; returns the saved path, or null if cancelled. */
  exportSingleFile: (rootPath: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:export-single-file', rootPath),
  loadPresentation: (folderPath: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:load-presentation', folderPath),
  /** Write a lecta.yaml for a folder of loose slides so it opens as a deck; returns the folder. */
  materializeFolder: (folderPath: string): Promise<string> =>
    ipcRenderer.invoke('fs:materialize-folder', folderPath),
  closePresentation: (rootPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:close-presentation', rootPath),
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:read-file', filePath),
  /** Copy the bundled example deck into the user's Documents folder (once) and return its path. */
  openDemoDeck: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:open-demo-deck'),
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
  addSlide: (rootPath: string, slideId: string, afterIndex: number, format?: string): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:add-slide', rootPath, slideId, afterIndex, format),
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
  setSlideBackground: (
    rootPath: string,
    slideIndex: number,
    background: { color?: string; gradient?: string; image?: string; overlay?: number } | null
  ): Promise<LoadedPresentation> =>
    ipcRenderer.invoke('fs:set-slide-background', rootPath, slideIndex, background),
  setTheme: (rootPath: string, themeId: string): Promise<void> =>
    ipcRenderer.invoke('fs:set-theme', rootPath, themeId),
  updatePresenterNotes: (rootPath: string, notes: string): Promise<void> =>
    ipcRenderer.invoke('fs:update-presenter-notes', rootPath, notes),
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
  /** Copy an image dropped on / pasted into the slide canvas into `<deck>/images/`. */
  importDroppedImage: (rootPath: string, fileName: string, dataUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('fs:import-dropped-image', rootPath, fileName, dataUrl),
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
  ): Promise<void> =>
    streamText('ai:notes-stream-', callback, (channel) =>
      ipcRenderer.invoke('ai:stream-notes', slideContent, codeContent, deckTitle, slideIndex, channel)
    ),

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
  getProviderStatuses: (): Promise<{ id: string; hasKey: boolean; status?: 'connected' | 'invalid' | 'not_configured'; keySource?: 'env-file' | 'settings' | 'env-var' | 'codex' | null; authMode?: 'apiKey' | 'codex'; accountEmail?: string; accountPlan?: string }[]> =>
    ipcRenderer.invoke('ai:get-provider-statuses'),
  setAIModel: (model: string): Promise<void> =>
    ipcRenderer.invoke('ai:set-model', model),
  ollamaModels: (): Promise<{ id: string; name: string }[]> =>
    ipcRenderer.invoke('ai:ollama-models'),
  generateInlineText: (prompt: string, slideContent: string, deckTitle: string): Promise<string> =>
    ipcRenderer.invoke('ai:generate-inline-text', prompt, slideContent, deckTitle),
  runPrompt: (
    prompt: string,
    slideContent: string,
    deckTitle: string,
    callback: (chunk: string) => void
  ): Promise<void> =>
    streamText('ai:prompt-stream-', callback, (channel) =>
      ipcRenderer.invoke('ai:run-prompt', prompt, slideContent, deckTitle, channel)
    ),
  generateFullPresentation: (
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    onProgress: (data: { status: string; slideIndex: number; total: number }) => void,
    options?: {
      tone?: string; webSearch?: boolean
      verbosity?: string
      language?: string
      temperature?: number
      outline?: { id: string; title: string; layout: string; keyPoints: string[] }[] | null
    }
  ): Promise<{ slides: { id: string; markdown: string; layout: string }[]; title: string }> => {
    const channel = makeChannel('ai:gen-pres-progress-')
    const unsubscribe = subscribe(channel, (data) =>
      onProgress(data as { status: string; slideIndex: number; total: number })
    )
    return ipcRenderer
      .invoke('ai:generate-full-presentation', prompt, title, sourceContent, slideCount, options ?? {}, channel)
      .finally(unsubscribe)
  },
  generateOutline: (
    prompt: string,
    title: string,
    sourceContent: string | null,
    slideCount: number,
    options?: { tone?: string; verbosity?: string; language?: string; temperature?: number; webSearch?: boolean }
  ): Promise<{ id: string; title: string; layout: string; keyPoints: string[] }[]> =>
    ipcRenderer.invoke('ai:generate-outline', prompt, title, sourceContent, slideCount, options ?? {}),
  readSourceFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('ai:read-source-file', filePath),
  selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
    ipcRenderer.invoke('fs:select-file', filters),
  selectFiles: (filters?: { name: string; extensions: string[] }[]): Promise<string[]> =>
    ipcRenderer.invoke('fs:select-files', filters),
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('fs:select-folder'),
  readSourceFolder: (folderPath: string): Promise<string> =>
    ipcRenderer.invoke('ai:read-source-folder', folderPath),
  streamArticle: (
    deckTitle: string,
    author: string,
    slidesContent: { title: string; markdown: string; code: string | null; notes: string | null }[],
    rules: string,
    callback: (chunk: string) => void
  ): Promise<void> =>
    streamText('ai:article-stream-', callback, (channel) =>
      ipcRenderer.invoke('ai:stream-article', deckTitle, author, slidesContent, rules, channel)
    ),

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
  /**
   * PDF/HTML export render options. `options` used to carry pre-rendered slide HTML; main now
   * renders the deck through the app's own `#/export` route and ignores any legacy payload.
   */
  exportPdf: (rootPath: string, options: ExportRenderOptions | string[], title: string): Promise<string | null> =>
    ipcRenderer.invoke('export:pdf', rootPath, options, title),

  exportHtml: (
    rootPath: string,
    options: ExportRenderOptions | { content: string; isPreRendered: boolean }[] | string[],
    title: string,
    theme: string
  ): Promise<string | null> =>
    ipcRenderer.invoke('export:html', rootPath, options, title, theme),
  /** Export route → main: every slide has been painted and the page can be printed/captured. */
  exportRenderReady: (): void => {
    ipcRenderer.send('export:render-ready')
  },
  exportPptx: (deck: {
    title: string
    author?: string
    theme?: string
    rootPath: string
    slides: { id: string; layout?: string; markdownContent: string; codeContent?: string | null; codeLanguage?: string | null; codeFile?: string | null; notesContent?: string | null; isMdx?: boolean; skip?: boolean }[]
  }): Promise<{ path: string; slideCount: number; warnings: string[] } | null> =>
    ipcRenderer.invoke('export:pptx', deck),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:show-item-in-folder', filePath),
  platform: process.platform as string,

  // Full presenter state → main (main fans out to presenter + audience windows)
  syncPresenterState: (state: { slideIndex: number; subSlide: number; clickStep: number; mdxTrusted?: boolean }): void => {
    ipcRenderer.send('presenter:sync-state', state)
  },
  onPresenterState: (callback: (state: { slideIndex: number; subSlide: number; clickStep: number; mdxTrusted?: boolean }) => void): (() => void) =>
    subscribe('presenter:sync-state', (state) => callback(state as { slideIndex: number; subSlide: number; clickStep: number; mdxTrusted?: boolean })),
  // Handshake: audience announces it is ready; the presenting window is asked for authoritative state
  sendAudienceReady: (): void => {
    ipcRenderer.send('presenter:audience-ready')
  },
  onRequestPresenterState: (callback: () => void): (() => void) =>
    subscribe('presenter:request-state', () => callback()),

  // Presenter sync listeners (for audience/presenter windows).
  // Every `on*` helper returns an unsubscribe function — call it on unmount
  // instead of `removeAllListeners`, which also kills other components' listeners.
  onPresenterSync: (callback: (slideIndex: number) => void): (() => void) =>
    subscribe('presenter:sync-slide', (slideIndex) => callback(slideIndex as number)),
  onPresenterLoadPath: (callback: (rootPath: string) => void): (() => void) =>
    subscribe('presenter:load-path', (rootPath) => callback(rootPath as string)),
  sendPresenterPath: (rootPath: string): void => {
    ipcRenderer.send('presenter:send-path', rootPath)
  },
  syncPresenterArtifact: (artifact: string | null): void => {
    ipcRenderer.send('presenter:sync-artifact', artifact)
  },
  onPresenterArtifactSync: (callback: (artifact: string | null) => void): (() => void) =>
    subscribe('presenter:sync-artifact', (artifact) => callback(artifact as string | null)),
  syncPresenterMouse: (pos: { x: number; y: number; area: string } | null): void => {
    ipcRenderer.send('presenter:sync-mouse', pos)
  },
  onPresenterMouseSync: (
    callback: (pos: { x: number; y: number; area: string } | null) => void
  ): (() => void) =>
    subscribe('presenter:sync-mouse', (pos) =>
      callback(pos as { x: number; y: number; area: string } | null)
    ),
  onPresenterAudienceClosed: (callback: () => void): (() => void) =>
    subscribe('presenter:audience-closed', () => callback()),
  syncPresenterExecution: (output: string): void => {
    ipcRenderer.send('presenter:sync-execution', output)
  },
  onPresenterExecutionSync: (callback: (output: string) => void): (() => void) =>
    subscribe('presenter:sync-execution', (output) => callback(output as string)),
  syncPresenterCode: (code: string): void => {
    ipcRenderer.send('presenter:sync-code', code)
  },
  onPresenterCodeSync: (callback: (code: string) => void): (() => void) =>
    subscribe('presenter:sync-code', (code) => callback(code as string)),
  onPresenterArtifactFrame: (callback: (base64: string) => void): (() => void) =>
    subscribe('presenter:artifact-frame', (base64) => callback(base64 as string)),

  // File watcher
  onFileChanged: (callback: (filePath: string, content: string, relativePath?: string) => void): (() => void) =>
    subscribe('fs:file-changed', (filePath, content, relativePath) =>
      callback(filePath as string, content as string, relativePath as string | undefined)
    ),

  // Native execution streaming
  onExecutionOutput: (callback: (data: string) => void): (() => void) =>
    subscribe('exec:output', (data) => callback(data as string)),
  onExecutionError: (callback: (data: string) => void): (() => void) =>
    subscribe('exec:error', (data) => callback(data as string)),
  onExecutionDone: (callback: (result: ExecutionResult) => void): (() => void) =>
    subscribe('exec:done', (result) => callback(result as ExecutionResult)),

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

  // MCP Server
  mcpToggle: (enabled: boolean): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('mcp:toggle', enabled),
  mcpStatus: (): Promise<{ enabled: boolean; running: boolean; inClaudeDesktop: boolean }> =>
    ipcRenderer.invoke('mcp:status'),
  mcpAddToClaude: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('mcp:add-to-claude'),
  mcpRemoveFromClaude: (): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('mcp:remove-from-claude'),

  // External MCP servers — live data sources the chat agent can query.
  mcpListExternalServers: (): Promise<{ name: string; command: string; args?: string[] }[]> =>
    ipcRenderer.invoke('mcp:list-external-servers'),
  mcpAddExternalServer: (server: { name: string; command: string; args?: string[] }): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('mcp:add-external-server', server),
  mcpRemoveExternalServer: (name: string): Promise<{ success: boolean; message: string }> =>
    ipcRenderer.invoke('mcp:remove-external-server', name),
  mcpTestExternalServer: (server: { name: string; command: string; args?: string[] }): Promise<{ success: boolean; message: string; tools?: string[] }> =>
    ipcRenderer.invoke('mcp:test-external-server', server),

  // Local REST API (opt-in localhost generation API)
  localApiToggle: (enabled: boolean): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('local-api:toggle', enabled),
  localApiStatus: (): Promise<{ enabled: boolean; running: boolean; port: number; token: string }> =>
    ipcRenderer.invoke('local-api:status'),

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
  setDefaultLayout: (rootPath: string, layout: string): Promise<any> =>
    ipcRenderer.invoke('nb:set-default-layout', rootPath, layout),
  setKernel: (rootPath: string, kernel: string): Promise<any> =>
    ipcRenderer.invoke('nb:set-kernel', rootPath, kernel),
  reorderNote: (rootPath: string, fromIndex: number, toIndex: number): Promise<any> =>
    ipcRenderer.invoke('nb:reorder-note', rootPath, fromIndex, toIndex),
  updateCellOutputs: (rootPath: string, noteId: string, outputs: any[]): Promise<any> =>
    ipcRenderer.invoke('nb:update-outputs', rootPath, noteId, outputs),
  toggleCellType: (rootPath: string, noteId: string): Promise<any> =>
    ipcRenderer.invoke('nb:toggle-cell-type', rootPath, noteId),
  addCell: (rootPath: string, afterIndex: number, cellType: string): Promise<any> =>
    ipcRenderer.invoke('nb:add-cell', rootPath, afterIndex, cellType),

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
  librarySearch: (query: string): Promise<{ id: string; type: 'slide' | 'presentation'; title: string; snippet: string; tags: string[]; path?: string; score: number }[]> =>
    ipcRenderer.invoke('library:search', query),
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
    const channel = makeChannel('chat:stream-')
    let unsubscribed = false
    const cleanup = (): void => {
      if (unsubscribed) return
      unsubscribed = true
      unsubscribe()
    }
    const unsubscribe = subscribe(channel, (data) => {
      const evt = data as ChatStreamEvent
      onEvent(evt)
      // `done` is the terminal event of a chat turn.
      if (evt?.type === 'done') cleanup()
    })
    return ipcRenderer.invoke('chat:send-message', messages, snapshot, actionMode, channel).then(
      (result) => { setTimeout(cleanup, 0); return result },
      (err) => { cleanup(); throw err }
    )
  },
  cancelAI: (): Promise<void> =>
    ipcRenderer.invoke('ai:cancel'),
  chatConfirmAction: (toolCallId: string, approved: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:confirm-action', toolCallId, approved),

  // run_code agent tool: main asks the renderer to run the slide's code and
  // report the output back in the same turn.
  onChatRunCodeRequest: (
    callback: (requestId: string, slideIndex: number) => void
  ): (() => void) =>
    subscribe('chat:run-code-request', (payload) => {
      const { requestId, slideIndex } = payload as { requestId: string; slideIndex: number }
      callback(requestId, slideIndex)
    }),
  reportCodeRunResult: (requestId: string, result: string): void => {
    ipcRenderer.send('chat:report-code-run-result', requestId, result)
  },

  // Window management
  newWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:new'),

  // Remove listeners
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  }
}

export type ElectronAPI = typeof api

contextBridge.exposeInMainWorld('electronAPI', api)
