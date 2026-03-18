import { registerFileSystemHandlers } from './file-system'
import { registerExecutionHandlers } from './execution'
import { registerAiHandlers } from './ai'
import { registerArtifactHandlers } from './artifacts'
import { registerPresenterHandlers } from './presenter'
import { registerSettingsHandlers } from './settings'
import { registerExportHandlers } from './export-pdf'

export function registerAllIpcHandlers(): void {
  registerFileSystemHandlers()
  registerExecutionHandlers()
  registerAiHandlers()
  registerArtifactHandlers()
  registerPresenterHandlers()
  registerSettingsHandlers()
  registerExportHandlers()
}
