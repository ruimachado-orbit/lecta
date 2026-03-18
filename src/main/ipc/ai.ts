import { ipcMain, BrowserWindow } from 'electron'
import { AIService } from '../services/ai-service'

let aiService: AIService | null = null

function getAIService(): AIService {
  if (!aiService) {
    aiService = new AIService()
  }
  return aiService
}

export function registerAiHandlers(): void {
  ipcMain.handle(
    'ai:generate-notes',
    async (
      _event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number
    ): Promise<string> => {
      const service = getAIService()
      return service.generateNotes(slideContent, codeContent, deckTitle, slideIndex)
    }
  )

  ipcMain.handle(
    'ai:stream-notes',
    async (
      _event,
      slideContent: string,
      codeContent: string | null,
      deckTitle: string,
      slideIndex: number,
      responseChannel: string
    ): Promise<void> => {
      const service = getAIService()
      const window = BrowserWindow.getFocusedWindow()

      await service.streamNotes(
        slideContent,
        codeContent,
        deckTitle,
        slideIndex,
        (chunk: string) => {
          window?.webContents.send(responseChannel, chunk)
        }
      )

      // Signal completion
      window?.webContents.send(responseChannel, '[DONE]')
    }
  )
}
