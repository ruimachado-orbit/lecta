import { registerFileSystemHandlers } from './file-system'
import { registerExecutionHandlers } from './execution'
import { registerAiHandlers } from './ai'
import { registerArtifactHandlers } from './artifacts'
import { registerPresenterHandlers } from './presenter'
import { registerSettingsHandlers } from './settings'
import { registerExportHandlers } from './export-pdf'
import { registerPptxExportHandlers } from './export-pptx'
import { registerNotebookHandlers } from './notebook-fs'
import { registerSlideLibraryHandlers } from './slide-library'
import { registerRemoteControlHandlers } from './remote-control'
import { registerGeminiImageHandlers } from './gemini-image'
import { registerChatAgentHandlers } from './chat-agent'
import { registerLibraryHandlers } from './library'
import { registerMcpHandlers } from './mcp'
import { registerDesignSystemHandlers } from './design-system'
import { registerDemoHandlers } from './demo'

export function registerAllIpcHandlers(): void {
  registerFileSystemHandlers()
  registerExecutionHandlers()
  registerAiHandlers()
  registerGeminiImageHandlers()
  registerArtifactHandlers()
  registerPresenterHandlers()
  registerSettingsHandlers()
  registerExportHandlers()
  registerPptxExportHandlers()
  registerNotebookHandlers()
  registerSlideLibraryHandlers()
  registerRemoteControlHandlers()
  registerChatAgentHandlers()
  registerLibraryHandlers()
  registerMcpHandlers()
  registerDesignSystemHandlers()
  registerDemoHandlers()
}
