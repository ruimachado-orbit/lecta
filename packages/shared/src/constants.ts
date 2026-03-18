// IPC Channel names
export const IPC = {
  // File system
  OPEN_FOLDER: 'fs:open-folder',
  LOAD_PRESENTATION: 'fs:load-presentation',
  READ_FILE: 'fs:read-file',
  GET_RECENT_DECKS: 'fs:get-recent-decks',
  FILE_CHANGED: 'fs:file-changed',

  // Execution
  EXEC_NATIVE: 'exec:native',
  EXEC_CANCEL: 'exec:cancel',
  EXEC_OUTPUT: 'exec:output',
  EXEC_ERROR: 'exec:error',
  EXEC_DONE: 'exec:done',

  // AI
  GENERATE_NOTES: 'ai:generate-notes',
  STREAM_NOTES: 'ai:stream-notes',

  // Artifacts
  OPEN_SYSTEM: 'artifacts:open-system',
  READ_BUFFER: 'artifacts:read-buffer',

  // Presenter
  OPEN_PRESENTER: 'presenter:open',
  SYNC_SLIDE: 'presenter:sync-slide',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set'
} as const

export const EXECUTION_TIMEOUT_MS = 30_000

export const SUPPORTED_ARTIFACT_TYPES = {
  pdf: ['.pdf'],
  excel: ['.xlsx', '.xls', '.csv'],
  image: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
  document: ['.doc', '.docx', '.txt', '.md']
} as const

export const DEFAULT_AI_MODEL = 'claude-sonnet-4-20250514'

export const APP_CONFIG_DIR = '.lecta'
export const DECK_CONFIG_FILE = 'lecta.yaml'
